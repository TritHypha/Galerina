import { test } from "node:test";
import assert from "node:assert/strict";
import { redactCliOutput, redactCliOutputChecked, SPORE_CLI_REDACT_001 } from "../dist/security.js";
import { formatCliResult } from "../dist/output.js";

test("assignment forms are scrubbed and the prefix is preserved", () => {
  const out = redactCliOutput("api_key=abc123 token=xyz password=hunter2");
  assert.match(out, /api_key=SecureString\(redacted\)/);
  assert.match(out, /token=SecureString\(redacted\)/);
  assert.match(out, /password=SecureString\(redacted\)/);
  assert.doesNotMatch(out, /abc123|xyz|hunter2/);
});

test("bearer and cookie headers are scrubbed", () => {
  const out = redactCliOutput("Authorization: bearer eyabc.def-ghi\ncookie: session=deadbeef");
  assert.doesNotMatch(out, /eyabc\.def-ghi/);
  assert.doesNotMatch(out, /deadbeef/);
});

test("FAIL-OPEN CLOSED: bare AWS access-key id is redacted even with no key= prefix", () => {
  const r = redactCliOutputChecked("deploy used AKIAIOSFODNN7EXAMPLE in the log");
  assert.doesNotMatch(r.text, /AKIAIOSFODNN7EXAMPLE/);
  assert.equal(r.tripwire, true);
  assert.ok(r.markers.includes("aws-access-key-id"));
});

test("FAIL-OPEN CLOSED: bare GitHub PAT is redacted", () => {
  const tok = "ghp_" + "A".repeat(36);
  const r = redactCliOutputChecked(`token leaked: ${tok}`);
  assert.doesNotMatch(r.text, new RegExp(tok));
  assert.equal(r.tripwire, true);
  assert.ok(r.markers.includes("vcs-pat"));
});

test("FAIL-OPEN CLOSED: bare PEM private-key block is redacted whole", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBg\nkqhkiG9w0\n-----END PRIVATE KEY-----";
  const r = redactCliOutputChecked(`here is the key:\n${pem}\nend`);
  assert.doesNotMatch(r.text, /MIIBVAIBADANBg/);
  assert.equal(r.tripwire, true);
  assert.ok(r.markers.includes("pem-private-key"));
});

test("FAIL-OPEN CLOSED: bare JWT is redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4";
  const r = redactCliOutputChecked(`session ${jwt} active`);
  assert.doesNotMatch(r.text, /SflKxwRJSMeKKF2QT4/);
  assert.equal(r.tripwire, true);
  assert.ok(r.markers.includes("jwt"));
});

test("benign output does not trip the wire and is unchanged", () => {
  const r = redactCliOutputChecked("compiled 3 flows, 0 diagnostics; wrote graph.json");
  assert.equal(r.tripwire, false);
  assert.equal(r.redactions, 0);
  assert.equal(r.text, "compiled 3 flows, 0 diagnostics; wrote graph.json");
});

test("formatCliResult surfaces SPORE-CLI-REDACT-001 when a bare token is caught", () => {
  const out = formatCliResult({ message: "ran job", details: ["used AKIAIOSFODNN7EXAMPLE"], code: 0 });
  assert.match(out, new RegExp(SPORE_CLI_REDACT_001));
  assert.doesNotMatch(out, /AKIAIOSFODNN7EXAMPLE/);
});

test("formatCliResult stays quiet (no tripwire banner) for clean output", () => {
  const out = formatCliResult({ message: "ok", details: ["2 routes"], code: 0 });
  assert.doesNotMatch(out, new RegExp(SPORE_CLI_REDACT_001));
  assert.match(out, /ok/);
});
