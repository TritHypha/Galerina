// =============================================================================
// Faithful real-AST regression tests for the runtime policy parsers.
//
// These parse REAL .spore source — the AST shape the parser actually emits — and assert
// that parseLimitConfig / parseTimeoutConfig / parseRetryPolicy extract the DECLARED
// values rather than silently falling back to defaults.
//
// Regression guard for BUG A (2026-06-26): findContractSection() in all three policy
// parsers matched the bare section name ("limits"), but the parser emits "limits:block",
// and each decl child carries a "decl:" prefix (e.g. "decl:max request size 5 MB").
// So parse*Config returned defaults for EVERY real corpus contract — every declared
// limit, timeout (a DoS/deadline guard) and retry was silently dropped. Fail-open:
// CWE-770/400 (Unrestricted Resource Consumption), OWASP API4:2023, NIST 800-53 SC-5.
//
// The pre-existing unit tests passed only because they hand-built a synthetic node with
// value "limits" + bare decls — a shape the parser never produces. These tests use the
// real parser so the masking can never recur.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";
import { parseLimitConfig } from "../dist/runtime/limitPolicy.js";
import { parseTimeoutConfig } from "../dist/runtime/timeoutPolicy.js";
import { parseRetryPolicy } from "../dist/runtime/retryPolicy.js";

function contractOf(source) {
  const { ast } = parseProgram(source, "policy.spore");
  let found;
  (function walk(n) {
    if (!n || found) return;
    if (n.kind === "contractDecl") { found = n; return; }
    for (const c of n.children ?? []) walk(c);
  })(ast);
  return found;
}

describe("runtime policy parsers — real parsed AST (BUG A regression)", () => {
  it("parseLimitConfig extracts limits from a real limits:block", () => {
    const c = contractOf(`secure flow f(readonly request: Request) -> Result<Response, ApiError>
contract { intent { "x" } effects { database.read }
  limits { max request size 5 MB
max batch size 100 } }
{ return Ok(Response.ok({})) }`);
    const cfg = parseLimitConfig(c);
    assert.equal(cfg.maxRequestSizeBytes, 5 * 1024 * 1024, "5 MB request-size limit must parse");
    assert.equal(cfg.maxBatchSize, 100, "batch-size limit must parse");
  });

  it("parseTimeoutConfig extracts the deadline from a real timeouts:block", () => {
    const c = contractOf(`secure flow f(readonly request: Request) -> Result<Response, ApiError>
contract { intent { "x" } effects { database.read }
  timeouts { deadline 500 ms } }
{ return Ok(Response.ok({})) }`);
    const cfg = parseTimeoutConfig(c);
    assert.equal(cfg.deadlineMs, 500, "deadline must parse (DoS guard)");
    assert.equal(cfg.cancelOnDeadline, true, "a parsed deadline must arm cancellation");
  });

  it("parseRetryPolicy extracts a per-effect policy from a real retries:block", () => {
    const c = contractOf(`secure flow f(readonly request: Request) -> Result<Response, ApiError>
contract { intent { "x" } effects { database.read }
  retries { database.read attempts 3 strategy exponential_backoff } }
{ return Ok(Response.ok({})) }`);
    const pol = parseRetryPolicy(c).policies.get("database.read");
    assert.ok(pol, "expected a retry policy keyed by the dotted effect name");
    assert.equal(pol.maxAttempts, 3);
    assert.equal(pol.strategy, "exponential_backoff");
  });

  it("returns defaults (no throw) when the policy block is absent", () => {
    const c = contractOf(`pure flow add(a: Int, b: Int) -> Int { return a + b }`);
    assert.deepEqual(parseLimitConfig(c), {});
    assert.equal(parseTimeoutConfig(c).deadlineMs, undefined);
    assert.equal(parseRetryPolicy(c).policies.size, 0);
  });
});
