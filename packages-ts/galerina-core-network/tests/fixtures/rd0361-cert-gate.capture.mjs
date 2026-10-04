// rd0361-cert-gate.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the cert-gate twin.
// Oracle = the reference spec in rd0361-cert-gate-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// vAnd / withSideSignal / certVerdict are captured from the REAL shipped K3 (galerina-tower-citizen dist three-valued-governance.js), exactly as the existing test drives them; the four sub-gates and the String folds are the test's spec.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "cert-gate.fungi",
  module: "cert-gate",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-cert-gate-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
import { allOf, vAnd } from "../../../galerina-tower-citizen/dist/three-valued-governance.js";
export const signatures = Object.freeze([
  { name: "vAnd", params: ["k3", "k3"], returns: "k3" },
  { name: "withSideSignal", params: ["k3", "k3"], returns: "k3" },
  { name: "certVerdict", params: ["k3", "k3", "k3", "k3"], returns: "k3" },
  { name: "pinMatchVerdict", params: ["bool", "bool", "bool"], returns: "k3" },
  { name: "chainValidVerdict", params: ["bool", "bool"], returns: "k3" },
  { name: "notExpiredVerdict", params: ["bool", "bool"], returns: "k3" },
  { name: "revocationVerdict", params: ["bool", "bool", "bool"], returns: "k3" },
  { name: "boundaryAuthorized", params: ["k3"], returns: "string" },
  { name: "revocationRecheckDue", params: ["string", "bool", "bool", "bool"], returns: "string" },
]);
export const reference = Object.freeze({
  vAnd: (x, y) => vAnd(x, y),
  withSideSignal: (x, y) => vAnd(x, y),
  certVerdict: (p, c, n, r) => allOf([p, c, n, r]),
  pinMatchVerdict: (cfg, present, match) => (!cfg ? 0 : !present ? 0 : match ? 1 : -1),
  chainValidVerdict: (valid, invalid) => (valid ? 1 : invalid ? -1 : 0),
  notExpiredVerdict: (known, within) => (!known ? 0 : within ? 1 : -1),
  revocationVerdict: (revoked, good, fresh) => (revoked ? -1 : !good ? 0 : !fresh ? 0 : 1),
  boundaryAuthorized: (v) => (v === 1 ? "authorized" : "denied"),
  revocationRecheckDue: (mode, ev, ie, cb) => (cb ? "due" : (mode === "poll" ? (!ev ? "not-due" : (ie ? "due" : "not-due")) : "not-due")),
});
export function cases() {
  const rows = [];
  for (const x of TRITS) for (const y of TRITS) {
    rows.push({ id: `vand-${x}-${y}`, export: "vAnd", args: [x, y] });
    rows.push({ id: `side-${x}-${y}`, export: "withSideSignal", args: [x, y] });
  }
  for (const p of TRITS) for (const c of TRITS) for (const n of TRITS) for (const r of TRITS)
    rows.push({ id: `cert-${p}-${c}-${n}-${r}`, export: "certVerdict", args: [p, c, n, r] });
  for (const x of B) for (const y of B) for (const z of B) {
    rows.push({ id: `pin-${b(x)}${b(y)}${b(z)}`, export: "pinMatchVerdict", args: [x, y, z] });
    rows.push({ id: `revoc-${b(x)}${b(y)}${b(z)}`, export: "revocationVerdict", args: [x, y, z] });
  }
  for (const x of B) for (const y of B) {
    rows.push({ id: `chain-${b(x)}${b(y)}`, export: "chainValidVerdict", args: [x, y] });
    rows.push({ id: `expiry-${b(x)}${b(y)}`, export: "notExpiredVerdict", args: [x, y] });
  }
  for (const v of TRITS) rows.push({ id: `boundary-${v}`, export: "boundaryAuthorized", args: [v] });
  for (const [label, mode] of [["poll", "poll"], ["other", "other"], ["upper-poll", "Poll"], ["empty", ""]]) for (const ev of B) for (const ie of B) for (const cb of B)
    rows.push({ id: `recheck-${label}-${b(ev)}${b(ie)}${b(cb)}`, export: "revocationRecheckDue", args: [mode, ev, ie, cb] });
  return rows;
}
