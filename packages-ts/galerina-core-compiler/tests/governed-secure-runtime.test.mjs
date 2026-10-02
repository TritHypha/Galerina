import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeBoundedReadLoopEnvelope,
  analyzeMillionReadLoopEnvelope,
  buildExecutionPlan,
  createCapabilityHost,
  createContractEnforcer,
  NodeFlags,
  executeFlow,
  executeFlowSync,
  parseProgram,
  run,
} from "../dist/index.js";

const SOURCE_FILE = "governed-secure-runtime.fungi";
const VALID_SOURCE = `governed floor_3 secure flow secureRuntime(value: Int) -> Int
contract { intent "secure runtime" effects {} }
{ return value + 1 }
`;

function parseFixture(source = VALID_SOURCE, file = SOURCE_FILE) {
  const parsed = parseProgram(source, file);
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(errors, [], `fixture must parse cleanly: ${JSON.stringify(errors)}`);
  return parsed;
}

function intArgs(value = 41) {
  return new Map([["value", { __tag: "int", value }]]);
}

function governedNode(parsed) {
  const node = parsed.ast.children.find((child) => child.kind === "governedFlowDecl");
  assert.ok(node !== undefined, "fixture must contain a governedFlowDecl");
  return node;
}

function mutateGovernedAst(parsed, update) {
  const target = governedNode(parsed);
  return {
    ...parsed.ast,
    children: parsed.ast.children.map((child) => child === target ? { ...target, ...update } : child),
  };
}

async function assertUnresolved(parsed, ast = parsed.ast, flowName = parsed.flows[0]?.name) {
  assert.ok(flowName !== undefined, "fixture must retain FlowMeta for the adversarial runtime request");
  const result = await executeFlow(flowName, intArgs(), ast, parsed.flows);
  assert.equal(result.value.__tag, "runtimeError");
  assert.match(result.value.message, new RegExp(`Flow '${flowName}' not found`));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-RUNTIME-002"));
  assert.equal(result.executionTier, "tree");
}

describe("governed-secure runtime resolution", () => {
  it("executes a valid flagged governed-secure flow only on the governed tree tier", async () => {
    const parsed = parseFixture();
    const result = await executeFlow(
      "secureRuntime",
      intArgs(),
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { pureFastPath: true, egraphFastPath: true },
    );

    assert.deepEqual(result.value, { __tag: "int", value: 42 });
    assert.equal(result.audit.qualifier, "secure");
    assert.equal(result.executionTier, "tree");
    assert.deepEqual(result.diagnostics, []);
  });

  it("keeps repeated governed-secure calls on the AST tree without cache, bytecode, or egraph promotion", async () => {
    const parsed = parseFixture();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await executeFlow(
        "secureRuntime",
        intArgs(),
        parsed.ast,
        parsed.flows,
        undefined,
        undefined,
        { pureFastPath: true, egraphFastPath: true },
      );

      assert.deepEqual(result.value, { __tag: "int", value: 42 });
      assert.equal(result.audit.qualifier, "secure");
      assert.equal(result.executionTier, "tree");
    }
  });

  it("refuses governed-secure direct synchronous execution", () => {
    const parsed = parseFixture();
    const result = executeFlowSync("secureRuntime", intArgs(), parsed.ast, parsed.flows);

    assert.equal(result, null);
  });

  it("does not let a caller-supplied pure execution plan bypass governed-secure AST execution", async () => {
    const parsed = parseFixture();
    const planSource = `pure flow secureRuntime(value: Int) -> PLAN_SENTINEL
{ return value }
`;
    const planParsed = parseFixture(planSource, "malicious-runtime-plan.fungi");
    const planMeta = planParsed.flows.find((flow) => flow.name === "secureRuntime");
    assert.ok(planMeta !== undefined, "malicious fixture must retain plan metadata");
    const plan = buildExecutionPlan(planParsed.ast, planMeta);
    assert.equal(plan.qualifier, "pure");

    const enforcer = createContractEnforcer(undefined, "secureRuntime", {});
    const host = createCapabilityHost({ declaredEffects: new Set(), enforcer });
    const result = await executeFlow(
      "secureRuntime",
      intArgs(),
      parsed.ast,
      parsed.flows,
      enforcer,
      host,
      { useExecutionPlan: true },
      new Map([["secureRuntime", plan]]),
    );

    assert.deepEqual(result.value, { __tag: "int", value: 42 });
    assert.equal(result.audit.qualifier, "secure");
    assert.equal(result.executionTier, "tree");
  });

  for (const floor of ["floor_1", "floor_2", "floor_3", "floor_4"]) {
    it(`executes canonical governed ${floor} secure runtime authority`, async () => {
      const parsed = parseFixture(
        VALID_SOURCE.replace("floor_3", floor),
        `governed-${floor}-secure-runtime.fungi`,
      );
      const result = await executeFlow("secureRuntime", intArgs(), parsed.ast, parsed.flows);

      assert.deepEqual(result.value, { __tag: "int", value: 42 });
      assert.equal(result.audit.qualifier, "secure");
      assert.equal(result.executionTier, "tree");
    });
  }

  it("keeps governed-secure flows outside both verified-loop analyzers", () => {
    const parsed = parseFixture();
    const million = analyzeMillionReadLoopEnvelope(parsed.ast, "secureRuntime");
    const bounded = analyzeBoundedReadLoopEnvelope(parsed.ast, "secureRuntime");

    assert.equal(million.candidate, false);
    assert.equal(million.verdict, -1);
    assert.ok(million.failureIds.includes("FLOW_SHAPE_NOT_EXACT"));
    assert.equal(bounded.candidate, false);
    assert.equal(bounded.verdict, -1);
    assert.ok(bounded.failureIds.includes("FLOW_SHAPE_NOT_EXACT"));
  });

  it("resolves a valid governed-secure flow for nested flow calls", async () => {
    const source = `secure flow caller(value: Int) -> Int
contract { intent "runtime caller" effects {} }
{ return secureRuntime(value) }
${VALID_SOURCE}`;
    const parsed = parseFixture(source, "nested-governed-secure-runtime.fungi");
    const result = await executeFlow("caller", intArgs(), parsed.ast, parsed.flows);

    assert.deepEqual(result.value, { __tag: "int", value: 42 });
    assert.equal(result.audit.qualifier, "secure");
    assert.equal(result.executionTier, "tree");
    assert.deepEqual(result.diagnostics, []);
  });

  it("resolves the governed-secure contract in the top-level runtime pipeline", async () => {
    const source = `governed floor_3 secure flow timedRuntime(value: Int) -> Int
contract {
  intent "timed secure runtime"
  effects {}
  timeouts { deadline 0 ms }
}
{ return value }
`;
    const realNow = Date.now;
    let tick = 1_000;
    Date.now = () => tick++;
    let result;
    try {
      result = await run(source, "timed-governed-secure-runtime.fungi", "timedRuntime", intArgs());
    } finally {
      Date.now = realNow;
    }

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-RUNTIME-006"));
    assert.equal(result.execution?.audit.qualifier, "secure");
    assert.equal(result.execution?.executionTier, "tree");
  });

  it("preserves unflagged legacy governed flows as unresolved", async () => {
    const source = VALID_SOURCE.replace("floor_3 secure flow", "floor_3 flow");
    const parsed = parseFixture(source, "legacy-governed-runtime.fungi");
    await assertUnresolved(parsed);
  });

  for (const floor of ["floor_5", "execution", "floor_unknown"]) {
    it(`refuses flagged governed ${floor} runtime authority`, async () => {
      const parsed = parseFixture();
      const node = governedNode(parsed);
      const ast = mutateGovernedAst(parsed, {
        value: `governed:${floor}:secureRuntime`,
        flags: (node.flags ?? NodeFlags.None) | NodeFlags.IsSecure,
      });
      await assertUnresolved(parsed, ast, "secureRuntime");
    });
  }

  it("refuses contradictory governed-secure posture flags", async () => {
    const parsed = parseFixture();
    const node = governedNode(parsed);
    const ast = mutateGovernedAst(parsed, {
      flags: (node.flags ?? NodeFlags.None) | NodeFlags.IsPure | NodeFlags.IsSecure,
    });
    await assertUnresolved(parsed, ast, "secureRuntime");
  });

  it("preserves ordinary flow precedence over a governed-secure duplicate", async () => {
    const ordinary = parseFixture(
      `secure flow duplicateRuntime(value: Int) -> Int
contract { intent "ordinary runtime" effects {} }
{ return value + 1 }
`,
      "ordinary-runtime.fungi",
    );
    const governed = parseFixture(
      VALID_SOURCE.replaceAll("secureRuntime", "duplicateRuntime").replace("value + 1", "value + 100"),
      "governed-runtime-duplicate.fungi",
    );
    const ast = {
      ...ordinary.ast,
      children: [governedNode(governed), ...ordinary.ast.children],
    };
    const result = await executeFlow("duplicateRuntime", intArgs(), ast, ordinary.flows);

    assert.deepEqual(result.value, { __tag: "int", value: 42 });
    assert.equal(result.audit.qualifier, "secure");
    assert.equal(result.executionTier, "tree");
  });
});
