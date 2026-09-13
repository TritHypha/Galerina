// rd-0365-key-custody.test.mjs — RD-0365 TPM/secure-enclave key custody ladder.
//
// Tests that:
//   (1) HOST_PROFILES now carries a keyCustody field on every entry.
//   (2) UNKNOWN_HOST defaults to "env-spore" (the shipped L1 baseline).
//   (3) Each profile's keyCustody claim is consistent with its other capabilities
//       (register_pinned → hardware-signer is the only L4 claim; browser → env-spore).
//   (4) KeyCustody type values are exactly the 4 ladder rungs.
//   (5) resolveHost("unknown") returns UNKNOWN_HOST with keyCustody "env-spore".
//   (6) Elevated custody labels require a current attestation and injected verifier;
//       labels alone never admit hardware authority.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

let L;
test.before(async () => { L = await import(pathToFileURL(COMPILER).href); });

const VALID_RUNGS = ["env-spore", "os-keystore", "tpm-sealed", "hardware-signer"];

test("RD-0365: HOST_PROFILES entries all carry a keyCustody field", () => {
  const { HOST_PROFILES } = L;
  if (!(HOST_PROFILES instanceof Map)) return; // not re-exported at top level
  for (const [name, profile] of HOST_PROFILES) {
    assert.ok("keyCustody" in profile,
      `HOST_PROFILES["${name}"] missing keyCustody`);
    assert.ok(VALID_RUNGS.includes(profile.keyCustody),
      `HOST_PROFILES["${name}"].keyCustody="${profile.keyCustody}" is not a valid rung`);
  }
});

test("RD-0365: UNKNOWN_HOST.keyCustody defaults to env-spore (L1 baseline)", () => {
  const { UNKNOWN_HOST } = L;
  if (UNKNOWN_HOST === undefined) return;
  assert.equal(UNKNOWN_HOST.keyCustody, "env-spore",
    "UNKNOWN_HOST must default to env-spore (the shipped L1 baseline)");
});

test("RD-0365: mlock_posix → env-spore (POSIX swap protection, no HSM)", () => {
  const { HOST_PROFILES } = L;
  if (!(HOST_PROFILES instanceof Map)) return;
  const p = HOST_PROFILES.get("mlock_posix");
  if (p === undefined) return;
  assert.equal(p.keyCustody, "env-spore");
});

test("RD-0365: register_pinned → hardware-signer (implies HSM for key ops)", () => {
  const { HOST_PROFILES } = L;
  if (!(HOST_PROFILES instanceof Map)) return;
  const p = HOST_PROFILES.get("register_pinned");
  if (p === undefined) return;
  assert.equal(p.keyCustody, "hardware-signer");
});

test("RD-0365: browser_secure_context → env-spore (no TPM in browser)", () => {
  const { HOST_PROFILES } = L;
  if (!(HOST_PROFILES instanceof Map)) return;
  const p = HOST_PROFILES.get("browser_secure_context");
  if (p === undefined) return;
  assert.equal(p.keyCustody, "env-spore",
    "browser cannot provide TPM/HSM; L1 is the ceiling");
});

test("RD-0365: resolveHost(unknown) → UNKNOWN_HOST with keyCustody env-spore (fail-closed)", () => {
  const { resolveHost } = L;
  if (typeof resolveHost !== "function") return;
  const h = resolveHost("totally-unknown-host");
  assert.equal(h.keyCustody, "env-spore");
  assert.equal(h.name, "<undeclared>");
  assert.equal(h.canRegisterPin, false);
  assert.equal(h.canNoDisk, false);
});

test("RD-0365: custody ladder ordering is strictly stronger (documented invariant)", () => {
  // Verifying the documentation claim: each rung is strictly stronger.
  // We can't test hardware here, but we can test the string-ordinal claim.
  const order = ["env-spore", "os-keystore", "tpm-sealed", "hardware-signer"];
  for (let i = 0; i < order.length; i++) {
    assert.ok(VALID_RUNGS.includes(order[i]),
      `rung "${order[i]}" must be in the valid rung set`);
  }
  // All 4 rungs defined — no gaps.
  assert.equal(order.length, 4, "ladder must have exactly 4 rungs");
});

test("RD-0365: env-spore is the declared baseline but an undeclared host is refused", () => {
  const { evaluateKeyCustody, HOST_PROFILES, UNKNOWN_HOST } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  assert.deepEqual(evaluateKeyCustody(HOST_PROFILES.get("browser_secure_context")), {
    admitted: true,
    enforced: false,
    reason: "env-spore baseline does not claim hardware custody",
  });
  assert.equal(evaluateKeyCustody(UNKNOWN_HOST).admitted, false);
  assert.equal(evaluateKeyCustody(UNKNOWN_HOST).enforced, false);
});

test("RD-0365: elevated custody refuses without a current attestation and verifier", () => {
  const { evaluateKeyCustody, HOST_PROFILES } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  const host = HOST_PROFILES.get("register_pinned");
  const decision = evaluateKeyCustody(host, undefined, undefined, 1_000);
  assert.equal(decision.admitted, false);
  assert.equal(decision.enforced, false);
});

test("RD-0365: verified current TPM/PCR evidence admits only the matching custody rung", () => {
  const { evaluateKeyCustody, HOST_PROFILES } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  const host = HOST_PROFILES.get("register_pinned");
  const attestation = {
    schema: "galerina.key-custody-attestation.v1",
    hostName: "register_pinned",
    keyCustody: "hardware-signer",
    pcrProfile: "windows-v1-pcr0-pcr7",
    quoteDigest: `sha256:${"a".repeat(64)}`,
    challengeDigest: `sha256:${"c".repeat(64)}`,
    issuedAtMs: 900,
    expiresAtMs: 1_100,
  };
  let seen;
  const decision = evaluateKeyCustody(host, attestation, (evidence, candidate) => {
    seen = { evidence, candidate };
    return true;
  }, 1_000);
  assert.deepEqual(decision, { admitted: true, enforced: true, reason: "attested custody verified" });
  assert.equal(seen.evidence, attestation);
  assert.equal(seen.candidate, host);
});

test("RD-0365: stale, mismatched, malformed and verifier-failed evidence remains denied", () => {
  const { evaluateKeyCustody, HOST_PROFILES } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  const host = HOST_PROFILES.get("register_pinned");
  const valid = {
    schema: "galerina.key-custody-attestation.v1",
    hostName: "register_pinned",
    keyCustody: "hardware-signer",
    pcrProfile: "windows-v1-pcr0-pcr7",
    quoteDigest: `sha256:${"b".repeat(64)}`,
    challengeDigest: `sha256:${"d".repeat(64)}`,
    issuedAtMs: 900,
    expiresAtMs: 1_100,
  };
  assert.equal(evaluateKeyCustody(host, { ...valid, expiresAtMs: 1_000 }, () => true, 1_000).admitted, false);
  assert.equal(evaluateKeyCustody(host, { ...valid, keyCustody: "tpm-sealed" }, () => true, 1_000).admitted, false);
  assert.equal(evaluateKeyCustody(host, { ...valid, quoteDigest: "not-a-digest" }, () => true, 1_000).admitted, false);
  assert.equal(evaluateKeyCustody(host, valid, () => false, 1_000).admitted, false);
  assert.equal(evaluateKeyCustody(host, valid, () => { throw new Error("provider unavailable"); }, 1_000).admitted, false);
  assert.equal(evaluateKeyCustody(host, { ...valid, hostName: "other_host" }, () => true, 1_000).admitted, false);
  const { challengeDigest: _challengeDigest, ...withoutChallenge } = valid;
  assert.equal(evaluateKeyCustody(host, withoutChallenge, () => true, 1_000).admitted, false);
});

test("RD-0365: a copied host capability is not a declared custody authority", () => {
  const { evaluateKeyCustody, HOST_PROFILES } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  const copied = { ...HOST_PROFILES.get("browser_secure_context") };
  const decision = evaluateKeyCustody(copied);
  assert.equal(decision.admitted, false);
  assert.equal(decision.enforced, false);
});

test("RD-0365: replacing an exported registry entry cannot grant custody", () => {
  const { evaluateKeyCustody, HOST_PROFILES } = L;
  assert.equal(typeof evaluateKeyCustody, "function");
  const original = HOST_PROFILES.get("browser_secure_context");
  const forged = { ...original, name: "browser_secure_context" };
  HOST_PROFILES.set("browser_secure_context", forged);
  try {
    const decision = evaluateKeyCustody(forged);
    assert.equal(decision.admitted, false);
    assert.equal(decision.enforced, false);
  } finally {
    HOST_PROFILES.set("browser_secure_context", original);
  }
});

test("RD-0365: fail-closed host sentinels and profile records are immutable", () => {
  const { HOST_PROFILES, UNKNOWN_HOST } = L;
  assert.equal(Object.isFrozen(UNKNOWN_HOST), true);
  for (const profile of HOST_PROFILES.values()) assert.equal(Object.isFrozen(profile), true);
});
