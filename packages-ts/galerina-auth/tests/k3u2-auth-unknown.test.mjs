// K3U2 (K3-UNKNOWN-NOT-ZERO): galerina-auth factors. "No positive evidence" is the typed UNKNOWN
// sentinel (Verdict.UNKNOWN === tower-citizen K3_UNKNOWN), NEVER the trit 0; a computed 0 is NEUTRAL.
// Synthetic inputs only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Verdict, scopeVerdict, bearerTokenVerdict, headerPresenceVerdict, channelIdentityVerdict, composeAuthVerdict, previewAdmission } from "../dist/index.js";

const NOW = 1_000_000;
const cert = (over = {}) => ({ pinnedDigests: ["sha256:abc"], presentedDigest: "sha256:abc", chainOutcome: "valid",
  notBefore: NOW - 1000, notAfter: NOW + 1000, now: NOW, revocation: "good", revocationProducedAt: NOW - 100,
  revocationFreshnessMs: 300_000, ...over });
const isUnknown = (v, why) => {
  assert.equal(v, Verdict.UNKNOWN, why);
  assert.notEqual(v, 0, why + " must never be the trit 0");
  assert.ok(Number.isNaN(Number(v)), why + " must be non-numeric");
};

test("K3U2-AUTH-1: every no-evidence factor is the typed UNKNOWN, never 0", () => {
  isUnknown(scopeVerdict([], ["x"]), "empty required scopes");
  isUnknown(bearerTokenVerdict({}, { algorithms: ["ES256"] }), "absent bearer token");
  isUnknown(bearerTokenVerdict({ authorization: "Basic abc" }, { algorithms: ["ES256"] }), "non-Bearer scheme");
  isUnknown(headerPresenceVerdict({ authorization: "synthetic" }), "header presence (default posture)");
  isUnknown(headerPresenceVerdict({}, { allowHeaderPresenceFallback: true }), "legacy opt-in, header absent");
  isUnknown(channelIdentityVerdict(cert({ revocation: "unknown" })), "revocation unknown");
  isUnknown(composeAuthVerdict([]), "empty composition");
});

test("K3U2-AUTH-2: composition keeps NEUTRAL 0 and UNKNOWN apart", () => {
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.NEUTRAL]), 0);
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.ALLOW]), Verdict.ALLOW);
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.DENY, Verdict.NEUTRAL]), Verdict.DENY);
  isUnknown(composeAuthVerdict([Verdict.ALLOW, Verdict.UNKNOWN]), "ALLOW ∧ UNKNOWN");
  isUnknown(composeAuthVerdict([Verdict.ALLOW, Verdict.DENY, Verdict.UNKNOWN]), "DENY ∧ UNKNOWN (infectious vAnd)");
});

test("K3U2-AUTH-3: only ALLOW is authorized; UNKNOWN refusal is audited", () => {
  const seen = [];
  const u = previewAdmission(Verdict.UNKNOWN, (d) => seen.push(d));
  assert.equal(u.authorized, false);
  assert.equal(u.diagnostic?.code, "FUNGI-GOV-3VL-001");
  assert.equal(seen.length, 1);
  assert.equal(previewAdmission(Verdict.NEUTRAL).authorized, false);
  assert.equal(previewAdmission(Verdict.DENY).authorized, false);
  assert.equal(previewAdmission(Verdict.ALLOW).authorized, true);
});

test("K3U2-AUTH-4: the deprecated INDETERMINATE name is the same UNKNOWN sentinel, not 0", () => {
  assert.equal(Verdict.INDETERMINATE, Verdict.UNKNOWN);
  assert.equal(Verdict.NEUTRAL, 0);
});
