// rd0361-defensive-controls.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the defensive-controls twin.
// Oracle = the reference spec in rd0361-defensive-controls-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "defensive-controls.fungi",
  module: "defensive-controls",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-defensive-controls-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
export const signatures = Object.freeze([
  { name: "proxyTrustVerdict", params: ["bool", "bool", "bool", "bool", "bool"], returns: "k3" },
  { name: "useForwardedAddress", params: ["bool", "bool"], returns: "k3" },
  { name: "uniformResourceAuthorized", params: ["bool"], returns: "k3" },
  { name: "uniformAuthAuthenticated", params: ["bool"], returns: "k3" },
  { name: "opaqueIdVerdict", params: ["bool", "bool", "bool"], returns: "k3" },
  { name: "pageLimitBranch", params: ["bool", "bool"], returns: "k3" },
]);
const refUniform = (isOk) => (isOk ? 1 : -1);
export const reference = Object.freeze({
  proxyTrustVerdict: (isMtls, mv, mp, isTok, tv) => {
    if (isMtls) return (mv && mp) ? 1 : -1;
    if (isTok) return tv ? 1 : -1;
    return -1;
  },
  useForwardedAddress: (trusted, nonBlank) => (trusted && nonBlank ? 1 : 0),
  uniformResourceAuthorized: refUniform,
  uniformAuthAuthenticated: refUniform,
  opaqueIdVerdict: (le, nn, us) => (!le ? -1 : !nn ? -1 : !us ? -1 : 1),
  pageLimitBranch: (valid, exceeds) => (!valid ? -1 : exceeds ? 1 : 0),
});
export function cases() {
  const rows = [];
  for (const m of B) for (const v of B) for (const p of B) for (const t of B) for (const tv of B)
    rows.push({ id: `proxy-${b(m)}${b(v)}${b(p)}${b(t)}${b(tv)}`, export: "proxyTrustVerdict", args: [m, v, p, t, tv] });
  for (const t of B) for (const n of B) rows.push({ id: `fwd-${b(t)}${b(n)}`, export: "useForwardedAddress", args: [t, n] });
  for (const ok of B) {
    rows.push({ id: `res-${b(ok)}`, export: "uniformResourceAuthorized", args: [ok] });
    rows.push({ id: `auth-${b(ok)}`, export: "uniformAuthAuthenticated", args: [ok] });
  }
  for (const l of B) for (const n of B) for (const u of B) rows.push({ id: `opaque-${b(l)}${b(n)}${b(u)}`, export: "opaqueIdVerdict", args: [l, n, u] });
  for (const v of B) for (const e of B) rows.push({ id: `page-${b(v)}${b(e)}`, export: "pageLimitBranch", args: [v, e] });
  return rows;
}
