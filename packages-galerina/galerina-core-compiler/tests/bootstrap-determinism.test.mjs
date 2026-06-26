// =============================================================================
// Bootstrap Determinism Test Suite
//
// Proves that the Galerina compiler produces stable, deterministic output when
// given the same input — the foundation of `galerina verify-selfhost`.
//
// Phase 16A: canonicalHash() implemented.
// This suite exercises all canonical hashing entry-points and the verify-selfhost
// concept end-to-end.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalHash,
  hashSource,
  hashGIR,
  buildAttestation,
  buildExecutionPlan,
  buildSemanticGraph,
  EFFECT_REGISTRY,
  parseProgram,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Test 1 — Key order independence
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: key order independence", () => {
  it("canonicalHash({a:1, b:2}) === canonicalHash({b:2, a:1})", () => {
    const h1 = canonicalHash({ a: 1, b: 2 });
    const h2 = canonicalHash({ b: 2, a: 1 });
    assert.equal(h1, h2, "Key order must not affect the hash");
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Idempotent hash of same object
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: idempotent hash", () => {
  it("canonicalHash of same object twice → identical strings", () => {
    const obj = { compiler: "galerina", phase: 16, stable: true };
    const h1 = canonicalHash(obj);
    const h2 = canonicalHash(obj);
    assert.equal(h1, h2, "Hashing the same object twice must produce the same string");
  });
});

// ---------------------------------------------------------------------------
// Test 3 — hashSource idempotence
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: hashSource idempotence", () => {
  it("hashSource('same source text') called twice → identical", () => {
    const source = "same source text";
    const h1 = hashSource(source);
    const h2 = hashSource(source);
    assert.equal(h1, h2, "hashSource must be deterministic");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — EFFECT_REGISTRY hash stability
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: EFFECT_REGISTRY hash stability", () => {
  it("EFFECT_REGISTRY hashed twice → identical strings (stable canonical artifact)", () => {
    const h1 = canonicalHash(EFFECT_REGISTRY);
    const h2 = canonicalHash(EFFECT_REGISTRY);
    assert.equal(h1, h2, "EFFECT_REGISTRY must hash deterministically");
  });
});

// ---------------------------------------------------------------------------
// Test 5 — hashGIR idempotence
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: hashGIR idempotence", () => {
  it("hashGIR of a minimal GIR object twice → identical", () => {
    const gir = {
      schemaVersion: "lln.gir.v1",
      generatedAt: "2024-01-01T00:00:00.000Z",
      flows: [{ name: "greet", qualifier: "pure", effects: { declared: [], observed: [], status: "compliant" } }],
    };
    const h1 = hashGIR(gir);
    const h2 = hashGIR(gir);
    assert.equal(h1, h2, "hashGIR must be idempotent");
  });
});

// ---------------------------------------------------------------------------
// Test 6 — canonicalHash strips timestamps
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: timestamp stripping", () => {
  it("{value:1, generatedAt:'any'} and {value:1, generatedAt:'other'} → same hash", () => {
    const h1 = canonicalHash({ value: 1, generatedAt: "2024-01-01T00:00:00.000Z" });
    const h2 = canonicalHash({ value: 1, generatedAt: "2099-12-31T23:59:59.999Z" });
    assert.equal(h1, h2, "ISO timestamps must be normalised to TIMESTAMP so different dates hash the same");
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Different objects → different hashes
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: different inputs produce different hashes", () => {
  it("canonicalHash of different objects → different strings", () => {
    const h1 = canonicalHash({ compiler: "galerina", version: 1 });
    const h2 = canonicalHash({ compiler: "galerina", version: 2 });
    assert.notEqual(h1, h2, "Distinct objects must produce distinct hashes");
  });
});

// ---------------------------------------------------------------------------
// Test 8 — All hashes start with "sha256:"
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: sha256: prefix on all hash functions", () => {
  it("all hash functions return strings starting with 'sha256:'", () => {
    const gir = { schemaVersion: "lln.gir.v1", flows: [] };

    assert.ok(canonicalHash({ x: 1 }).startsWith("sha256:"), "canonicalHash must start with sha256:");
    assert.ok(hashSource("source").startsWith("sha256:"), "hashSource must start with sha256:");
    assert.ok(hashGIR(gir).startsWith("sha256:"), "hashGIR must start with sha256:");
  });
});

// ---------------------------------------------------------------------------
// Test 9 — buildAttestation hashes.source stability
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: buildAttestation source hash stability", () => {
  it("buildAttestation({flowName:'f', sourceText:'x'}) twice → same hashes.source", async () => {
    const inputs = { flowName: "f", sourceText: "x" };
    const att1 = await buildAttestation(inputs);
    const att2 = await buildAttestation(inputs);
    assert.equal(
      att1.hashes.source,
      att2.hashes.source,
      "buildAttestation must produce deterministic hashes.source for the same sourceText",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10 — PassiveExecutionPlan planHash stability
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: PassiveExecutionPlan planHash stability", () => {
  it("buildExecutionPlan called twice on same FlowMeta → same planHash", () => {
    const source = `
pure flow hashMe(x: Int) -> Int {
  return x
}
`;
    const parsed = parseProgram(source, "hashme.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const meta = parsed.flows.find((f) => f.name === "hashMe");
    assert.ok(meta !== undefined, "Flow 'hashMe' must be found");

    const plan1 = buildExecutionPlan(parsed.ast, meta);
    const plan2 = buildExecutionPlan(parsed.ast, meta);

    assert.equal(
      plan1.planHash,
      plan2.planHash,
      "buildExecutionPlan must produce the same planHash on repeated calls with the same input",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 11 — SemanticGraph stability
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: SemanticGraph stability", () => {
  it("buildSemanticGraph on same AST twice → same nodes.length and edges.length", () => {
    const source = `
pure flow stableGraph(a: String, b: Int) -> String {
  return a
}
`;
    const parsed = parseProgram(source, "stable.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Parse errors: ${errors.map((e) => e.message).join(", ")}`);

    const graph1 = buildSemanticGraph(parsed.ast, parsed.flows);
    const graph2 = buildSemanticGraph(parsed.ast, parsed.flows);

    assert.equal(
      graph1.nodes.length,
      graph2.nodes.length,
      "nodes.length must be stable across repeated buildSemanticGraph calls",
    );
    assert.equal(
      graph1.edges.length,
      graph2.edges.length,
      "edges.length must be stable across repeated buildSemanticGraph calls",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 12 — Verify-selfhost concept: EFFECT_REGISTRY["database.find"] determinism
// ---------------------------------------------------------------------------

describe("bootstrap-determinism: verify-selfhost concept", () => {
  it("EFFECT_REGISTRY['database.find'] hash1 === hash2 → determinism confirmed", () => {
    const entry = EFFECT_REGISTRY["database.find"];
    assert.ok(entry !== undefined, "EFFECT_REGISTRY must contain 'database.find'");

    const hash1 = canonicalHash(entry);
    const hash2 = canonicalHash(entry);

    assert.equal(hash1, hash2, "verify-selfhost: EFFECT_REGISTRY['database.find'] must hash deterministically");
    assert.ok(hash1.startsWith("sha256:"), "Hash must carry sha256: prefix");
  });
});
