// rd0361-cors-policy.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the cors-policy twin.
// Oracle = the reference spec in rd0361-cors-policy-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "cors-policy.fungi",
  module: "cors-policy",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-cors-policy-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
export const signatures = Object.freeze([
  { name: "admit", params: [], returns: "k3" },
  { name: "deny", params: [], returns: "k3" },
  { name: "corsVerdict", params: ["bool", "bool", "bool", "bool", "bool", "bool", "bool", "bool"], returns: "k3" },
]);
export const reference = Object.freeze({
  admit: () => 1,
  deny: () => -1,
  corsVerdict: (o, nullO, wild, creds, exact, pre, pm, ph) => {
    if (!o) return 1;
    if (nullO) return -1;
    if (wild && creds) return -1;
    if (!exact && !wild) return -1;
    if (pre) { if (!pm) return -1; if (!ph) return -1; }
    return 1;
  },
});
export function cases() {
  const rows = [{ id: "admit", export: "admit", args: [] }, { id: "deny", export: "deny", args: [] }];
  for (let n = 0; n < 256; n++) {
    const bitAt = (i) => ((n >> i) & 1) === 1;
    rows.push({ id: `cors-${n}`, export: "corsVerdict", args: [0, 1, 2, 3, 4, 5, 6, 7].map(bitAt) });
  }
  return rows;
}
