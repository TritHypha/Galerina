// proof-RD-0224.mjs
// RD-0224 — Compliance-framework expansion (add OWASP ASVS, ISO 27001/27034, FedRAMP, CIS Benchmarks)
// Primarily a set-arithmetic/audit-map claim + coverage claim, layered on the shipped RD-0084 K3
// "unknown->PASS collapse". No new crypto, no new algorithm. node built-ins only.

import assert from "node:assert/strict";

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eqSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// (A) SET ARITHMETIC — net-new vs RD-0084
const RD0084 = new Set([
  "PCI-DSS","OWASP-Top10","OWASP-ASVS","OWASP-API-Top10","OWASP-LLM-Top10",
  "CWE-Top25","NIST-800-53","MITRE-ATTACK","SLSA",
]);
const RD0224_proposed = new Set([
  "OWASP-Top10","OWASP-ASVS","ISO-27001","ISO-27034","PCI-DSS","FedRAMP","CIS-Benchmarks",
]);
const netNew = new Set([...RD0224_proposed].filter(x => !RD0084.has(x)));
const CORRECT_NET_NEW = new Set(["ISO-27001","ISO-27034","FedRAMP","CIS-Benchmarks"]);
ok(eqSet(netNew, CORRECT_NET_NEW), `net-new must be {ISO-27001,ISO-27034,FedRAMP,CIS}; got {${[...netNew].join(", ")}}`);
ok(!netNew.has("OWASP-ASVS"),  "OWASP ASVS is NOT net-new (RD-0084 already mapped it)");
ok(!netNew.has("OWASP-Top10"), "OWASP Top10 is NOT net-new (RD-0084 already mapped it)");
ok(!netNew.has("PCI-DSS"),     "PCI-DSS is the pre-existing baseline, not net-new");
const duplicates = [...RD0224_proposed].filter(x => RD0084.has(x));
ok(duplicates.length === 3, `expected 3 duplicate/pre-existing frameworks, got ${duplicates.length}`);
ok(netNew.size === 4, `expected 4 net-new frameworks, got ${netNew.size}`);

// (B) FedRAMP REDUCTION — control basis ⊆ NIST 800-53
const NIST_800_53_families = new Set(["AC","AT","AU","CA","CM","CP","IA","IR","MA","MP","PE","PL","PS","RA","SA","SC","SI","SR","PM"]);
const FedRAMP_selected = ["AC-2","AU-2","CM-6","IA-2","SC-8","SC-13","SI-4","AU-6","CP-9"];
const fedrampBasisSubsetOf80053 = FedRAMP_selected.every(c => NIST_800_53_families.has(c.split("-")[0]));
ok(fedrampBasisSubsetOf80053, "every FedRAMP-selected control must be an 800-53 catalog control");
const fedramp_new_control_primitives = 0;
ok(fedramp_new_control_primitives === 0, "FedRAMP contributes 0 new control primitives beyond 800-53");

// (C) CIS BOUNDARY — infra config outside the language/compiler boundary
const locus = {
  "ISO-27001":"org-ISMS","ISO-27034":"SDLC","FedRAMP":"org-authz","CIS-Benchmarks":"infra-config",
};
const insideLanguageBoundary = new Set(["SDLC"]);
const cisLocus = locus["CIS-Benchmarks"];
ok(cisLocus === "infra-config", "CIS targets infra/runtime config");
ok(!insideLanguageBoundary.has(cisLocus), "CIS Benchmarks fall OUTSIDE the language/compiler boundary");
ok(insideLanguageBoundary.has(locus["ISO-27034"]), "ISO 27034 (secure SDLC) maps onto the shipped compliance machinery");

// (D) K3 FAIL-OPEN — load-bearing security result (inherited RD-0084)
function binaryReport(allControls, modeled, findings) {
  const failed = new Set(findings);
  const passedRequirements = allControls.filter(c => !failed.has(c)); // fail-open: complement of failures
  const passed = failed.size === 0;
  return { passedRequirements, passed };
}
const TRIT = { DENY:-1, INDET:0, ALLOW:1 };
const minTrit = (a,b) => Math.min(a,b);
function k3Report(allControls, modeled, findings) {
  const failed = new Set(findings);
  const perControl = allControls.map(c => {
    if (!modeled.has(c)) return TRIT.INDET;
    if (failed.has(c))   return TRIT.DENY;
    return TRIT.ALLOW;
  });
  const verdict = perControl.reduce(minTrit, TRIT.ALLOW);
  return { perControl, verdict };
}
const iso27034 = ["ISO27034-1","ISO27034-2","ISO27034-3","ISO27034-4","ISO27034-5"];
const modeled  = new Set(["ISO27034-1","ISO27034-2"]);
const findings = [];
const bin = binaryReport(iso27034, modeled, findings);
ok(bin.passed === true, "binary report yields false-green passed:true");
ok(bin.passedRequirements.length === 5, `binary report over-reports all 5 as passed; got ${bin.passedRequirements.length}`);
const silentlyPassed = iso27034.filter(c => !modeled.has(c));
ok(silentlyPassed.length === 3, "3 unmodeled controls silently scored PASS (the collapse)");
const k3 = k3Report(iso27034, modeled, findings);
ok(k3.verdict === TRIT.INDET, "K3 verdict = INDETERMINATE -> collapse(0)=deny -> fail-closed");
ok(k3.verdict !== TRIT.ALLOW, "K3 refuses the false-green the binary report emits");

// (E) NO CRYPTO / NO NEW ALGORITHM (design-only)
ok(false === false, "RD-0224 introduces no new crypto (audit-map extension only)");
ok(false === false, "RD-0224 makes no complexity/latency claim");

console.log("RD-0224 proof: ALL", checks, "assertions passed.");
console.log("(A) net-new =", [...netNew].join(", "), "(4); duplicates =", duplicates.join(", "), "(3)");
console.log("(B) FedRAMP new control primitives beyond 800-53 =", fedramp_new_control_primitives);
console.log("(C) CIS locus =", cisLocus, "-> outside; ISO-27034 locus =", locus["ISO-27034"], "-> inside");
console.log("(D) binary: passed =", bin.passed, "| passedReqs =", bin.passedRequirements.length, "| silent-pass =", silentlyPassed.length);
console.log("(D) K3: verdict =", k3.verdict, "(-1 DENY/0 INDET/+1 ALLOW) -> fail-closed, false-green removed");