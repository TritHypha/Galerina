// rd0361-k3-codec.mjs: K3-UNKNOWN-NOT-ZERO (owner decision D-A, Phillip 2026-10-25 18:28 GMT) codec between the
// native .fungi K3 encoding (trits -1/0/1 plus the UNKNOWN sentinel -128) and the shipped TS Verdict (trits plus
// the frozen K3_UNKNOWN object). Identity only: -128 <-> the one K3_UNKNOWN object; anything else throws.
// Rejected: mapping K3_UNKNOWN to 0 (the conflation K3U2 removes); accepting any isK3Unknown look-alike (a forged
// object with kind "K3_UNKNOWN" must not pass). NON_AUTHORIZING.
import { K3_UNKNOWN } from "../../../galerina-tower-citizen/dist/three-valued-governance.js";

export const NATIVE_UNKNOWN = -128;
/** native Int -> TS Verdict */
export function decodeK3(n) {
  if (n === NATIVE_UNKNOWN) return K3_UNKNOWN;
  if (n === -1 || n === 0 || n === 1) return n;
  throw new Error(`k3 codec: not a native K3 value: ${String(n)}`);
}
/** TS Verdict -> native Int */
export function encodeK3(v) {
  if (v === K3_UNKNOWN) return NATIVE_UNKNOWN;
  if (v === -1 || v === 0 || v === 1) return v;
  throw new Error("k3 codec: not a shipped TS Verdict");
}
