// Runtime policy contracts (TODO pass, Grok 2026-10-05).
//
// Pure, fail-closed decisions for stream backpressure, memory policy, the Node-hosted
// adapter, host overhead reporting, target fallback, resource budgets and malicious-data
// intake. None of them performs I/O or executes guest code; each returns a typed verdict
// with RuntimeDiagnostic-shaped diagnostics. Defaults deny: zero network, tools and
// accelerator budget, no fallback, no shared or executable memory, no child processes.

export interface RuntimePolicyDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export interface RuntimePolicyVerdict {
  readonly allowed: boolean;
  readonly diagnostics: readonly RuntimePolicyDiagnostic[];
}

const refuse = (code: string, message: string, path: string): RuntimePolicyDiagnostic => ({ code, severity: "error", message, path });
const verdictOf = (diagnostics: readonly RuntimePolicyDiagnostic[]): RuntimePolicyVerdict => ({ allowed: diagnostics.length === 0, diagnostics });
const isPositiveInt = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInt = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

// ── stream backpressure ──────────────────────────────────────────────────────
// There is deliberately no "drop" overflow mode: a governed stream never loses data
// silently. Over the high-water mark the producer pauses or the stream fails.
export interface StreamBackpressurePolicy {
  readonly highWaterMarkItems: number;
  readonly highWaterMarkBytes: number;
  readonly maxItemBytes: number;
  readonly overflow: "pause-producer" | "fail-stream";
}

export interface StreamBufferState {
  readonly bufferedItems: number;
  readonly bufferedBytes: number;
  readonly incomingBytes: number;
}

export type StreamBackpressureAction = "accept" | "pause-producer" | "fail-stream";

export function validateStreamBackpressurePolicy(policy: StreamBackpressurePolicy): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (!isPositiveInt(policy.highWaterMarkItems)) d.push(refuse("Galerina_RUNTIME_STREAM_HWM_ITEMS", "High-water mark (items) must be a positive safe integer.", "highWaterMarkItems"));
  if (!isPositiveInt(policy.highWaterMarkBytes)) d.push(refuse("Galerina_RUNTIME_STREAM_HWM_BYTES", "High-water mark (bytes) must be a positive safe integer.", "highWaterMarkBytes"));
  if (!isPositiveInt(policy.maxItemBytes) || policy.maxItemBytes > policy.highWaterMarkBytes) d.push(refuse("Galerina_RUNTIME_STREAM_ITEM_BYTES", "Max item size must be positive and fit the byte high-water mark.", "maxItemBytes"));
  if (policy.overflow !== "pause-producer" && policy.overflow !== "fail-stream") d.push(refuse("Galerina_RUNTIME_STREAM_OVERFLOW_MODE", "Overflow must pause the producer or fail the stream; dropping is never allowed.", "overflow"));
  return verdictOf(d);
}

export function decideStreamBackpressure(state: StreamBufferState, policy: StreamBackpressurePolicy): StreamBackpressureAction {
  if (!validateStreamBackpressurePolicy(policy).allowed) return "fail-stream";
  if (![state.bufferedItems, state.bufferedBytes, state.incomingBytes].every(isNonNegativeInt)) return "fail-stream";
  if (state.incomingBytes > policy.maxItemBytes) return "fail-stream";
  const overItems = state.bufferedItems + 1 > policy.highWaterMarkItems;
  const overBytes = state.bufferedBytes + state.incomingBytes > policy.highWaterMarkBytes;
  if (overItems || overBytes) return policy.overflow;
  return "accept";
}

// ── runtime memory policy ───────────────────────────────────────────────────
export interface RuntimeMemoryPolicy {
  readonly maxHeapBytes: number;
  readonly maxSingleAllocationBytes: number;
  readonly zeroOnFree: boolean;
  readonly allowSharedMemory: boolean;
  readonly allowExecutableMemory: boolean;
}

export const DEFAULT_RUNTIME_MEMORY_POLICY: RuntimeMemoryPolicy = Object.freeze({
  maxHeapBytes: 256 * 1024 * 1024,
  maxSingleAllocationBytes: 64 * 1024 * 1024,
  zeroOnFree: true,
  allowSharedMemory: false,
  allowExecutableMemory: false,
});

// Executable memory stays with the separately evidenced RD-0662 W^X floor; a general
// runtime memory policy may never enable it.
export function validateRuntimeMemoryPolicy(policy: RuntimeMemoryPolicy): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (!isPositiveInt(policy.maxHeapBytes)) d.push(refuse("Galerina_RUNTIME_MEMORY_HEAP", "Heap budget must be a positive safe integer.", "maxHeapBytes"));
  if (!isPositiveInt(policy.maxSingleAllocationBytes) || policy.maxSingleAllocationBytes > policy.maxHeapBytes) d.push(refuse("Galerina_RUNTIME_MEMORY_ALLOCATION", "Single-allocation cap must be positive and within the heap budget.", "maxSingleAllocationBytes"));
  if (policy.zeroOnFree !== true) d.push(refuse("Galerina_RUNTIME_MEMORY_ZERO_ON_FREE", "Freed memory must be zeroed.", "zeroOnFree"));
  if (policy.allowSharedMemory !== false) d.push(refuse("Galerina_RUNTIME_MEMORY_SHARED", "Shared memory is not allowed by the general runtime policy.", "allowSharedMemory"));
  if (policy.allowExecutableMemory !== false) d.push(refuse("Galerina_RUNTIME_MEMORY_EXECUTABLE", "Executable memory is reserved to the RD-0662 W^X floor.", "allowExecutableMemory"));
  return verdictOf(d);
}

export function decideRuntimeAllocation(currentHeapBytes: number, requestBytes: number, policy: RuntimeMemoryPolicy): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [...validateRuntimeMemoryPolicy(policy).diagnostics];
  if (!isNonNegativeInt(currentHeapBytes) || !isPositiveInt(requestBytes)) d.push(refuse("Galerina_RUNTIME_MEMORY_REQUEST_INVALID", "Heap usage and request must be safe integers.", "requestBytes"));
  else {
    if (requestBytes > policy.maxSingleAllocationBytes) d.push(refuse("Galerina_RUNTIME_MEMORY_ALLOCATION_TOO_LARGE", "Allocation exceeds the single-allocation cap.", "requestBytes"));
    if (currentHeapBytes + requestBytes > policy.maxHeapBytes) d.push(refuse("Galerina_RUNTIME_MEMORY_HEAP_EXHAUSTED", "Allocation would exceed the heap budget.", "requestBytes"));
  }
  return verdictOf(d);
}

// ── Node-hosted runtime adapter ─────────────────────────────────────────────
export interface NodeHostAdapterDescriptor {
  readonly nodeMajor: number;
  readonly permissionModelEnabled: boolean;
  readonly allowedBuiltins: readonly string[];
  readonly allowNativeAddons: boolean;
  readonly allowEval: boolean;
}

// Builtins a governed guest may ever be handed. Process, VM, inspector, worker and
// native-module surfaces are absent on purpose and cannot be added by a descriptor.
export const NODE_HOST_BUILTIN_ALLOWLIST: readonly string[] = Object.freeze([
  "node:buffer", "node:crypto", "node:events", "node:path", "node:stream", "node:string_decoder", "node:url", "node:util",
]);

export function validateNodeHostAdapter(descriptor: NodeHostAdapterDescriptor): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (!Number.isSafeInteger(descriptor.nodeMajor) || descriptor.nodeMajor < 18) d.push(refuse("Galerina_RUNTIME_NODE_VERSION", "Node-hosted runtime requires Node 18 or later.", "nodeMajor"));
  if (descriptor.permissionModelEnabled !== true) d.push(refuse("Galerina_RUNTIME_NODE_PERMISSION_MODEL", "The Node permission model must be enabled.", "permissionModelEnabled"));
  if (descriptor.allowNativeAddons !== false) d.push(refuse("Galerina_RUNTIME_NODE_NATIVE_ADDONS", "Native addons are never loaded for guests.", "allowNativeAddons"));
  if (descriptor.allowEval !== false) d.push(refuse("Galerina_RUNTIME_NODE_EVAL", "Dynamic code evaluation is never allowed.", "allowEval"));
  const seen = new Set<string>();
  descriptor.allowedBuiltins.forEach((name, index) => {
    if (!NODE_HOST_BUILTIN_ALLOWLIST.includes(name)) d.push(refuse("Galerina_RUNTIME_NODE_BUILTIN_DENIED", `Builtin "${name}" is not on the host allowlist (use the node: prefix).`, `allowedBuiltins.${index}`));
    if (seen.has(name)) d.push(refuse("Galerina_RUNTIME_NODE_BUILTIN_DUPLICATE", `Builtin "${name}" is listed twice.`, `allowedBuiltins.${index}`));
    seen.add(name);
  });
  return verdictOf(d);
}

// ── host-runtime overhead report ────────────────────────────────────────────
export interface HostOverheadSample {
  readonly label: string;
  readonly guestNs: number;
  readonly hostNs: number;
}

export interface HostOverheadReport {
  readonly schema: "galerina.runtime.host-overhead-report.v1";
  readonly status: "MEASURED" | "UNMEASURED" | "REFUSED";
  readonly samples: number;
  readonly guestNsTotal: number;
  readonly hostNsTotal: number;
  readonly overheadPermille: number;
  readonly refusedLabels: readonly string[];
}

// Integer-only: totals are safe-integer nanoseconds and overhead is reported as an
// integer permille of guest time (rounded down). A zero guest total is UNMEASURED rather
// than a division by zero; any malformed sample REFUSES the whole report.
export function createHostOverheadReport(samples: readonly HostOverheadSample[]): HostOverheadReport {
  const refusedLabels = samples.filter((s) => s.label.trim().length === 0 || !isNonNegativeInt(s.guestNs) || !isNonNegativeInt(s.hostNs)).map((s) => s.label);
  const guestNsTotal = refusedLabels.length > 0 ? 0 : samples.reduce((sum, s) => sum + s.guestNs, 0);
  const hostNsTotal = refusedLabels.length > 0 ? 0 : samples.reduce((sum, s) => sum + s.hostNs, 0);
  const overflow = !Number.isSafeInteger(guestNsTotal) || !Number.isSafeInteger(hostNsTotal) || !Number.isSafeInteger(hostNsTotal * 1000);
  const status = refusedLabels.length > 0 || overflow ? "REFUSED" : guestNsTotal === 0 ? "UNMEASURED" : "MEASURED";
  return {
    schema: "galerina.runtime.host-overhead-report.v1",
    status,
    samples: samples.length,
    guestNsTotal: status === "REFUSED" ? 0 : guestNsTotal,
    hostNsTotal: status === "REFUSED" ? 0 : hostNsTotal,
    overheadPermille: status === "MEASURED" ? Math.floor((hostNsTotal * 1000) / guestNsTotal) : 0,
    refusedLabels,
  };
}

// ── target fallback ─────────────────────────────────────────────────────────
export interface RuntimeTargetCapability {
  readonly target: string;
  readonly available: boolean;
  readonly semantics: "exact" | "approximate";
}

export interface TargetFallbackPolicy {
  readonly preferred: string;
  readonly fallbackChain: readonly string[];
  readonly allowFallback: boolean;
}

export const DEFAULT_TARGET_FALLBACK_POLICY: TargetFallbackPolicy = Object.freeze({ preferred: "cpu", fallbackChain: [], allowFallback: false });

export interface TargetFallbackDecision {
  readonly status: "PREFERRED" | "FALLBACK" | "REFUSED";
  readonly target: string;
  readonly reasons: readonly string[];
}

// Fallback is opt-in, follows only the declared chain, and never lands on a target with
// approximate semantics. Every skipped target is recorded; nothing falls back silently.
export function decideTargetFallback(targets: readonly RuntimeTargetCapability[], policy: TargetFallbackPolicy): TargetFallbackDecision {
  const reasons: string[] = [];
  const usable = (name: string): boolean => {
    const at = targets.findIndex((t) => t.target === name);
    if (at < 0) { reasons.push(`${name}: not declared`); return false; }
    const t = targets[at] as RuntimeTargetCapability;
    if (!t.available) { reasons.push(`${name}: unavailable`); return false; }
    if (t.semantics !== "exact") { reasons.push(`${name}: approximate semantics`); return false; }
    return true;
  };
  if (usable(policy.preferred)) return { status: "PREFERRED", target: policy.preferred, reasons };
  if (!policy.allowFallback) {
    reasons.push("fallback disabled");
    return { status: "REFUSED", target: "", reasons };
  }
  for (const name of policy.fallbackChain) {
    if (name === policy.preferred) continue;
    if (usable(name)) return { status: "FALLBACK", target: name, reasons };
  }
  reasons.push("fallback chain exhausted");
  return { status: "REFUSED", target: "", reasons };
}

// ── RD-0855 governed target fallback ────────────────────────────────────────
// decideTargetFallback stays the availability-only helper. This extension classifies
// skip reasons, bounds attempts, and never grants SLIDE admission or VOK authority.
// 8/16-trit execution profiles are unregistered before v1. Binary step 3 stays HOLD.

export const ADMITTED_TRIT_WIDTHS_V1: readonly number[] = Object.freeze([1, 32, 64, 256]);

export type TargetSkipClass =
  | "unavailable"
  | "incompatible"
  | "deny"
  | "revoked"
  | "integrity_invalid"
  | "unknown_outcome"
  | "partial_effect"
  | "cleanup_failure"
  | "approximate_semantics"
  | "undeclared"
  | "unregistered_width"
  | "binary_step_unresolved"
  | "budget_exhausted"
  | "deadline_exceeded"
  | "effect_occurred"
  | "replay_uncertain"
  | "skip_class_required";

export const FALLBACK_ELIGIBLE_SKIP_CLASSES: readonly TargetSkipClass[] = Object.freeze(["unavailable", "incompatible", "approximate_semantics"]);

export const TERMINAL_TARGET_SKIP_CLASSES: readonly TargetSkipClass[] = Object.freeze([
  "deny", "revoked", "integrity_invalid", "unknown_outcome", "partial_effect", "cleanup_failure",
  "effect_occurred", "replay_uncertain", "skip_class_required",
]);

export type FallbackTier = "requested-width" | "k3-trit" | "binary-same-semantics";

export const FALLBACK_TIER_ORDER: readonly FallbackTier[] = Object.freeze([
  "requested-width", "k3-trit", "binary-same-semantics",
]);

export interface AlternativeAttemptBudget {
  readonly maxAttempts: number;
  readonly deadlineMs: number;
}

export const DEFAULT_ALTERNATIVE_ATTEMPT_BUDGET: AlternativeAttemptBudget = Object.freeze({
  maxAttempts: 2,
  deadlineMs: 10_000,
});

export const ALTERNATIVE_ATTEMPT_BUDGET_OWNER = "OWNER-REVISIT" as const;

export interface AlternativeAttemptState {
  readonly attemptsAlready: number;
  readonly elapsedMs: number;
}

export const DEFAULT_ALTERNATIVE_ATTEMPT_STATE: AlternativeAttemptState = Object.freeze({
  attemptsAlready: 0,
  elapsedMs: 0,
});

export interface GovernedTargetCandidate {
  readonly target: string;
  readonly available: boolean;
  readonly semantics: "exact" | "approximate";
  readonly skipClass: TargetSkipClass | "none";
  readonly tritWidth: number;
  readonly tier: FallbackTier;
  readonly effectOccurred: boolean;
  readonly provedNonExecution: boolean;
  readonly admittedIdempotency: boolean;
}

export interface GovernedTargetFallbackPolicy {
  readonly preferred: string;
  readonly fallbackChain: readonly string[];
  readonly allowFallback: boolean;
  readonly requestedTritWidth: number;
  readonly attemptBudget: AlternativeAttemptBudget;
}

export const DEFAULT_GOVERNED_TARGET_FALLBACK_POLICY: GovernedTargetFallbackPolicy = Object.freeze({
  preferred: "cpu",
  fallbackChain: [],
  allowFallback: false,
  requestedTritWidth: 1,
  attemptBudget: DEFAULT_ALTERNATIVE_ATTEMPT_BUDGET,
});

export interface GovernedTargetFallbackDecision {
  readonly status: "PREFERRED" | "FALLBACK" | "REFUSED";
  readonly target: string;
  readonly reasons: readonly string[];
  readonly skipClass: TargetSkipClass | "none";
  readonly keptRefusal: string;
  readonly selectedTier: FallbackTier | "";
  readonly attemptsUsed: number;
  readonly remainingAttempts: number;
  readonly authorityReleased: false;
  readonly slideAdmission: "not-evaluated";
  readonly vokDecision: "not-evaluated";
  readonly diagnostics: readonly RuntimePolicyDiagnostic[];
}

const governedBase = {
  authorityReleased: false as const,
  slideAdmission: "not-evaluated" as const,
  vokDecision: "not-evaluated" as const,
};

export function validateAlternativeAttemptBudget(budget: AlternativeAttemptBudget): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (!isPositiveInt(budget.maxAttempts)) d.push(refuse("Galerina_RUNTIME_FALLBACK_BUDGET_INVALID", "Attempt budget maxAttempts must be a positive safe integer.", "maxAttempts"));
  if (!isPositiveInt(budget.deadlineMs)) d.push(refuse("Galerina_RUNTIME_FALLBACK_DEADLINE_INVALID", "Attempt budget deadlineMs must be a positive safe integer.", "deadlineMs"));
  return verdictOf(d);
}

export function validateGovernedTargetFallbackPolicy(policy: GovernedTargetFallbackPolicy): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [...validateAlternativeAttemptBudget(policy.attemptBudget).diagnostics];
  if (typeof policy.preferred !== "string" || policy.preferred.trim().length === 0) d.push(refuse("Galerina_RUNTIME_FALLBACK_PREFERRED", "Preferred target must be a non-empty name.", "preferred"));
  if (!Array.isArray(policy.fallbackChain) || policy.fallbackChain.some((name) => typeof name !== "string" || name.trim().length === 0)) {
    d.push(refuse("Galerina_RUNTIME_FALLBACK_CHAIN", "Fallback chain must be a list of non-empty names.", "fallbackChain"));
  }
  if (policy.allowFallback !== true && policy.allowFallback !== false) d.push(refuse("Galerina_RUNTIME_FALLBACK_FLAG", "allowFallback must be a boolean.", "allowFallback"));
  if (!isPositiveInt(policy.requestedTritWidth)) d.push(refuse("Galerina_RUNTIME_FALLBACK_WIDTH_INVALID", "Requested trit-width must be a positive safe integer.", "requestedTritWidth"));
  else if (!ADMITTED_TRIT_WIDTHS_V1.includes(policy.requestedTritWidth)) d.push(refuse("Galerina_RUNTIME_FALLBACK_WIDTH_UNREGISTERED", "Requested trit-width is not an admitted v1 execution profile.", "requestedTritWidth"));
  return verdictOf(d);
}

export function classifyTargetSkip(candidate: GovernedTargetCandidate): TargetSkipClass | "none" {
  if (typeof candidate.target !== "string" || candidate.target.trim().length === 0) return "skip_class_required";
  if (candidate.tier !== "requested-width" && candidate.tier !== "k3-trit" && candidate.tier !== "binary-same-semantics") return "skip_class_required";
  if (!isPositiveInt(candidate.tritWidth) || !ADMITTED_TRIT_WIDTHS_V1.includes(candidate.tritWidth)) return "unregistered_width";
  if (candidate.tier === "binary-same-semantics") return "binary_step_unresolved";
  if (candidate.effectOccurred && candidate.provedNonExecution) return "replay_uncertain";
  if (candidate.effectOccurred) return "effect_occurred";
  if (candidate.skipClass === "unknown_outcome" || candidate.skipClass === "partial_effect") return candidate.skipClass;
  if (candidate.skipClass === "deny" || candidate.skipClass === "revoked" || candidate.skipClass === "integrity_invalid" || candidate.skipClass === "cleanup_failure") return candidate.skipClass;
  if (candidate.semantics !== "exact") return "approximate_semantics";
  if (!candidate.available) {
    if (candidate.skipClass === "unavailable" || candidate.skipClass === "incompatible") return candidate.skipClass;
    return "skip_class_required";
  }
  if (candidate.skipClass !== "none") return candidate.skipClass;
  return "none";
}

function remainingAttemptsOf(used: number, maxAttempts: number): number {
  return used >= maxAttempts ? 0 : maxAttempts - used;
}

function governedDecision(
  status: "PREFERRED" | "FALLBACK" | "REFUSED",
  target: string,
  reasons: readonly string[],
  skipClass: TargetSkipClass | "none",
  keptRefusal: string,
  selectedTier: FallbackTier | "",
  attemptsUsed: number,
  maxAttempts: number,
  diagnostics: readonly RuntimePolicyDiagnostic[],
): GovernedTargetFallbackDecision {
  return {
    status,
    target,
    reasons,
    skipClass,
    keptRefusal,
    selectedTier,
    attemptsUsed,
    remainingAttempts: remainingAttemptsOf(attemptsUsed, maxAttempts),
    diagnostics,
    ...governedBase,
  };
}

export function decideGovernedTargetFallback(
  candidates: readonly GovernedTargetCandidate[],
  policy: GovernedTargetFallbackPolicy,
  state: AlternativeAttemptState = DEFAULT_ALTERNATIVE_ATTEMPT_STATE,
): GovernedTargetFallbackDecision {
  const policyVerdict = validateGovernedTargetFallbackPolicy(policy);
  const maxAttempts = isPositiveInt(policy.attemptBudget.maxAttempts) ? policy.attemptBudget.maxAttempts : 1;
  if (!policyVerdict.allowed) {
    const widthRefused = policyVerdict.diagnostics.some((d) => d.code === "Galerina_RUNTIME_FALLBACK_WIDTH_UNREGISTERED" || d.code === "Galerina_RUNTIME_FALLBACK_WIDTH_INVALID");
    return governedDecision("REFUSED", "", ["policy invalid"], widthRefused ? "unregistered_width" : "skip_class_required", widthRefused ? "unregistered_width" : "skip_class_required", "", state.attemptsAlready, maxAttempts, policyVerdict.diagnostics);
  }
  if (!isNonNegativeInt(state.attemptsAlready) || !isNonNegativeInt(state.elapsedMs)) {
    return governedDecision("REFUSED", "", ["attempt state invalid"], "skip_class_required", "skip_class_required", "", state.attemptsAlready, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_STATE_INVALID", "Attempt state must use non-negative safe integers.", "attemptsAlready")]);
  }
  if (state.attemptsAlready >= policy.attemptBudget.maxAttempts) {
    return governedDecision("REFUSED", "", ["attempt budget exhausted"], "budget_exhausted", "budget_exhausted", "", state.attemptsAlready, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_BUDGET_EXHAUSTED", "No remaining alternative attempts.", "maxAttempts")]);
  }
  if (state.elapsedMs >= policy.attemptBudget.deadlineMs) {
    return governedDecision("REFUSED", "", ["attempt deadline exceeded"], "deadline_exceeded", "deadline_exceeded", "", state.attemptsAlready, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_DEADLINE", "Alternative-attempt deadline has already elapsed.", "deadlineMs")]);
  }

  const reasons: string[] = [];
  const findCandidate = (name: string): GovernedTargetCandidate | undefined => candidates.find((c) => c.target === name);

  const classifyNamed = (name: string): { candidate: GovernedTargetCandidate | undefined; skip: TargetSkipClass | "none" } => {
    const candidate = findCandidate(name);
    if (candidate === undefined) return { candidate: undefined, skip: "undeclared" };
    return { candidate, skip: classifyTargetSkip(candidate) };
  };

  const preferred = classifyNamed(policy.preferred);
  if (preferred.skip === "none" && preferred.candidate !== undefined) {
    const used = state.attemptsAlready + 1;
    return governedDecision("PREFERRED", policy.preferred, reasons, "none", "", preferred.candidate.tier, used, maxAttempts, []);
  }
  reasons.push(`${policy.preferred}: ${preferred.skip}`);
  if (TERMINAL_TARGET_SKIP_CLASSES.includes(preferred.skip as TargetSkipClass)) {
    const used = state.attemptsAlready + 1;
    return governedDecision("REFUSED", "", reasons, preferred.skip, preferred.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_TERMINAL", "Terminal skip refuses fallback and keeps the original refusal.", "skipClass")]);
  }
  if (!FALLBACK_ELIGIBLE_SKIP_CLASSES.includes(preferred.skip as TargetSkipClass)) {
    const used = state.attemptsAlready + 1;
    return governedDecision("REFUSED", "", reasons, preferred.skip, preferred.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_NOT_ELIGIBLE", "Only authenticated pre-effect unavailability or incompatibility may propose fallback.", "skipClass")]);
  }
  if (!policy.allowFallback) {
    reasons.push("fallback disabled");
    const used = state.attemptsAlready + 1;
    return governedDecision("REFUSED", "", reasons, preferred.skip, preferred.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_DISABLED", "Fallback is disabled.", "allowFallback")]);
  }
  if (state.attemptsAlready + 2 > policy.attemptBudget.maxAttempts) {
    reasons.push("attempt budget exhausted");
    const used = state.attemptsAlready + 1;
    return governedDecision("REFUSED", "", reasons, "budget_exhausted", preferred.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_BUDGET_EXHAUSTED", "Fallback would exceed the attempt budget.", "maxAttempts")]);
  }

  for (const name of policy.fallbackChain) {
    if (name === policy.preferred) continue;
    const next = classifyNamed(name);
    if (next.skip === "undeclared") { reasons.push(`${name}: undeclared`); continue; }
    reasons.push(`${name}: ${next.skip}`);
    if (TERMINAL_TARGET_SKIP_CLASSES.includes(next.skip as TargetSkipClass)) {
      const used = state.attemptsAlready + 1;
      return governedDecision("REFUSED", "", reasons, next.skip, next.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_TERMINAL", "Terminal skip refuses fallback and keeps the original refusal.", "skipClass")]);
    }
    if (next.skip === "none" && next.candidate !== undefined) {
      const used = state.attemptsAlready + 2;
      return governedDecision("FALLBACK", name, reasons, preferred.skip, "", next.candidate.tier, used, maxAttempts, []);
    }
  }
  reasons.push("fallback chain exhausted");
  const used = state.attemptsAlready + 1;
  return governedDecision("REFUSED", "", reasons, preferred.skip, preferred.skip, "", used, maxAttempts, [refuse("Galerina_RUNTIME_FALLBACK_CHAIN_EXHAUSTED", "No admitted alternative remains after classified skips.", "fallbackChain")]);
}

// ── resource budget ─────────────────────────────────────────────────────────
export interface RuntimeResourceBudget {
  readonly cpuMs: number;
  readonly wallMs: number;
  readonly memoryBytes: number;
  readonly recursionDepth: number;
  readonly loopIterations: number;
  readonly tasks: number;
  readonly networkRequests: number;
  readonly toolCalls: number;
  readonly acceleratorMs: number;
}

export type RuntimeResourceKind = keyof RuntimeResourceBudget;

export const RUNTIME_RESOURCE_KINDS: readonly RuntimeResourceKind[] = Object.freeze([
  "cpuMs", "wallMs", "memoryBytes", "recursionDepth", "loopIterations", "tasks", "networkRequests", "toolCalls", "acceleratorMs",
]);

// Compute bounds are positive; outward-facing budgets (network, tools, accelerator)
// default to zero: nothing is granted that was not asked for.
export const DEFAULT_RUNTIME_RESOURCE_BUDGET: RuntimeResourceBudget = Object.freeze({
  cpuMs: 5_000, wallMs: 10_000, memoryBytes: 256 * 1024 * 1024, recursionDepth: 512, loopIterations: 10_000_000, tasks: 64,
  networkRequests: 0, toolCalls: 0, acceleratorMs: 0,
});

const MUST_BE_POSITIVE: readonly RuntimeResourceKind[] = ["cpuMs", "wallMs", "memoryBytes", "recursionDepth", "loopIterations", "tasks"];

export function validateRuntimeResourceBudget(budget: RuntimeResourceBudget): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  for (const kind of RUNTIME_RESOURCE_KINDS) {
    const value = budget[kind];
    const ok = MUST_BE_POSITIVE.includes(kind) ? isPositiveInt(value) : isNonNegativeInt(value);
    if (!ok) d.push(refuse("Galerina_RUNTIME_BUDGET_INVALID", `Budget "${kind}" must be a ${MUST_BE_POSITIVE.includes(kind) ? "positive" : "non-negative"} safe integer.`, kind));
  }
  if (isPositiveInt(budget.cpuMs) && isPositiveInt(budget.wallMs) && budget.cpuMs > budget.wallMs * budget.tasks) {
    d.push(refuse("Galerina_RUNTIME_BUDGET_CPU_EXCEEDS_WALL", "CPU budget cannot exceed wall time across all tasks.", "cpuMs"));
  }
  return verdictOf(d);
}

export interface RuntimeResourceCheck {
  readonly verdict: "WITHIN_BUDGET" | "TERMINATE";
  readonly exceeded: readonly RuntimeResourceKind[];
  readonly diagnostics: readonly RuntimePolicyDiagnostic[];
}

export function checkRuntimeResourceUsage(usage: RuntimeResourceBudget, budget: RuntimeResourceBudget): RuntimeResourceCheck {
  const diagnostics: RuntimePolicyDiagnostic[] = [...validateRuntimeResourceBudget(budget).diagnostics];
  const exceeded: RuntimeResourceKind[] = [];
  for (const kind of RUNTIME_RESOURCE_KINDS) {
    if (!isNonNegativeInt(usage[kind])) diagnostics.push(refuse("Galerina_RUNTIME_USAGE_INVALID", `Usage "${kind}" must be a non-negative safe integer.`, kind));
    else if (usage[kind] > budget[kind]) exceeded.push(kind);
  }
  return { verdict: diagnostics.length === 0 && exceeded.length === 0 ? "WITHIN_BUDGET" : "TERMINATE", exceeded, diagnostics };
}

// ── malicious-data intake pipeline ──────────────────────────────────────────
export interface DataIntakePolicy {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxKeys: number;
  readonly maxStringLength: number;
  readonly requiredKeys: readonly string[];
  readonly allowedKeys: readonly string[];
}

export type DataIntakeStage = "policy" | "size" | "parse" | "depth" | "schema" | "canonical" | "ownership";

export interface DataIntakeResult {
  readonly admitted: boolean;
  readonly failedStage: DataIntakeStage | "none";
  readonly diagnostics: readonly RuntimePolicyDiagnostic[];
  readonly owner: string;
  readonly taint: "untrusted";
  readonly value: Readonly<Record<string, unknown>>;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value === Object(value)) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value === Object(value)) {
    for (const child of Object.values(value as object)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Staged, first-failure-wins intake of untrusted JSON text: size before parse; parse;
// depth/key/string bounds and forbidden prototype keys; closed schema; canonical form
// (sorted keys, no whitespace, so duplicate keys and alternative encodings refuse); an
// explicit owner. Admitted data stays tainted "untrusted"; this pipeline never clears it.
export function admitUntrustedData(text: string, policy: DataIntakePolicy, owner: string): DataIntakeResult {
  const fail = (stage: DataIntakeStage, code: string, message: string): DataIntakeResult =>
    ({ admitted: false, failedStage: stage, diagnostics: [refuse(code, message, stage)], owner, taint: "untrusted", value: Object.freeze({}) });
  const validKeys = (keys: unknown): keys is readonly string[] => Array.isArray(keys) && keys.every((key) => typeof key === "string");
  if (policy === null || typeof policy !== "object"
    || !isPositiveInt(policy.maxBytes) || !isPositiveInt(policy.maxDepth)
    || !isPositiveInt(policy.maxKeys) || !isPositiveInt(policy.maxStringLength)
    || !validKeys(policy.requiredKeys) || !validKeys(policy.allowedKeys)
    || policy.requiredKeys.some((key) => !policy.allowedKeys.includes(key))) {
    return fail("policy", "Galerina_RUNTIME_INTAKE_POLICY", "Intake policy bounds and key sets must be valid before processing input.");
  }
  if (typeof text !== "string") return fail("size", "Galerina_RUNTIME_INTAKE_SIZE", "Input must be text.");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > policy.maxBytes) return fail("size", "Galerina_RUNTIME_INTAKE_SIZE", "Input exceeds the byte limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("parse", "Galerina_RUNTIME_INTAKE_PARSE", "Input is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed !== Object(parsed) || Array.isArray(parsed)) return fail("parse", "Galerina_RUNTIME_INTAKE_ROOT", "Input root must be a JSON object.");
  let keys = 0;
  let boundError = "";
  const walk = (node: unknown, depth: number): void => {
    if (boundError.length > 0) return;
    if (depth > policy.maxDepth) { boundError = "depth"; return; }
    if (typeof node === "string" && node.length > policy.maxStringLength) { boundError = "string"; return; }
    if (typeof node === "number" && !Number.isFinite(node)) { boundError = "number"; return; }
    if (typeof node === "object" && node === Object(node)) {
      for (const [k, v] of Object.entries(node as object)) {
        keys += Array.isArray(node) ? 0 : 1;
        if (!Array.isArray(node) && FORBIDDEN_KEYS.has(k)) { boundError = "forbidden"; return; }
        walk(v, depth + 1);
      }
    }
  };
  walk(parsed, 1);
  if (boundError === "forbidden") return fail("depth", "Galerina_RUNTIME_INTAKE_FORBIDDEN_KEY", "Input carries a prototype-pollution key.");
  if (boundError.length > 0) return fail("depth", "Galerina_RUNTIME_INTAKE_BOUNDS", `Input exceeds the ${boundError} bound.`);
  if (keys > policy.maxKeys) return fail("depth", "Galerina_RUNTIME_INTAKE_BOUNDS", "Input exceeds the key-count bound.");
  const record = parsed as Record<string, unknown>;
  const rootKeys = Object.keys(record);
  if (policy.requiredKeys.some((k) => !rootKeys.includes(k)) || rootKeys.some((k) => !policy.allowedKeys.includes(k))) {
    return fail("schema", "Galerina_RUNTIME_INTAKE_SCHEMA", "Input keys do not match the closed schema.");
  }
  if (canonicalJson(record) !== text) return fail("canonical", "Galerina_RUNTIME_INTAKE_CANONICAL", "Input is not in canonical JSON form.");
  if (typeof owner !== "string" || owner.trim().length === 0) return fail("ownership", "Galerina_RUNTIME_INTAKE_OWNER", "Admitted data needs an explicit owner.");
  return { admitted: true, failedStage: "none", diagnostics: [], owner, taint: "untrusted", value: deepFreeze(record) };
}
