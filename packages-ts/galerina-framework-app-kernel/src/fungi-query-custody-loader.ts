// S6 (RD-1413 O2/O3): THIN, NON-AUTHORIZING loader for the Fungi query-custody verdict on POST /auth/verify.
//
// The verdict is the return code of the `admitQueryCustody` export of the BUILT query-custody
// WebAssembly (packages/fungi/memory/src/query-custody.fungi flattened with c-boundary.fungi).
// This file never decides: it snapshots the raw ordered query pairs the transport handed over,
// COUNTS exact decoded names (object / version / anything else), reports whether the flat Record
// equals those pairs, and maps each observation onto the documented c-boundary classTag. Only the
// literal 0 admits; every listed refusal, unlisted code, trap or wrong type refuses.
//
// Zero-trust choices (gcw-s6d, 2026-10-23):
// - POST /auth/verify ALWAYS runs this verdict (keyed on the product route RD-1413 names, not on a
//   route opt-in). Rejected: a per-route `query.closed` opt-in (a config omission would bypass).
// - A Record with no raw pair custody is UNKNOWN and refuses (custodyToken 1). Rejected: re-derive
//   from the Record (repeats already erased); trusting api-server admitQueryOnce as sole decider.
// - Pinned by SHA-256; an unloadable, tampered or import-bearing artifact leaves the route
//   "unavailable" (refused) rather than throwing at boot, so no new boot refusal code is emitted.
//   Rejected: folding admitQueryCustody into the secret-gate artifact (re-pins S5, couples units).
// - No alias table and no case fold anywhere on the host side: names are compared with ===.
// - Every foreign read is inside try; a throwing getter is classTag 2 (Absent), a wrong shape is
//   classTag 10 (WrongType). Typed UNKNOWN only; no null/NaN reaches the WebAssembly.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** SHA-256 of assets/query-custody.wasm (fresh `galerina build` of flattened query-custody.fungi). */
export const QUERY_CUSTODY_SHA256 = "d9982e86efb1e7d6226d9e00cfe321061d362665f5ff68e4029584c629f348cf";

export type QueryCustodyVerdict = "admit" | "refuse" | "unavailable";

export interface FungiQueryCustody {
  /** Reads `query` and `queryCustody` from the foreign request exactly once each. */
  verdict(request: unknown): QueryCustodyVerdict;
}

type VerdictExport = (...args: number[]) => unknown;

const I32_MAX = 2147483647;
const hasOwn = Object.prototype.hasOwnProperty;
const intrinsicApply = Reflect.apply;
const intrinsicIsArray = Array.isArray;
const intrinsicKeys = Object.keys;

/** True only for the RD-1413 product route. Exact strings; no normalisation here. */
export function isQueryCustodyRoute(method: unknown, path: unknown): boolean {
  return method === "POST" && path === "/auth/verify";
}

function countClass(n: number): readonly [number, number] {
  if (!Number.isSafeInteger(n) || n < 0 || n > I32_MAX) return [8, 0];
  return [0, n];
}

/** Host observations -> 10 Int args for admitQueryCustody. Never throws. */
export function observeQueryCustody(request: unknown): number[] {
  let custodyClass = 0;
  let custodyToken = 0;
  let recordClass = 0;
  let recordToken = 1;
  let objectCount = 0;
  let versionCount = 0;
  let unknownCount = 0;
  let rawRecord: unknown;
  let rawCustody: unknown;
  let readOk = true;
  try {
    const src = request as { query?: unknown; queryCustody?: unknown };
    rawRecord = src.query;
    rawCustody = src.queryCustody;
  } catch {
    readOk = false;
  }
  if (!readOk) {
    return [2, 0, 0, 0, 0, 0, 0, 0, 2, 0];
  }
  let pairs: Array<readonly [string, string]> | undefined;
  if (rawCustody === undefined) {
    custodyToken = 1; // Record-only: UNKNOWN
  } else {
    try {
      if (!intrinsicIsArray(rawCustody)) {
        custodyClass = 10;
      } else {
        const list = rawCustody as readonly unknown[];
        const length = list.length;
        const copy: Array<readonly [string, string]> = [];
        for (let i = 0; i < length; i += 1) {
          const pair = list[i];
          if (!intrinsicIsArray(pair) || (pair as readonly unknown[]).length !== 2) {
            custodyClass = 10;
            break;
          }
          const name = (pair as readonly unknown[])[0];
          const value = (pair as readonly unknown[])[1];
          if (typeof name !== "string" || typeof value !== "string") {
            custodyClass = 10;
            break;
          }
          copy.push([name, value]);
        }
        if (custodyClass === 0) pairs = copy;
      }
    } catch {
      custodyClass = 2;
    }
  }
  if (pairs !== undefined) {
    for (let i = 0; i < pairs.length; i += 1) {
      const name = (pairs[i] as readonly [string, string])[0];
      if (name === "object") objectCount += 1;
      else if (name === "version") versionCount += 1;
      else unknownCount += 1;
    }
    try {
      if (rawRecord === null || typeof rawRecord !== "object" || intrinsicIsArray(rawRecord)) {
        recordClass = 10;
      } else {
        const keys = intrinsicKeys(rawRecord as object);
        let same = keys.length === pairs.length;
        for (let i = 0; same && i < pairs.length; i += 1) {
          const [name, value] = pairs[i] as readonly [string, string];
          if (!intrinsicApply(hasOwn, rawRecord, [name])) same = false;
          else if ((rawRecord as Record<string, unknown>)[name] !== value) same = false;
        }
        recordToken = same ? 0 : 1;
      }
    } catch {
      recordClass = 2;
    }
  }
  return [
    custodyClass, custodyToken,
    ...countClass(objectCount), ...countClass(versionCount), ...countClass(unknownCount),
    recordClass, recordToken,
  ];
}

function unavailable(): FungiQueryCustody {
  return Object.freeze({ verdict: (): QueryCustodyVerdict => "unavailable" });
}

/** Load a query-custody artifact. Anything but the pinned, import-free, 10-arg export is unavailable. */
export function loadFungiQueryCustody(input: { readonly wasmBytes?: unknown; readonly expectedSha256?: unknown }): {
  readonly ok: boolean;
  readonly custody: FungiQueryCustody;
} {
  const source = input === undefined || input === null ? undefined : input.wasmBytes;
  const pin = input === undefined || input === null ? undefined : input.expectedSha256;
  const refused = Object.freeze({ ok: false, custody: unavailable() });
  if (!(source instanceof Uint8Array) || source.byteLength === 0) return refused;
  if (typeof pin !== "string" || !/^[0-9a-f]{64}$/.test(pin)) return refused;
  const bytes = new Uint8Array(source); // one copy: hashed bytes are compiled bytes
  if (createHash("sha256").update(bytes).digest("hex") !== pin) return refused;
  let exported: unknown;
  try {
    const mod = new WebAssembly.Module(bytes);
    if (WebAssembly.Module.imports(mod).length !== 0) return refused;
    const instance = new WebAssembly.Instance(mod, {});
    exported = (instance.exports as Record<string, unknown>)["admitQueryCustody"];
  } catch {
    return refused;
  }
  if (typeof exported !== "function" || (exported as VerdictExport).length !== 10) return refused;
  const fn = exported as VerdictExport;
  function verdict(request: unknown): QueryCustodyVerdict {
    const args = observeQueryCustody(request);
    let code: unknown;
    try {
      code = fn(...args);
    } catch {
      return "refuse"; // trap = refuse
    }
    return code === 0 ? "admit" : "refuse";
  }
  return Object.freeze({ ok: true, custody: Object.freeze({ verdict }) });
}

/** The only kernel entry point: the shipped asset against the compiled-in pin. No byte injection. */
export function loadPinnedFungiQueryCustody(): FungiQueryCustody {
  let wasmBytes: unknown;
  try {
    wasmBytes = new Uint8Array(readFileSync(new URL("../assets/query-custody.wasm", import.meta.url)));
  } catch {
    return unavailable();
  }
  return loadFungiQueryCustody({ wasmBytes, expectedSha256: QUERY_CUSTODY_SHA256 }).custody;
}