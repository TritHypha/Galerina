// K3U2 TS <-> native Fungi Verdict marshal (test-only, fail-closed). gcw-k3u10 2026-10-25.
//
// The native Fungi Verdict is a closed enum Deny | Unknown | Allow with no NEUTRAL member. The TS
// reference is DENY(-1) | NEUTRAL(0) | ALLOW(+1) plus the typed K3_UNKNOWN sentinel. Zero-trust choice:
//   - K3_UNKNOWN maps to the native member Verdict.Unknown, taken from the compiler itself (a flow that
//     returns Verdict.Unknown), so this file never writes a number for UNKNOWN.
//   - NEUTRAL (trit 0) has NO native image and is refused (throws): it is never conflated with Unknown.
//   - Anything else (junk, forged sentinel, NaN, strings) is refused.
//   - fromFungi accepts only the three native images; anything else is refused.
// Rejected: NEUTRAL -> Unknown (conflates a computed 0 with undecided, the K3U2 bug in reverse);
// NEUTRAL -> Deny (silently rewrites a value); a 4th native member here (compiler change, out of scope).
import { isDeepStrictEqual } from "node:util";
import { executeFlow, parseProgram } from "../../../galerina-core-compiler/dist/index.js";
import { K3_UNKNOWN, Verdict } from "../../dist/index.js";

const IMAGE_SOURCE = [
  "@version 1",
  "pure flow nativeDeny() -> Verdict { return Verdict.Deny }",
  "pure flow nativeUnknown() -> Verdict { return Verdict.Unknown }",
  "pure flow nativeAllow() -> Verdict { return Verdict.Allow }",
].join("\n");

let images;
export async function nativeImages() {
  if (images) return images;
  const program = parseProgram(IMAGE_SOURCE, "k3-fungi-marshal.fungi");
  const errors = (program.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errors.length !== 0) throw new Error("marshal image program has errors — fail-closed");
  const run = async (name) => (await executeFlow(name, new Map(), program.ast, program.flows)).value;
  const deny = await run("nativeDeny");
  const unknown = await run("nativeUnknown");
  const allow = await run("nativeAllow");
  for (const v of [deny, unknown, allow]) {
    if (v === null || typeof v !== "object" || v.__tag !== "verdict") throw new Error("no native Verdict image — fail-closed");
  }
  if (isDeepStrictEqual(deny, unknown) || isDeepStrictEqual(unknown, allow) || isDeepStrictEqual(deny, allow)) {
    throw new Error("native Verdict images collide — fail-closed");
  }
  images = Object.freeze({ deny: Object.freeze(deny), unknown: Object.freeze(unknown), allow: Object.freeze(allow) });
  return images;
}

export async function toFungi(v) {
  const img = await nativeImages();
  if (v === K3_UNKNOWN) return img.unknown;
  if (v === Verdict.DENY) return img.deny;
  if (v === Verdict.ALLOW) return img.allow;
  if (v === Verdict.NEUTRAL) throw new Error("TS NEUTRAL (trit 0) has no native Fungi Verdict image — fail-closed");
  throw new Error("value is not a TS Verdict — fail-closed");
}

export async function fromFungi(value) {
  const img = await nativeImages();
  if (isDeepStrictEqual(value, img.unknown)) return K3_UNKNOWN;
  if (isDeepStrictEqual(value, img.deny)) return Verdict.DENY;
  if (isDeepStrictEqual(value, img.allow)) return Verdict.ALLOW;
  throw new Error("Fungi result is not a native Verdict — fail-closed");
}
