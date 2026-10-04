// rd0361-route-defaults.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the
// route-defaults twin. Oracle = the reference spec in rd0361-route-defaults-execution.test.mjs, copied
// verbatim (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// String args marshal at the module's own literal handles (the shared loader does this, task #68).
// Re-capture: node scripts/rd0361-freeze-reference.mjs.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-framework-app-kernel/src/self-hosted",
  file: "route-defaults.fungi",
  module: "route-defaults",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-framework-app-kernel/tests/rd0361-route-defaults-execution.test.mjs",
});
export const signatures = Object.freeze([
  { name: "secureMaxBodyBytes", params: ["bool"], returns: "int" },
  { name: "secureMaxConcurrent", params: ["bool"], returns: "int" },
  { name: "isBodySizeRelaxation", params: ["int", "bool"], returns: "bool" },
  { name: "isFieldPolicyRelaxation", params: ["string"], returns: "bool" },
  { name: "isAuthRelaxation", params: ["string"], returns: "bool" },
  { name: "idempotentByDefault", params: ["string"], returns: "bool" },
  { name: "isIdempotencyRelaxation", params: ["string", "bool"], returns: "bool" },
]);
const refMaxBody = (postureOn) => (postureOn ? 65536 : 262144);
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const reference = Object.freeze({
  secureMaxBodyBytes: refMaxBody,
  secureMaxConcurrent: (postureOn) => (postureOn ? 5 : 10),
  isBodySizeRelaxation: (userMax, postureOn) => userMax > refMaxBody(postureOn),
  isFieldPolicyRelaxation: (setting) => setting !== "deny",
  isAuthRelaxation: (mode) => mode === "public",
  idempotentByDefault: (method) => MUTATING.has(method),
  isIdempotencyRelaxation: (method, enabled) => MUTATING.has(method) && !enabled,
});
const B = [false, true];
const b = (x) => (x ? 1 : 0);
const slug = (s) => (s === "" ? "empty" : s.toLowerCase());
export function cases() {
  const rows = [];
  for (const p of B) {
    rows.push({ id: `maxbody-${b(p)}`, export: "secureMaxBodyBytes", args: [p] });
    rows.push({ id: `maxconc-${b(p)}`, export: "secureMaxConcurrent", args: [p] });
  }
  const NS = [-2147483648, -1, 0, 1, 65535, 65536, 65537, 262143, 262144, 262145, 2147483647];
  for (const p of B) for (const [i, n] of NS.entries()) rows.push({ id: `bodyrelax-${b(p)}-${i}`, export: "isBodySizeRelaxation", args: [n, p] });
  for (const s of ["deny", "allow", "warn", "", "Deny"]) rows.push({ id: `field-${s === "Deny" ? "upper-deny" : slug(s)}`, export: "isFieldPolicyRelaxation", args: [s] });
  for (const m of ["public", "required", "", "Public"]) rows.push({ id: `auth-${m === "Public" ? "upper-public" : slug(m)}`, export: "isAuthRelaxation", args: [m] });
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "GET", "HEAD", "OPTIONS", "post"]) {
    const id = m === "post" ? "lower-post" : slug(m);
    rows.push({ id: `idem-${id}`, export: "idempotentByDefault", args: [m] });
    for (const en of B) rows.push({ id: `idemrelax-${id}-${b(en)}`, export: "isIdempotencyRelaxation", args: [m, en] });
  }
  return rows;
}
