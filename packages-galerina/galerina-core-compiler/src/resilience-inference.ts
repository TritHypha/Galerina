// =============================================================================
// Galerina — Resilience Inference (Convention over Configuration)
//
// `contract { resilience {} }` is OPTIONAL and auto-by-default.
// The compiler infers retry strategy, fallback, and quarantine settings
// from the flow's declared effects and qualifier.
//
// Design approved: 2026-06-04 (galerina-resilience-observability-design.md)
//
// Key rules:
//   - retry is FORBIDDEN on database.write / gateway.charge without idempotent: true
//     → FUNGI-RES-001
//   - pure flows default to 0 retries (pure = side-effect-free, safe to retry but
//     only with explicit declaration)
//   - secure flows with network.outbound default to 1 retry
//   - database.write flows default to 0 retries
//   - circuit_breaker fallback integrates with DRCM V_DPM (DRCM Phase 5)
//
// AI generators: do NOT generate resilience blocks for simple flows.
// Only declare when overriding the inferred policy.
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResilienceFallback =
  | "propagate"       // default — return error as-is
  | "return_cached"   // return last successful cached result
  | "return_default"  // return flow's declared default value
  | "quarantine"      // immediately quarantine the flow
  | "circuit_breaker" // trip V_DPM → DPM_DEFENSIVE_MODE (DRCM Phase 5)
  | "escalate";       // surface to parent flow error handler

export type BackoffStrategy = "constant" | "linear" | "exponential";

// ---------------------------------------------------------------------------
// First-class fault handlers (R&D 0017) — `on_*_fault <action>` inside resilience {}
// ---------------------------------------------------------------------------

export type FaultSignal =
  | "on_timeout_fault"    // an operation exceeded its time budget
  | "on_rotation_fault"   // a key/credential rotation failed (galerina-ext-secrets-vault)
  | "on_denial_fault"     // a capability was denied mid-flow (capability_denied)
  | "on_substrate_fault"; // a substrate lane failed (substrate {} model)

/** Recovery action for a fault. `halt` is the fail-closed DEFAULT. `log` is the only fail-OPEN action
 *  and is admitted ONLY on on_rotation_fault (back-compat with galerina-ext-secrets-vault types). */
export type FaultAction = "halt" | "quarantine" | "retry" | "fallback" | "log";

export interface FaultHandler {
  readonly signal: FaultSignal;
  readonly action: FaultAction;
  /** Target flow name — present iff action === "fallback". */
  readonly target?: string;
  /** "declared" = author wrote `on_X_fault <action>`; "inferred-default" = secure default (halt). */
  readonly source: "declared" | "inferred-default";
}

export interface InferredResilience {
  /** Number of retry attempts on transient failure */
  readonly retryCount: number;
  /** Backoff strategy between retry attempts */
  readonly backoff: BackoffStrategy;
  /** Maximum delay between retry attempts (ms) */
  readonly maxDelayMs: number;
  /** Behaviour when retries exhausted */
  readonly fallback: ResilienceFallback;
  /** Quarantine after N consecutive failures (0 = disabled) */
  readonly quarantineAfter: number;
  /** Quarantine reset strategy ("manual" or "after_Ns") */
  readonly quarantineReset: string;
  /** Whether flow declares idempotency (enables retry for mutation effects) */
  readonly idempotent: boolean;
  /** DPM posture bit to set on quarantine (DRCM Phase 5, "" = none) */
  readonly onQuarantinePostureBit: string;
  /** 0017: the full 4-class fault-handler matrix — every signal resolves to a handler (declared or the
   *  fail-closed `halt` default). 0016's generator emits one fault-injection test per entry. */
  readonly faultHandlers: readonly FaultHandler[];
  /** True if resilience was explicitly declared in contract */
  readonly explicit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MUTATION_EFFECTS = new Set([
  "database.write", "database.delete", "database.update",
  // 2026-07-01: was "gateway.charge" (non-canonical → matched nothing; payment flows
  // silently missed mutation classification). Canonical payment effect is payment.charge.
  "payment.charge", "ledger.mutate",
]);

const NETWORK_EFFECTS = new Set([
  // 2026-07-01: dropped dead "http.outbound" (neither canonical nor an alias — matched
  // nothing; network.outbound already covers it). http.post/put are canonical aliases.
  "network.outbound", "http.post", "http.put",
]);

function hasExplicitResilience(flowNode: AstNode): boolean {
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  return (contractNode?.children ?? []).some(
    c => c.kind === "identifier" && c.value === "resilience:block",
  );
}

function extractResilienceField(flowNode: AstNode, field: string): string | null {
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  if (contractNode === undefined) return null;
  const resBlock = (contractNode.children ?? []).find(
    c => c.kind === "identifier" && c.value === "resilience:block",
  );
  if (resBlock === undefined) return null;
  for (const child of resBlock.children ?? []) {
    if (child.kind === "identifier" && (child.value ?? "").startsWith(`decl:${field}`)) {
      return child.value ?? null;
    }
  }
  return null;
}

function extractIdempotentFlag(flowNode: AstNode): boolean {
  // idempotent may appear on its own line ("decl:idempotent : true") OR
  // on the same line as retry ("decl:retry 3 times idempotent : true").
  // Search for the keyword anywhere in any resilience block decl line.
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  if (contractNode === undefined) return false;
  const resBlock = (contractNode.children ?? []).find(
    c => c.kind === "identifier" && c.value === "resilience:block",
  );
  if (resBlock === undefined) return false;
  return (resBlock.children ?? []).some(
    c => c.kind === "identifier" && (c.value ?? "").includes("idempotent"),
  );
}

function extractFallback(flowNode: AstNode): ResilienceFallback | null {
  const raw = extractResilienceField(flowNode, "fallback");
  if (raw === null) return null;
  const val = raw.replace(/^decl:fallback\s*/, "").trim();
  const valid: ResilienceFallback[] = [
    "propagate", "return_cached", "return_default",
    "quarantine", "circuit_breaker", "escalate",
  ];
  return valid.includes(val as ResilienceFallback) ? (val as ResilienceFallback) : null;
}

function extractRetryCount(flowNode: AstNode): number | null {
  const raw = extractResilienceField(flowNode, "retry");
  if (raw === null) return null;
  const match = raw.match(/retry\s+(\d+)/);
  return match !== undefined && match?.[1] !== undefined ? parseInt(match[1], 10) : null;
}

function extractOnQuarantine(flowNode: AstNode): string {
  const raw = extractResilienceField(flowNode, "on_quarantine");
  if (raw === null) return "";
  const match = raw.match(/set_posture_bit\s+(\w+)/);
  return match?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// Fault handlers (0017): on_*_fault lines already parse into the resilience:block as inert
// `decl:on_<signal>_fault <action> [<flow>]` identifiers. These give them typed, fail-closed semantics.
// ---------------------------------------------------------------------------

const FAULT_SIGNALS: readonly FaultSignal[] = [
  "on_timeout_fault", "on_rotation_fault", "on_denial_fault", "on_substrate_fault",
];

/** The fail-closed secure default applied to every undeclared fault class. */
const SECURE_DEFAULT_FAULT_ACTION: FaultAction = "halt";

/** Scan the resilience:block for `decl:on_*_fault <action> [<flowIdent>]` lines; returns the RAW
 *  declared action (validated/coerced later) keyed by signal. Last declaration of a signal wins. */
function extractDeclaredFaultHandlers(
  flowNode: AstNode,
): Map<FaultSignal, { action: string; target?: string }> {
  const out = new Map<FaultSignal, { action: string; target?: string }>();
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  const resBlock = (contractNode?.children ?? []).find(
    c => c.kind === "identifier" && c.value === "resilience:block",
  );
  if (resBlock === undefined) return out;
  for (const child of resBlock.children ?? []) {
    const v = child.value ?? "";
    if (!v.startsWith("decl:on_")) continue;
    const parts = v.replace(/^decl:/, "").trim().split(/\s+/); // e.g. ["on_substrate_fault","fallback","degraded_read_flow"]
    const signal = parts[0] as FaultSignal;
    if (!FAULT_SIGNALS.includes(signal)) continue;
    const action = parts[1] ?? "";
    const target = parts[2];
    out.set(signal, target !== undefined ? { action, target } : { action });
  }
  return out;
}

/** Coerce a raw declared action to a safe FaultAction. Unknown actions, and the fail-OPEN `log` outside
 *  on_rotation_fault, COERCE to `halt` (fail-closed by construction). The coercion is separately surfaced
 *  as a diagnostic by checkFaultHandlerViolations so the author isn't silently overridden. */
function coerceFaultAction(signal: FaultSignal, raw: string): FaultAction {
  if (raw === "halt" || raw === "quarantine" || raw === "retry" || raw === "fallback") return raw;
  if (raw === "log" && signal === "on_rotation_fault") return "log"; // back-compat opt-in (fail-open, flagged)
  return "halt"; // fail-closed default for anything unrecognised or disallowed
}

/** Build the full 4-class fault-handler matrix: EVERY signal resolves to a handler — the declared action
 *  when present+valid, else the fail-closed secure default. Explicit declaration wins; inference fills
 *  gaps with `halt`; nothing widens toward fail-open (the #58 precedence contract, applied to faults). */
function buildFaultHandlers(flowNode: AstNode): FaultHandler[] {
  const declared = extractDeclaredFaultHandlers(flowNode);
  return FAULT_SIGNALS.map((signal): FaultHandler => {
    const d = declared.get(signal);
    if (d === undefined) {
      return { signal, action: SECURE_DEFAULT_FAULT_ACTION, source: "inferred-default" };
    }
    const action = coerceFaultAction(signal, d.action);
    if (action === "fallback" && d.target !== undefined) {
      return { signal, action, target: d.target, source: "declared" };
    }
    return { signal, action, source: "declared" };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infer resilience policy for a flow from its declared effects and qualifier.
 *
 * Called by the governance verifier for every flow — explicit `resilience {}`
 * overrides defaults; absent block triggers convention-based inference.
 */
export function inferFlowResilience(
  flowNode: AstNode,
  flow: FlowMeta,
): InferredResilience {
  const hasMutationEffect = flow.declaredEffects.some(e => MUTATION_EFFECTS.has(e));
  const hasNetworkEffect  = flow.declaredEffects.some(e => NETWORK_EFFECTS.has(e));
  const isPure            = flow.qualifier === "pure";
  const idempotent        = extractIdempotentFlag(flowNode);
  const faultHandlers     = buildFaultHandlers(flowNode);

  if (hasExplicitResilience(flowNode)) {
    const retryCount = extractRetryCount(flowNode) ?? (hasMutationEffect && !idempotent ? 0 : 1);
    return {
      retryCount,
      backoff:                 "exponential",
      maxDelayMs:              5000,
      fallback:                extractFallback(flowNode) ?? "propagate",
      quarantineAfter:         0,
      quarantineReset:         "manual",
      idempotent,
      onQuarantinePostureBit:  extractOnQuarantine(flowNode),
      faultHandlers,
      explicit:                true,
    };
  }

  // Auto-by-default inference:
  if (isPure) {
    // Pure flows: no retry needed (side-effect-free, safe to retry at caller level)
    return { retryCount: 0, backoff: "constant", maxDelayMs: 0, fallback: "propagate",
             quarantineAfter: 0, quarantineReset: "manual", idempotent: false,
             onQuarantinePostureBit: "", faultHandlers, explicit: false };
  }
  if (hasMutationEffect) {
    // Mutation effects: NO retry by default (safety — avoid duplicate writes)
    return { retryCount: 0, backoff: "constant", maxDelayMs: 0, fallback: "propagate",
             quarantineAfter: 0, quarantineReset: "manual", idempotent: false,
             onQuarantinePostureBit: "", faultHandlers, explicit: false };
  }
  if (hasNetworkEffect) {
    // Network effects: 1 retry with exponential backoff (transient fault tolerance)
    return { retryCount: 1, backoff: "exponential", maxDelayMs: 5000, fallback: "propagate",
             quarantineAfter: 0, quarantineReset: "manual", idempotent: false,
             onQuarantinePostureBit: "", faultHandlers, explicit: false };
  }

  // Default: no retry
  return { retryCount: 0, backoff: "constant", maxDelayMs: 0, fallback: "propagate",
           quarantineAfter: 0, quarantineReset: "manual", idempotent: false,
           onQuarantinePostureBit: "", faultHandlers, explicit: false };
}

// ---------------------------------------------------------------------------
// Governance check (FUNGI-RES-001)
// ---------------------------------------------------------------------------

export interface ResilienceViolation {
  readonly code: "FUNGI-RES-001" | "FUNGI-RES-CB-PENDING";
  readonly severity: "error" | "warning";
  readonly subcode: string;
  readonly message: string;
  readonly hint: string;
}

/**
 * Resilience governance checks:
 *  - FUNGI-RES-001 (error): retry on a mutation effect without idempotent: true.
 *  - FUNGI-RES-CB-PENDING (warning, R&D 0120): `fallback circuit_breaker` is parsed + stored but its
 *    posture-trip is a NO-OP today (DRCM Phase 5). A declared-but-inert safety control must never read
 *    as enforced — fail LOUD so the author does not rely on graceful degradation that does not happen.
 */
export function checkResilienceViolations(
  flowNode: AstNode,
  flow: FlowMeta,
): ResilienceViolation[] {
  const violations: ResilienceViolation[] = [];
  const inferred = inferFlowResilience(flowNode, flow);

  if (inferred.retryCount > 0 && !inferred.idempotent) {
    const mutationEffects = flow.declaredEffects.filter(e => MUTATION_EFFECTS.has(e));
    if (mutationEffects.length > 0) {
      violations.push({
        code: "FUNGI-RES-001",
        severity: "error",
        subcode: "RESILIENCE_RETRY_ON_MUTATION",
        message:
          `Flow '${flow.name}' declares retry: ${inferred.retryCount} but has ` +
          `mutation effects [${mutationEffects.join(", ")}] without idempotent: true. ` +
          `Retrying mutations risks duplicate writes. Add 'idempotent: true' to ` +
          `resilience {} or remove the retry declaration.`,
        hint: `Add 'idempotent: true' to the resilience {} block, or remove the retry declaration.`,
      });
    }
  }

  // FUNGI-RES-CB-PENDING: a declared circuit_breaker that does not yet trip must not read as enforced.
  if (inferred.fallback === "circuit_breaker") {
    violations.push({
      code: "FUNGI-RES-CB-PENDING",
      severity: "warning",
      subcode: "CIRCUIT_BREAKER_NOT_ENFORCED",
      message:
        `Flow '${flow.name}' declares fallback: circuit_breaker, but the posture-trip is NOT YET ` +
        `enforced (parsed + stored only — DRCM Phase 5). Do NOT rely on it for graceful degradation: ` +
        `on failure the breaker will not actually trip the defensive-mode posture bit today.`,
      hint: `Track the breaker externally until DRCM Phase 5 lands, or choose an enforced fallback ` +
        `(propagate / return_cached / return_default / quarantine / escalate).`,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Fault-handler governance checks (0017): FUNGI-FAULT-001 / FUNGI-FAULT-003
// ---------------------------------------------------------------------------

export interface FaultHandlerViolation {
  readonly code: "FUNGI-FAULT-001" | "FUNGI-FAULT-003";
  readonly message: string;
}

/**
 * Validate DECLARED fault handlers (the secure default never violates by construction):
 *  - **FUNGI-FAULT-003** (fail-open guard): a handler resolving to `log` outside the on_rotation_fault
 *    back-compat opt-in is fail-OPEN (it keeps serving past the fault) — rejected. Use halt/quarantine.
 *  - **FUNGI-FAULT-001** (monotonicity): `on_denial_fault retry` is rejected — retrying a capability denial
 *    attempts a re-grant, colliding with deny-only monotonicity (FUNGI-MONO-001). Use halt/quarantine/fallback.
 * The matrix itself already coerces these to `halt` (fail-closed); this surfaces the author error instead of
 * silently overriding it.
 */
export function checkFaultHandlerViolations(flowNode: AstNode): FaultHandlerViolation[] {
  const violations: FaultHandlerViolation[] = [];
  for (const [signal, d] of extractDeclaredFaultHandlers(flowNode)) {
    if (d.action === "log" && signal !== "on_rotation_fault") {
      violations.push({
        code: "FUNGI-FAULT-003",
        message:
          `Fault handler '${signal} log' is fail-OPEN: 'log' keeps serving past the fault and is permitted ` +
          `only on on_rotation_fault. Use 'halt' (fail-closed) or 'quarantine'.`,
      });
    }
    if (d.action === "retry" && signal === "on_denial_fault") {
      violations.push({
        code: "FUNGI-FAULT-001",
        message:
          `Fault handler 'on_denial_fault retry' is rejected: retrying a capability denial attempts a ` +
          `re-grant, colliding with deny-only monotonicity (FUNGI-MONO-001). Use 'halt', 'quarantine', or 'fallback <flow>'.`,
      });
    }
  }
  return violations;
}
