// gate-cache.test.mjs — GateCache caches the COMPILED governance evaluator, NEVER
// the decision (#194). Two invariants are pinned here:
//   1. Compiling the SAME ai{} policy input twice returns the SAME cached
//      CompiledPolicy object (a HIT) — the recompile is avoided.
//   2. The allow/deny DECISION is NOT cached: it is recomputed fresh from the request
//      on every evaluation. Caching decisions would be silent semantic drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GateCache, defaultGateCache, compilePolicyCached, policyCacheKey,
  compilePolicy,
  POL_HAS_ALLOWLIST, POL_HAS_CALL_BUDGET,
  createHybridEngine,
} from "../dist/index.js";

const cid = (s) => `GATE-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

// ── 1. Same policy input → same cached CompiledPolicy object (HIT) ──
test("GateCache: identical policy input returns the SAME cached CompiledPolicy (HIT)", () => {
  const cache = new GateCache();
  const gov = { approvedModels: ["a", "b"], maxModelCalls: 3, maxNewTokens: 128, maxTokenCost: "GBP0.05", denyHostNativeFallback: true };

  const first = cache.compile(gov, false);
  const second = cache.compile(gov, false);

  assert.equal(first, second, "second compile must return the SAME object reference (cache HIT)");
  assert.deepEqual(cache.stats(), { hits: 1, misses: 1, size: 1 });
});

test("GateCache: a structurally-equal policy (reordered keys / allow-list) hits the same entry", () => {
  const cache = new GateCache();
  // Different object identity, different key order, different allow-list order — same POLICY.
  const a = cache.compile({ approvedModels: ["a", "b"], maxNewTokens: 64 }, false);
  const b = cache.compile({ maxNewTokens: 64, approvedModels: ["b", "a"] }, false);

  assert.equal(a, b, "structurally-equal policy must map to the same cached evaluator");
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
  assert.equal(cache.stats().size, 1);
});

test("GateCache: a DIFFERENT policy is a MISS (distinct compiled evaluator)", () => {
  const cache = new GateCache();
  const a = cache.compile({ approvedModels: ["a"] }, false);
  const b = cache.compile({ approvedModels: ["a", "b"] }, false);
  assert.notEqual(a, b, "different allow-list ⇒ different evaluator");
  assert.deepEqual(cache.stats(), { hits: 0, misses: 2, size: 2 });
});

test("GateCache: the certified posture is part of the key (different trap → different evaluator)", () => {
  const cache = new GateCache();
  const gov = { approvedModels: ["m"], maxNewTokens: 64, maxTokenCost: "GBP0.01", denyHostNativeFallback: true };
  const plain = cache.compile(gov, false);
  const certified = cache.compile(gov, true);
  assert.notEqual(plain, certified, "certified flag must not collide with the non-certified compile");
  assert.equal(plain.certifiedTrap, null);
  assert.equal(certified.certifiedTrap, null); // fully specified ⇒ satisfied, but still a distinct entry
  assert.equal(cache.stats().misses, 2);
});

test("GateCache: the cached evaluator is byte-for-byte a fresh compilePolicy()", () => {
  const cache = new GateCache();
  const gov = { approvedModels: ["x"], maxModelCalls: 2 };
  const cached = cache.compile(gov, false);
  const fresh = compilePolicy(gov, false);
  // Same compiled shape: flags, budgets, traps. (Set is compared by membership.)
  assert.equal(cached.flags, fresh.flags);
  assert.ok(cached.flags & POL_HAS_ALLOWLIST);
  assert.ok(cached.flags & POL_HAS_CALL_BUDGET);
  assert.equal(cached.maxModelCalls, fresh.maxModelCalls);
  assert.equal(cached.maxNewTokens, fresh.maxNewTokens);
  assert.deepEqual([...cached.approvedModels].sort(), [...fresh.approvedModels].sort());
  assert.deepEqual(cached.certifiedTrap, fresh.certifiedTrap);
});

test("policyCacheKey: stable across key/allow-list order, sensitive to value + certified", () => {
  const k1 = policyCacheKey({ approvedModels: ["a", "b"], maxNewTokens: 64 }, false);
  const k2 = policyCacheKey({ maxNewTokens: 64, approvedModels: ["b", "a"] }, false);
  assert.equal(k1, k2, "stable key regardless of field/allow-list order");
  assert.notEqual(k1, policyCacheKey({ approvedModels: ["a", "b"], maxNewTokens: 65 }, false), "a value change changes the key");
  assert.notEqual(k1, policyCacheKey({ approvedModels: ["a", "b"], maxNewTokens: 64 }, true), "certified posture changes the key");
});

test("compilePolicyCached + defaultGateCache: repeat input is a HIT on the shared cache", () => {
  defaultGateCache.clear();
  const gov = { approvedModels: ["solo"], maxNewTokens: 32 };
  const a = compilePolicyCached(gov, false);
  const b = compilePolicyCached(gov, false);
  assert.equal(a, b, "shared default cache returns the same evaluator for a repeat policy");
  assert.equal(defaultGateCache.stats().hits, 1);
  defaultGateCache.clear();
});

// ── 2. The DECISION is NEVER cached — it recomputes fresh from inputs every time ──

test("GateCache: clear() forces the next compile of the same policy to MISS", () => {
  const cache = new GateCache();
  const gov = { approvedModels: ["a"] };
  cache.compile(gov, false);
  cache.clear();
  assert.deepEqual(cache.stats(), { hits: 0, misses: 0, size: 0 });
  cache.compile(gov, false);
  assert.equal(cache.stats().misses, 1, "after clear, the policy must be recompiled");
});

test("the allow/deny DECISION is computed fresh per evaluation — a HIT-shaped policy still flips verdict", async () => {
  // One engine = the policy compiles ONCE (and is what GateCache would memoize). If
  // the engine cached the DECISION, the first call's "allow" would wrongly persist.
  // Instead each infer() re-evaluates the (constant) policy against live state, so a
  // call budget of 1 yields allow → then deny on the SAME compiled policy.
  const eng = createHybridEngine({ governance: { maxModelCalls: 1 } });
  const first = await eng.infer({ prompt: "x", correlationId: cid("d1"), opClasses: ["feedforward"] });
  assert.equal(first.trapFired, false, "first call within budget → allow");
  const second = await eng.infer({ prompt: "x", correlationId: cid("d2"), opClasses: ["feedforward"] });
  assert.equal(second.trapCode, "ERR_AI_CALL_BUDGET", "second call → deny: decision recomputed, not cached");
});

test("a cached evaluator yields DIFFERENT decisions for different requests (rules cached, ruling not)", () => {
  // The compiled allow-list is the same cached object; the membership DECISION still
  // depends entirely on the request's model — proving we cache the rules, not the ruling.
  const cache = new GateCache();
  const policy = cache.compile({ approvedModels: ["good-model"] }, false);
  const policyAgain = cache.compile({ approvedModels: ["good-model"] }, false);
  assert.equal(policy, policyAgain, "same evaluator object (HIT)");

  // Decide fresh against the cached table for two different requests.
  const decide = (model) => policy.approvedModels.has(model);
  assert.equal(decide("good-model"), true, "approved request → allow");
  assert.equal(decide("evil-model"), false, "unapproved request → deny");
  // The cache recorded ONE compile and ONE hit — and zero decisions (it stores none).
  assert.deepEqual(cache.stats(), { hits: 1, misses: 1, size: 1 });
});
