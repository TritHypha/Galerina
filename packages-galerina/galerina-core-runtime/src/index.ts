export type RuntimeMode = "checked" | "compiled";

export type RuntimeEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production";

export type RuntimeDiagnosticSeverity = "warning" | "error";

export interface RuntimeContext {
  readonly mode: RuntimeMode;
  readonly projectRoot: string;
  readonly environment: RuntimeEnvironment;
  readonly entryFile?: string;
  readonly timeoutMs?: number;
}

export interface RuntimeDiagnostic {
  readonly code: string;
  readonly severity: RuntimeDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface RuntimeError {
  readonly code: string;
  readonly safeMessage: string;
  readonly sourceLocation?: string;
}

export interface RuntimeResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: RuntimeError;
}

export type RuntimeEffectKind =
  | "filesystem"
  | "network"
  | "environment"
  | "clock"
  | "random"
  | "process";

export interface RuntimeEffect {
  readonly kind: RuntimeEffectKind;
  readonly name: string;
  readonly resource: string;
}

export interface RuntimeEffectPolicy {
  readonly allowedEffects: readonly RuntimeEffectKind[];
  readonly denyProcessEffects: boolean;
  readonly requireExplicitNetworkPermission: boolean;
}

export interface RuntimeEffectDecision {
  readonly effect: RuntimeEffect;
  readonly allowed: boolean;
  readonly reason: string;
}

export interface RuntimeReport {
  readonly mode: RuntimeMode;
  readonly durationMs: number;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly warnings: readonly string[];
  readonly effects: readonly RuntimeEffect[];
  readonly cancelled: boolean;
  readonly timedOut: boolean;
}

export const DEFAULT_RUNTIME_EFFECT_POLICY: RuntimeEffectPolicy = {
  allowedEffects: ["clock", "random"],
  denyProcessEffects: true,
  requireExplicitNetworkPermission: true,
};

export function createRuntimeContext(
  input: RuntimeContext,
): RuntimeContext {
  const diagnostics = validateRuntimeContext(input);
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );

  if (errors.length > 0) {
    throw new Error(errors.map((diagnostic) => diagnostic.message).join(" "));
  }

  return input;
}

export function validateRuntimeContext(
  context: RuntimeContext,
): readonly RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = [];

  if (context.projectRoot.trim().length === 0) {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_PROJECT_ROOT_REQUIRED",
      "error",
      "Runtime context requires a project root.",
      "projectRoot",
    ));
  }

  if (context.timeoutMs !== undefined && context.timeoutMs <= 0) {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_TIMEOUT_INVALID",
      "error",
      "Runtime timeout must be positive when declared.",
      "timeoutMs",
    ));
  }

  if (context.environment === "production" && context.mode === "checked") {
    diagnostics.push(createRuntimeDiagnostic(
      "Galerina_RUNTIME_PRODUCTION_CHECKED_MODE",
      "warning",
      "Production checked mode should be explicitly justified.",
      "mode",
    ));
  }

  return diagnostics;
}

export function okRuntimeResult<T>(value: T): RuntimeResult<T> {
  return { ok: true, value };
}

export function errorRuntimeResult<T = never>(
  error: RuntimeError,
): RuntimeResult<T> {
  return { ok: false, error };
}

export function decideRuntimeEffect(
  effect: RuntimeEffect,
  policy: RuntimeEffectPolicy = DEFAULT_RUNTIME_EFFECT_POLICY,
): RuntimeEffectDecision {
  if (policy.denyProcessEffects && effect.kind === "process") {
    return {
      effect,
      allowed: false,
      reason: "Process effects are denied by runtime policy.",
    };
  }

  if (
    policy.requireExplicitNetworkPermission &&
    effect.kind === "network" &&
    !policy.allowedEffects.includes("network")
  ) {
    return {
      effect,
      allowed: false,
      reason: "Network effects require explicit runtime permission.",
    };
  }

  const allowed = policy.allowedEffects.includes(effect.kind);

  return {
    effect,
    allowed,
    reason: allowed
      ? "Runtime effect is explicitly allowed."
      : "Runtime effect is not listed in the allow policy.",
  };
}

export function createRuntimeReport(input: {
  readonly context: RuntimeContext;
  readonly durationMs: number;
  readonly effects?: readonly RuntimeEffect[];
  readonly diagnostics?: readonly RuntimeDiagnostic[];
  readonly cancelled?: boolean;
  readonly timedOut?: boolean;
}): RuntimeReport {
  const diagnostics = [
    ...validateRuntimeContext(input.context),
    ...(input.diagnostics ?? []),
  ];

  return {
    mode: input.context.mode,
    durationMs: input.durationMs,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
    effects: input.effects ?? [],
    cancelled: input.cancelled ?? false,
    timedOut: input.timedOut ?? false,
  };
}

function createRuntimeDiagnostic(
  code: string,
  severity: RuntimeDiagnosticSeverity,
  message: string,
  path?: string,
): RuntimeDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Border-safe governed-runtime SEAM (RD-0361 R4 / #143 · P1.5, R&D 2026-07-18)
// ─────────────────────────────────────────────────────────────────────────────
// A "what to enforce" decision (a governance verdict) was welded to a "how to execute" mechanism (the
// compiler's WASM executor: admitAndInstantiate + host record-marshalling). That coupling is why the
// app-kernel — which is allowed to depend on core-runtime but NEVER the compiler (Hardened Border) — cannot
// make a twin's WASM verdict authoritative without pulling the compiler across the border (a fail-open).
//
// This seam is the fix: the ONE declared, minimal-authority, deny-by-default edge a border-locked consumer
// binds to reach authoritative twin execution. core-runtime DECLARES the seam (this file, dependency-free);
// it does NOT execute — the executor (a pre-signed-`.wasm` loader owned by the DSS.wasm supervisor) plugs in
// behind it later. Compile-at-runtime is forbidden by contract (a request carries a hash-pinned, pre-built
// artifact) — compiling at runtime is exactly what would drag the compiler back across the border.

/** The pinned seam version. A provider whose version differs is REFUSED (fail-closed) — never run a
 *  mismatched executor. */
export const GOVERNED_RUNTIME_SEAM_VERSION = "galerina.runtime.seam.v1";

/** An admit request: a pre-built, pre-signed twin artifact (hash-pinned) + the already-marshalled call.
 *  There is deliberately no source/`.fungi` field — the seam never compiles; it only executes a signed artifact. */
export interface GovernedRuntimeRequest {
  readonly seamVersion: string;
  readonly artifactSha256: string;
  readonly exportName: string;
  readonly args: readonly unknown[];
}

/** The seam verdict. Fail-CLOSED: anything that is not an explicit `admit` is a denial. `admit` optionally
 *  carries the executed twin's raw result token for the caller to interpret. */
export type GovernedRuntimeVerdict =
  | { readonly outcome: "admit"; readonly result?: unknown }
  | { readonly outcome: "deny"; readonly reason: string };

/** A border-safe executor plugged in behind the seam. Real implementations live in the DSS.wasm supervisor /
 *  a pre-signed-`.wasm` loader — NOT here. Must pin the same seam version. */
export interface GovernedRuntimeExecutor {
  readonly seamVersion: string;
  admitAndExecute(request: GovernedRuntimeRequest): GovernedRuntimeVerdict;
}

/** Deny-by-default executor: with nothing wired, EVERY request denies. This is the whole point of the seam —
 *  an absent/unplugged runtime provider must never fall through to admit (the fail-open the border prevents). */
export const DENY_ALL_RUNTIME_EXECUTOR: GovernedRuntimeExecutor = {
  seamVersion: GOVERNED_RUNTIME_SEAM_VERSION,
  admitAndExecute: (): GovernedRuntimeVerdict => ({
    outcome: "deny",
    reason:
      "no governed-runtime executor is wired — deny-by-default (the border-safe runtime seam is unplugged).",
  }),
};

/** Bind a consumer to the seam. Returns the deny-all executor when no provider is supplied OR when the
 *  provider's seam version does not match the pinned version — both are unsafe and MUST fail closed rather
 *  than admit. A version match with a real provider returns that provider unchanged. */
export function bindGovernedRuntime(
  provider?: GovernedRuntimeExecutor,
): GovernedRuntimeExecutor {
  if (provider === undefined) return DENY_ALL_RUNTIME_EXECUTOR;
  if (provider.seamVersion !== GOVERNED_RUNTIME_SEAM_VERSION) return DENY_ALL_RUNTIME_EXECUTOR;
  return provider;
}
