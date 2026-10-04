// rd0361-egress-guard.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the egress-guard twin.
// Oracle = the reference spec in rd0361-egress-guard-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// The existing test's full >11k-point classify corpus exceeds the 8192-case frozen cap; this set freezes the d in {0,254} plane plus d=255 for a=255, and the existing test keeps the dense corpus.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "egress-guard.fungi",
  module: "egress-guard",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-egress-guard-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
export const signatures = Object.freeze([
  { name: "classifyIpv4Category", params: ["int", "int", "int", "int"], returns: "int" },
  { name: "egressVerdict", params: ["int", "bool", "bool", "bool", "bool"], returns: "k3" },
  { name: "resolvedVerdict", params: ["int", "bool", "bool"], returns: "k3" },
  { name: "urlVerdict", params: ["bool", "bool", "k3", "bool", "bool", "bool", "bool"], returns: "k3" },
]);
export const reference = Object.freeze({
  classifyIpv4Category: (a, b, c, d) => {
    if (a === 169 && b === 254) return (c === 169 && d === 254) ? 0 : 3;
    if (a === 0) return 7;
    if (a === 127) return 1;
    if (a === 10) return 2;
    if (a === 172 && b > 15 && b < 32) return 2;
    if (a === 192) {
      if (b === 168) return 2;
      if (b === 0 && (c === 0 || c === 2)) return 8;
    }
    if (a === 100 && b > 63 && b < 128) return 5;
    if (a === 198) {
      if (b === 18 || b === 19) return 8;
      if (b === 51 && c === 100) return 8;
    }
    if (a === 203 && b === 0 && c === 113) return 8;
    if (a > 223 && a < 240) return 6;
    if (a > 239) return (a === 255 && b === 255 && c === 255 && d === 255) ? 9 : 8;
    return 10;
  },
  egressVerdict: (category, allowNonPublic, allowMetadata, allowLoopback, isAllowlisted) => {
    if (isAllowlisted) return 1;
    if (category === 0) return allowMetadata ? 1 : -1;
    if (category === 1 && allowLoopback) return 1;
    if (category === 10) return 1;
    if (category === 11) return -1;
    return allowNonPublic ? 1 : -1;
  },
  resolvedVerdict: (resolvedCount, anyNonPublic, isAllowlisted) => {
    if (resolvedCount < 1) return -1;
    if (isAllowlisted) return 1;
    return anyNonPublic ? -1 : 1;
  },
  urlVerdict: (schemeAllowed, credentialsBlocked, hostVerdict, isLoopback, isAllowlisted, tlsOk, portOk) => {
    if (!schemeAllowed) return -1;
    if (credentialsBlocked) return -1;
    if (hostVerdict < 1) return hostVerdict;
    if (isLoopback) return 1;
    if (isAllowlisted) return 1;
    if (!tlsOk) return -1;
    if (!portOk) return -1;
    return 1;
  },
});
const AS = [0, 1, 9, 10, 11, 99, 100, 101, 126, 127, 128, 168, 169, 170, 171, 172, 173, 191, 192, 193, 197, 198, 199, 202, 203, 204, 223, 224, 225, 239, 240, 241, 254, 255];
const BS = [0, 1, 15, 16, 18, 19, 31, 32, 51, 63, 64, 100, 113, 127, 128, 168, 254, 255];
const CS = [0, 2, 100, 113, 169, 255];
export function cases() {
  const rows = [];
  for (const a of AS) for (const bb of BS) for (const c of CS) for (const d of [0, 254])
    rows.push({ id: `ip-${a}-${bb}-${c}-${d}`, export: "classifyIpv4Category", args: [a, bb, c, d] });
  for (const bb of BS) for (const c of CS) rows.push({ id: `ip-255-${bb}-${c}-255`, export: "classifyIpv4Category", args: [255, bb, c, 255] });
  for (let cat = -1; cat <= 12; cat++) for (const np of B) for (const md of B) for (const lb of B) for (const al of B)
    rows.push({ id: `egress-${cat}-${b(np)}${b(md)}${b(lb)}${b(al)}`, export: "egressVerdict", args: [cat, np, md, lb, al] });
  for (const n of [-2147483648, -2, -1, 0, 1, 2, 7, 2147483647]) for (const anp of B) for (const al of B)
    rows.push({ id: `resolved-${n}-${b(anp)}${b(al)}`, export: "resolvedVerdict", args: [n, anp, al] });
  for (const sa of B) for (const cb of B) for (const hv of TRITS) for (const il of B) for (const al of B) for (const tls of B) for (const po of B)
    rows.push({ id: `url-${b(sa)}${b(cb)}${hv}${b(il)}${b(al)}${b(tls)}${b(po)}`, export: "urlVerdict", args: [sa, cb, hv, il, al, tls, po] });
  return rows;
}
