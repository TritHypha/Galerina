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

// ─────────────────────────────────────────────────────────────────────────────
// Governed-runtime executor COMPOSITION (RD-0361 R4 / #143 · block 2 — deny-by-default orchestration)
// ─────────────────────────────────────────────────────────────────────────────
// The seam above DECLARES the edge; this composes the fail-closed executor that sits behind it WITHOUT
// pulling any border-crossing mechanism into core-runtime. A governed executor must, in order: resolve the
// pinned artifact, prove its INTEGRITY, prove its ADMISSION, then run it. That control flow — the part that
// must never fall open — is orchestrated here; every MECHANISM is INJECTED (a DI seam, never an import): the
// content store, the sha256, the signature/admission oracle, and the low-level WASM VM all live behind the
// Hardened Border (the DSS.wasm supervisor wires them). core-runtime therefore stays dependency-free and
// border-safe while still owning the deny-by-default orchestration. Every branch that is not a full success
// DENIES with a specific, auditable reason — there is NO path from a missing dependency or a failed check to
// `admit`. This is the border-safe half of #143 block 2; the injected TCB (compiler's admitAndInstantiate +
// host marshalling) is extracted into a border-safe home in the owner-gated half.

/** Content-addressed source of pre-built, pre-signed artifact bytes. Returns the bytes registered under a
 *  sha256, or undefined if it cannot vouch for that hash. The source is UNTRUSTED: the executor re-hashes
 *  whatever bytes come back and denies on mismatch, so a compromised or buggy source cannot smuggle in a
 *  different artifact than the one the request pinned. */
export interface GovernedRuntimeArtifactSource {
  readonly seamVersion: string;
  artifactBytesFor(artifactSha256: string): Uint8Array | undefined;
}

/** Injected admission oracle: proves a pinned artifact is signed-admitted for a given export (the #105
 *  admission decision). Crypto/signature verification lives behind the border — never in core-runtime — so it
 *  is injected here as a pure boolean verdict. An absent verifier ⇒ deny (unproven ⇒ not admitted). */
export interface GovernedAdmissionVerifier {
  readonly seamVersion: string;
  isAdmitted(input: { readonly artifactSha256: string; readonly exportName: string }): boolean;
}

/** The one border-crossing capability: instantiate verified bytes and call an export. This wraps the
 *  compiler's WASM TCB (admitAndInstantiate + host record-marshalling) — injected by the DSS.wasm supervisor
 *  on the border-safe side, NEVER imported by core-runtime (importing it would drag the compiler across the
 *  Hardened Border, the exact fail-open the seam exists to prevent). */
export interface LowLevelWasmExecutor {
  readonly seamVersion: string;
  instantiateAndCall(input: {
    readonly artifactBytes: Uint8Array;
    readonly exportName: string;
    readonly args: readonly unknown[];
  }): { readonly ok: true; readonly result?: unknown } | { readonly ok: false; readonly reason: string };
}

/** Injected dependencies of a composed governed executor. Every one is OPTIONAL so an under-wired
 *  composition fails closed — a missing dependency denies, never admits. */
export interface GovernedRuntimeExecutorDeps {
  readonly artifactSource?: GovernedRuntimeArtifactSource;
  readonly admissionVerifier?: GovernedAdmissionVerifier;
  readonly lowLevel?: LowLevelWasmExecutor;
  /** sha256 over the artifact bytes, hex-encoded lowercase — injected so no crypto import lands in core-runtime. */
  readonly hashArtifact?: (bytes: Uint8Array) => string;
}

function denyVerdict(reason: string): GovernedRuntimeVerdict {
  return { outcome: "deny", reason };
}

/** Compose the border-safe governed executor. The returned executor performs, per request and IN ORDER:
 *  (0) seam-version match on the request AND every injected dependency; (1) resolve artifact bytes from the
 *  content store; (2) re-hash and require the digest to equal the pinned sha256 (integrity); (3) require a
 *  positive admission verdict for (hash, export); (4) instantiate + call via the low-level VM. Any failure at
 *  any step — including a missing dependency — is a DENY with a specific reason. Admission is checked BEFORE
 *  execution, so an unadmitted artifact never reaches the VM. There is no path from an absent dependency or a
 *  failed check to `admit`. */
export function createGovernedRuntimeExecutor(
  deps: GovernedRuntimeExecutorDeps = {},
): GovernedRuntimeExecutor {
  return {
    seamVersion: GOVERNED_RUNTIME_SEAM_VERSION,
    admitAndExecute(request: GovernedRuntimeRequest): GovernedRuntimeVerdict {
      if (request.seamVersion !== GOVERNED_RUNTIME_SEAM_VERSION) {
        return denyVerdict(
          `request seam version '${request.seamVersion}' does not match '${GOVERNED_RUNTIME_SEAM_VERSION}'.`,
        );
      }
      const { artifactSource, admissionVerifier, lowLevel, hashArtifact } = deps;
      if (
        artifactSource === undefined ||
        admissionVerifier === undefined ||
        lowLevel === undefined ||
        hashArtifact === undefined
      ) {
        return denyVerdict(
          "governed executor is under-wired — a required capability (artifact source, admission verifier, hash, or low-level executor) is unplugged; deny-by-default.",
        );
      }
      if (
        artifactSource.seamVersion !== GOVERNED_RUNTIME_SEAM_VERSION ||
        admissionVerifier.seamVersion !== GOVERNED_RUNTIME_SEAM_VERSION ||
        lowLevel.seamVersion !== GOVERNED_RUNTIME_SEAM_VERSION
      ) {
        return denyVerdict("a wired capability pins a different seam version — refused (fail-closed).");
      }
      const bytes = artifactSource.artifactBytesFor(request.artifactSha256);
      if (bytes === undefined) {
        return denyVerdict(`no artifact registered for sha256 '${request.artifactSha256}'.`);
      }
      const computed = hashArtifact(bytes);
      if (computed !== request.artifactSha256) {
        return denyVerdict(
          `artifact integrity check FAILED — source returned bytes hashing to '${computed}', not the pinned '${request.artifactSha256}'.`,
        );
      }
      if (!admissionVerifier.isAdmitted({ artifactSha256: request.artifactSha256, exportName: request.exportName })) {
        return denyVerdict(
          `artifact '${request.artifactSha256}' is not signed-admitted for export '${request.exportName}'.`,
        );
      }
      const executed = lowLevel.instantiateAndCall({
        artifactBytes: bytes,
        exportName: request.exportName,
        args: request.args,
      });
      if (!executed.ok) {
        return denyVerdict(`low-level execution denied: ${executed.reason}`);
      }
      return { outcome: "admit", result: executed.result };
    },
  };
}
