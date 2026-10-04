// rd0361-registry-index.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the
// registry-index twin. Oracle = the REAL lookupCertifiedPackage (registry-index.ts, package dist), driven as
// rd0361-packages-execution-cutover.test.mjs drives it: each consistent evidence tuple (nameCount,
// versionCount, hashMatches, keyIdProvided, keyIdMatches) is realised as a concrete registry + query, the
// real decider answers, and the realised scenario is re-derived to the same tuple (else the capture throws).
// S6b extends the set to riskRank, signatureVerdict, policyVerdict and admitVerdict, each captured from the
// REAL registry-index.ts (verifyRegistryIndex v1 path, checkRegistryPolicy, admitFromRegistry). The 32
// lookupVerdict cases are unchanged. Cases where the real .ts and the twin DISAGREE are not frozen: they are
// listed by DISAGREEMENT_EXCLUDED below and reported (re-capturing over a disagreement is owner decision D-A).
// Re-capture: node scripts/rd0361-freeze-reference.mjs.
import {
  RegistryIndexError, admitFromRegistry, checkRegistryPolicy, lookupCertifiedPackage, verifyRegistryIndex,
} from "../../dist/index.js";

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
  { name: "riskRank", params: ["string"], returns: "int" },
  { name: "signatureVerdict", params: ["bool", "bool", "bool", "string", "bool", "bool"], returns: "string" },
  { name: "policyVerdict", params: ["bool", "bool", "string", "string"], returns: "string" },
  { name: "admitVerdict", params: ["string", "string", "string"], returns: "string" },
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
function realLookup(...tuple) {
  const { entries, q } = realise(...tuple);
  if (JSON.stringify(rederive(entries, q)) !== JSON.stringify(tuple)) throw new Error(`inconsistent evidence tuple ${JSON.stringify(tuple)}`);
  const r = lookupCertifiedPackage({ entries }, q);
  return r.ok ? "ok" : r.code;
}

// Signature evidence realised as a v1 (Ed25519, historical) index + an injected verifier result.
const FLOOR_FRESH = "2026-01-01T00:00:00Z";
const FLOOR_STALE = "2026-12-01T00:00:00Z";
function sigIndex(hasEd25519Sig, sigNonEmpty, canonIsJcs, schemaOk, entries) {
  return {
    schema: schemaOk ? "galerina-registry-index/v1" : "galerina-registry-index/v0",
    registry: "r", issuedAt: "2026-06-01T00:00:00Z", entries,
    signature: { algorithm: hasEd25519Sig ? "Ed25519" : "RSA", keyId: "k1", signature: sigNonEmpty ? "c2ln" : "", canon: canonIsJcs ? "jcs" : "c14n" },
  };
}
const verifierResult = (s) => (s === "true" ? true : s === "false" ? false : s);
function realSignature(hasEd25519Sig, sigNonEmpty, canonIsJcs, verifyResult, schemaOk, freshEnough) {
  const index = sigIndex(hasEd25519Sig, sigNonEmpty, canonIsJcs, schemaOk, []);
  try {
    return verifyRegistryIndex(index, () => verifierResult(verifyResult), freshEnough ? FLOOR_FRESH : FLOOR_STALE);
  } catch (err) {
    if (err instanceof RegistryIndexError) return err.code;
    throw err;
  }
}

// Policy evidence realised as a real entry + RegistryPolicy.
const LATTICE = ["low", "medium", "high", "critical"];
const policyEntry = (riskRating) => ({ ...entry("pkg", "1.0.0", H, "k1"), riskRating });
function realPolicy(levelAllowed, gateOnRisk, riskRating, maxRiskRating) {
  const policy = { allowedLevels: levelAllowed ? ["certified"] : ["experimental"], ...(gateOnRisk ? { maxRiskRating } : {}) };
  const r = checkRegistryPolicy(policyEntry(riskRating), policy);
  return r.ok ? "ok" : r.code;
}
// The real module keeps its risk order private; the rank is read off real gate decisions: rank(r) is the
// number of lattice maxima the real checkRegistryPolicy refuses r under.
const realRiskRank = (rating) => LATTICE.filter((max) => realPolicy(true, true, rating, max) !== "ok").length;

// admitVerdict: each gate outcome is realised by the evidence that produces it, then the REAL
// admitFromRegistry composes them. Each realisation is re-checked against its own gate first.
const SIG_EVIDENCE = {
  verified: [true, true, true, "true", true, true],
  ERR_REGISTRY_INDEX_UNSIGNED: [false, true, true, "true", true, true],
  ERR_REGISTRY_INDEX_MALFORMED: [true, true, false, "true", true, true],
  ERR_REGISTRY_INDEX_NO_KEY: [true, true, true, "no-key", true, true],
  ERR_REGISTRY_INDEX_BAD_SIGNATURE: [true, true, true, "false", true, true],
  ERR_REGISTRY_INDEX_STALE: [true, true, true, "true", true, false],
};
const LOOKUP_EVIDENCE = {
  ok: [1, 1, true, false, true],
  ERR_REGISTRY_PACKAGE_UNKNOWN: [0, 0, true, false, true],
  ERR_REGISTRY_VERSION_UNKNOWN: [1, 0, true, false, true],
  ERR_REGISTRY_DUPLICATE: [2, 2, true, false, true],
  ERR_REGISTRY_HASH_MISMATCH: [1, 1, false, false, true],
  ERR_REGISTRY_KEYID_MISMATCH: [1, 1, true, true, false],
};
function realAdmit(sigVerdict, lookupResult, policyResult) {
  const [hasEd, nonEmpty, jcs, vr, schemaOk, fresh] = SIG_EVIDENCE[sigVerdict];
  if (realSignature(...SIG_EVIDENCE[sigVerdict]) !== sigVerdict) throw new Error(`signature realisation failed for ${sigVerdict}`);
  if (realLookup(...LOOKUP_EVIDENCE[lookupResult]) !== lookupResult) throw new Error(`lookup realisation failed for ${lookupResult}`);
  const { entries, q } = realise(...LOOKUP_EVIDENCE[lookupResult]);
  const index = sigIndex(hasEd, nonEmpty, jcs, schemaOk, entries);
  const policy = { allowedLevels: policyResult === "ok" ? ["certified"] : ["experimental"] };
  const r = admitFromRegistry(index, () => verifierResult(vr), q, policy, fresh ? FLOOR_FRESH : FLOOR_STALE);
  return r.ok ? "admitted" : r.code;
}

export const reference = Object.freeze({
  lookupVerdict: realLookup,
  riskRank: realRiskRank,
  signatureVerdict: realSignature,
  policyVerdict: realPolicy,
  admitVerdict: realAdmit,
});

// Real .ts vs twin DISAGREEMENTS (found by the S6b capture; not frozen, reported):
//   D1 riskRank / policyVerdict on an UNKNOWN risk rating: the twin ranks it 99 (fail-closed DENY under any
//      max); the real checkRegistryPolicy compares RISK_ORDER[unknown] (undefined) > n, which is false, so
//      an unknown rating PASSES the risk gate (fail-open).
//   D2 signatureVerdict with an unsupported schema: the real verifyRegistryIndex refuses MALFORMED first;
//      the twin reports the earlier signature gate's code (UNSIGNED / MALFORMED-canon / NO_KEY / BAD_SIGNATURE)
//      and only reaches its schemaOk check after a good signature. Both refuse; the codes differ.
const RATINGS = [...LATTICE, "extreme"];
export function disagreementExcluded(row) {
  if (row.export === "riskRank") return !LATTICE.includes(row.args[0]);
  if (row.export === "policyVerdict") return row.args[0] && row.args[1] && !LATTICE.includes(row.args[2]);
  if (row.export === "signatureVerdict") {
    const [hasEd, nonEmpty, jcs, vr, schemaOk] = row.args;
    return !schemaOk && !(hasEd && nonEmpty && jcs && vr === "true");
  }
  return false;
}
const SIG_LABEL = { verified: "ok", ERR_REGISTRY_INDEX_UNSIGNED: "unsigned", ERR_REGISTRY_INDEX_MALFORMED: "malformed", ERR_REGISTRY_INDEX_NO_KEY: "nokey", ERR_REGISTRY_INDEX_BAD_SIGNATURE: "badsig", ERR_REGISTRY_INDEX_STALE: "stale" };
const LOOKUP_LABEL = { ok: "ok", ERR_REGISTRY_PACKAGE_UNKNOWN: "pkg", ERR_REGISTRY_VERSION_UNKNOWN: "ver", ERR_REGISTRY_DUPLICATE: "dup", ERR_REGISTRY_HASH_MISMATCH: "hash", ERR_REGISTRY_KEYID_MISMATCH: "keyid" };
const VR_LABEL = { true: "t", false: "f", "no-key": "nokey", yes: "yes" };
export function candidateCases() {
  const rows = [];
  for (const r of RATINGS) rows.push({ id: `rank-${r}`, export: "riskRank", args: [r] });
  for (const e of B) for (const n of B) for (const j of B) for (const vr of ["true", "false", "no-key", "yes"]) for (const s of B) for (const f of B)
    rows.push({ id: `sig-${b(e)}${b(n)}${b(j)}-${VR_LABEL[vr]}-${b(s)}${b(f)}`, export: "signatureVerdict", args: [e, n, j, vr, s, f] });
  for (const la of B) for (const g of B) for (const r of RATINGS) for (const m of RATINGS)
    rows.push({ id: `policy-${b(la)}${b(g)}-${r}-${m}`, export: "policyVerdict", args: [la, g, r, m] });
  for (const sv of Object.keys(SIG_LABEL)) for (const lv of Object.keys(LOOKUP_LABEL)) for (const pv of ["ok", "ERR_REGISTRY_POLICY_DENIED"])
    rows.push({ id: `admit-${SIG_LABEL[sv]}-${LOOKUP_LABEL[lv]}-${pv === "ok" ? "ok" : "denied"}`, export: "admitVerdict", args: [sv, lv, pv] });
  return rows;
}
const B = [false, true];
const b = (x) => (x ? 1 : 0);
export function cases() {
  const rows = [];
  for (let nc = 0; nc <= 3; nc++) for (let vc = 0; vc <= nc; vc++) for (const hm of B) for (const kp of B) for (const km of B) {
    if (vc !== 1 && !hm) continue;
    if ((vc !== 1 || !kp) && !km) continue;
    rows.push({ id: `lookup-n${nc}-v${vc}-${b(hm)}${b(kp)}${b(km)}`, export: "lookupVerdict", args: [nc, vc, hm, kp, km] });
  }
  // RD0361_PROBE_DISAGREEMENTS=1 re-includes the excluded rows, so `--check` reproduces the D1/D2 refusal.
  const probe = process.env.RD0361_PROBE_DISAGREEMENTS === "1";
  for (const row of candidateCases()) if (probe || !disagreementExcluded(row)) rows.push(row);
  return rows;
}
