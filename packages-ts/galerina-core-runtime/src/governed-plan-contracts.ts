// Securely Governed Runtime execution plan, verified fast path and AI compute plan
// runtime-hook contracts (TODO pass, Grok 2026-10-05).
//
// Pure, fail-closed decisions in the style of runtime-contracts.ts. None of them performs
// I/O, dials a model or executes guest code. Diagnostics carry fixed messages and a path;
// they never echo caller-supplied text. Zero-trust defaults, owner may revisit:
//   - an execution plan advances strictly request -> planning -> verification ->
//     capability locking -> execution -> audit proof; any out-of-order step is terminal;
//   - capabilities lock only when every requested one is in an explicit grant list, and the
//     locked set is exactly the requested set (never the wider grant);
//   - AI actors need an authority-kernel lease id and never run in the trusted core;
//   - a fast path is a hint to reuse a pre-verified plan, never a bypass: policy, capability
//     limits, effect boundaries, data contracts and audit still run (FAST_PATH_NEVER_BYPASSES);
//   - fast path leases are capped at one hour and any context change invalidates them;
//   - the default AI compute policy admits nothing.
// Fast path signatures are NOT authenticated here; the host must load them from trusted
// storage. Authenticating receipts at the host boundary is a separate TODO row.

import {
  validateRuntimeResourceBudget,
  type RuntimePolicyDiagnostic,
  type RuntimePolicyVerdict,
  type RuntimeResourceBudget,
} from "./runtime-contracts.js";

const refuse = (code: string, message: string, path: string): RuntimePolicyDiagnostic => Object.freeze({ code, severity: "error" as const, message, path });
const verdictOf = (diagnostics: readonly RuntimePolicyDiagnostic[]): RuntimePolicyVerdict => Object.freeze({ allowed: diagnostics.length === 0, diagnostics: Object.freeze([...diagnostics]) });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isPositiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const IDENT = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]{0,127}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const isIdent = (value: unknown): value is string => typeof value === "string" && IDENT.test(value);
export const MAX_PLAN_LIST_ITEMS = 256;

function identList(value: unknown, path: string, code: string, out: RuntimePolicyDiagnostic[]): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_PLAN_LIST_ITEMS || !value.every(isIdent) || new Set(value).size !== value.length) {
    out.push(refuse(code, `The ${path} list must hold at most ${MAX_PLAN_LIST_ITEMS} unique identifiers.`, path));
    return [];
  }
  return value as readonly string[];
}

// ── Securely Governed Runtime execution plan ───────────────────────────────
export const GOVERNED_EXECUTION_PLAN_SCHEMA = "galerina.runtime.governed-execution-plan.v1";
export const GOVERNED_EXECUTION_STAGES = Object.freeze(["request", "planning", "verification", "capability-locking", "execution", "audit-proof"] as const);
export type GovernedExecutionStage = (typeof GOVERNED_EXECUTION_STAGES)[number];
export type RuntimeTrustZone = "trusted-core" | "governed" | "untrusted";
export type GovernedActorKind = "human" | "service" | "ai";

export interface GovernedExecutionPlan {
  readonly schema: typeof GOVERNED_EXECUTION_PLAN_SCHEMA;
  readonly planId: string;
  readonly actor: { readonly kind: GovernedActorKind; readonly id: string; readonly leaseId?: string };
  readonly zone: RuntimeTrustZone;
  /** Declared boundary; required when zone is "untrusted". */
  readonly boundary?: string;
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly budget: RuntimeResourceBudget;
  readonly auditRequired: true;
}

export function validateGovernedExecutionPlan(plan: GovernedExecutionPlan): RuntimePolicyVerdict {
  if (!isRecord(plan)) return verdictOf([refuse("Galerina_RUNTIME_PLAN_MALFORMED", "Execution plan must be a plain record.", "plan")]);
  const d: RuntimePolicyDiagnostic[] = [];
  if (plan.schema !== GOVERNED_EXECUTION_PLAN_SCHEMA) d.push(refuse("Galerina_RUNTIME_PLAN_SCHEMA", "Execution plan schema is not supported.", "schema"));
  if (!isIdent(plan.planId)) d.push(refuse("Galerina_RUNTIME_PLAN_ID", "Plan id must be an identifier.", "planId"));
  const actor = plan.actor;
  if (!isRecord(actor) || !["human", "service", "ai"].includes(actor.kind as string) || !isIdent(actor.id)) {
    d.push(refuse("Galerina_RUNTIME_PLAN_ACTOR", "Actor must declare a known kind and an identifier.", "actor"));
  } else if (actor.kind === "ai") {
    if (!isIdent(actor.leaseId)) d.push(refuse("Galerina_RUNTIME_PLAN_AI_LEASE_REQUIRED", "An AI actor needs an authority-kernel lease; intent is not authority.", "actor.leaseId"));
    if (plan.zone === "trusted-core") d.push(refuse("Galerina_RUNTIME_PLAN_AI_TRUSTED_CORE", "AI actors never run in the trusted core.", "zone"));
  }
  if (!["trusted-core", "governed", "untrusted"].includes(plan.zone as string)) d.push(refuse("Galerina_RUNTIME_PLAN_ZONE", "Zone must be trusted-core, governed or untrusted.", "zone"));
  if (plan.zone === "untrusted" && !isIdent(plan.boundary)) d.push(refuse("Galerina_RUNTIME_PLAN_BOUNDARY_REQUIRED", "Untrusted work runs only through a declared boundary.", "boundary"));
  identList(plan.effects, "effects", "Galerina_RUNTIME_PLAN_EFFECTS", d);
  identList(plan.capabilities, "capabilities", "Galerina_RUNTIME_PLAN_CAPABILITIES", d);
  if (!isRecord(plan.budget)) d.push(refuse("Galerina_RUNTIME_PLAN_BUDGET_REQUIRED", "Every plan needs an explicit resource budget.", "budget"));
  else for (const diag of validateRuntimeResourceBudget(plan.budget).diagnostics) d.push(refuse(diag.code, diag.message, `budget.${diag.path}`));
  if (plan.auditRequired !== true) d.push(refuse("Galerina_RUNTIME_PLAN_AUDIT_REQUIRED", "Audit is part of execution and cannot be turned off.", "auditRequired"));
  return verdictOf(d);
}

export interface GovernedExecutionState {
  readonly planId: string;
  readonly stage: GovernedExecutionStage;
  readonly failed: boolean;
  readonly complete: boolean;
  readonly lockedCapabilities: readonly string[];
  readonly auditProofId?: string;
  readonly diagnostics: readonly RuntimePolicyDiagnostic[];
}

export type GovernedExecutionEvent =
  | { readonly type: "plan" }
  | { readonly type: "verify"; readonly verdict: RuntimePolicyVerdict }
  | { readonly type: "lock-capabilities"; readonly granted: readonly string[] }
  | { readonly type: "execute" }
  | { readonly type: "audit-proof"; readonly proofId: string };

const EVENT_FOR_NEXT_STAGE: Readonly<Record<GovernedExecutionStage, GovernedExecutionEvent["type"] | undefined>> = Object.freeze({
  request: "plan",
  planning: "verify",
  verification: "lock-capabilities",
  "capability-locking": "execute",
  execution: "audit-proof",
  "audit-proof": undefined,
});

const freezeState = (state: GovernedExecutionState): GovernedExecutionState =>
  Object.freeze({ ...state, lockedCapabilities: Object.freeze([...state.lockedCapabilities]), diagnostics: Object.freeze([...state.diagnostics]) });

/** Start a governed execution at the "request" stage. An invalid plan yields a failed, terminal state. */
export function startGovernedExecution(plan: GovernedExecutionPlan): GovernedExecutionState {
  const verdict = validateGovernedExecutionPlan(plan);
  const planId = isRecord(plan) && isIdent(plan.planId) ? plan.planId : "";
  return freezeState({ planId, stage: "request", failed: !verdict.allowed, complete: false, lockedCapabilities: [], diagnostics: verdict.diagnostics });
}

/**
 * Advance one stage. Only the event for the next stage is accepted; anything else, a failed
 * verification, an ungranted capability or a malformed proof id fails the execution for good.
 */
export function advanceGovernedExecution(plan: GovernedExecutionPlan, state: GovernedExecutionState, event: GovernedExecutionEvent): GovernedExecutionState {
  const fail = (diag: RuntimePolicyDiagnostic): GovernedExecutionState => freezeState({ ...state, failed: true, complete: false, diagnostics: [...(state.diagnostics ?? []), diag] });
  if (!isRecord(state) || state.failed !== false || state.complete !== false || !GOVERNED_EXECUTION_STAGES.includes(state.stage)) {
    return freezeState({ planId: "", stage: "request", failed: true, complete: false, lockedCapabilities: [], diagnostics: [refuse("Galerina_RUNTIME_PLAN_STATE", "Execution state is failed, complete or malformed.", "state")] });
  }
  // The plan is re-validated on every step, so a plan mutated after start cannot advance.
  const verdict = validateGovernedExecutionPlan(plan);
  if (!verdict.allowed || plan.planId !== state.planId) return fail(refuse("Galerina_RUNTIME_PLAN_CHANGED", "The plan is invalid or is not the plan this execution started with.", "plan"));
  if (!isRecord(event) || event.type !== EVENT_FOR_NEXT_STAGE[state.stage]) return fail(refuse("Galerina_RUNTIME_PLAN_STAGE_ORDER", "Execution stages must run in order: request, planning, verification, capability locking, execution, audit proof.", "event.type"));
  const at = GOVERNED_EXECUTION_STAGES.indexOf(state.stage);
  const next = GOVERNED_EXECUTION_STAGES[at + 1] as GovernedExecutionStage;
  switch (event.type) {
    case "verify":
      if (!isRecord(event.verdict) || event.verdict.allowed !== true || !Array.isArray(event.verdict.diagnostics) || event.verdict.diagnostics.length > 0) {
        return fail(refuse("Galerina_RUNTIME_PLAN_VERIFICATION_FAILED", "Verification did not pass cleanly.", "event.verdict"));
      }
      break;
    case "lock-capabilities": {
      const granted = Array.isArray(event.granted) ? event.granted : [];
      if (!plan.capabilities.every((c) => granted.includes(c))) return fail(refuse("Galerina_RUNTIME_PLAN_CAPABILITY_NOT_GRANTED", "Every requested capability must be explicitly granted before locking.", "event.granted"));
      return freezeState({ ...state, stage: next, lockedCapabilities: [...plan.capabilities] });
    }
    case "audit-proof":
      if (!isIdent(event.proofId)) return fail(refuse("Galerina_RUNTIME_PLAN_AUDIT_PROOF", "Audit proof id must be an identifier.", "event.proofId"));
      return freezeState({ ...state, stage: next, complete: true, auditProofId: event.proofId });
    default:
      break;
  }
  return freezeState({ ...state, stage: next });
}

// ── verified fast path signature and invalidation ──────────────────────────
export const FAST_PATH_SIGNATURE_SCHEMA = "galerina.runtime.fast-path-signature.v1";
/** Longest lease a fast path signature may carry (one hour). Zero-trust default, owner may revisit. */
export const MAX_FAST_PATH_LEASE_MS = 3_600_000;
/** What a fast path never skips. A fast path only reuses a pre-verified plan. */
export const FAST_PATH_NEVER_BYPASSES = Object.freeze(["policy", "capability-limits", "effect-boundaries", "data-contracts", "audit"] as const);

export interface FastPathContext {
  readonly policyHash: string;
  readonly packageGraphHash: string;
  readonly outputContractHash: string;
  /** Model version identifier, or "none" for non-model work. */
  readonly modelVersion: string;
  readonly hardwareProfile: string;
  readonly trustState: string;
}

export interface FastPathSignature {
  readonly schema: typeof FAST_PATH_SIGNATURE_SCHEMA;
  readonly signatureId: string;
  readonly workloadKey: string;
  readonly leaseId: string;
  readonly context: FastPathContext;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export type FastPathInvalidation =
  | "MALFORMED" | "WORKLOAD_MISMATCH" | "NOT_YET_VALID" | "EXPIRED" | "LEASE_TOO_LONG" | "REVOKED"
  | "POLICY_CHANGED" | "PACKAGES_CHANGED" | "OUTPUT_CONTRACT_CHANGED" | "MODEL_CHANGED" | "HARDWARE_CHANGED" | "TRUST_STATE_CHANGED";

const CONTEXT_FIELDS: readonly [keyof FastPathContext, FastPathInvalidation][] = [
  ["policyHash", "POLICY_CHANGED"],
  ["packageGraphHash", "PACKAGES_CHANGED"],
  ["outputContractHash", "OUTPUT_CONTRACT_CHANGED"],
  ["modelVersion", "MODEL_CHANGED"],
  ["hardwareProfile", "HARDWARE_CHANGED"],
  ["trustState", "TRUST_STATE_CHANGED"],
];

function contextOk(context: unknown): context is FastPathContext {
  if (!isRecord(context)) return false;
  return SHA256_HEX.test(String(context.policyHash)) && SHA256_HEX.test(String(context.packageGraphHash)) && SHA256_HEX.test(String(context.outputContractHash)) &&
    isIdent(context.modelVersion) && isIdent(context.hardwareProfile) && isIdent(context.trustState);
}

export interface FastPathSignatureRequest {
  readonly signatureId: string;
  readonly workloadKey: string;
  readonly leaseId: string;
  readonly context: FastPathContext;
  readonly issuedAtMs: number;
  readonly leaseMs: number;
}

/** Build a frozen, context-tagged signature. Hashes are lower-case SHA-256 hex; the lease is 1 ms..MAX_FAST_PATH_LEASE_MS. */
export function createFastPathSignature(request: FastPathSignatureRequest): { readonly signature?: FastPathSignature; readonly diagnostics: readonly RuntimePolicyDiagnostic[] } {
  const d: RuntimePolicyDiagnostic[] = [];
  if (!isRecord(request)) return Object.freeze({ diagnostics: Object.freeze([refuse("Galerina_RUNTIME_FASTPATH_MALFORMED", "Fast path request must be a plain record.", "request")]) });
  for (const key of ["signatureId", "workloadKey", "leaseId"] as const) if (!isIdent(request[key])) d.push(refuse("Galerina_RUNTIME_FASTPATH_ID", "Fast path ids and workload keys must be identifiers.", key));
  if (!contextOk(request.context)) d.push(refuse("Galerina_RUNTIME_FASTPATH_CONTEXT", "Context needs SHA-256 policy, package graph and output contract hashes plus model, hardware and trust identifiers.", "context"));
  if (!isNonNegativeInt(request.issuedAtMs)) d.push(refuse("Galerina_RUNTIME_FASTPATH_TIME", "issuedAtMs must be a non-negative safe integer.", "issuedAtMs"));
  if (!isPositiveInt(request.leaseMs) || request.leaseMs > MAX_FAST_PATH_LEASE_MS) d.push(refuse("Galerina_RUNTIME_FASTPATH_LEASE", `Fast path leases run 1..${MAX_FAST_PATH_LEASE_MS} ms.`, "leaseMs"));
  if (d.length > 0) return Object.freeze({ diagnostics: Object.freeze(d) });
  const c = request.context;
  const signature: FastPathSignature = Object.freeze({
    schema: FAST_PATH_SIGNATURE_SCHEMA,
    signatureId: request.signatureId,
    workloadKey: request.workloadKey,
    leaseId: request.leaseId,
    context: Object.freeze({ policyHash: c.policyHash, packageGraphHash: c.packageGraphHash, outputContractHash: c.outputContractHash, modelVersion: c.modelVersion, hardwareProfile: c.hardwareProfile, trustState: c.trustState }),
    issuedAtMs: request.issuedAtMs,
    expiresAtMs: request.issuedAtMs + request.leaseMs,
  });
  return Object.freeze({ signature, diagnostics: Object.freeze([]) });
}

export interface FastPathCurrent {
  readonly workloadKey: string;
  readonly context: FastPathContext;
  readonly nowMs: number;
  readonly revokedLeaseIds?: readonly string[];
  readonly revokedSignatureIds?: readonly string[];
}

export interface FastPathDecision {
  readonly use: boolean;
  readonly invalidations: readonly FastPathInvalidation[];
  /** Always the full list: using a fast path does not skip any of these. */
  readonly stillRequired: typeof FAST_PATH_NEVER_BYPASSES;
}

/**
 * Decide whether a stored signature may be reused now. Every reason is reported, not just the
 * first. A signature is expired at nowMs >= expiresAtMs. A malformed signature, current context or
 * clock is MALFORMED and never used.
 */
export function checkFastPath(signature: FastPathSignature, current: FastPathCurrent): FastPathDecision {
  const decide = (invalidations: FastPathInvalidation[]): FastPathDecision => Object.freeze({ use: invalidations.length === 0, invalidations: Object.freeze(invalidations), stillRequired: FAST_PATH_NEVER_BYPASSES });
  const wellFormed = isRecord(signature) && signature.schema === FAST_PATH_SIGNATURE_SCHEMA &&
    isIdent(signature.signatureId) && isIdent(signature.workloadKey) && isIdent(signature.leaseId) && contextOk(signature.context) &&
    isNonNegativeInt(signature.issuedAtMs) && isNonNegativeInt(signature.expiresAtMs) && signature.expiresAtMs > signature.issuedAtMs;
  if (!wellFormed || !isRecord(current) || !isIdent(current.workloadKey) || !contextOk(current.context) || !isNonNegativeInt(current.nowMs)) return decide(["MALFORMED"]);
  const out: FastPathInvalidation[] = [];
  if (signature.workloadKey !== current.workloadKey) out.push("WORKLOAD_MISMATCH");
  if (signature.expiresAtMs - signature.issuedAtMs > MAX_FAST_PATH_LEASE_MS) out.push("LEASE_TOO_LONG");
  if (current.nowMs < signature.issuedAtMs) out.push("NOT_YET_VALID");
  if (current.nowMs >= signature.expiresAtMs) out.push("EXPIRED");
  const revokedLeases = Array.isArray(current.revokedLeaseIds) ? current.revokedLeaseIds : [];
  const revokedSignatures = Array.isArray(current.revokedSignatureIds) ? current.revokedSignatureIds : [];
  if (revokedLeases.includes(signature.leaseId) || revokedSignatures.includes(signature.signatureId)) out.push("REVOKED");
  for (const [field, reason] of CONTEXT_FIELDS) if (signature.context[field] !== current.context[field]) out.push(reason);
  return decide(out);
}

// ── AI compute plan runtime hooks ──────────────────────────────────────────
export const AI_COMPUTE_PLAN_SCHEMA = "galerina.runtime.ai-compute-plan.v1";
export type AiDataSensitivity = "public" | "internal" | "confidential" | "restricted";
export type AiComputeTarget = "cpu" | "gpu" | "npu" | "wasm";
export type AiPrecision = "fp32" | "fp16" | "bf16" | "int8" | "int4";
const SENSITIVITY_RANK: Readonly<Record<AiDataSensitivity, number>> = Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });
const TARGETS: readonly AiComputeTarget[] = ["cpu", "gpu", "npu", "wasm"];
const PRECISIONS: readonly AiPrecision[] = ["fp32", "fp16", "bf16", "int8", "int4"];

export interface AiComputePlan {
  readonly schema: typeof AI_COMPUTE_PLAN_SCHEMA;
  readonly planId: string;
  readonly inputType: string;
  readonly outputType: string;
  readonly modelClass: string;
  readonly dataSensitivity: AiDataSensitivity;
  readonly precision: AiPrecision;
  readonly latencyTargetMs: number;
  readonly computeTarget: AiComputeTarget;
  readonly memoryBytes: number;
  readonly allowedTools: readonly string[];
  readonly audit: { readonly required: true; readonly recordInputs: boolean; readonly recordOutputs: boolean };
}

export interface AiComputePolicy {
  readonly allowedModelClasses: readonly string[];
  readonly allowedTargets: readonly AiComputeTarget[];
  /** Highest data sensitivity each target may process. A target with no entry may process nothing. */
  readonly maxSensitivityByTarget: Readonly<Partial<Record<AiComputeTarget, AiDataSensitivity>>>;
  readonly allowedTools: readonly string[];
  readonly maxMemoryBytes: number;
}

/** Admits nothing: no model classes, targets, sensitivities or tools, and zero memory. */
export const DEFAULT_AI_COMPUTE_POLICY: AiComputePolicy = Object.freeze({
  allowedModelClasses: Object.freeze([]),
  allowedTargets: Object.freeze([]),
  maxSensitivityByTarget: Object.freeze({}),
  allowedTools: Object.freeze([]),
  maxMemoryBytes: 0,
});

/** Pre-execution hook: the plan must be well formed and fit the policy before any model runs. */
export function admitAiComputePlan(plan: AiComputePlan, policy: AiComputePolicy = DEFAULT_AI_COMPUTE_POLICY): RuntimePolicyVerdict {
  if (!isRecord(plan)) return verdictOf([refuse("Galerina_RUNTIME_AI_PLAN_MALFORMED", "AI compute plan must be a plain record.", "plan")]);
  if (!isRecord(policy)) return verdictOf([refuse("Galerina_RUNTIME_AI_POLICY_MALFORMED", "AI compute policy must be a plain record.", "policy")]);
  const d: RuntimePolicyDiagnostic[] = [];
  if (plan.schema !== AI_COMPUTE_PLAN_SCHEMA) d.push(refuse("Galerina_RUNTIME_AI_PLAN_SCHEMA", "AI compute plan schema is not supported.", "schema"));
  if (!isIdent(plan.planId)) d.push(refuse("Galerina_RUNTIME_AI_PLAN_ID", "Plan id must be an identifier.", "planId"));
  for (const key of ["inputType", "outputType"] as const) {
    if (typeof plan[key] !== "string" || !TYPE_NAME.test(plan[key])) d.push(refuse("Galerina_RUNTIME_AI_PLAN_TYPE", "Input and output types must be UpperCamel type names.", key));
  }
  const allowedClasses = Array.isArray(policy.allowedModelClasses) ? policy.allowedModelClasses : [];
  if (!isIdent(plan.modelClass) || !allowedClasses.includes(plan.modelClass)) d.push(refuse("Galerina_RUNTIME_AI_PLAN_MODEL_CLASS", "Model class is not allowed by policy.", "modelClass"));
  if (!PRECISIONS.includes(plan.precision)) d.push(refuse("Galerina_RUNTIME_AI_PLAN_PRECISION", "Precision must be fp32, fp16, bf16, int8 or int4.", "precision"));
  if (!isPositiveInt(plan.latencyTargetMs)) d.push(refuse("Galerina_RUNTIME_AI_PLAN_LATENCY", "Latency target must be a positive safe integer.", "latencyTargetMs"));
  const allowedTargets = Array.isArray(policy.allowedTargets) ? policy.allowedTargets : [];
  if (!TARGETS.includes(plan.computeTarget) || !allowedTargets.includes(plan.computeTarget)) {
    d.push(refuse("Galerina_RUNTIME_AI_PLAN_TARGET", "Compute target is not allowed by policy.", "computeTarget"));
  }
  if (!Object.prototype.hasOwnProperty.call(SENSITIVITY_RANK, plan.dataSensitivity as string)) {
    d.push(refuse("Galerina_RUNTIME_AI_PLAN_SENSITIVITY", "Data sensitivity must be public, internal, confidential or restricted.", "dataSensitivity"));
  } else {
    const caps = isRecord(policy.maxSensitivityByTarget) ? policy.maxSensitivityByTarget : {};
    const cap = Object.prototype.hasOwnProperty.call(caps, plan.computeTarget as string) ? (caps as Record<string, unknown>)[plan.computeTarget] : undefined;
    const capRank = typeof cap === "string" && Object.prototype.hasOwnProperty.call(SENSITIVITY_RANK, cap) ? SENSITIVITY_RANK[cap as AiDataSensitivity] : -1;
    if (SENSITIVITY_RANK[plan.dataSensitivity] > capRank) d.push(refuse("Galerina_RUNTIME_AI_PLAN_SENSITIVITY_TARGET", "This target may not process data at this sensitivity.", "dataSensitivity"));
  }
  const maxMemory = isNonNegativeInt(policy.maxMemoryBytes) ? policy.maxMemoryBytes : 0;
  if (!isPositiveInt(plan.memoryBytes) || plan.memoryBytes > maxMemory) d.push(refuse("Galerina_RUNTIME_AI_PLAN_MEMORY", "Memory must be positive and within the policy limit.", "memoryBytes"));
  const tools = identList(plan.allowedTools, "allowedTools", "Galerina_RUNTIME_AI_PLAN_TOOLS", d);
  const policyTools = Array.isArray(policy.allowedTools) ? policy.allowedTools : [];
  if (!tools.every((tool) => policyTools.includes(tool))) d.push(refuse("Galerina_RUNTIME_AI_PLAN_TOOL_NOT_ALLOWED", "Every tool in the plan must be allowed by policy.", "allowedTools"));
  if (!isRecord(plan.audit) || plan.audit.required !== true || typeof plan.audit.recordInputs !== "boolean" || typeof plan.audit.recordOutputs !== "boolean") {
    d.push(refuse("Galerina_RUNTIME_AI_PLAN_AUDIT", "AI compute plans require audit with explicit input and output recording choices.", "audit"));
  }
  return verdictOf(d);
}

/**
 * Post-execution hook: typed output validation. The caller supplies the validator for the
 * plan's outputType; anything but a literal `true` (including a throw) refuses the output.
 * The output is never echoed.
 */
export function checkAiComputeOutput(plan: AiComputePlan, output: unknown, validateOutput: (value: unknown) => boolean): RuntimePolicyVerdict {
  if (!isRecord(plan) || typeof plan.outputType !== "string" || !TYPE_NAME.test(plan.outputType)) return verdictOf([refuse("Galerina_RUNTIME_AI_PLAN_MALFORMED", "AI compute plan must declare an output type.", "plan")]);
  if (typeof validateOutput !== "function") return verdictOf([refuse("Galerina_RUNTIME_AI_OUTPUT_VALIDATOR", "An output validator is required.", "validateOutput")]);
  let ok = false;
  try {
    ok = validateOutput(output) === true;
  } catch {
    ok = false;
  }
  return verdictOf(ok ? [] : [refuse("Galerina_RUNTIME_AI_OUTPUT_CONTRACT", "AI output does not match the declared output type.", "output")]);
}
