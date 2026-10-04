// rd0361-registry-index.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the
// registry-index twin. Oracle = the REAL lookupCertifiedPackage (registry-index.ts, package dist), driven as
// rd0361-packages-execution-cutover.test.mjs drives it: each consistent evidence tuple (nameCount,
// versionCount, hashMatches, keyIdProvided, keyIdMatches) is realised as a concrete registry + query, the
// real decider answers, and the realised scenario is re-derived to the same tuple (else the capture throws).
// Scope: lookupVerdict only, the export the existing differential covers. Other exports are not frozen here.
// Re-capture: node scripts/rd0361-freeze-reference.mjs.
import { lookupCertifiedPackage } from "../../dist/index.js";

export const twin = Object.freeze({
  dir: "packages-ts/galerina-framework-app-kernel/src/self-hosted",
  file: "registry-index.fungi",
  module: "registry-index",
});
export const oracle = Object.freeze({
  kind: "typescript-shadow-capture",
  source: "packages-ts/galerina-framework-app-kernel/src/registry-index.ts",
});
export const signatures = Object.freeze([
  { name: "lookupVerdict", params: ["int", "int", "bool", "bool", "bool"], returns: "string" },
]);

const H = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
const H2 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
const entry = (name, version, sourceHash, keyId) => ({
  name, version, sourceHash, keyId, publisher: "acme", certificationLevel: "certified",
  riskRating: "low", capabilities: [], effects: [],
});
function realise(nameCount, versionCount, hashMatches, keyIdProvided, keyIdMatches) {
  const entries = [entry("other", "1.0.0", H, "k1")];
  for (let i = 0; i < versionCount; i++) entries.push(entry("pkg", "1.0.0", versionCount === 1 && !hashMatches ? H2 : H, `k${i + 1}`));
  for (let i = versionCount; i < nameCount; i++) entries.push(entry("pkg", `2.0.${i}`, H, "k1"));
  const q = { name: "pkg", version: "1.0.0", sourceHash: H };
  if (keyIdProvided) q.keyId = versionCount === 1 && !keyIdMatches ? "k9" : "k1";
  return { entries, q };
}
function rederive(entries, q) {
  const named = entries.filter((e) => e.name === q.name);
  const matches = named.filter((e) => e.version === q.version);
  const one = matches.length === 1;
  const provided = Object.hasOwn(q, "keyId");
  return [named.length, matches.length, one ? matches[0].sourceHash === q.sourceHash : true, provided, one && provided ? matches[0].keyId === q.keyId : true];
}
export const reference = Object.freeze({
  lookupVerdict: (...tuple) => {
    const { entries, q } = realise(...tuple);
    if (JSON.stringify(rederive(entries, q)) !== JSON.stringify(tuple)) throw new Error(`inconsistent evidence tuple ${JSON.stringify(tuple)}`);
    const r = lookupCertifiedPackage({ entries }, q);
    return r.ok ? "ok" : r.code;
  },
});
const B = [false, true];
const b = (x) => (x ? 1 : 0);
export function cases() {
  const rows = [];
  for (let nc = 0; nc <= 3; nc++) for (let vc = 0; vc <= nc; vc++) for (const hm of B) for (const kp of B) for (const km of B) {
    if (vc !== 1 && !hm) continue;
    if ((vc !== 1 || !kp) && !km) continue;
    rows.push({ id: `lookup-n${nc}-v${vc}-${b(hm)}${b(kp)}${b(km)}`, export: "lookupVerdict", args: [nc, vc, hm, kp, km] });
  }
  return rows;
}
