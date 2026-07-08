// =============================================================================
// @galerina/ext-tritsocket — public surface.
//
// A deny-only ternary (Kleene-3) admission pre-filter. Emits Deny | Maybe, NEVER
// Allow. Run it IN FRONT OF a real keyed PQ gate (via `admit`) to cheaply reject
// obvious non-matches without ever weakening the real gate.
//
// ⚠️ NOT a security boundary, NOT authentication, holds NO key. The mask is public
// and the score is forgeable — that is exactly why `Maybe` is never an `Allow`.
// =============================================================================

export {
  Verdict,
  type Trit,
  packedLen,
  pack,
  unpack,
  prefilter,
  dot,
  prefilterBatch,
  ABI_VERSION,
} from "./prefilter.js";

export { admit, admitSync, type RealKeyedGate } from "./compose.js";
