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
const BA = "packages-galerina/galerina-tower-citizen/src/bridge-attestation.ts";
const HE = "packages-galerina/galerina-tower-citizen/src/hybrid-engine.ts";
const KEMDEM = "packages-galerina/galerina-ext-spore/src/kemdem.ts";

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

/** spore-signing-state (0294m + 0294o/F10): TRACKED OPEN-RISK — .spore is unsigned-v0 while ML-DSA signing
 *  is deferred, AND (owner decision 2026-07-09) the F10 file-identity AAD fold is COUPLED to that same
 *  ceremony (one v1 bump: signed root + file_id in AAD), so the cross-file splice residual rides this check
 *  until v1 lands. The load-bearing construction that must HOLD is the reader's fail-closed reject of any
 *  signed file (no silent downgrade). ok stays true while that reject is present; RED if it is removed. */
function checkSporeSigningState(get) {
  const base = { check: "spore-signing-state", owasp: "A08:2021", cwe: "CWE-345", rd: "0294m", target: CONTAINER, tier: "OPEN-RISK", severity: "high" };
  const c = get(CONTAINER);
  if (c === null) return { ...base, ok: false, message: "cannot read container.ts — fail-closed" };
  const rejectsSigned = c.includes('"AuthError"') && c.includes("signed .spore rejected");
  return { ...base, ok: rejectsSigned,
    message: rejectsSigned
      ? "TRACKED origin-UNVERIFIED: .spore is unsigned-v0 (ML-DSA signing deferred); the reader fail-closed REJECTS any signed file (no silent downgrade). Integrity ≠ origin — do not rely on .spore for authenticity until signing lands. ALSO RIDING THIS MILESTONE (owner 2026-07-09): F10/RD-0294o — no file-identity in the AEAD AAD yet, so a v0 file is NOT cross-file-splice-resistant; the file_id AAD fold lands in the same v1 bump as signing."
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

/** bridge-attestation-failclosed (DP-RD-0285b / M3-M4 of the MCP tool-poisoning pass, docs/security/
 *  mcp-tool-poisoning-pass-2026-07-09.md): the SHIPPED signed-manifest admission surface (bridges + plugins —
 *  the exact pattern the future MCP adapter must reuse) stays fail-closed. Ed25519 is algorithm-PINNED
 *  (edVerify(null,…), not read from the artifact); the hybrid verifier refuses a stripped PQ half; the ML-DSA
 *  half is FIPS-204 domain-separated; and the admission gate denies `requireHybrid` without an ML-DSA key
 *  (no silent downgrade). RED if any of these constructions is removed — a poisoned/rug-pulled/downgraded
 *  manifest could then be admitted. */
function checkBridgeAttestationFailClosed(get) {
  const base = { check: "bridge-attestation-failclosed", owasp: "A08:2021", cwe: "CWE-347", rd: "DP-RD-0285b", target: BA + " + hybrid-engine.ts" };
  const ba = get(BA), he = get(HE);
  if (ba === null || he === null) return { ...base, tier: "OPEN-RISK", ok: false, severity: "critical", message: "cannot read bridge-attestation.ts / hybrid-engine.ts — fail-closed (cannot confirm the attestation admission stays fail-closed)" };
  const nBA = ba.replace(/\s+/g, " "), nHE = he.replace(/\s+/g, " ");
  const edPinned = nBA.includes("edVerify( null,");                                   // pure Ed25519 — primitive not selected from the artifact
  const hybridBothSigs = ba.includes("ML-DSA signature required but absent");         // hybrid verifier refuses a stripped PQ half (no downgrade)
  const domainSep = ba.includes("galerina.bridge.manifest.v2");                       // FIPS-204 cross-surface confusion guard
  const noDowngradeGate = nHE.includes("requireHybrid === true && mlDsaPublicKey === undefined"); // admission gate denies before routing
  const ok = edPinned && hybridBothSigs && domainSep && noDowngradeGate;
  const missing = [!edPinned && "Ed25519 edVerify(null,…) pin", !hybridBothSigs && "hybrid stripped-PQ-half reject", !domainSep && "FIPS-204 domain-sep context", !noDowngradeGate && "requireHybrid no-downgrade gate"].filter(Boolean);
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "critical",
    message: ok
      ? "signed-manifest admission stays fail-closed: Ed25519 algorithm-pinned (edVerify(null,…)), hybrid requires BOTH signatures, FIPS-204 domain-separated, and the gate denies requireHybrid without an ML-DSA key (no PQ downgrade) — the shipped DP-RD-0285b pattern (bridges/plugins) cannot silently regress"
      : `attestation admission REGRESSED — missing: ${missing.join(", ")} (a poisoned / rug-pulled / downgraded manifest could be admitted — DP-RD-0285b M3/M4)` };
}

/** spore-nonce-freshness (F8 / CWE-323): AEAD nonces are FRESH-random per seal — randomBytes(12) for a
 *  single-shot section, a fresh randomBytes(8) prefix for a STREAM (each frame's 12-B nonce then position+
 *  last-flag derived via streamNonce12) — over a fresh per-section KEM key, so no (key,nonce) pair is ever
 *  reused (catastrophic for AES-GCM). RED if the fresh-nonce derivation is gone. */
function checkSporeNonceFreshness(get) {
  const base = { check: "spore-nonce-freshness", owasp: "A02:2021", cwe: "CWE-323", rd: "0294-F8", target: KEMDEM };
  const k = get(KEMDEM);
  if (k === null) return { ...base, tier: "OPEN-RISK", ok: false, severity: "high", message: "cannot read kemdem.ts — fail-closed (cannot confirm nonce freshness)" };
  const singleShot = k.includes("randomBytes(12)"), streamPrefix = k.includes("randomBytes(8)"), posDerived = k.includes("streamNonce12(");
  const ok = singleShot && streamPrefix && posDerived;
  const missing = [!singleShot && "randomBytes(12) single-shot nonce", !streamPrefix && "randomBytes(8) stream prefix", !posDerived && "streamNonce12 position-derived nonce"].filter(Boolean);
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "high",
    message: ok
      ? "AEAD nonces are fresh per seal: randomBytes(12) single-shot + a fresh randomBytes(8) STREAM prefix with position+last-flag streamNonce12 frames, over a fresh per-section KEM key — no (key,nonce) reuse"
      : `REGRESSED — fresh-nonce derivation missing: ${missing.join(", ")} (a fixed/derived nonce risks AES-GCM (key,nonce) reuse — F8/CWE-323)` };
}

/** spore-suite-pinning (F9 / CWE-757): the DEM is PINNED to AES-256-GCM — requireAesGcm throws on any other
 *  aead_suite and runs on the AAD-bound suite byte (aeadContext[27]) at the top of every seal/open/stream, so
 *  an attacker-chosen suite cannot downgrade the primitive (the suite is also bound into the committed AAD).
 *  RED if the pin is removed. */
function checkSporeSuitePinning(get) {
  const base = { check: "spore-suite-pinning", owasp: "A02:2021", cwe: "CWE-757", rd: "0294-F9", target: KEMDEM };
  const k = get(KEMDEM);
  if (k === null) return { ...base, tier: "OPEN-RISK", ok: false, severity: "high", message: "cannot read kemdem.ts — fail-closed (cannot confirm suite pinning)" };
  const pin = k.includes("aeadSuite !== AEAD_SUITE.AES_256_GCM"), invoked = k.includes("requireAesGcm(aeadContext[27]");
  const ok = pin && invoked;
  const missing = [!pin && "requireAesGcm AES-256-GCM pin", !invoked && "requireAesGcm(aeadContext[27]) invocation"].filter(Boolean);
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "high",
    message: ok
      ? "the DEM is pinned to AES-256-GCM: requireAesGcm throws on any other aead_suite and runs on the AAD-bound suite byte [27] at the top of seal/open/stream — no silent suite downgrade"
      : `REGRESSED — AES-256-GCM suite pin missing: ${missing.join(", ")} (an attacker-chosen aead_suite could downgrade the primitive — F9/CWE-757)` };
}

/** spore-key-commitment (F11 / CWE-354): the DEM is a COMMITTING AEAD — key_commit (SHAKE256, spore-dem-
 *  commit-v0) folded into the committed AAD, and the §8.5 CTX Chan-Rogaway tag (spore-cmt-ctx-v0) recomputed
 *  and CONSTANT-TIME compared (bytesEqual) BEFORE the AEAD open, so one ciphertext cannot bind to two
 *  keys/plaintexts (CMT-4 partitioning-resistance). RED if the committing construction is removed. */
function checkSporeKeyCommitment(get) {
  const base = { check: "spore-key-commitment", owasp: "A02:2021", cwe: "CWE-354", rd: "0294-F11", target: KEMDEM };
  const k = get(KEMDEM);
  if (k === null) return { ...base, tier: "OPEN-RISK", ok: false, severity: "high", message: "cannot read kemdem.ts — fail-closed (cannot confirm key-commitment)" };
  const keyCommitDom = k.includes("spore-dem-commit-v0"), ctxDom = k.includes("spore-cmt-ctx-v0");
  const committedAadFolded = k.includes("committedAad("), verifyBeforeOpen = k.includes("bytesEqual(ctxCommitTag(");
  const ok = keyCommitDom && ctxDom && committedAadFolded && verifyBeforeOpen;
  const missing = [!keyCommitDom && "key_commit domain (spore-dem-commit-v0)", !ctxDom && "CTX domain (spore-cmt-ctx-v0)", !committedAadFolded && "committedAad fold", !verifyBeforeOpen && "constant-time ctxCommitTag verify-before-open"].filter(Boolean);
  return { ...base, tier: ok ? "CONFIRMED" : "OPEN-RISK", ok, severity: "high",
    message: ok
      ? "committing AEAD (CMT-4) holds: key_commit (spore-dem-commit-v0) folded into the committed AAD + the §8.5 CTX tag (spore-cmt-ctx-v0) recomputed and constant-time compared (bytesEqual) BEFORE open — a ciphertext cannot open under two keys (partitioning-resistant)"
      : `REGRESSED — key-commitment missing: ${missing.join(", ")} (without CMT-4 committing, one ciphertext could open under two keys — partitioning oracle, F11/CWE-354)` };
}

function runAll(get, listWorkflows) {
  return [checkSigVerifyPinned(get), checkSporeSigningState(get), checkFailOpenGate(get, listWorkflows), checkBridgeAttestationFailClosed(get),
    checkSporeNonceFreshness(get), checkSporeSuitePinning(get), checkSporeKeyCommitment(get)];
}

// ── self-test: prove each detector fires on a synthetic regression (a neutered detector is a fail-open) ──────
function selfTest() {
  const good = {
    [FL]: "… valid = crypto.verify(null, bytesForVerification, publicKey, sig); …",
    [HV]: "const ML_DSA_65_PUBKEY_BYTES = 1952;\nawait verifyGovernanceSignatureHybrid(env, ed, ml);",
    [CONTAINER]: 'throw new SporeError("AuthError", "signed .spore rejected: no vetted verifier"); // never writes a fake signature',
    [BA]: 'const ok = edVerify(\n  null,\n  msg, pub, sig);\nreturn { ok: false, reason: "ML-DSA signature required but absent (hybrid)" };\nconst CTX = enc("galerina.bridge.manifest.v2");',
    [HE]: "if (policy.requireHybrid === true && mlDsaPublicKey === undefined) { return deny; }",
    [KEMDEM]: 'const nonce = new Uint8Array(randomBytes(12));\nconst prefix8 = new Uint8Array(randomBytes(8));\nconst n = streamNonce12(prefix8, i, i === segments.length - 1);\nif (aeadSuite !== AEAD_SUITE.AES_256_GCM) throw x;\nrequireAesGcm(aeadContext[27]!);\nenc.encode("spore-dem-commit-v0"); enc.encode("spore-cmt-ctx-v0");\nconst caad = committedAad(aeadContext, kaead);\nif (!bytesEqual(ctxCommitTag(kaead, nonce, caad, T), received)) throw y;',
    ".github/workflows/conventions.yml": "jobs:\n  x:\n    steps:\n      - run: node scripts/audit.mjs",
  };
  const bad = {
    [FL]: "const verifier = createVerify(sig.algorithm); const valid = verifier.verify(pub, tag);", // alg-selected: regressed
    [HV]: "// hybrid verification removed in refactor",
    [CONTAINER]: "return result; // signed files now pass through unverified",
    [BA]: "const ok = edVerify(sig.algorithm, msg, pub, sig); // alg read from artifact — pin regressed, no hybrid guard",
    [HE]: "const result = verifyAttestation(bridge.attestation, policy); // requireHybrid gate dropped — silent downgrade",
    [KEMDEM]: "const nonce = deriveNonce(sectionId); gcm(kaead, nonce, aeadContext).encrypt(payload); // fixed nonce, no suite pin, no committing tag",
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
    ["bridge-attestation-failclosed CONFIRMED on the real constructions", (() => { const r = checkBridgeAttestationFailClosed(from(good)); return r.ok && r.tier === "CONFIRMED"; })()],
    ["bridge-attestation-failclosed RED when the Ed25519 pin / no-downgrade gate is gone", checkBridgeAttestationFailClosed(from(bad)).ok === false],
    ["bridge-attestation-failclosed FAIL-CLOSED on an unreadable target", checkBridgeAttestationFailClosed(() => null).ok === false],
    ["spore-nonce-freshness CONFIRMED on the real construction", (() => { const r = checkSporeNonceFreshness(from(good)); return r.ok && r.tier === "CONFIRMED"; })()],
    ["spore-nonce-freshness RED when fresh-nonce derivation is gone", checkSporeNonceFreshness(from(bad)).ok === false],
    ["spore-nonce-freshness FAIL-CLOSED on an unreadable target", checkSporeNonceFreshness(() => null).ok === false],
    ["spore-suite-pinning CONFIRMED on the real construction", (() => { const r = checkSporeSuitePinning(from(good)); return r.ok && r.tier === "CONFIRMED"; })()],
    ["spore-suite-pinning RED when the AES-256-GCM pin is gone", checkSporeSuitePinning(from(bad)).ok === false],
    ["spore-suite-pinning FAIL-CLOSED on an unreadable target", checkSporeSuitePinning(() => null).ok === false],
    ["spore-key-commitment CONFIRMED on the real construction", (() => { const r = checkSporeKeyCommitment(from(good)); return r.ok && r.tier === "CONFIRMED"; })()],
    ["spore-key-commitment RED when the committing tag is gone", checkSporeKeyCommitment(from(bad)).ok === false],
    ["spore-key-commitment FAIL-CLOSED on an unreadable target", checkSporeKeyCommitment(() => null).ok === false],
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
