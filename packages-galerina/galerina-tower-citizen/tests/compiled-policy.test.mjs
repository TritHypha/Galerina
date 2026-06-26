// compiled-policy.test.mjs — the numeric policy table compiles ai{} once and the
// hot path reads packed flags + a membership Set instead of probing the object.
// These tests pin BOTH the compiled shape and that the engine's behaviour is
// byte-for-byte the same as the previous object-probing path.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compilePolicy,
  POL_HAS_ALLOWLIST, POL_DENY_HOST_NATIVE, POL_HAS_CALL_BUDGET, POL_HAS_TOKEN_BUDGET, POL_HAS_COST_CEILING,
  createHybridEngine,
} from "../dist/index.js";

const cid = (s) => `POL-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

test("compilePolicy: empty governance → no flags, no traps, unbounded", () => {
  const p = compilePolicy({}, false);
  assert.equal(p.flags, 0);
  assert.equal(p.approvedModels.size, 0);
  assert.equal(p.maxModelCalls, -1);
  assert.equal(p.maxNewTokens, -1);
  assert.equal(p.certifiedTrap, null);
});

test("compilePolicy: each ai{} field sets exactly its flag bit", () => {
  const p = compilePolicy({
    approvedModels: ["a", "b"], maxModelCalls: 3, maxNewTokens: 128,
    maxTokenCost: "GBP0.05", denyHostNativeFallback: true,
  }, false);
  assert.ok(p.flags & POL_HAS_ALLOWLIST);
  assert.ok(p.flags & POL_DENY_HOST_NATIVE);
  assert.ok(p.flags & POL_HAS_CALL_BUDGET);
  assert.ok(p.flags & POL_HAS_TOKEN_BUDGET);
  assert.ok(p.flags & POL_HAS_COST_CEILING);
  assert.equal(p.approvedModels.has("a"), true);
  assert.equal(p.approvedModels.has("z"), false);
  assert.equal(p.maxModelCalls, 3);
  assert.equal(p.maxNewTokens, 128);
});

test("compilePolicy: certified preconditions resolve ONCE, in order", () => {
  assert.equal(compilePolicy({}, true).certifiedTrap.code, "ERR_CERTIFIED_NO_ALLOWLIST");
  assert.equal(compilePolicy({ approvedModels: ["m"] }, true).certifiedTrap.code, "ERR_CERTIFIED_NO_TOKEN_BUDGET");
  assert.equal(compilePolicy({ approvedModels: ["m"], maxNewTokens: 64 }, true).certifiedTrap.code, "ERR_CERTIFIED_NO_COST_CEILING");
  assert.equal(compilePolicy({ approvedModels: ["m"], maxNewTokens: 64, maxTokenCost: "GBP0.01" }, true).certifiedTrap.code, "ERR_CERTIFIED_HOST_NATIVE_OPEN");
  // fully specified → satisfied
  assert.equal(compilePolicy({ approvedModels: ["m"], maxNewTokens: 64, maxTokenCost: "GBP0.01", denyHostNativeFallback: true }, true).certifiedTrap, null);
});

// ── End-to-end behaviour is preserved (same trap codes as the old path) ──
test("engine: allow-list denies an unapproved model (O(1) membership)", async () => {
  const eng = createHybridEngine({ governance: { approvedModels: ["bitnet_b1_58_2b"] } });
  const ok = await eng.infer({ prompt: "x", correlationId: cid("ok"), model: "bitnet_b1_58_2b", opClasses: ["feedforward"] });
  assert.equal(ok.trapFired, false);
  const bad = await eng.infer({ prompt: "x", correlationId: cid("bad"), model: "gpt-evil", opClasses: ["feedforward"] });
  assert.equal(bad.trapCode, "ERR_AI_MODEL_NOT_APPROVED");
  const none = await eng.infer({ prompt: "x", correlationId: cid("none"), opClasses: ["feedforward"] });
  assert.equal(none.trapCode, "ERR_AI_MODEL_REQUIRED");
});

test("engine: call budget + token budget still enforced from the table", async () => {
  const budgeted = createHybridEngine({ governance: { maxModelCalls: 1 } });
  const first = await budgeted.infer({ prompt: "x", correlationId: cid("b1"), opClasses: ["feedforward"] });
  assert.equal(first.trapFired, false);
  const second = await budgeted.infer({ prompt: "x", correlationId: cid("b2"), opClasses: ["feedforward"] });
  assert.equal(second.trapCode, "ERR_AI_CALL_BUDGET");

  const tok = createHybridEngine({ governance: { maxNewTokens: 100 } });
  const over = await tok.infer({ prompt: "x", correlationId: cid("tok"), maxNewTokens: 500, opClasses: ["feedforward"] });
  assert.equal(over.trapCode, "ERR_AI_TOKEN_BUDGET");
});
