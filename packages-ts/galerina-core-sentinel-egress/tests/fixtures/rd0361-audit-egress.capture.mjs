// rd0361-audit-egress.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the audit-egress
// twin. Oracle = the reference spec in rd0361-audit-egress-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-sentinel-egress/src/self-hosted",
  file: "audit-egress.fungi",
  module: "audit-egress",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-sentinel-egress/tests/rd0361-audit-egress-execution.test.mjs",
});
export const signatures = Object.freeze([
  { name: "chainLinkVerdict", params: ["bool", "bool", "bool", "bool"], returns: "k3" },
  { name: "epochLinkVerdict", params: ["bool", "bool", "bool", "int"], returns: "int" },
  { name: "epochAdoptVerdict", params: ["bool", "bool"], returns: "k3" },
  { name: "configVerdict", params: ["bool", "bool", "bool"], returns: "k3" },
]);
export const reference = Object.freeze({
  chainLinkVerdict: (ph, seq, cnt, mac) => (!ph || !seq || !cnt || !mac ? -1 : 1),
  epochLinkVerdict: (ev, nd, ku, base) => (!ev ? -1 : !nd ? -1 : !ku ? -1 : base < 1 ? base : 1),
  epochAdoptVerdict: (gt, real) => (!gt ? -1 : !real ? -1 : 1),
  configVerdict: (bs, sk, ep) => (!bs ? -1 : !sk ? -1 : !ep ? -1 : 1),
});
const B = [false, true];
const b = (x) => (x ? 1 : 0);
export function cases() {
  const rows = [];
  for (const p of B) for (const s of B) for (const c of B) for (const m of B) rows.push({ id: `chain-${b(p)}${b(s)}${b(c)}${b(m)}`, export: "chainLinkVerdict", args: [p, s, c, m] });
  for (const e of B) for (const n of B) for (const k of B) for (const base of [-1, 0, 1]) rows.push({ id: `epoch-${b(e)}${b(n)}${b(k)}-${base}`, export: "epochLinkVerdict", args: [e, n, k, base] });
  for (const g of B) for (const r of B) rows.push({ id: `adopt-${b(g)}${b(r)}`, export: "epochAdoptVerdict", args: [g, r] });
  for (const x of B) for (const y of B) for (const z of B) rows.push({ id: `config-${b(x)}${b(y)}${b(z)}`, export: "configVerdict", args: [x, y, z] });
  return rows;
}
