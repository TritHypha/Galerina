/**
 * addon-loader.ts — load the native BitNet N-API addon, or report its absence
 *
 * The real ternary kernels live in C:\wwwprojects\BitNet (ggml-bitnet-mad.cpp).
 * A future build step (node-gyp / cmake-js) compiles them into a `.node` addon
 * exposing the contract documented in native/README.md. This loader tries to
 * require that addon and reports whether it is present.
 *
 * When absent (the current state on a clean checkout), bridges fall back to the
 * byte-faithful TPLSimulator from @galerina/tower-citizen — correct results, just
 * not native SIMD speed. nativeAvailable=false makes this explicit to callers.
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
}

const CANDIDATE_PATHS = [
  join(__dir, "..", "build", "Release", "bitnet_addon.node"),
  join(__dir, "..", "native", "build", "Release", "bitnet_addon.node"),
  join(__dir, "..", "prebuilds", `bitnet_addon-${process.platform}-${process.arch}.node`),
];

export function loadNativeAddon(opts: { expectedHash?: string } = {}): AddonLoadResult {
  const searched: string[] = [];
  for (const p of CANDIDATE_PATHS) {
    searched.push(p);
    if (!existsSync(p)) continue;
    // CF-7: hash the binary BEFORE loading it. In a certified deployment the
    // caller passes the expected hash; a mismatch FAILS CLOSED (no require()).
    const addonHash = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (opts.expectedHash !== undefined && opts.expectedHash !== addonHash) {
      return {
        loaded: false, addon: null, searchedPaths: searched, addonPath: p, addonHash,
        reason: `ERR_ADDON_HASH_MISMATCH at ${p}: expected ${opts.expectedHash}, got ${addonHash}`,
      };
    }
    try {
      const addon = require(p) as BitNetNativeAddon;
      // Minimal contract check.
      if (typeof addon.tmac === "function" && typeof addon.init === "function") {
        return { loaded: true, addon, searchedPaths: searched, reason: `loaded ${p}`, addonPath: p, addonHash };
      }
      return { loaded: false, addon: null, searchedPaths: searched, addonPath: p, addonHash, reason: `addon at ${p} missing required exports` };
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
