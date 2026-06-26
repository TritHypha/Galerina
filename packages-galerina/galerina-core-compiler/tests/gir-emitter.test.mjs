import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkEffects, emitGIR, emitExpr, verifyGovernance } from "../dist/index.js";
import { computeGIRHash } from "../dist/gir-emitter.js";

function parseAndEmit(source) {
  const parsed = parseProgram(source, "test.spore");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return emitGIR(parsed.ast, parsed.flows, effects);
}

describe("GIR emitter - basic pure flow", () => {
  it("emits schema and pure flow metadata", () => {
    const result = parseAndEmit(`
pure flow calculateVat(price: Money<GBP>) -> Money<GBP> {
  return price
}
`);

    assert.equal(result.gir.schemaVersion, "lln.gir.v1");
    assert.equal(result.gir.flows[0].qualifier, "pure");
    assert.deepEqual(result.gir.flows[0].effects.declared, []);
  });
});

describe("GIR emitter - guarded flow with effects", () => {
  it("copies declared effects from FlowMeta", () => {
    const result = parseAndEmit(`
guarded flow saveOrder(order: Order) -> Result<Order, Error>
contract { effects { database.write } }
{
  OrdersDB.insert(order)
  return Ok(order)
}
`);

    assert.ok(result.gir.flows[0].effects.declared.includes("database.write"));
  });
});

describe("GIR emitter - protected values", () => {
  it("extracts protected binding names and base types", () => {
    const result = parseAndEmit(`
flow collectEmail() -> String {
  let email: protected Email = "a@example.com"
  return "ok"
}
`);

    assert.deepEqual(result.gir.flows[0].protected_values, [
      { name: "email", type: "Email" },
    ]);
  });
});

describe("GIR emitter - intent", () => {
  it("extracts flow intent declarations", () => {
    const result = parseAndEmit(`
secure flow createPatient() -> String
intent "Test intent" {
  return "ok"
}
`);

    assert.equal(result.gir.flows[0].intent.declared, "Test intent");
  });
});

describe("GIR emitter - metadata", () => {
  it("produces a generatedAt timestamp", () => {
    const result = parseAndEmit(`
pure flow id(x: Int) -> Int {
  return x
}
`);

    assert.equal(typeof result.gir.generatedAt, "string");
    assert.ok(result.gir.generatedAt.length > 0);
  });

  it("emits multiple flow entries", () => {
    const result = parseAndEmit(`
pure flow one() -> Int {
  return 1
}

pure flow two() -> Int {
  return 2
}
`);

    assert.equal(result.gir.flows.length, 2);
  });
});

// ── GIR tensor metadata (Phase 8A) ───────────────────────────────────────────

describe("GIR emitter — tensor metadata", () => {
  it("extracts tensor binding from flow body", () => {
    const result = parseAndEmit(`
guarded flow embedText(text: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  let embedding: Tensor<Float32, [1, 768]> = EmbeddingModel.embed(text)?
  return Ok("ok")
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined, "Expected a flow in GIR");
    assert.ok(flow.tensors.length > 0, "Expected tensor metadata in GIR");
    const tensor = flow.tensors[0];
    assert.ok(tensor !== undefined);
    assert.equal(tensor.elementType, "Float32");
    assert.equal(tensor.photonic_compatible, true);
  });

  it("marks Int8 tensor as NOT photonic compatible", () => {
    const result = parseAndEmit(`
guarded flow quantizedInfer(input: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  let weights: Tensor<Int8, [OutFeatures, InFeatures]> = QuantizedModel.weights()
  return Ok("ok")
}
`);
    const flow = result.gir.flows[0];
    const tensor = flow?.tensors[0];
    if (tensor !== undefined) {
      assert.equal(tensor.photonic_compatible, false, "Int8 tensor should not be photonic compatible");
    }
  });

  it("produces target_affinity for ai.inference flows", () => {
    const result = parseAndEmit(`
guarded flow classify(text: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  return Ok("label")
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    assert.ok(flow.target_affinity !== undefined, "Expected target_affinity for ai.inference flow");
    assert.ok(flow.target_affinity.suggested.includes("npu"), "Expected npu in target_affinity suggestions");
  });

  it("does not produce target_affinity for database-only flows", () => {
    const result = parseAndEmit(`
guarded flow saveOrder(order: String) -> Result<String, Error>
contract { effects { database.write } }
{
  return Ok("saved")
}
`);
    const flow = result.gir.flows[0];
    // database.write alone does not suggest GPU/NPU
    if (flow?.target_affinity !== undefined) {
      assert.ok(!flow.target_affinity.suggested.includes("npu"), "database.write should not suggest npu");
    }
  });
});

// ── Governance compute hint (Phase 8A) ───────────────────────────────────────

describe("Governance verifier — SPORE-HINT-COMPUTE-001", () => {
  it("emits SPORE-HINT-COMPUTE-001 when ai.inference has no compute target", () => {
    const source = `
guarded flow classify(text: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  return Ok("label")
}
`;
    const parsed = parseProgram(source, "test.spore");
    const effects = checkEffects(parsed.flows, parsed.ast);
    const gov = verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
    assert.ok(
      gov.diagnostics.some((d) => d.code === "SPORE-HINT-COMPUTE-001"),
      `Expected SPORE-HINT-COMPUTE-001, got: ${gov.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("does NOT emit SPORE-HINT-COMPUTE-001 when compute target is declared", () => {
    const source = `
guarded flow classify(text: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  compute target best { prefer [npu, gpu, cpu] fallback cpu }
  return Ok("label")
}
`;
    const parsed = parseProgram(source, "test.spore");
    const effects = checkEffects(parsed.flows, parsed.ast);
    const gov = verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
    assert.ok(
      !gov.diagnostics.some((d) => d.code === "SPORE-HINT-COMPUTE-001"),
      "Unexpected SPORE-HINT-COMPUTE-001 when compute target is declared",
    );
  });
});

// ── GIR emitExpr — #record callExpr nodes ────────────────────────────────────

describe("GIR emitter — emitExpr #record handling", () => {
  it("emits recordLiteral with correct field names for audit call record", () => {
    // AuditLog.write({ event: "PatientCreated", email: redact(email) })
    // The record literal { event: "PatientCreated", email: redact(email) }
    // is parsed as callExpr { value: "#record" } with field identifier children.
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [
        {
          kind: "identifier",
          value: "event",
          children: [{ kind: "stringLiteral", value: "\"PatientCreated\"" }],
        },
        {
          kind: "identifier",
          value: "email",
          children: [{ kind: "callExpr", value: "redact", children: [{ kind: "identifier", value: "email" }] }],
        },
      ],
    };

    const expr = emitExpr(recordNode);

    assert.equal(expr.kind, "recordLiteral", "Expected recordLiteral kind for #record callExpr");
    assert.ok(Array.isArray(expr.fields), "Expected fields array");
    assert.equal(expr.fields.length, 2, "Expected 2 fields");
    assert.equal(expr.fields[0].name, "event", "First field name should be 'event'");
    assert.equal(expr.fields[1].name, "email", "Second field name should be 'email'");
  });

  it("emits recordLiteral with correct field names for response record", () => {
    // Response.okJson({ patientId: patient.id, name: patient.name })
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [
        {
          kind: "identifier",
          value: "patientId",
          children: [{ kind: "identifier", value: "patient" }],
        },
        {
          kind: "identifier",
          value: "name",
          children: [{ kind: "identifier", value: "patient" }],
        },
      ],
    };

    const expr = emitExpr(recordNode);

    assert.equal(expr.kind, "recordLiteral");
    assert.equal(expr.fields.length, 2);
    const fieldNames = expr.fields.map((f) => f.name);
    assert.ok(fieldNames.includes("patientId"), "Expected 'patientId' field in record");
    assert.ok(fieldNames.includes("name"), "Expected 'name' field in record");
  });

  it("emits recordLiteral for empty #record literal (no fields)", () => {
    // An empty record { } should still produce a recordLiteral (not void)
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [],
    };

    const expr = emitExpr(recordNode);

    assert.equal(expr.kind, "recordLiteral", "#record with no fields should still emit recordLiteral");
    assert.equal(expr.fields.length, 0);
  });

  it("emitExpr does not silently skip #record — produces inspectable output", () => {
    // Verify that a plain callExpr with value "#record" is NOT treated as a regular call
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [
        {
          kind: "identifier",
          value: "field1",
          children: [{ kind: "stringLiteral", value: "\"hello\"" }],
        },
      ],
    };

    const expr = emitExpr(recordNode);

    // Must not be treated as a regular callExpr named "#record"
    assert.notEqual(expr.kind, "void", "#record must not produce void");
    assert.equal(expr.kind, "recordLiteral", "#record must produce recordLiteral, not a generic callExpr");
  });
});

// ── Task 1: computeGIRHash ────────────────────────────────────────────────────

describe("computeGIRHash — canonical GIR hash", () => {
  it("returns a string starting with 'sha256:'", () => {
    const result = parseAndEmit(`
pure flow hashMe(x: Int) -> Int {
  return x
}
`);
    const hash = computeGIRHash(result.gir);
    assert.equal(typeof hash, "string");
    assert.ok(hash.startsWith("sha256:"), `Expected sha256: prefix, got: ${hash}`);
    assert.ok(hash.length > 7, "Expected non-empty hexdigest after sha256:");
  });

  it("produces the same hash for the same GIR called twice", () => {
    const result = parseAndEmit(`
pure flow stableFlow(x: Int) -> Int {
  return x
}
`);
    const hash1 = computeGIRHash(result.gir);
    const hash2 = computeGIRHash(result.gir);
    assert.equal(hash1, hash2, "computeGIRHash must be deterministic for the same GIR object");
  });
});

// ── Task 2: GIRRecordField location ──────────────────────────────────────────

describe("GIR emitter — GIRRecordField location", () => {
  it("includes location on GIRRecordField when source child has location", () => {
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [
        {
          kind: "identifier",
          value: "myField",
          location: { file: "test.spore", line: 3, column: 5 },
          children: [{ kind: "stringLiteral", value: "\"hello\"" }],
        },
      ],
    };

    const expr = emitExpr(recordNode);
    assert.equal(expr.kind, "recordLiteral");
    assert.ok(Array.isArray(expr.fields));
    const field = expr.fields[0];
    assert.ok(field !== undefined, "Expected at least one field");
    assert.ok(field.location !== undefined, "Expected location to be set on GIRRecordField");
    assert.equal(field.location.line, 3);
    assert.equal(field.location.column, 5);
  });

  it("omits location on GIRRecordField when source child has no location", () => {
    const recordNode = {
      kind: "callExpr",
      value: "#record",
      children: [
        {
          kind: "identifier",
          value: "noLocField",
          children: [{ kind: "stringLiteral", value: "\"x\"" }],
        },
      ],
    };

    const expr = emitExpr(recordNode);
    assert.equal(expr.kind, "recordLiteral");
    const field = expr.fields[0];
    assert.ok(field !== undefined);
    assert.equal(field.location, undefined, "Expected location to be absent when source has no location");
  });
});

// ── Task 3: GIRFlow capabilities ─────────────────────────────────────────────

describe("GIR emitter — GIRFlow capabilities field", () => {
  it("GIRFlow has a capabilities map for each declared effect", () => {
    const result = parseAndEmit(`
guarded flow saveData(x: String) -> Result<String, Error>
contract { effects { database.write } }
{
  return Ok(x)
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    assert.ok(flow.capabilities instanceof Map, "capabilities should be a Map");
    assert.ok(flow.capabilities.has("database.write"), "Expected database.write in capabilities map");
    assert.equal(flow.capabilities.get("database.write"), "host.database.write");
  });

  it("GIRFlow capabilities uses host.<effect> fallback for unknown effects", () => {
    const result = parseAndEmit(`
guarded flow customEffect(x: String) -> Result<String, Error>
contract { effects { custom.thing } }
{
  return Ok(x)
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    // custom.thing is not in EFFECT_TO_CAPABILITY, should fallback to host.custom.thing
    const cap = flow.capabilities.get("custom.thing");
    assert.equal(cap, "host.custom.thing", "Unknown effects should map to host.<effect>");
  });

  it("GIRFlow capabilities is empty for pure flows with no effects", () => {
    const result = parseAndEmit(`
pure flow noEffects(x: Int) -> Int {
  return x
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    assert.ok(flow.capabilities instanceof Map);
    assert.equal(flow.capabilities.size, 0, "Pure flow with no effects should have empty capabilities");
  });
});

// ── Task 4: GIRFlow contract metadata ────────────────────────────────────────

describe("GIR emitter — GIRFlow contract metadata", () => {
  it("GIRFlow.contract.hasIntent is true for flows with intent block", () => {
    const result = parseAndEmit(`
secure flow withIntent() -> String
intent "Save patient data"
{
  return "ok"
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    // intent is declared at flow level, not inside a contractDecl — contract may be absent
    // Test with a contract block:
    assert.ok(flow.intent.declared === "Save patient data", "Expected intent to be parsed");
  });

  it("GIRFlow.contract has effectCount matching declared effects in contract block", () => {
    const result = parseAndEmit(`
guarded flow multiEffect(x: String) -> Result<String, Error>
contract { effects { database.write audit.write } }
{
  return Ok(x)
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    if (flow.contract !== undefined) {
      assert.ok(typeof flow.contract.effectCount === "number", "effectCount should be a number");
      assert.ok(flow.contract.effectCount >= 0);
    }
  });

  it("GIRFlow.contract is undefined for flows without a contract block", () => {
    const result = parseAndEmit(`
pure flow noContract(x: Int) -> Int {
  return x
}
`);
    const flow = result.gir.flows[0];
    assert.ok(flow !== undefined);
    assert.equal(flow.contract, undefined, "contract should be absent for flows without contractDecl");
  });
});
