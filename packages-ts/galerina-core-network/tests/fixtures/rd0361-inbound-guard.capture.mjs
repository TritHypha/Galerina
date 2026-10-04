// rd0361-inbound-guard.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the inbound-guard twin.
// Oracle = the reference spec in rd0361-inbound-guard-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "inbound-guard.fungi",
  module: "inbound-guard",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-inbound-guard-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
export const signatures = Object.freeze([
  { name: "admit", params: [], returns: "k3" },
  { name: "deny", params: [], returns: "k3" },
  { name: "inboundVerdict", params: ["bool", "bool", "bool", "bool"], returns: "k3" },
  { name: "rateLimitVerdict", params: ["bool", "bool", "bool"], returns: "k3" },
]);
export const reference = Object.freeze({
  admit: () => 1,
  deny: () => -1,
  inboundVerdict: (port, denyMatch, allowMatch, defAllow) => (!port ? -1 : denyMatch ? -1 : allowMatch ? 1 : defAllow ? 1 : -1),
  rateLimitVerdict: (parseable, expired, below) => (!parseable ? -1 : expired ? 1 : below ? 1 : -1),
});
export function cases() {
  const rows = [{ id: "admit", export: "admit", args: [] }, { id: "deny", export: "deny", args: [] }];
  for (const p of B) for (const d of B) for (const a of B) for (const f of B)
    rows.push({ id: `inbound-${b(p)}${b(d)}${b(a)}${b(f)}`, export: "inboundVerdict", args: [p, d, a, f] });
  for (const p of B) for (const e of B) for (const l of B)
    rows.push({ id: `rate-${b(p)}${b(e)}${b(l)}`, export: "rateLimitVerdict", args: [p, e, l] });
  return rows;
}
