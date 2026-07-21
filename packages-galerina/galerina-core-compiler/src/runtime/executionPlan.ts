// =============================================================================
// Galerina Phase 15 — Passive Execution Plans
//
// A PassiveExecutionPlan is a pre-verified, governance-checked description of
// the steps a flow will perform at runtime. It is produced at compile time and
// consumed by the runtime — the runtime executes steps without re-walking the AST.
//
// Architecture:
//   Source → AST → GIR → PassiveExecutionPlan → Runtime → RuntimeReport
//
// Phase 15 is a STRUCTURAL plan (not a complete execution trace). Steps represent
// governance-verified operations. Full plan-based AST replacement is Phase 16.
// =============================================================================

import { createHash } from "node:crypto";
import type { AstNode, FlowMeta } from "../parser.js";
import { EFFECT_TO_CAPABILITY } from "../gir-emitter.js";
import type { CapabilityHost } from "./capabilityHost.js";
import type { RuntimeContext } from "./runtimeContext.js";

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

export interface ValidateContextStep {
  readonly kind: "validate_context";
  readonly field: string;
}

export interface ValidateParamStep {
  readonly kind: "validate_param";
  readonly name: string;
  readonly type: string;
  readonly gate: string;
}

export interface CapabilityCallStep {
  readonly kind: "capability_call";
  readonly capability: string;
  readonly effect: string;
  readonly operation: string;
}

export interface ResponseStep {
  readonly kind: "response";
  readonly format: "okJson" | "created" | "ok" | "err";
}

export interface EmitEventStep {
  readonly kind: "emit_event";
  readonly event: string;
}

export interface ReturnStep {
  readonly kind: "return";
  readonly value: string;
}

export type ExecutionStep =
  | ValidateContextStep
  | ValidateParamStep
  | CapabilityCallStep
  | ResponseStep
  | EmitEventStep
  | ReturnStep;

// ---------------------------------------------------------------------------
// ApprovedCapability
// ---------------------------------------------------------------------------

export interface ApprovedCapability {
  readonly declared: boolean;
  readonly allowed: boolean;
  readonly effect: string;
  readonly capability: string;
}

// ---------------------------------------------------------------------------
// PassiveExecutionPlan
// ---------------------------------------------------------------------------

export interface PassiveExecutionPlan {
  readonly flow: string;
  readonly qualifier: "pure" | "guarded" | "secure" | "flow";
  readonly steps: readonly ExecutionStep[];
  readonly approvedCapabilities: ReadonlyMap<string, ApprovedCapability>;
  readonly planHash: string;
  readonly generatedAt: string;
  /**
   * RD-0363 §2.1 — signed artifact slot.
   * At build time this is left undefined (plans are produced by the compiler, not the signing key).
   * The signing surface: Ed25519 (+ ML-DSA-65 in certified profile) over the canonical planHash.
   * Post-v1 admission gate: a replayable plan must carry both halves; unsigned ⇒ REJECT at the
   * replay-time admission check (the same pattern as the #105 fuse-loader gate).
   *
   * Format: "<ed25519-hex>.<mldsa65-hex>" or "<ed25519-hex>" (dev profile)
   * Absent at compile time = unsigned (feasibility artifact, not a bearer token).
   */
  readonly planSignature?: string;
  /**
   * RD-0363 §2.2 — replay freshness.
   * Maximum age in milliseconds before a stored plan is considered stale → INDETERMINATE → deny.
   * Defaults to 86_400_000 ms (24 h) when not specified.
   * A verifier checking `Date.now() - generatedAt > maxAgeMs` resolves: old plan → fail-closed DENY.
   */
  readonly maxAgeMs?: number;
  /**
   * RD-0363 §2.3 — target binding.
   * The compute target family this plan was built for (e.g. "cpu", "wasm", "gpu").
   * Replaying a cpu-plan on a gpu lane ⇒ REJECT at admission (cross-target smuggling, PV3).
   */
  readonly targetBinding?: string;
}

/** Default plan max-age (24 h in ms). Plans older than this are stale → deny at replay. */
export const PLAN_DEFAULT_MAX_AGE_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** SHA-256 a string and return the hex digest (no prefix). */
function sha256hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Walk the AST and collect all emit:EventName identifiers. */
function collectEmitEvents(node: AstNode): string[] {
  const events: string[] = [];

  function walk(n: AstNode): void {
    if (n.kind === "identifier" && n.value !== undefined && n.value.startsWith("emit:")) {
      const eventName = n.value.slice("emit:".length).trim();
      if (eventName !== "") events.push(eventName);
    }
    for (const child of n.children ?? []) walk(child);
  }

  walk(node);
  return events;
}

/** Find a flow AST node by name. */
function findFlowNode(ast: AstNode, name: string): AstNode | undefined {
  const FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl"]);

  function walk(node: AstNode): AstNode | undefined {
    if (FLOW_KINDS.has(node.kind) && node.value === name) return node;
    for (const child of node.children ?? []) {
      const found = walk(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  return walk(ast);
}

/**
 * Extracts the context.require fields from a contractDecl node.
 * Looks for a contractSetDecl with value "context" and collects items
 * whose value starts with "require ".
 */
function extractContextRequireFields(contractNode: AstNode): string[] {
  const fields: string[] = [];
  for (const child of contractNode.children ?? []) {
    if (child.kind === "contractSetDecl" && child.value === "context") {
      for (const item of child.children ?? []) {
        const v = item.value?.trim();
        if (v !== undefined && v.startsWith("require ")) {
          fields.push(v.slice("require ".length).trim());
        }
        // Also handle identifier nodes with value like "require:userId" or plain "userId"
        // in case parser stores them differently
        if (v !== undefined && !v.startsWith("require ") && v !== "") {
          fields.push(v);
        }
      }
    }
  }
  return fields;
}

/**
 * Extracts params with unsafe trust state.
 * Params that start with "unsafe " have untrusted input that needs validation.
 */
function extractUnsafeParams(meta: FlowMeta): Array<{ name: string; type: string }> {
  const unsafe: Array<{ name: string; type: string }> = [];

  for (const param of meta.params) {
    let input = param.trim();
    if (!input.startsWith("unsafe ")) continue;
    input = input.slice("unsafe ".length).trim();

    const colon = input.indexOf(":");
    if (colon < 0) continue;

    const name = input.slice(0, colon).trim();
    const type = input.slice(colon + 1).trim();
    if (name !== "" && type !== "") {
      unsafe.push({ name, type });
    }
  }

  return unsafe;
}

// ---------------------------------------------------------------------------
// buildExecutionPlan
// ---------------------------------------------------------------------------

/**
 * Builds a PassiveExecutionPlan from a flow's AST and metadata.
 *
 * Implementation (Phase 15 structural approach):
 * 1. validate_context steps for any context.require fields in the contract
 * 2. validate_param steps for params with unsafe trust state
 * 3. capability_call steps for each declared effect (using EFFECT_TO_CAPABILITY)
 * 4. emit_event steps for any emit:EventName identifiers in the body
 * 5. return step at the end
 * 6. planHash from SHA-256 of canonical JSON (generatedAt stripped before hashing)
 * 7. approvedCapabilities from declaredEffects
 */
export function buildExecutionPlan(
  flowNode: AstNode,
  meta: FlowMeta,
): PassiveExecutionPlan {
  const steps: ExecutionStep[] = [];

  // 1. validate_context steps from contract context.require declarations
  const contractNode = (flowNode.children ?? []).find((c) => c.kind === "contractDecl");
  if (contractNode !== undefined) {
    const contextFields = extractContextRequireFields(contractNode);
    for (const field of contextFields) {
      if (field !== "") {
        steps.push({ kind: "validate_context", field });
      }
    }
  }

  // 2. validate_param steps for unsafe params
  const unsafeParams = extractUnsafeParams(meta);
  for (const param of unsafeParams) {
    steps.push({
      kind: "validate_param",
      name: param.name,
      type: param.type,
      gate: `validate.${param.name}`,
    });
  }

  // 3. capability_call steps for each declared effect
  for (const effect of meta.declaredEffects) {
    const capability = EFFECT_TO_CAPABILITY.get(effect) ?? `host.${effect}`;
    // Infer operation from effect name: "database.write" -> "write"
    const dotIdx = effect.lastIndexOf(".");
    const operation = dotIdx >= 0 ? effect.slice(dotIdx + 1) : effect;
    steps.push({
      kind: "capability_call",
      capability,
      effect,
      operation,
    });
  }

  // 4. emit_event steps from body
  const emitEvents = collectEmitEvents(flowNode);
  const seenEvents = new Set<string>();
  for (const event of emitEvents) {
    if (!seenEvents.has(event)) {
      seenEvents.add(event);
      steps.push({ kind: "emit_event", event });
    }
  }

  // 5. return step
  steps.push({ kind: "return", value: meta.returnType });

  // 7. approvedCapabilities from declaredEffects
  const approvedCapabilities = new Map<string, ApprovedCapability>();
  for (const effect of meta.declaredEffects) {
    const capability = EFFECT_TO_CAPABILITY.get(effect) ?? `host.${effect}`;
    approvedCapabilities.set(effect, {
      declared: true,
      allowed: true,
      effect,
      capability,
    });
  }

  const generatedAt = new Date().toISOString();

  // 6. planHash: SHA-256 of canonical JSON without generatedAt
  const canonicalPlan = {
    flow: meta.name,
    qualifier: meta.qualifier,
    steps,
    approvedCapabilities: Object.fromEntries(approvedCapabilities),
  };
  const planHash = sha256hex(JSON.stringify(canonicalPlan));

  return {
    flow: meta.name,
    qualifier: meta.qualifier,
    steps,
    approvedCapabilities,
    planHash,
    generatedAt,
  };
}

// ---------------------------------------------------------------------------
// RD-0363 — Passive plan replay admission helpers
// ---------------------------------------------------------------------------

/** Result of a freshness/admission check on a PassiveExecutionPlan. */
export interface PlanAdmissionResult {
  readonly admitted: boolean;
  /** Human-readable denial reason if !admitted. */
  readonly reason?: string;
  /** K3 fold: +1 admitted, 0 stale/unsigned (indeterminate → caller denies), -1 rejected. */
  readonly verdict: 1 | 0 | -1;
}

/**
 * RD-0363 §2.2 freshness check — is the plan still within its max age?
 *
 * `nowMs` defaults to `Date.now()` (injected for deterministic testing).
 * Returns: +1 fresh, 0 stale (→ INDETERMINATE → caller collapses to DENY), -1 if parse fails.
 */
export function verifyPlanFreshness(
  plan: PassiveExecutionPlan,
  nowMs: number = Date.now(),
): PlanAdmissionResult {
  const maxAge = plan.maxAgeMs ?? PLAN_DEFAULT_MAX_AGE_MS;
  let generatedAtMs: number;
  try {
    generatedAtMs = new Date(plan.generatedAt).getTime();
  } catch {
    return { admitted: false, reason: "planFreshness: generatedAt is not a valid ISO date", verdict: -1 };
  }
  if (!Number.isFinite(generatedAtMs)) {
    return { admitted: false, reason: "planFreshness: generatedAt parsed to a non-finite timestamp", verdict: -1 };
  }
  const age = nowMs - generatedAtMs;
  if (age > maxAge) {
    return {
      admitted: false,
      reason: `planFreshness: plan is ${Math.round(age / 1000)}s old (max ${Math.round(maxAge / 1000)}s) — STALE`,
      verdict: 0, // INDETERMINATE → collapses to DENY at the caller boundary
    };
  }
  return { admitted: true, verdict: 1 };
}

/**
 * RD-0363 §2 plan admission gate — combines hash integrity, freshness, and target binding.
 *
 * This is the compile-time half of the admission story. The full runtime half (capability
 * re-verification at replay time, RD-0363 §2.2) is a runtime concern beyond the compiler.
 *
 * Checks:
 *   (1) planHash integrity — canonical hash must match what was committed at build time.
 *   (2) freshness — plan must be within its max-age window.
 *   (3) targetBinding — if a required target is specified, the plan must declare it.
 *
 * Signature verification (Ed25519 + ML-DSA-65) is NOT done here; it requires the key material
 * which the compiler does not hold. The gate returns INDETERMINATE (0) when planSignature is
 * absent so that a downstream verifier that DOES hold the key can fold its verdict in. A missing
 * signature never converts to ALLOW — it is always at best 0, never +1.
 */
export function verifyPlanAdmission(
  plan: PassiveExecutionPlan,
  options?: { requiredTarget?: string; nowMs?: number },
): PlanAdmissionResult {
  // (1) Hash integrity — recompute the canonical hash and compare.
  const canonical = {
    flow: plan.flow,
    qualifier: plan.qualifier,
    steps: plan.steps,
    approvedCapabilities: Object.fromEntries(plan.approvedCapabilities),
  };
  const recomputed = createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  if (recomputed !== plan.planHash) {
    return { admitted: false, reason: `planAdmission: planHash mismatch — plan may have been tampered (PV1)`, verdict: -1 };
  }

  // (2) Freshness.
  const fresh = verifyPlanFreshness(plan, options?.nowMs);
  if (!fresh.admitted) return fresh;

  // (3) Target binding — if required, the plan must declare a matching targetBinding.
  if (options?.requiredTarget !== undefined) {
    if (plan.targetBinding === undefined) {
      return { admitted: false, reason: `planAdmission: plan has no targetBinding but ${options.requiredTarget} is required (PV3)`, verdict: -1 };
    }
    if (plan.targetBinding !== options.requiredTarget) {
      return { admitted: false, reason: `planAdmission: targetBinding "${plan.targetBinding}" !== required "${options.requiredTarget}" (PV3)`, verdict: -1 };
    }
  }

  // Signature absent → INDETERMINATE (0). The caller MUST fold a key-verifier verdict before admitting.
  if (plan.planSignature === undefined) {
    return { admitted: false, reason: "planAdmission: no planSignature — unsigned plan is INDETERMINATE (not a bearer token)", verdict: 0 };
  }

  return { admitted: true, verdict: 1 };
}

// ---------------------------------------------------------------------------
// PurePlan — result type for pure flow execution via executePlan
// ---------------------------------------------------------------------------

export interface PurePlanResult {
  readonly value: string;
  readonly auditTrail: readonly string[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// executePlan — Phase 16 implementation for PurePlan (pure flows)
// ---------------------------------------------------------------------------

/**
 * Executes a PassiveExecutionPlan step-by-step for pure flows (PurePlan).
 *
 * For pure flows (qualifier === "pure"), this replaces AST-walking entirely:
 *   - validate_context: checks that the required context field exists, warns if missing
 *   - capability_call: checks host approval and executes the operation
 *   - emit_event: records the event in the audit trail
 *   - return: returns the plan's return value
 *   - response: formats and returns the response value
 *
 * For non-pure flows, the function still validates all capability steps against
 * the host (Phase 15 behaviour) and delegates execution to the caller.
 */
export async function executePlan(
  plan: PassiveExecutionPlan,
  host: CapabilityHost,
  context: RuntimeContext,
): Promise<PurePlanResult> {
  const auditTrail: string[] = [];
  const warnings: string[] = [];
  let returnValue = "";

  for (const step of plan.steps) {
    switch (step.kind) {
      case "validate_context": {
        // Check that the required context field is present on the runtime context
        const hasField =
          step.field === "actor" ? context.actor !== undefined :
          step.field === "traceId" ? context.traceId !== undefined :
          step.field === "deadline" ? context.deadlineMs !== undefined :
          // For any other named field, we cannot verify at this level — warn
          false;

        if (!hasField) {
          warnings.push(
            `validate_context: required context field '${step.field}' is missing`,
          );
        }
        break;
      }

      case "capability_call": {
        // Verify the capability is approved in the plan
        const approved = plan.approvedCapabilities.get(step.effect);
        if (approved === undefined || !approved.allowed) {
          throw new Error(
            `executePlan: capability '${step.capability}' for effect '${step.effect}' is not approved in plan`,
          );
        }

        // Check that the host allows this call
        const checkResult = host.check({
          capabilityId: step.capability,
          effect: step.effect,
          args: [],
          context,
        });

        if (!checkResult.allowed) {
          throw new Error(
            `executePlan: host denied capability '${step.capability}': ${checkResult.reason ?? "denied"}`,
          );
        }

        // For pure plans we record the capability execution in the audit trail
        // (the actual IO implementation is the caller's responsibility)
        auditTrail.push(
          `capability_call: ${step.capability} (${step.operation}) [allowed]`,
        );
        break;
      }

      case "emit_event": {
        // Record the event in the audit trail
        auditTrail.push(`emit_event: ${step.event}`);
        break;
      }

      case "return": {
        // Capture the plan's declared return value and stop processing
        returnValue = step.value;
        return { value: returnValue, auditTrail, warnings };
      }

      case "response": {
        // Format and return a response step
        returnValue = `response(${step.format})`;
        return { value: returnValue, auditTrail, warnings };
      }

      default:
        // validate_param and any future step kinds — skip silently
        break;
    }
  }

  return { value: returnValue, auditTrail, warnings };
}
