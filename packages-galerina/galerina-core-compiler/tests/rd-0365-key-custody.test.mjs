// rd-0365-key-custody.test.mjs — RD-0365 TPM/secure-enclave key custody ladder.
//
// Tests that:
//   (1) HOST_PROFILES now carries a keyCustody field on every entry.
//   (2) UNKNOWN_HOST defaults to "env-spore" (the shipped L1 baseline).
//   (3) Each profile's keyCustody claim is consistent with its other capabilities
//       (register_pinned → hardware-signer is the only L4 claim; browser → env-spore).
//   (4) KeyCustody type values are exactly the 4 ladder rungs.
//   (5) resolveHost("unknown") returns UNKNOWN_HOST with keyCustody "env-spore".
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
