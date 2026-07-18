/**
 * seam-adapters.ts — the injectable providers that plug this border-safe TCB into core-runtime's
 * governed-runtime seam (RD-0361 R4 / #143). core-runtime DECLARES the seam (dependency-free) and INJECTS
 * these; it never imports them. The Hardened Border direction holds: this package reaches core-runtime for
 * TYPE-ONLY seam interfaces (and node:crypto for the TCB), NEVER the compiler.
 *
 * Three capabilities the DSS.wasm supervisor wires behind `createGovernedRuntimeExecutor`:
 *   • hashArtifact                 — sha256 over the artifact bytes (== wasmHash).
 *   • GovernedAdmissionVerifier    — R&D ruling 2026-07-18 model A: verify the #105 signature over
 *                                    (domain ∥ hash ∥ profile), THEN hard-gate that the requested export is a
 *                                    defined export of the hash-verified module. No per-export pre-image (B)
 *                                    today — the module hash already binds the whole export TABLE, so
 *                                    admitting a module admits all of its exports equally; per-export
 *                                    admission of a MULTI-export module would need B (owner-gated, deferred).
 *   • LowLevelWasmExecutor         — instantiate verified bytes with ONLY the closed host import set and call
 *                                    an export (sync; scoped to the numeric-fold ABI the sentinels use).
 *
 * These adapters do NOT re-decide admission on their own — the composition in core-runtime proves integrity
 * and calls the verifier BEFORE the low-level executor, so an unadmitted artifact never reaches instantiation.
 * Each adapter still fails CLOSED on its own (a malformed attestation, an unparseable module, a missing
 * export, a non-numeric arg, a LinkError, or a trap all deny) so a mis-wire cannot fall open.
 */

// TYPE-ONLY seam interfaces (the ✅ direction; core-runtime is a zero-dep leaf — see .graph/boundary-policy.json).
import type { GovernedAdmissionVerifier, LowLevelWasmExecutor } from "@galerina/core-runtime";
import { wasmHash, verifyWasm } from "./wasm-runtime.js";
import { createHostRuntime } from "./wasm-runtime.js";
import type { AdmissionPolicy, WasmAttestation, RunnerProfile } from "./wasm-runtime.js";

/**
 * MUST equal @galerina/core-runtime's exported GOVERNED_RUNTIME_SEAM_VERSION. Kept as a local literal so the
 * source edge to core-runtime stays TYPE-ONLY (the boundary contract); tests/seam-adapters.test.mjs imports
 * the real value and asserts equality, so a drift is caught at CI. A drift is also fail-CLOSED at runtime: the
 * composition refuses any injected capability whose seamVersion does not match the pinned version.
 */
const RUNTIME_SEAM_VERSION = "galerina.runtime.seam.v1";

/** The seam's `hashArtifact` capability: sha256 hex over the artifact bytes. */
export const hashArtifact: (bytes: Uint8Array) => string = wasmHash;

/** Serialize a WasmAttestation to the wire string the seam's `attestation` field carries (single source of
 *  truth for the format, shared with `parseAttestation`). */
export function serializeAttestation(attestation: WasmAttestation): string {
  return JSON.stringify(attestation);
}

/** Parse a wire attestation string back to a WasmAttestation, FAIL-CLOSED: any malformed field (non-hex
 *  sha256, unknown profile, non-string signature) returns null so the verifier denies rather than guessing. */
export function parseAttestation(wire: string): WasmAttestation | null {
  if (typeof wire !== "string" || wire.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(wire);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(o.sha256)) return null;
  if (o.profile !== "dev" && o.profile !== "certified") return null;
  if (o.signature !== undefined && typeof o.signature !== "string") return null;
  const profile: RunnerProfile = o.profile;
  return o.signature === undefined
    ? { sha256: o.sha256, profile }
    : { sha256: o.sha256, signature: o.signature, profile };
}

/** True iff `bytes` compile to a module that DEFINES a callable FUNCTION export named `exportName`. Fail-closed:
 *  unparseable bytes → false. This is the presence check on the admitted (hash-verified) bytes — the export
 *  table is part of the signed hash, so this confirms the signed module actually admits the requested export.
 *  The `kind === "function"` clause (R&D precision 2026-07-18) makes ADMISSION itself exact: a module exporting
 *  a memory/global named `exportName` but no function `exportName` is denied HERE, not merely later at the
 *  executor's `typeof fn !== "function"` deny — belt-and-braces, so the two layers agree at the point of decision. */
function moduleDefinesExport(bytes: Uint8Array, exportName: string): boolean {
  try {
    const mod = new WebAssembly.Module(bytes as BufferSource);
    return WebAssembly.Module.exports(mod).some((e) => e.name === exportName && e.kind === "function");
  } catch {
    return false;
  }
}

/**
 * Build the injectable admission verifier (R&D ruling model A). `policy` is the DSS admission policy — which
 * public key to trust, whether a signature / certified profile is required, any pinned-hash allow-list. The
 * verifier returns true ONLY when ALL hold on the SAME hash-verified bytes:
 *   1. the wire attestation parses (fail-closed),
 *   2. its declared hash equals the hash the composition re-computed and bound us to (`artifactSha256`),
 *   3. `verifyWasm` accepts the signature over (domain ∥ hash ∥ profile) under `policy`
 *      (requireSigned / requireCertifiedProfile / allowedHashes all enforced there, fail-closed), and
 *   4. `exportName` is a DEFINED export of that module (the hard export-presence gate — a valid signature
 *      over a module that does not define the export still DENIES).
 */
export function createWasmAdmissionVerifier(policy: AdmissionPolicy): GovernedAdmissionVerifier {
  return {
    seamVersion: RUNTIME_SEAM_VERSION,
    verifyAttestation({ attestation, artifactSha256, exportName, artifactBytes }): boolean {
      const parsed = parseAttestation(attestation);
      if (parsed === null) return false;
      // Bind the attestation to the exact bytes the composition re-hashed. verifyWasm recomputes the hash
      // from artifactBytes and checks it === parsed.sha256; we additionally require both to equal the
      // composition-supplied artifactSha256 so a mismatched (bytes, hash) pair can never slip through.
      if (parsed.sha256 !== artifactSha256) return false;
      const verdict = verifyWasm(artifactBytes, parsed, policy);
      if (!verdict.ok) return false;
      if (verdict.hash !== artifactSha256) return false;
      // HARD export-presence gate (R&D ruling condition 2): never admit a call to an export the signed
      // (hash-verified) module does not define.
      if (!moduleDefinesExport(artifactBytes, exportName)) return false;
      return true;
    },
  };
}

/**
 * Build the injectable low-level executor: instantiate verified bytes with ONLY the closed host import set
 * and call `exportName(...args)`. SYNC (the seam is sync) — uses the synchronous WebAssembly API. It does NOT
 * verify admission (the composition already did, before calling this); its job is the one border-crossing
 * capability — run the already-admitted bytes — and it still fails CLOSED on every fault.
 *
 * Marshalling is scoped to the NUMERIC-fold ABI the governance sentinels use: every arg must be a finite
 * number (a non-numeric arg is REFUSED, never silently coerced — NaN→0 would corrupt an i32 param). Generic
 * string/record argument marshalling is a later widening.
 */
export function createLowLevelWasmExecutor(): LowLevelWasmExecutor {
  return {
    seamVersion: RUNTIME_SEAM_VERSION,
    instantiateAndCall({ artifactBytes, exportName, args }) {
      for (const a of args) {
        if (typeof a !== "number" || !Number.isFinite(a)) {
          return { ok: false, reason: `argument marshalling refused: non-numeric arg (${String(a)}) — numeric-fold ABI only` };
        }
      }
      // A fresh closed host per execution (resets the string/array registries + the record staging bump).
      const host = createHostRuntime();
      let instance: WebAssembly.Instance;
      try {
        const mod = new WebAssembly.Module(artifactBytes as BufferSource);
        instance = new WebAssembly.Instance(mod, host.imports);
      } catch (err) {
        // Mirror admitAndInstantiate's fail-closed classification: a LinkError means the module tried to
        // reach a host import OUTSIDE the closed set — a capability escape, not an ordinary fault.
        const reason = err instanceof WebAssembly.LinkError
          ? `disallowed host import (module requires a capability outside the closed host set): ${err.message}`
          : `instantiation failed: ${err instanceof Error ? err.message : String(err)}`;
        return { ok: false, reason };
      }
      const mem = (instance.exports as Record<string, unknown>)["memory"];
      if (mem instanceof WebAssembly.Memory) host.bindMemory(mem);
      const fn = (instance.exports as Record<string, unknown>)[exportName];
      if (typeof fn !== "function") {
        return { ok: false, reason: `export '${exportName}' is not a callable function of the module` };
      }
      try {
        const result = (fn as (...a: number[]) => unknown)(...(args as readonly number[]));
        return { ok: true, result };
      } catch (err) {
        return { ok: false, reason: `trap during '${exportName}': ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

/** The three TCB-side seam capabilities bundled, ready to spread into core-runtime's
 *  `createGovernedRuntimeExecutor` alongside the DSS-owned `artifactSource`. */
export function createBorderSafeRuntimeDeps(opts: { readonly policy: AdmissionPolicy }): {
  readonly admissionVerifier: GovernedAdmissionVerifier;
  readonly lowLevel: LowLevelWasmExecutor;
  readonly hashArtifact: (bytes: Uint8Array) => string;
} {
  return {
    admissionVerifier: createWasmAdmissionVerifier(opts.policy),
    lowLevel: createLowLevelWasmExecutor(),
    hashArtifact,
  };
}
