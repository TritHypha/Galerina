/**
 * addon-loader.ts — load the native BitNet N-API addon, or report its absence
 *
 * The real ternary kernels live in C:\Users\phill\Documents\GitHub\BitNet (ggml-bitnet-mad.cpp).
 * A future build step (node-gyp / cmake-js) compiles them into a `.node` addon
 * exposing the contract documented in native/README.md. This loader tries to
 * require that addon and reports whether it is present.
 *
 * When absent (the current state on a clean checkout), bridges fall back to the
 * byte-faithful TPLSimulator from @galerina/tower-citizen — correct results, just
 * not native SIMD speed. nativeAvailable=false makes this explicit to callers.
 *
 * RD-0238 (P0 RCE) FIX — fail-closed native load. A present `.node` is executed ONLY when its SHA-256 matches a
 * caller-supplied pin (from the SIGNED bridge manifest). Absence of a pin is NOT a licence to run unverified native
 * code: it FAILS CLOSED (fall back to the simulator) unless the caller EXPLICITLY opts in for local dev
 * (`allowUnverified: true`, audited on the result). Previously the mismatch check was skipped whenever `expectedHash`
 * was undefined, so `loadNativeAddon()` (the sole caller's call) `require()`d any `.node` at a candidate path with zero
 * verification = arbitrary native code execution. Unknown pin ⇒ dangerous, never safe (the fail-closed / no-50-year-mistake rule).
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));

/** The contract the compiled native addon must satisfy (see native/README.md). */
export interface BitNetNativeAddon {
  /** ggml_bitnet_init() */
  init(): void;
  /** ggml_bitnet_free() */
  free(): void;
  /** ggml_bitnet_set_n_threads(n) */
  setThreads(n: number): void;
  /**
   * Native ternary T-MAC over packed I2_S weights + int activations.
   * Returns the scaled accumulator. Must be bit-identical to the simulator.
   */
  tmac(packedWeights: Int32Array, activations: Int32Array, count: number, scale: number, offset: number): number;
  /** True if the build targeted a CUDA kernel as well. */
  hasCuda(): boolean;
}

export interface AddonLoadResult {
  readonly loaded: boolean;
  readonly addon: BitNetNativeAddon | null;
  readonly searchedPaths: readonly string[];
  readonly reason: string;
  /** Resolved path of the addon that was found (if any). */
  readonly addonPath?: string;
  /** CF-7: SHA-256 hex of the `.node` binary, computed BEFORE `require()`.
   *  Feeds the bridge manifest's `nativeAddonHash` for supply-chain attestation. */
  readonly addonHash?: string;
  /** RD-0238: true iff the loaded addon's hash was verified against a caller-supplied pin. */
  readonly verified?: boolean;
}

const CANDIDATE_PATHS = [
  join(__dir, "..", "build", "Release", "bitnet_addon.node"),
  join(__dir, "..", "native", "build", "Release", "bitnet_addon.node"),
  join(__dir, "..", "prebuilds", `bitnet_addon-${process.platform}-${process.arch}.node`),
];

/**
 * @param opts.expectedHash   SHA-256 hex the `.node` must match (from the signed bridge manifest). REQUIRED to load
 *                            native code in any non-dev deployment.
 * @param opts.allowUnverified  Local-dev ONLY escape hatch: load a present `.node` without a pin. Default FALSE.
 *                              When true, the load is still reported as `verified:false` with a loud reason (audited).
 */
export function loadNativeAddon(opts: { expectedHash?: string; allowUnverified?: boolean } = {}): AddonLoadResult {
  const searched: string[] = [];
  for (const p of CANDIDATE_PATHS) {
    searched.push(p);
    if (!existsSync(p)) continue; // perf-allow: loop-sync-io — one-shot native-addon discovery over 3 fixed candidate paths (distinct per iteration)
    // CF-7: hash the binary BEFORE loading it.
    const addonHash = createHash("sha256").update(readFileSync(p)).digest("hex"); // perf-allow: loop-sync-io — one-shot addon-discovery scan; reads the first present candidate then returns

    // RD-0238 FAIL-CLOSED GATE. Enumerate the SAFE ways to run native code; default-DENY everything else.
    if (opts.expectedHash === undefined) {
      // No pin. NOT safe by default — refuse to execute unverified native code.
      if (opts.allowUnverified !== true) {
        return {
          loaded: false, addon: null, searchedPaths: searched, addonPath: p, addonHash, verified: false,
          reason: `ERR_ADDON_UNPINNED at ${p}: refusing to load UNVERIFIED native code — pass expectedHash from the ` +
            `signed bridge manifest, or set allowUnverified:true for local dev. Falling back to TPLSimulator.`,
        };
      }
      // else: explicit, audited dev opt-out — fall through and load, reported verified:false below.
    } else if (opts.expectedHash !== addonHash) {
      // Pin present but the binary does not match ⇒ fail closed (unchanged correct behavior).
      return {
        loaded: false, addon: null, searchedPaths: searched, addonPath: p, addonHash, verified: false,
        reason: `ERR_ADDON_HASH_MISMATCH at ${p}: expected ${opts.expectedHash}, got ${addonHash}`,
      };
    }

    const verified = opts.expectedHash !== undefined;   // true ⇒ pin matched; false ⇒ audited dev opt-out
    try {
      const addon = require(p) as BitNetNativeAddon;
      // Minimal contract check.
      if (typeof addon.tmac === "function" && typeof addon.init === "function") {
        return {
          loaded: true, addon, searchedPaths: searched, addonPath: p, addonHash, verified,
          reason: verified ? `loaded ${p} (hash-verified)` : `loaded ${p} (UNVERIFIED — allowUnverified dev opt-out)`,
        };
      }
      return { loaded: false, addon: null, searchedPaths: searched, addonPath: p, addonHash, verified, reason: `addon at ${p} missing required exports` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { loaded: false, addon: null, searchedPaths: searched, reason: `failed to load ${p}: ${msg}` };
    }
  }
  return {
    loaded: false,
    addon: null,
    searchedPaths: searched,
    reason: "no compiled native addon found — falling back to TPLSimulator (build with cmake-js to enable native SIMD)",
  };
}
