#!/usr/bin/env node
// conformance-scan.mjs — @galerina/devtools-security by-construction conformance gate (RD-0296).
//
// Machine-asserts that each *verified* design construction is STILL PRESENT in the code, so the gate goes RED
// the moment a refactor removes it. This is the thing no off-the-shelf scanner can do — only Galerina knows
// its own constructions. It OPERATIONALISES what the periodic AI-skills audit CONFIRMS
// (docs/security/cybersec-skills-audit-2026-07-09.md); the audit feeds new checks in here.
//
// FAIL-CLOSED (RD-0290a / DP-RD-0269): the scanner itself must never be the fail-open — a check that cannot
// READ its target FAILS the gate (ok:false), never skips green. `--self-test` proves every detector fires on a
// synthetic regression before the enforcing scan (a neutered detector is itself a fail-open).
//
// HONEST-EVIDENCE tiers (a check MUST NOT print CONFIRMED for a claim whose engine it cannot read):
//   CONFIRMED · SPEC-ASSERTED · DEMONSTRATED (example-only) · GAP · OPEN-RISK.
// The `.hypha` §2 claims are deliberately ABSENT here — their engine (TritMeshQL) is EXTERNAL and not present;
// their conformance suite belongs in TritMesh-Query-Language/spec/05-conformance.md, and stays SPEC-ASSERTED /
// DEMONSTRATED until that engine exists (see the engine-external rescope prompt).
//
// Each finding: { check, tier, ok, severity, owasp, cwe, rd, target, message }. Gate = exit non-zero iff any
// ok===false (a construction regressed OR a target was unreadable). An OPEN-RISK/GAP finding whose construction
// still HOLDS is a REPORTED, tracked residual (e.g. .spore unsigned-v0) — visible, not a surprise, not a fail.
//
// Usage:
//   node conformance-scan.mjs --self-test   # prove every detector fires on a synthetic regression
//   node conformance-scan.mjs               # enforce against the live tree (exit 1 on any regression)
//   node conformance-scan.mjs --json        # machine-readable findings
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// packages-galerina/galerina-devtools-security/ -> the Galerina monorepo root.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readText = (rel) => {
  const abs = join(REPO, rel);
  if (!existsSync(abs)) return null;
  try { return readFileSync(abs, "utf8"); } catch { return null; }
};

// ── by-construction checks (pure: a text-resolver is injected so --self-test can plant regressions) ──────────
const FL = "packages-galerina/galerina-framework-app-kernel/src/fuse-loader.ts";
const HV = "packages-galerina/galerina-core-compiler/src/lmanifest-hybrid-verifier.ts";
const CONTAINER = "packages-galerina/galerina-ext-spore/src/container.ts";

/** sig-verify-pinned (0294t): the verifier pins Ed25519 AND ML-DSA-65 as constants; it never selects the
 *  primitive from the artifact's `alg`. RED if either pin is gone (a refactor may be reading alg). */
function checkSigVerifyPinned(get) {
  const base = { check: "sig-verify-pinned", owasp: "A08:2021", cwe: "CWE-347", rd: "0294t", target: FL };
  const fl = get(FL), hv = get(HV);
  if (fl === null || hv === null) return { ...base, tier: "OPEN-RISK", ok: false, severity: "critical", message: "cannot read the verifier source — fail-closed (cannot confirm algorithm pinning)" };
  const edPinned = fl.includes("crypto.verify(null,");                                   // RFC-8032 Ed25519, primitive hardcoded
  const mldsaPinned = hv.includes("ML_DSA_65_PUBKEY_BYTES") && hv.includes("verifyGovernanceSignatureHybrid");
  const ok = edPinned && mldsaPinned;
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "critical",
    message: ok
      ? "verifier pins Ed25519 (crypto.verify(null,…)) and the hybrid path pins ML-DSA-65 (both halves) — the algorithm is not selected from the artifact"
      : `algorithm-pin REGRESSED — ${!edPinned ? "Ed25519 crypto.verify(null,…) pin missing in fuse-loader" : "ML-DSA-65 hybrid pin missing in lmanifest-hybrid-verifier"} (the verifier may be reading 'alg' from the artifact — 0294t OPEN-RISK)` };
}

/** spore-signing-state (0294m): TRACKED OPEN-RISK — .spore is unsigned-v0 while ML-DSA signing is deferred.
 *  The load-bearing construction that must HOLD is the reader's fail-closed reject of any signed file (no
 *  silent downgrade). ok stays true while that reject is present; RED if it is removed. */
function checkSporeSigningState(get) {
  const base = { check: "spore-signing-state", owasp: "A08:2021", cwe: "CWE-345", rd: "0294m", target: CONTAINER, tier: "OPEN-RISK", severity: "high" };
  const c = get(CONTAINER);
  if (c === null) return { ...base, ok: false, message: "cannot read container.ts — fail-closed" };
  const rejectsSigned = c.includes('"AuthError"') && c.includes("signed .spore rejected");
  return { ...base, ok: rejectsSigned,
    message: rejectsSigned
      ? "TRACKED origin-UNVERIFIED: .spore is unsigned-v0 (ML-DSA signing deferred); the reader fail-closed REJECTS any signed file (no silent downgrade). Integrity ≠ origin — do not rely on .spore for authenticity until signing lands."
      : "REGRESSED: container.ts no longer fail-closed-rejects a signed .spore — a signed file could be silently downgraded / accepted unverified (0294m)" };
}

/** fail-open-gate (RD-0290a): CI workflows carry no continue-on-error / '|| true' step-swallow (a load-bearing
 *  gate must fail closed). RED if a fail-open appears; fail-closed if a workflow is unreadable. */
function checkFailOpenGate(get, listWorkflows) {
  const base = { check: "fail-open-gate", owasp: "A05:2021", cwe: "CWE-636", rd: "RD-0290a", target: ".github/workflows/*.yml" };
  const hits = [];
  const files = listWorkflows();
  if (files.length === 0) return { ...base, tier: "OPEN-RISK", ok: false, severity: "high", message: "no workflow files found to scan — fail-closed (cannot confirm gates are present)" };
  for (const rel of files) {
    const t = get(rel);
    if (t === null) { hits.push(`${rel}: unreadable (fail-closed)`); continue; }
    if (/continue-on-error:\s*true/.test(t)) hits.push(`${rel}: continue-on-error: true`);
    if (/\|\|\s*true(\s|$)/m.test(t)) hits.push(`${rel}: '|| true' swallows a failing step`);
  }
  const ok = hits.length === 0;
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "high",
    message: ok
      ? `no fail-open across ${files.length} CI workflow(s): no continue-on-error / '|| true' step-swallow`
      : `fail-open detected: ${hits.join("; ")}` };
}

function runAll(get, listWorkflows) {
  return [checkSigVerifyPinned(get), checkSporeSigningState(get), checkFailOpenGate(get, listWorkflows)];
}

// ── self-test: prove each detector fires on a synthetic regression (a neutered detector is a fail-open) ──────
function selfTest() {
  const good = {
    [FL]: "… valid = crypto.verify(null, bytesForVerification, publicKey, sig); …",
    [HV]: "const ML_DSA_65_PUBKEY_BYTES = 1952;\nawait verifyGovernanceSignatureHybrid(env, ed, ml);",
    [CONTAINER]: 'throw new SporeError("AuthError", "signed .spore rejected: no vetted verifier"); // never writes a fake signature',
    ".github/workflows/conventions.yml": "jobs:\n  x:\n    steps:\n      - run: node scripts/audit.mjs",
  };
  const bad = {
    [FL]: "const verifier = createVerify(sig.algorithm); const valid = verifier.verify(pub, tag);", // alg-selected: regressed
    [HV]: "// hybrid verification removed in refactor",
    [CONTAINER]: "return result; // signed files now pass through unverified",
    ".github/workflows/conventions.yml": "jobs:\n  x:\n    steps:\n      - run: node scripts/audit.mjs\n        continue-on-error: true",
  };
  const from = (m) => (rel) => (rel in m ? m[rel] : null);
  const lw = () => [".github/workflows/conventions.yml"];

  const checks = [
    ["sig-verify-pinned CONFIRMED on the real construction", (() => { const r = checkSigVerifyPinned(from(good)); return r.ok && r.tier === "CONFIRMED"; })()],
    ["sig-verify-pinned RED when the Ed25519/ML-DSA pin is gone", checkSigVerifyPinned(from(bad)).ok === false],
    ["sig-verify-pinned FAIL-CLOSED on an unreadable target", checkSigVerifyPinned(() => null).ok === false],
    ["spore-signing-state ok + OPEN-RISK while the signed-reject holds", (() => { const r = checkSporeSigningState(from(good)); return r.ok && r.tier === "OPEN-RISK"; })()],
    ["spore-signing-state RED when the signed-reject is removed", checkSporeSigningState(from(bad)).ok === false],
    ["spore-signing-state FAIL-CLOSED on an unreadable target", checkSporeSigningState(() => null).ok === false],
    ["fail-open-gate CONFIRMED on a clean workflow", checkFailOpenGate(from(good), lw).ok === true],
    ["fail-open-gate RED on continue-on-error: true", checkFailOpenGate(from(bad), lw).ok === false],
    ["fail-open-gate FAIL-CLOSED when no workflows found", checkFailOpenGate(from(good), () => []).ok === false],
  ];
  let allOk = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) allOk = false; }
  if (!allOk) { console.error("  ❌ self-test FAILED — a conformance detector is neutered (fail-open)"); process.exit(1); }
  console.log("  conformance self-test: every detector fires on regression, holds on the real construction ✅");
}

const listWorkflows = () => {
  const dir = join(REPO, ".github", "workflows");
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`); } catch { return []; }
};

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

const findings = runAll(readText, listWorkflows);
const regressed = findings.filter((f) => !f.ok);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ schemaVersion: "galerina.conformance.v1", findings, ok: regressed.length === 0 }, null, 2));
} else {
  console.log("\n  by-construction conformance (RD-0296) — a check goes RED when the construction regresses:\n");
  for (const f of findings) {
    const mark = f.ok ? (f.tier === "CONFIRMED" ? "✅" : "•") : "❌";
    console.log(`  ${mark} [${f.tier}] ${f.check} (${f.cwe}, ${f.rd}) — ${f.target}`);
    console.log(`      ${f.message}`);
  }
  console.log("");
}

if (regressed.length) {
  console.error(`  ❌ conformance: ${regressed.length} construction(s) REGRESSED or unverifiable — fail-closed.\n`);
  process.exit(1);
}
console.log(`  ✅ conformance: ${findings.length} construction(s) hold (CONFIRMED where the engine is readable; tracked residuals reported).`);
