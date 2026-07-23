/**
 * Crypto-agility part 1 — the crypto-suite register reader.
 *
 * Pins that the register loads, that the THREE domains are present, and — the security
 * point — that the fail-closed predicates deny the right things: only the active suite may
 * sign, a retired/planned/unknown suite may not, and a verify-only suite keeps verifying.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SUITE_STATUSES,
  loadCryptoSuites,
  validateCryptoSuites,
  listDomains,
  getDomain,
  listSuites,
  getSuite,
  isSuiteSignable,
  isSuiteVerifiable,
  getVerifierSymbol,
  getSignerSymbol,
  securityFindings,
  openDecisions,
} from "../../governance/crypto-suites.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REG = loadCryptoSuites(ROOT);

const GOV = "governance-signature";
const AUDIT = "audit-attestation";
const BRIDGE = "bridge-manifest";

// ── structure ───────────────────────────────────────────────────────────────
test("the register loads and carries the three domain-separated families", () => {
  const domains = listDomains(REG);
  assert.deepEqual(domains.sort(), [AUDIT, BRIDGE, GOV].sort());
});

test("governance-signature carries v1, v2, v3 with the right statuses", () => {
  assert.deepEqual(listSuites(REG, GOV), ["fungi.gov.sig.v1", "fungi.gov.sig.v2", "fungi.gov.sig.v3"]);
  assert.equal(getSuite(REG, GOV, "fungi.gov.sig.v1").status, "open-decision");
  assert.equal(getSuite(REG, GOV, "fungi.gov.sig.v2").status, "active-for-signing");
  assert.equal(getSuite(REG, GOV, "fungi.gov.sig.v3").status, "planned");
});

test("the governance context is the FIPS-204 domain-separation string", () => {
  assert.equal(getDomain(REG, GOV).context, "galerina.proofgraph.governance.v2");
});

// ── the security primitive: only the active suite may SIGN (fail closed) ──────
test("only fungi.gov.sig.v2 (active) is signable; v1 (open-decision) and v3 (planned) are NOT", () => {
  assert.equal(isSuiteSignable(REG, GOV, "fungi.gov.sig.v2"), true);
  assert.equal(isSuiteSignable(REG, GOV, "fungi.gov.sig.v1"), false, "v1 is an OPEN DECISION, not signable");
  assert.equal(isSuiteSignable(REG, GOV, "fungi.gov.sig.v3"), false, "v3 is planned, not signable");
});

test("an unknown suite id or unknown domain is NOT signable — deny, never throw", () => {
  assert.equal(isSuiteSignable(REG, GOV, "fungi.gov.sig.v99"), false);
  assert.equal(isSuiteSignable(REG, "not-a-domain", "fungi.gov.sig.v2"), false);
});

// ── the iron rule: a suite with a verifier stays verifiable ───────────────────
test("v1 and v2 are verifiable (they name verifiers); v3 (no verifier) is not", () => {
  assert.equal(isSuiteVerifiable(REG, GOV, "fungi.gov.sig.v1"), true);
  assert.equal(isSuiteVerifiable(REG, GOV, "fungi.gov.sig.v2"), true);
  assert.equal(isSuiteVerifiable(REG, GOV, "fungi.gov.sig.v3"), false, "planned suite has no verifier yet");
  assert.equal(isSuiteVerifiable(REG, GOV, "fungi.gov.sig.v99"), false);
});

test("each suite binds to its real verifier / signer symbol", () => {
  assert.equal(getVerifierSymbol(REG, GOV, "fungi.gov.sig.v1"), "verifyGovernanceSignature");
  assert.equal(getVerifierSymbol(REG, GOV, "fungi.gov.sig.v2"), "verifyGovernanceSignatureHybrid");
  assert.equal(getVerifierSymbol(REG, GOV, "fungi.gov.sig.v3"), null);
  assert.equal(getSignerSymbol(REG, GOV, "fungi.gov.sig.v2"), "signProofGraphHybrid");
  assert.equal(getSignerSymbol(REG, GOV, "fungi.gov.sig.v3"), null, "planned suite names no signer");
});

// ── audit-attestation domain (its own namespace) ──────────────────────────────
test("audit-attestation Ed25519 is active+verifiable; the hybrid is planned but keeps its verifier", () => {
  assert.equal(isSuiteSignable(REG, AUDIT, "Ed25519"), true);
  assert.equal(getVerifierSymbol(REG, AUDIT, "Ed25519"), "verifyAttestation");
  assert.equal(isSuiteSignable(REG, AUDIT, "Ed25519+ML-DSA-65"), false, "hybrid attestation signer not built");
  assert.equal(isSuiteVerifiable(REG, AUDIT, "Ed25519+ML-DSA-65"), true, "verifier exists (verifyAttestationHybrid)");
});

// ── bridge-manifest domain (galerina-tower-citizen, cross-package) ────────────
test("bridge-manifest carries the classical + hybrid suites, both active and verifiable", () => {
  assert.deepEqual(listSuites(REG, BRIDGE), ["Ed25519", "Ed25519+ML-DSA-65"]);
  assert.equal(getDomain(REG, BRIDGE).context, "galerina.bridge.manifest.v2");
  assert.equal(isSuiteSignable(REG, BRIDGE, "Ed25519"), true);
  assert.equal(getSignerSymbol(REG, BRIDGE, "Ed25519"), "signManifest");
  assert.equal(getVerifierSymbol(REG, BRIDGE, "Ed25519"), "verifyAttestation");
  assert.equal(isSuiteSignable(REG, BRIDGE, "Ed25519+ML-DSA-65"), true, "hybrid is built + active here (unlike audit)");
  assert.equal(getSignerSymbol(REG, BRIDGE, "Ed25519+ML-DSA-65"), "signManifestHybrid");
  assert.equal(getVerifierSymbol(REG, BRIDGE, "Ed25519+ML-DSA-65"), "verifyAttestationHybrid");
  assert.equal(isSuiteSignable(REG, BRIDGE, "unknown"), false);
});

// ── cross-cutting invariant: an active suite must be able to sign AND verify ───
test("every active-for-signing suite names both a signer and a verifier", () => {
  for (const domainId of listDomains(REG)) {
    for (const suiteId of listSuites(REG, domainId)) {
      const s = getSuite(REG, domainId, suiteId);
      if (s.status === "active-for-signing") {
        assert.ok(getSignerSymbol(REG, domainId, suiteId), `${domainId}/${suiteId} is active but names no signer`);
        assert.ok(getVerifierSymbol(REG, domainId, suiteId), `${domainId}/${suiteId} is active but names no verifier`);
      }
    }
  }
});

// ── findings + open decisions carried for parts 2/3 and the owner ─────────────
test("the signer-downgrade fallback finding is recorded, liveness not yet checked", () => {
  const f = securityFindings(REG).find((x) => x.id === "signer-downgrade-fallback");
  assert.ok(f, "the asymmetric-downgrade finding is present");
  assert.equal(f.livenessChecked, false);
});

test("the v1-retirement open decision is parked for the owner", () => {
  const d = openDecisions(REG).find((x) => x.id === "v1-retirement");
  assert.ok(d, "v1-retirement is an open decision");
  assert.equal(d.owner, "pending");
});

// ── structural navigation fails loud on a caller bug ──────────────────────────
test("getDomain throws on an unknown domain (structural navigation, fail loud)", () => {
  assert.throws(() => getDomain(REG, "not-a-domain"), /unknown domain/);
});

// ── fail-closed validation (pure, in-memory) ──────────────────────────────────
test("an invalid suite status throws at validation (a typo must not silently deny)", () => {
  const bad = { domains: [{ id: "d", suites: [{ suiteId: "s", status: "actve-for-signing" }] }] };
  assert.throws(() => validateCryptoSuites(bad), /invalid status/);
});

test("a planned suite that names a signer throws (planned means no signer)", () => {
  const bad = { domains: [{ id: "d", suites: [{ suiteId: "s", status: "planned", signer: "signSomething" }] }] };
  assert.throws(() => validateCryptoSuites(bad), /is 'planned' but names a signer/);
});

test("a duplicate suiteId within a domain throws", () => {
  const bad = { domains: [{ id: "d", suites: [
    { suiteId: "s", status: "planned" }, { suiteId: "s", status: "planned" },
  ] }] };
  assert.throws(() => validateCryptoSuites(bad), /duplicate suiteId/);
});

test("missing domains array throws", () => {
  assert.throws(() => validateCryptoSuites({}), /missing or invalid 'domains'/);
});

test("the closed status vocabulary is exactly the four known statuses", () => {
  assert.deepEqual([...SUITE_STATUSES].sort(),
    ["active-for-signing", "open-decision", "planned", "verify-only-retired"]);
});
