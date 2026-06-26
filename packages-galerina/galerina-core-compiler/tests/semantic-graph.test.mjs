import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  buildSemanticGraph,
  buildAiGraph,
  run,
} from "../dist/index.js";

import {
  graphToJSON,
  graphFromJSON,
  effectsOf,
  callers,
} from "@galerina/devtools-graph-algorithms";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFlows(source) {
  return parseProgram(source, "test.spore");
}

const SIMPLE_FLOW_SOURCE = `
pure flow greet() -> String {
  return "hello"
}
`;

const EFFECT_FLOW_SOURCE = `
guarded flow saveOrder(order: Order) -> Result<Order, Error>
contract { effects { database.write } }
{
  return Ok(order)
}
`;

const MULTI_EFFECT_SOURCE = `
secure flow processPayment(amount: Money<GBP>) -> Result<String, Error>
contract { effects { payment.charge, audit.log } }
{
  return Ok("done")
}
`;

// ---------------------------------------------------------------------------
// Task 1: buildSemanticGraph
// ---------------------------------------------------------------------------

describe("buildSemanticGraph — basic flow node", () => {
  it("produces a flow node for a simple pure flow", () => {
    const parsed = parseFlows(SIMPLE_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const flowNode = graph.nodes.find((n) => n.id === "flow:greet");
    assert.ok(flowNode !== undefined, "flow:greet node should be present");
    assert.equal(flowNode.kind, "flow");
    assert.equal(flowNode.name, "greet");
  });
});

describe("buildSemanticGraph — flow node metadata", () => {
  it("carries correct qualifier, returnType, params, and declaredEffects in meta", () => {
    const parsed = parseFlows(SIMPLE_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const flowNode = graph.nodes.find((n) => n.id === "flow:greet");
    assert.ok(flowNode !== undefined);
    assert.equal(flowNode.meta?.qualifier, "pure");
    assert.equal(flowNode.meta?.returnType, "String");
    assert.deepEqual(flowNode.meta?.params, []);
    assert.deepEqual(flowNode.meta?.declaredEffects, []);
  });
});

describe("buildSemanticGraph — effect nodes", () => {
  it("adds an effect node for each declared effect", () => {
    const parsed = parseFlows(EFFECT_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const effectNode = graph.nodes.find((n) => n.id === "effect:database.write");
    assert.ok(effectNode !== undefined, "effect:database.write node should be present");
    assert.equal(effectNode.kind, "effect");
    assert.equal(effectNode.name, "database.write");
  });

  it("adds all effect nodes for multiple declared effects", () => {
    const parsed = parseFlows(MULTI_EFFECT_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const paymentNode = graph.nodes.find((n) => n.id === "effect:payment.charge");
    const auditNode = graph.nodes.find((n) => n.id === "effect:audit.log");
    assert.ok(paymentNode !== undefined, "effect:payment.charge should be present");
    assert.ok(auditNode !== undefined, "effect:audit.log should be present");
  });
});

describe("buildSemanticGraph — declaresEffect edges", () => {
  it("adds a declaresEffect edge from flow to each effect node", () => {
    const parsed = parseFlows(EFFECT_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const edge = graph.edges.find(
      (e) => e.from === "flow:saveOrder" && e.to === "effect:database.write" && e.kind === "declaresEffect",
    );
    assert.ok(edge !== undefined, "declaresEffect edge should be present");
    assert.equal(edge.label, "database.write");
  });

  it("adds declaresEffect edges for all declared effects", () => {
    const parsed = parseFlows(MULTI_EFFECT_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const paymentEdge = graph.edges.find(
      (e) => e.from === "flow:processPayment" && e.to === "effect:payment.charge" && e.kind === "declaresEffect",
    );
    const auditEdge = graph.edges.find(
      (e) => e.from === "flow:processPayment" && e.to === "effect:audit.log" && e.kind === "declaresEffect",
    );
    assert.ok(paymentEdge !== undefined);
    assert.ok(auditEdge !== undefined);
  });
});

// ---------------------------------------------------------------------------
// JSON roundtrip
// ---------------------------------------------------------------------------

describe("SemanticGraph JSON roundtrip", () => {
  it("graphToJSON / graphFromJSON round-trips correctly", () => {
    const parsed = parseFlows(EFFECT_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const json = graphToJSON(graph);
    const restored = graphFromJSON(json);

    assert.equal(restored.schemaVersion, "1.0");
    assert.equal(
      restored.nodes.length,
      graph.nodes.length,
      "node count should be preserved",
    );
    assert.equal(
      restored.edges.length,
      graph.edges.length,
      "edge count should be preserved",
    );

    const flowNode = restored.nodes.find((n) => n.id === "flow:saveOrder");
    assert.ok(flowNode !== undefined);
    assert.equal(flowNode.kind, "flow");
  });
});

// ---------------------------------------------------------------------------
// effectsOf() helper
// ---------------------------------------------------------------------------

describe("effectsOf() helper", () => {
  it("returns the declared effects for a flow node", () => {
    const parsed = parseFlows(EFFECT_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const effects = effectsOf(graph, "flow:saveOrder");
    assert.ok(effects.includes("database.write"), "should contain database.write");
  });

  it("returns empty array for a flow with no effects", () => {
    const parsed = parseFlows(SIMPLE_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const effects = effectsOf(graph, "flow:greet");
    assert.deepEqual(effects, []);
  });

  it("returns all declared effects for multi-effect flow", () => {
    const parsed = parseFlows(MULTI_EFFECT_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const effects = effectsOf(graph, "flow:processPayment");
    assert.ok(effects.includes("payment.charge"));
    assert.ok(effects.includes("audit.log"));
  });
});

// ---------------------------------------------------------------------------
// callers() helper
// ---------------------------------------------------------------------------

describe("callers() helper", () => {
  it("returns empty array for a top-level flow with no callers", () => {
    const parsed = parseFlows(SIMPLE_FLOW_SOURCE);
    const graph = buildSemanticGraph(parsed.ast, parsed.flows);

    const flowCallers = callers(graph, "flow:greet");
    assert.deepEqual([...flowCallers], []);
  });
});

// ---------------------------------------------------------------------------
// run() integration — emitSemanticGraph
// ---------------------------------------------------------------------------

describe("run() with emitSemanticGraph: true", () => {
  it("returns semanticGraph field in result", async () => {
    const result = await run(
      SIMPLE_FLOW_SOURCE,
      "test.spore",
      "greet",
      new Map(),
      { emitSemanticGraph: true },
    );

    assert.ok(result.ok, "run should succeed");
    assert.ok(result.semanticGraph !== undefined, "semanticGraph should be present");
    assert.equal(result.semanticGraph.schemaVersion, "1.0");

    const flowNode = result.semanticGraph.nodes.find((n) => n.id === "flow:greet");
    assert.ok(flowNode !== undefined, "flow:greet node should be present");
  });

  it("does not include semanticGraph when option is not set", async () => {
    const result = await run(
      SIMPLE_FLOW_SOURCE,
      "test.spore",
      "greet",
    );

    assert.equal(result.semanticGraph, undefined);
  });
});

// ---------------------------------------------------------------------------
// AI Graph (version 2) — buildAiGraph and run() with emitAiGraph
// ---------------------------------------------------------------------------

const EFFECT_FLOW_FOR_AI = `
guarded flow saveOrder(order: Order) -> Result<Order, Error>
contract { effects { database.write } }
{
  return Ok(order)
}
`;

const AI_INFERENCE_FLOW = `
guarded flow classify(text: String) -> Result<String, Error>
contract { effects { ai.inference } }
{
  return Ok("label")
}
`;

describe("buildAiGraph — version field is '2'", () => {
  it("AI graph version is '2'", () => {
    const parsed = parseProgram(SIMPLE_FLOW_SOURCE, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    assert.equal(graph.version, "2", "AI graph version should be '2'");
  });
});

describe("buildAiGraph — capabilities mapped from effects", () => {
  it("AI graph includes capabilities mapped from effects", () => {
    const parsed = parseProgram(EFFECT_FLOW_FOR_AI, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    const flow = graph.flows.find((f) => f.name === "saveOrder");
    assert.ok(flow !== undefined, "saveOrder flow should be present in AI graph");
    assert.ok(
      flow.capabilities.includes("host.database.write"),
      `Expected host.database.write in capabilities, got: ${flow.capabilities.join(", ")}`,
    );
  });

  it("AI graph maps ai.inference to host.ai.inference", () => {
    const parsed = parseProgram(AI_INFERENCE_FLOW, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    const flow = graph.flows.find((f) => f.name === "classify");
    assert.ok(flow !== undefined, "classify flow should be present in AI graph");
    assert.ok(
      flow.capabilities.includes("host.ai.inference"),
      `Expected host.ai.inference in capabilities, got: ${flow.capabilities.join(", ")}`,
    );
  });

  it("pure flow with no effects has empty capabilities array", () => {
    const parsed = parseProgram(SIMPLE_FLOW_SOURCE, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    const flow = graph.flows.find((f) => f.name === "greet");
    assert.ok(flow !== undefined, "greet flow should be present in AI graph");
    assert.deepEqual(flow.capabilities, [], "pure flow with no effects should have empty capabilities");
  });
});

describe("buildAiGraph — diagnostics field is an array", () => {
  it("AI graph diagnostics field is an array", () => {
    const parsed = parseProgram(SIMPLE_FLOW_SOURCE, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    assert.ok(Array.isArray(graph.diagnostics), "diagnostics should be an array");
  });

  it("AI graph diagnostics is empty for a clean flow", () => {
    const parsed = parseProgram(SIMPLE_FLOW_SOURCE, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    assert.equal(graph.diagnostics.length, 0, "diagnostics should be empty for a clean flow");
  });
});

describe("buildAiGraph — no values field", () => {
  it("AI graph does NOT include a 'values' field", () => {
    const parsed = parseProgram(EFFECT_FLOW_FOR_AI, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    assert.ok(!("values" in graph), "AI graph must not contain a 'values' field");
  });

  it("AI graph flows do NOT include a 'values' field", () => {
    const parsed = parseProgram(EFFECT_FLOW_FOR_AI, "test.spore");
    const graph = buildAiGraph(parsed.ast, parsed.flows);
    for (const flow of graph.flows) {
      assert.ok(!("values" in flow), `Flow '${flow.name}' must not contain a 'values' field`);
    }
  });
});

describe("run() with emitAiGraph: true — version 2 format", () => {
  it("returns aiGraphJson field when emitAiGraph is true", async () => {
    const result = await run(
      SIMPLE_FLOW_SOURCE,
      "test.spore",
      "greet",
      new Map(),
      { emitAiGraph: true },
    );
    assert.ok(result.ok, "run should succeed");
    assert.ok(result.aiGraphJson !== undefined, "aiGraphJson should be present");
    const graph = JSON.parse(result.aiGraphJson);
    assert.equal(graph.version, "2", "AI graph version from run() should be '2'");
  });

  it("aiGraphJson from run() has diagnostics array and no values field", async () => {
    const result = await run(
      SIMPLE_FLOW_SOURCE,
      "test.spore",
      "greet",
      new Map(),
      { emitAiGraph: true },
    );
    assert.ok(result.aiGraphJson !== undefined);
    const graph = JSON.parse(result.aiGraphJson);
    assert.ok(Array.isArray(graph.diagnostics), "diagnostics should be an array");
    assert.ok(!("values" in graph), "AI graph must not contain a 'values' field");
  });
});
