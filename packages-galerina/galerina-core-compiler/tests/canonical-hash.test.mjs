// =============================================================================
// Phase 16A — Canonical Hashing — Tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalHash,
  stripNonDeterministic,
  hashSource,
  hashGIR,
  hashPassivePlan,
  EFFECT_REGISTRY,
  buildExecutionPlan,
  parseProgram,
  executePlan,
  createCapabilityHost,
  createContractEnforcer,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// canonicalHash — basic properties
// ---------------------------------------------------------------------------

describe("canonicalHash — basic properties", () => {
  it("same object produces same hash", () => {
    const obj = { a: 1, b: "hello", c: [3, 1, 2] };
    const h1 = canonicalHash(obj);
    const h2 = canonicalHash(obj);
    assert.equal(h1, h2);
  });

  it("different objects produce different hashes", () => {
    const h1 = canonicalHash({ a: 1 });
    const h2 = canonicalHash({ a: 2 });
    assert.notEqual(h1, h2);
  });

  it("hash starts with 'sha256:'", () => {
    const h = canonicalHash({ x: 42 });
    assert.ok(h.startsWith("sha256:"), `Expected sha256: prefix, got: ${h}`);
  });

  it("hash is 64 hex chars after prefix", () => {
    const h = canonicalHash({ x: 42 });
    const hex = h.slice("sha256:".length);
    assert.equal(hex.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hex), `Not hex: ${hex}`);
  });

  it("object key order does not affect hash", () => {
    const h1 = canonicalHash({ a: 1, b: 2, c: 3 });
    const h2 = canonicalHash({ c: 3, a: 1, b: 2 });
    const h3 = canonicalHash({ b: 2, c: 3, a: 1 });
    assert.equal(h1, h2);
    assert.equal(h2, h3);
  });

  it("nested object key order does not affect hash", () => {
    const h1 = canonicalHash({ outer: { x: 1, y: 2 }, z: 3 });
    const h2 = canonicalHash({ z: 3, outer: { y: 2, x: 1 } });
    assert.equal(h1, h2);
  });

  it("timestamps in strings are normalized to TIMESTAMP", () => {
    const hWithTs = canonicalHash({ generatedAt: "2024-01-15T12:00:00.000Z" });
    const hNormalized = canonicalHash({ generatedAt: "2099-12-31T23:59:59.999Z" });
    // Both ISO dates → "TIMESTAMP" so they hash the same
    assert.equal(hWithTs, hNormalized);
  });

  it("a timestamp-containing object hashes the same regardless of date", () => {
    const obj1 = { name: "test", ts: "2020-05-01T00:00:00Z" };
    const obj2 = { name: "test", ts: "2030-11-15T08:30:00Z" };
    assert.equal(canonicalHash(obj1), canonicalHash(obj2));
  });

  // #55 / SPORE-FLOAT-NAN-001: a non-finite number must FAIL CLOSED, not be laundered to null. The old
  // null-normalization made {x: Infinity}, {x: NaN} and {x: null} collide to ONE signed fingerprint — a
  // wrong-but-plausible value signed into the proof-graph. Now it throws (matching manifest-generator / RFC 8785).
  it("Infinity FAILS CLOSED (not laundered to null — would collide with null/NaN in a signed fingerprint)", () => {
    assert.throws(() => canonicalHash({ x: Infinity }), /non-finite/);
  });

  it("NaN FAILS CLOSED (not laundered to null)", () => {
    assert.throws(() => canonicalHash({ x: NaN }), /non-finite/);
  });

  it("primitive arrays are sorted for stability", () => {
    const h1 = canonicalHash({ items: ["c", "a", "b"] });
    const h2 = canonicalHash({ items: ["a", "b", "c"] });
    assert.equal(h1, h2);
  });

  it("mixed arrays (containing objects) preserve order", () => {
    // Arrays with object elements are NOT sorted — order matters
    const h1 = canonicalHash([{ step: "a" }, { step: "b" }]);
    const h2 = canonicalHash([{ step: "b" }, { step: "a" }]);
    assert.notEqual(h1, h2);
  });

  it("null and undefined both become null in canonical form", () => {
    const h1 = canonicalHash(null);
    const h2 = canonicalHash(undefined);
    assert.equal(h1, h2);
  });
});

// ---------------------------------------------------------------------------
// stripNonDeterministic
// ---------------------------------------------------------------------------

describe("stripNonDeterministic", () => {
  it("replaces known timestamp keys with REDACTED_TIMESTAMP", () => {
    const obj = {
      name: "test",
      generatedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01",
      updatedAt: "2024-02-01",
    };
    const stripped = stripNonDeterministic(obj);
    assert.equal(stripped.generatedAt, "REDACTED_TIMESTAMP");
    assert.equal(stripped.createdAt, "REDACTED_TIMESTAMP");
    assert.equal(stripped.updatedAt, "REDACTED_TIMESTAMP");
    assert.equal(stripped.name, "test");
  });

  it("strips timestamp keys in nested objects", () => {
    const obj = { outer: { timestamp: "2024-01-01", value: 42 } };
    const stripped = stripNonDeterministic(obj);
    assert.equal(stripped.outer.timestamp, "REDACTED_TIMESTAMP");
    assert.equal(stripped.outer.value, 42);
  });

  it("strips timestamp keys in arrays", () => {
    const arr = [{ date: "2024-01-01", x: 1 }, { date: "2024-02-01", x: 2 }];
    const stripped = stripNonDeterministic(arr);
    assert.equal(stripped[0].date, "REDACTED_TIMESTAMP");
    assert.equal(stripped[1].date, "REDACTED_TIMESTAMP");
    assert.equal(stripped[0].x, 1);
  });

  it("leaves non-timestamp keys untouched", () => {
    const obj = { name: "hello", count: 42, tags: ["a", "b"] };
    const stripped = stripNonDeterministic(obj);
    assert.deepEqual(stripped, obj);
  });

  it("passes through primitives unchanged", () => {
    assert.equal(stripNonDeterministic(42), 42);
    assert.equal(stripNonDeterministic("hello"), "hello");
    assert.equal(stripNonDeterministic(true), true);
    assert.equal(stripNonDeterministic(null), null);
  });
});

// ---------------------------------------------------------------------------
// hashSource
// ---------------------------------------------------------------------------

describe("hashSource", () => {
  it("same string → same hash", () => {
    const s = "pure flow foo() -> String { return \"bar\" }";
    assert.equal(hashSource(s), hashSource(s));
  });

  it("different strings → different hashes", () => {
    assert.notEqual(hashSource("hello"), hashSource("world"));
  });

  it("hash starts with sha256:", () => {
    assert.ok(hashSource("test").startsWith("sha256:"));
  });

  it("empty string hashes deterministically", () => {
    const h1 = hashSource("");
    const h2 = hashSource("");
    assert.equal(h1, h2);
  });

  it("does NOT normalize timestamps in source text", () => {
    // hashSource is raw — no normalization
    const h1 = hashSource("generatedAt: 2024-01-01T00:00:00Z");
    const h2 = hashSource("generatedAt: 2099-12-31T23:59:59Z");
    // Different strings → different hashes (no normalization applied)
    assert.notEqual(h1, h2);
  });
});

// ---------------------------------------------------------------------------
// hashGIR
// ---------------------------------------------------------------------------

describe("hashGIR", () => {
  it("same GIR object → same hash", () => {
    const gir = { schemaVersion: "v1", flows: [{ name: "foo", effects: [] }] };
    assert.equal(hashGIR(gir), hashGIR(gir));
  });

  it("GIR with different generatedAt → same hash (stripped)", () => {
    const gir1 = { name: "test", generatedAt: "2024-01-01T00:00:00Z", flows: [] };
    const gir2 = { name: "test", generatedAt: "2099-12-31T23:59:59Z", flows: [] };
    assert.equal(hashGIR(gir1), hashGIR(gir2));
  });

  it("different GIR content → different hashes", () => {
    const gir1 = { flows: [{ name: "foo" }] };
    const gir2 = { flows: [{ name: "bar" }] };
    assert.notEqual(hashGIR(gir1), hashGIR(gir2));
  });
});

// ---------------------------------------------------------------------------
// hashPassivePlan
// ---------------------------------------------------------------------------

describe("hashPassivePlan", () => {
  it("same plan → same hash", () => {
    const plan = {
      flow: "test",
      qualifier: "pure",
      steps: [{ kind: "return", value: "Int" }],
      approvedCapabilities: {},
      planHash: "sha256:abc123",
      generatedAt: "2024-01-01T00:00:00Z",
    };
    assert.equal(hashPassivePlan(plan), hashPassivePlan(plan));
  });

  it("plan with different generatedAt → same hash (stripped)", () => {
    const plan1 = { flow: "f", qualifier: "pure", steps: [], approvedCapabilities: {}, planHash: "sha256:x", generatedAt: "2024-01-01T00:00:00Z" };
    const plan2 = { flow: "f", qualifier: "pure", steps: [], approvedCapabilities: {}, planHash: "sha256:x", generatedAt: "2099-12-31T23:59:59Z" };
    assert.equal(hashPassivePlan(plan1), hashPassivePlan(plan2));
  });

  it("different plans → different hashes", () => {
    const plan1 = { flow: "foo", qualifier: "pure", steps: [], planHash: "sha256:a" };
    const plan2 = { flow: "bar", qualifier: "pure", steps: [], planHash: "sha256:b" };
    assert.notEqual(hashPassivePlan(plan1), hashPassivePlan(plan2));
  });
});

// ---------------------------------------------------------------------------
// verify-selfhost concept: EFFECT_REGISTRY hash twice → same
// ---------------------------------------------------------------------------

describe("verify-selfhost concept", () => {
  it("EFFECT_REGISTRY hash is stable across two calls", () => {
    const h1 = canonicalHash(EFFECT_REGISTRY);
    const h2 = canonicalHash(EFFECT_REGISTRY);
    assert.equal(h1, h2, "EFFECT_REGISTRY must hash deterministically");
    assert.ok(h1.startsWith("sha256:"));
  });

  it("EFFECT_REGISTRY hash is not empty", () => {
    const h = canonicalHash(EFFECT_REGISTRY);
    assert.notEqual(h, "sha256:");
    assert.equal(h.length, "sha256:".length + 64);
  });

  it("selfhost simulation: three artifacts hash stably twice", () => {
    function computeArtifacts() {
      const registryHash = canonicalHash(EFFECT_REGISTRY);
      const sourceHash = hashSource("pure flow verifySample(x: Int) -> Int { return x }");
      const plan = {
        flow: "verifySample",
        qualifier: "pure",
        steps: [{ kind: "return", value: "Int" }],
        approvedCapabilities: {},
        planHash: sourceHash,
      };
      return canonicalHash({ registryHash, sourceHash, planHash: canonicalHash(plan) });
    }

    const run1 = computeArtifacts();
    const run2 = computeArtifacts();
    assert.equal(run1, run2, "Self-host simulation: both runs must produce the same hash");
    assert.ok(run1.startsWith("sha256:"));
  });
});

// ---------------------------------------------------------------------------
// executePlan for pure flow — returns without throwing
// ---------------------------------------------------------------------------

describe("executePlan for pure flow", () => {
  it("executePlan on a pure flow returns without throwing", async () => {
    const source = `
pure flow calculateVat(price: Money) -> Money {
  return price
}
`;
    const parsed = parseProgram(source, "test.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const meta = parsed.flows.find((f) => f.name === "calculateVat");
    assert.ok(meta !== undefined, "Flow 'calculateVat' not found");

    const plan = buildExecutionPlan(parsed.ast, meta);
    assert.equal(plan.qualifier, "pure");

    // Build a permissive capability host (no declared effects for pure flow)
    const enforcer = createContractEnforcer(undefined, "calculateVat", {});
    const host = createCapabilityHost({ declaredEffects: new Set(), enforcer });

    const ctx = {
      flowName: "calculateVat",
      startedAt: Date.now(),
    };

    let threw = false;
    let result;
    try {
      result = await executePlan(plan, host, ctx);
    } catch (err) {
      threw = true;
    }

    assert.equal(threw, false, "executePlan should not throw for a pure flow");
    assert.ok(result !== undefined);
    assert.equal(typeof result.value, "string");
    assert.ok(Array.isArray(result.auditTrail));
    assert.ok(Array.isArray(result.warnings));
  });

  it("executePlan returns a value and an audit trail", async () => {
    const source = `
pure flow add(a: Int, b: Int) -> Int {
  return a
}
`;
    const parsed = parseProgram(source, "test.spore");
    const meta = parsed.flows.find((f) => f.name === "add");
    assert.ok(meta !== undefined);

    const plan = buildExecutionPlan(parsed.ast, meta);
    const enforcer = createContractEnforcer(undefined, "add", {});
    const host = createCapabilityHost({ declaredEffects: new Set(), enforcer });
    const ctx = { flowName: "add", startedAt: Date.now() };

    const result = await executePlan(plan, host, ctx);
    assert.ok(result !== undefined);
    assert.ok(result.auditTrail !== undefined);
  });

  it("executePlan emitSemanticGraph option produces a hash in RuntimeResult", async () => {
    // This tests Task 2: semanticGraphHash wired into RuntimeResult
    const { run } = await import("../dist/index.js");
    const result = await run(
      `pure flow greet() -> String { return "hello" }`,
      "test.spore",
      "greet",
      new Map(),
      { emitSemanticGraph: true },
    );
    assert.ok(result.semanticGraphHash !== undefined, "semanticGraphHash should be set when emitSemanticGraph is true");
    assert.ok(result.semanticGraphHash.startsWith("sha256:"), `Expected sha256: prefix, got: ${result.semanticGraphHash}`);
  });

  it("semanticGraphHash is stable across two identical runs", async () => {
    const { run } = await import("../dist/index.js");
    const source = `pure flow greet() -> String { return "hello" }`;
    const r1 = await run(source, "test.spore", "greet", new Map(), { emitSemanticGraph: true });
    const r2 = await run(source, "test.spore", "greet", new Map(), { emitSemanticGraph: true });
    assert.equal(r1.semanticGraphHash, r2.semanticGraphHash, "semanticGraphHash must be deterministic");
  });
});
