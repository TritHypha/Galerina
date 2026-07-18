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

/** An admit request: a pre-built, pre-signed twin artifact (hash-pinned) + a signed admission attestation +
 *  the already-marshalled call. There is deliberately no source/`.fungi` field — the seam never compiles; it
 *  only executes a signed artifact. */
export interface GovernedRuntimeRequest {
  readonly seamVersion: string;
  readonly artifactSha256: string;
  /** The signed #105 admission attestation, bound to `artifactSha256`. Verified INSIDE the executor via an
   *  injected crypto capability (never a bare "admitted" boolean handed across the seam — that is forgeable,
   *  the same class as a bare `as Verdict` cast). An empty attestation is refused (fail-closed). */
  readonly attestation: string;
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

/** Injected admission verifier: checks the request's SIGNED #105 attestation against the artifact hash (the
 *  #105 admission decision). A signature primitive, not a trust-me boolean — the executor calls it INSIDE, in
 *  the same moment as the integrity re-hash, so no forgeable `admitted` claim crosses the seam and no TOCTOU
 *  window opens between "admitted" and execute. Bound to the artifact hash → an attestation for artifact X
 *  cannot be replayed to admit artifact Y. Crypto stays injected (like `hashArtifact`) so core-runtime holds
 *  no import; the real verify is a vetted, hash-pinned native-floor artifact. An absent verifier ⇒ deny. */
export interface GovernedAdmissionVerifier {
  readonly seamVersion: string;
  /**
   * Returns true ONLY if `attestation` is a valid signature admitting THIS MODULE — the signature binds
   * `domain ∥ artifactSha256 ∥ profile` (the whole-module hash + provenance profile), NOT a single export —
   * AND `exportName` is a defined export of that hash-verified module.
   *
   * Why the module hash already binds the export (R&D ruling 2026-07-18): a module's export SECTION is part
   * of the bytes sha256 covers, so admitting a module cryptographically admits its whole export TABLE — you
   * cannot swap the module (hash mismatch) nor conjure an export it does not define. Admission is therefore
   * PER-MODULE = all-of-that-module's-exports-equally-admitted; there is no representable "admit foo but not
   * bar" for one signed module. Per-export admission of a MULTI-export module would need a per-export
   * pre-image (`domain ∥ hash ∥ export ∥ profile`) — a deferred, owner-gated attestation-contract change; it
   * adds no security for today's one-governed-export-per-module artifacts.
   *
   * The export-presence check is a HARD fail-closed gate, not advisory: a valid signature over a module that
   * does NOT define `exportName` returns FALSE. (Verifying the signature but then calling an unchecked export
   * is the one way this could drift open.) `artifactBytes` is the hash-verified module the caller is about to
   * run — the composition passes the exact bytes it re-hashed — so the presence check is on the admitted bytes.
   */
  verifyAttestation(input: {
    readonly attestation: string;
    readonly artifactSha256: string;
    readonly exportName: string;
    readonly artifactBytes: Uint8Array;
  }): boolean;
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
 *  content store; (2) re-hash and require the digest to equal the pinned sha256 (integrity); (3) verify the
 *  request's SIGNED attestation against that freshly-computed hash AND that the requested export is defined by
 *  the hash-verified module (admission — a signature, not a trust-me boolean); (4) instantiate + call via the
 *  low-level VM. Any failure at any step — including a missing
 *  dependency or an empty attestation — is a DENY with a specific reason. Integrity and admission are both
 *  proven on the same bytes and BEFORE execution, so no unverified/unadmitted artifact ever reaches the VM
 *  and no TOCTOU window opens. There is no path from an absent dependency or a failed check to `admit`. */
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
      if (typeof request.attestation !== "string" || request.attestation === "") {
        return denyVerdict("request carries no signed admission attestation — deny (a bare 'admitted' claim is not accepted).");
      }
      // Admission is verified INSIDE, against the freshly-COMPUTED hash (not the request's claimed hash) and
      // the EXACT bytes we re-hashed — so it is bound to the bytes we are about to run, closing any
      // check-then-swap window. The verifier also hard-gates that `exportName` is a defined export of that
      // hash-verified module (the export table is part of the signed bytes), so a valid signature can never
      // admit a call to an export the signed module does not define.
      if (!admissionVerifier.verifyAttestation({ attestation: request.attestation, artifactSha256: computed, exportName: request.exportName, artifactBytes: bytes })) {
        return denyVerdict(
          `admission attestation did not verify for artifact '${computed}' / export '${request.exportName}'.`,
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
