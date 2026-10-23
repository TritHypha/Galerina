// S5 (RD-1413/1414/1415 closure path): THIN, NON-AUTHORIZING loader for the Fungi secret gate.
//
// The gate-9.5 verdict is the return code of the `admit` export of the BUILT secret-gate
// WebAssembly (packages/fungi/memory/src/secret-gate.fungi, flattened with c-boundary.fungi and
// release-commit-point.fungi). This file never decides: it only maps host observations onto the
// documented Int tags of that unit (c-boundary classTag 0..10) and accepts exactly packed 100 as
// admit. Every other code (listed refusal, unlisted code, trap, wrong type) refuses.
//
// Zero-trust choices (preflight-s5-01-8f5158ff, option A):
// - The artifact is pinned by SHA-256 (SECRET_GATE_ADMIT_SHA256). A missing, empty or non-byte
//   artifact, a missing/ill-formed pin, a module that imports anything, or one without a 10-arg
//   `admit` export is FUNGI-SECRET-008; a hash mismatch is
//   FUNGI-SECRET-009. A refused load exposes no gate.
// - The kernel loads ONLY the pinned asset through loadPinnedFungiSecretGate(); there is no kernel
//   option to inject artifact bytes (rejected: a test hook is a lying-artifact door).
// - Bytes are copied once before hashing; the hashed copy is the compiled copy (no TOCTOU).
// - The import object is empty (deny-by-default); a module with any import is refused.
// - Several required names: one WebAssembly admit call per name, all must return packed 100
//   (AND only; the host can refuse more, never admit more). The epoch is read once per admit.
// - A host observation that cannot be made (getter/has/revocationEpoch throws) is never coerced
//   to a value: has() throwing is presence 4 (has-threw); an unreadable epoch or epoch-presence
//   is classTag 2 (Absent); any non-boolean has() result or non-string name is classTag 10
//   (WrongType). Typed UNKNOWN only; no null/NaN reaches the WebAssembly.
// Rejected: B fence-only, C self-hosted presence-fold twin, D TS shadow decider (two deciders).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** SHA-256 of assets/secret-gate-admit.wasm (fresh `galerina build` of flattened secret-gate.fungi). */
export const SECRET_GATE_ADMIT_SHA256 = "5b11c9d4e8ae92cdfdd930a112211c1996b791a2beaf24560699fb4416da37cd";

export type SecretGateArtifactRefusalCode =
  | "FUNGI-SECRET-009"
  | "FUNGI-SECRET-008";

/** Structural provider view the loader observes. Matches secret-gate.ts SecretsProvider. */
export interface ObservedSecretsProvider {
  has(name: string): boolean;
  revocationEpoch?: () => number;
}

export interface FungiSecretGate {
  /** null = the WebAssembly returned packed 100 for every required name; else refuse. */
  admit(provider: unknown, required: unknown): "secret_unavailable" | null;
  /** gateNoteUnknown verdict: 106 -> "delivery-unknown", 108 -> "no-op", anything else (trap, unlisted) -> "UNKNOWN". */
  noteUnknownVerdict(leaseState: unknown): "delivery-unknown" | "no-op" | "UNKNOWN";
  /** deliverPreHandoff verdict: packed 100 -> "admit"; every other code, a trap or unreadable facts -> "refuse". */
  preHandoffVerdict(facts: unknown): "admit" | "refuse";
}

/** Host observations for deliverPreHandoff. TS only maps them onto Int tags; the WebAssembly decides. */
export interface PreHandoffFacts {
  readonly declared: boolean;
  readonly providerPresent: boolean;
  readonly epochPresent: boolean;
  readonly epochMint: number;
  readonly epochUse: number;
  readonly epochMoved: boolean;
  readonly revoked: boolean;
  readonly currentlyValid: boolean;
}

export type FungiSecretGateLoad =
  | { readonly ok: true; readonly gate: FungiSecretGate }
  | { readonly ok: false; readonly code: SecretGateArtifactRefusalCode };

const ADMIT_PACKED = 100;
const I32_MAX = 2147483647;

type AdmitExport = (...args: number[]) => unknown;

function refused(code: SecretGateArtifactRefusalCode): FungiSecretGateLoad {
  return Object.freeze({ ok: false as const, code });
}

/** c-boundary classTag for a host value claimed to be an integer. Returns [classTag, integer]. */
function classifyInteger(value: unknown): readonly [number, number] {
  if (typeof value !== "number") return [10, 0];
  if (Number.isNaN(value)) return [3, 0];
  if (value === Number.POSITIVE_INFINITY) return [4, 0];
  if (value === Number.NEGATIVE_INFINITY) return [5, 0];
  if (Object.is(value, -0)) return [6, 0];
  if (!Number.isInteger(value)) return [7, 0];
  if (!Number.isSafeInteger(value)) return [8, 0];
  if (value > I32_MAX || value < -I32_MAX) return [8, 0];
  return [0, value];
}

const DELIVERY_UNKNOWN_PACKED = 106;
const NO_OP_PACKED = 108;

/** c-boundary classTag for a host value claimed to be a 0/1 token. Returns [classTag, token]. */
function classifyToken(value: unknown): readonly [number, number] {
  if (value === true) return [0, 1];
  if (value === false) return [0, 0];
  return [10, 0];
}

function makeGate(admitExport: AdmitExport, noteUnknownExport: AdmitExport, preExport: AdmitExport): FungiSecretGate {
  function noteUnknownVerdict(leaseState: unknown): "delivery-unknown" | "no-op" | "UNKNOWN" {
    const [leaseClass, lease] = classifyInteger(leaseState);
    let packed: unknown;
    try {
      packed = noteUnknownExport(leaseClass, lease);
    } catch {
      return "UNKNOWN"; // trap = typed UNKNOWN
    }
    if (packed === DELIVERY_UNKNOWN_PACKED) return "delivery-unknown";
    if (packed === NO_OP_PACKED) return "no-op";
    return "UNKNOWN";
  }

  function preHandoffVerdict(facts: unknown): "admit" | "refuse" {
    if (facts === null || typeof facts !== "object") return "refuse";
    // Read every field exactly once; a throwing getter refuses.
    let f: Record<string, unknown>;
    try {
      const src = facts as Record<string, unknown>;
      f = {
        declared: src["declared"], providerPresent: src["providerPresent"], epochPresent: src["epochPresent"],
        epochMint: src["epochMint"], epochUse: src["epochUse"], epochMoved: src["epochMoved"],
        revoked: src["revoked"], currentlyValid: src["currentlyValid"],
      };
    } catch {
      return "refuse";
    }
    const args = [
      ...classifyToken(f["declared"]), ...classifyToken(f["providerPresent"]), ...classifyToken(f["epochPresent"]),
      ...classifyInteger(f["epochMint"]), ...classifyInteger(f["epochUse"]), ...classifyToken(f["epochMoved"]),
      ...classifyToken(f["revoked"]), ...classifyToken(f["currentlyValid"]),
    ];
    let packed: unknown;
    try {
      packed = preExport(...args);
    } catch {
      return "refuse";
    }
    return packed === ADMIT_PACKED ? "admit" : "refuse";
  }

  function call(args: readonly number[]): boolean {
    let packed: unknown;
    try {
      packed = admitExport(...args);
    } catch {
      return false; // trap = refuse
    }
    return packed === ADMIT_PACKED;
  }

  function admit(provider: unknown, required: unknown): "secret_unavailable" | null {
    // providerPresent: 0 absent 1 present; other host shapes are WrongType.
    let providerClass = 0;
    let providerPresent = 0;
    if (provider === undefined || provider === null) {
      providerPresent = 0;
    } else if (typeof provider === "object" || typeof provider === "function") {
      providerPresent = 1;
    } else {
      providerClass = 10;
    }

    // epochPresent: 0 missing-legacy 1 present. Read the epoch once for this admit.
    let epochPresentClass = 0;
    let epochPresentToken = 0;
    let epochClass = 0;
    let epoch = 0;
    if (providerClass === 0 && providerPresent === 1) {
      let fn: unknown;
      let observed = true;
      try {
        fn = (provider as { revocationEpoch?: unknown }).revocationEpoch;
      } catch {
        observed = false;
      }
      if (!observed) {
        epochPresentClass = 2;
      } else if (typeof fn === "function") {
        epochPresentToken = 1;
        let raw: unknown;
        let read = true;
        try {
          raw = (fn as () => unknown).call(provider);
        } catch {
          read = false;
        }
        if (read) {
          [epochClass, epoch] = classifyInteger(raw);
        } else {
          epochClass = 2;
        }
      } else if (fn !== undefined) {
        epochPresentClass = 10;
      }
    }

    const base = (requiredCountClass: number, requiredCount: number, presenceClass: number, presenceStatus: number) => [
      requiredCountClass, requiredCount, providerClass, providerPresent, presenceClass, presenceStatus,
      epochClass, epoch, epochPresentClass, epochPresentToken,
    ];

    if (!Array.isArray(required)) {
      return call(base(10, 0, 0, 0)) ? null : "secret_unavailable";
    }
    const names = required as readonly unknown[];
    if (names.length === 0) {
      return call(base(0, 0, 0, 0)) ? null : "secret_unavailable";
    }
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      let presenceClass = 0;
      let presenceStatus = 0;
      if (typeof name !== "string") {
        presenceClass = 10;
      } else if (providerClass === 0 && providerPresent === 1) {
        let has: unknown;
        let got = true;
        try {
          has = (provider as { has?: unknown }).has;
        } catch {
          got = false;
        }
        if (!got || typeof has !== "function") {
          presenceClass = got ? 10 : 2;
        } else {
          let answer: unknown;
          let threw = false;
          try {
            answer = (has as (n: string) => unknown).call(provider, name);
          } catch {
            threw = true;
          }
          if (threw) presenceStatus = 4;
          else if (answer === true) presenceStatus = 0;
          else if (answer === false) presenceStatus = 1;
          else presenceClass = 10;
        }
      }
      if (!call(base(0, 1, presenceClass, presenceStatus))) return "secret_unavailable";
    }
    return null;
  }

  return Object.freeze({ admit, noteUnknownVerdict, preHandoffVerdict });
}

/** Load a secret-gate WebAssembly artifact. Refuses (typed) unless it hashes to the pin. */
export function loadFungiSecretGate(input: { readonly wasmBytes?: unknown; readonly expectedSha256?: unknown }): FungiSecretGateLoad {
  const source = input === undefined || input === null ? undefined : input.wasmBytes;
  const pin = input === undefined || input === null ? undefined : input.expectedSha256;
  if (!(source instanceof Uint8Array) || source.byteLength === 0) return refused("FUNGI-SECRET-008");
  if (typeof pin !== "string" || !/^[0-9a-f]{64}$/.test(pin)) return refused("FUNGI-SECRET-008");
  const bytes = new Uint8Array(source); // one copy: hashed bytes are compiled bytes
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== pin) return refused("FUNGI-SECRET-009");
  let admitExport: unknown;
  let noteUnknownExport: unknown;
  let preExport: unknown;
  try {
    const mod = new WebAssembly.Module(bytes);
    if (WebAssembly.Module.imports(mod).length !== 0) return refused("FUNGI-SECRET-008");
    const instance = new WebAssembly.Instance(mod, {});
    admitExport = (instance.exports as Record<string, unknown>)["admit"];
    noteUnknownExport = (instance.exports as Record<string, unknown>)["gateNoteUnknown"];
    preExport = (instance.exports as Record<string, unknown>)["deliverPreHandoff"];
  } catch {
    return refused("FUNGI-SECRET-008");
  }
  if (typeof admitExport !== "function" || (admitExport as AdmitExport).length !== 10) {
    return refused("FUNGI-SECRET-008");
  }
  if (typeof noteUnknownExport !== "function" || (noteUnknownExport as AdmitExport).length !== 2) {
    return refused("FUNGI-SECRET-008");
  }
  if (typeof preExport !== "function" || (preExport as AdmitExport).length !== 16) {
    return refused("FUNGI-SECRET-008");
  }
  return Object.freeze({
    ok: true as const,
    gate: makeGate(admitExport as AdmitExport, noteUnknownExport as AdmitExport, preExport as AdmitExport),
  });
}

/** The only kernel entry point: the shipped asset against the compiled-in pin. No byte injection. */
export function loadPinnedFungiSecretGate(): FungiSecretGateLoad {
  let wasmBytes: unknown;
  try {
    wasmBytes = new Uint8Array(readFileSync(new URL("../assets/secret-gate-admit.wasm", import.meta.url)));
  } catch {
    return refused("FUNGI-SECRET-008");
  }
  return loadFungiSecretGate({ wasmBytes, expectedSha256: SECRET_GATE_ADMIT_SHA256 });
}