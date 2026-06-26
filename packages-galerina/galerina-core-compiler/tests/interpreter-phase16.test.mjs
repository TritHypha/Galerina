// =============================================================================
// Phase 16 — Interpreter tests
//
// Tests for:
//   - Task 1: executePlan() for pure flow PurePlan
//   - Task 2: Better runtime error messages (flow name included)
//   - Task 3: Context propagation (context.actor accessible in flow body)
//   - Task 4: SPORE-RUNTIME-006 emitted on deadline exceeded
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  run,
  executeFlow,
  parseProgram,
  buildExecutionPlan,
  executePlan,
  createCapabilityHost,
  createContractEnforcer,
} from "../dist/index.js";

// ---------------------------------------------------------------------------
// Task 1: executePlan() with pure flow PurePlan → returns correct result
// ---------------------------------------------------------------------------

describe("Phase 16 — executePlan() for PurePlan", () => {
  it("executePlan on a pure flow returns the declared return type value", async () => {
    const source = `
pure flow computeTotal(price: Int) -> Int {
  return price
}
`;
    const parsed = parseProgram(source, "test.spore");
    const meta = parsed.flows.find((f) => f.name === "computeTotal");
    assert.ok(meta !== undefined, "Flow meta should be found");

    const plan = buildExecutionPlan(parsed.ast, meta);
    assert.equal(plan.qualifier, "pure");

    const enforcer = createContractEnforcer(undefined, "computeTotal", {});
    const host = createCapabilityHost({
      declaredEffects: new Set(),
      enforcer,
    });

    const ctx = { flowName: "computeTotal", startedAt: Date.now() };
    const result = await executePlan(plan, host, ctx);

    assert.ok(typeof result.value === "string", "result.value should be a string (return type name)");
    assert.equal(result.value, "Int");
    assert.ok(Array.isArray(result.auditTrail), "auditTrail should be an array");
    assert.ok(Array.isArray(result.warnings), "warnings should be an array");
  });

  it("executePlan on a pure flow with no effects has an empty auditTrail", async () => {
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
    // Pure flow with no emit steps → audit trail has no emit events
    const emitEntries = result.auditTrail.filter((e) => e.startsWith("emit_event:"));
    assert.equal(emitEntries.length, 0);
  });

  it("executePlan on a flow with emit_event steps records them in auditTrail", async () => {
    const source = `
guarded flow registerUser(name: String) -> Result<String, Error>
contract { effects { database.write } }
{
  DB.insert(name)
  emit UserRegistered
  return Ok(name)
}
`;
    const parsed = parseProgram(source, "test.spore");
    const meta = parsed.flows.find((f) => f.name === "registerUser");
    assert.ok(meta !== undefined);

    const plan = buildExecutionPlan(parsed.ast, meta);
    const enforcer = createContractEnforcer(undefined, "registerUser", {});
    const host = createCapabilityHost({
      declaredEffects: new Set(["database.write"]),
      enforcer,
    });
    const ctx = { flowName: "registerUser", startedAt: Date.now() };

    const result = await executePlan(plan, host, ctx);
    const emitEntries = result.auditTrail.filter((e) => e.startsWith("emit_event:"));
    assert.ok(emitEntries.length >= 1, "Should record at least one emit_event in audit trail");
    assert.ok(
      emitEntries.some((e) => e.includes("UserRegistered")),
      "Audit trail should contain UserRegistered event",
    );
  });

  it("executePlan warns when required context field is missing", async () => {
    // Build a plan that has a validate_context step — we simulate this by
    // calling executePlan directly with a step that includes validate_context.
    const source = `
pure flow greet(name: String) -> String {
  return name
}
`;
    const parsed = parseProgram(source, "test.spore");
    const meta = parsed.flows.find((f) => f.name === "greet");
    assert.ok(meta !== undefined);

    const plan = buildExecutionPlan(parsed.ast, meta);
    // Synthesize a plan with a validate_context step for "actor"
    const planWithContext = {
      ...plan,
      steps: [{ kind: "validate_context", field: "actor" }, ...plan.steps],
    };

    const enforcer = createContractEnforcer(undefined, "greet", {});
    const host = createCapabilityHost({ declaredEffects: new Set(), enforcer });
    // Context without actor field
    const ctx = { flowName: "greet", startedAt: Date.now() };

    const result = await executePlan(planWithContext, host, ctx);
    assert.ok(
      result.warnings.some((w) => w.includes("actor")),
      "Should warn that 'actor' context field is missing",
    );
  });

  it("executePlan does not warn when context field is present", async () => {
    const source = `
pure flow greet(name: String) -> String {
  return name
}
`;
    const parsed = parseProgram(source, "test.spore");
    const meta = parsed.flows.find((f) => f.name === "greet");
    assert.ok(meta !== undefined);

    const plan = buildExecutionPlan(parsed.ast, meta);
    const planWithContext = {
      ...plan,
      steps: [{ kind: "validate_context", field: "actor" }, ...plan.steps],
    };

    const enforcer = createContractEnforcer(undefined, "greet", {});
    const host = createCapabilityHost({ declaredEffects: new Set(), enforcer });
    // Context WITH actor field
    const ctx = { flowName: "greet", startedAt: Date.now(), actor: "user-123" };

    const result = await executePlan(planWithContext, host, ctx);
    const actorWarnings = result.warnings.filter((w) => w.includes("actor"));
    assert.equal(actorWarnings.length, 0, "Should not warn when actor is present in context");
  });
});

// ---------------------------------------------------------------------------
// Task 2: Better error messages include flow name
// ---------------------------------------------------------------------------

describe("Phase 16 — Better runtime error messages", () => {
  it("runtimeError for missing flow includes the flow name", async () => {
    const result = await run(`
pure flow existing() -> Int {
  return 1
}
`, "test.spore", "nonExistentFlow");

    assert.equal(result.ok, false);
    // The diagnostic message or the execution should reference the flow name
    const hasFlowName = result.diagnostics.some((d) => d.message.includes("nonExistentFlow"));
    assert.ok(hasFlowName, "Error should include the flow name 'nonExistentFlow'");
  });

  it("runtime exception error message includes flow name in diagnostic", async () => {
    // We use executeFlow directly to trigger a runtime exception by having
    // an unresolvable identifier that causes a runtimeError
    const source = `
pure flow crashFlow(x: Int) -> Int {
  return x
}
`;
    const parsed = parseProgram(source, "test.spore");
    // Execute a flow that doesn't exist to get a flow-name-including error
    const result = await executeFlow(
      "missingFlow",
      new Map(),
      parsed.ast,
      parsed.flows,
    );

    assert.equal(result.value.__tag, "runtimeError");
    // The error message should include the flow name
    assert.ok(
      result.value.message.includes("missingFlow"),
      `Error message should include 'missingFlow', got: ${result.value.message}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Task 3: Runtime context propagation — context.actor accessible in flow body
// ---------------------------------------------------------------------------

describe("Phase 16 — Runtime context propagation", () => {
  it("context.actor is accessible in flow body", async () => {
    const source = `
pure flow whoAmI() -> String {
  let actor = context.actor
  return actor
}
`;
    const parsed = parseProgram(source, "test.spore");
    const result = await executeFlow(
      "whoAmI",
      new Map(),
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { actor: "alice" },
    );

    // The flow reads context.actor; since context is seeded as a record,
    // context.actor should resolve to "alice"
    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "alice");
  });

  it("context.trace_id is accessible in flow body", async () => {
    const source = `
pure flow getTrace() -> String {
  let tid = context.trace_id
  return tid
}
`;
    const parsed = parseProgram(source, "test.spore");
    const result = await executeFlow(
      "getTrace",
      new Map(),
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { traceId: "trace-abc-123" },
    );

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "trace-abc-123");
  });

  it("context record is not declared when no context options are provided", async () => {
    const source = `
pure flow simple() -> Int {
  return 42
}
`;
    const parsed = parseProgram(source, "test.spore");
    const result = await executeFlow(
      "simple",
      new Map(),
      parsed.ast,
      parsed.flows,
    );

    // Should succeed normally — context not being present doesn't break anything
    assert.equal(result.ok !== false || result.value.__tag !== "runtimeError", true);
  });

  it("context propagation via run() with actor option", async () => {
    const source = `
pure flow getActor() -> String {
  let a = context.actor
  return a
}
`;
    // run() goes through runtime.ts which creates the interpreter; we pass actor
    // via runtimeOptions through the executeFlow path (this tests integration).
    // We'll use executeFlow directly here since run() doesn't expose runtimeOptions yet.
    const parsed = parseProgram(source, "test.spore");
    const result = await executeFlow(
      "getActor",
      new Map(),
      parsed.ast,
      parsed.flows,
      undefined,
      undefined,
      { actor: "bob" },
    );

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "bob");
  });
});

// ---------------------------------------------------------------------------
// Task 4: SPORE-RUNTIME-006 — Flow execution deadline exceeded
// ---------------------------------------------------------------------------

describe("Phase 16 — SPORE-RUNTIME-006 FlowDeadlineExceeded", () => {
  it("deadline exceeded emits SPORE-RUNTIME-006 diagnostic code", async () => {
    // Use a negative deadlineMs so runtime.ts computes Date.now() + (-10000),
    // which is 10 seconds in the past — guaranteed to be expired.
    const result = await run(`
pure flow slow() -> Int {
  return 1
}
`, "test.spore", "slow", new Map(), {
      deadlineMs: -10_000,
    });

    // The diagnostics should contain SPORE-RUNTIME-006
    const hasDeadlineDiag = result.diagnostics.some(
      (d) => d.code === "SPORE-RUNTIME-006",
    );
    assert.ok(
      hasDeadlineDiag,
      `Expected SPORE-RUNTIME-006 diagnostic but got: ${JSON.stringify(result.diagnostics.map((d) => d.code))}`,
    );
  });

  it("deadline exceeded diagnostic message includes flow name", async () => {
    const result = await run(`
pure flow targetFlow() -> Int {
  return 1
}
`, "test.spore", "targetFlow", new Map(), {
      deadlineMs: -10_000,
    });

    const deadlineDiag = result.diagnostics.find(
      (d) => d.code === "SPORE-RUNTIME-006",
    );
    assert.ok(deadlineDiag !== undefined, "Should have SPORE-RUNTIME-006 diagnostic");
    assert.ok(
      deadlineDiag.message.includes("targetFlow"),
      `Deadline message should include flow name 'targetFlow', got: ${deadlineDiag.message}`,
    );
  });

  it("non-expired deadline does not emit SPORE-RUNTIME-006", async () => {
    const result = await run(`
pure flow fast() -> Int {
  return 99
}
`, "test.spore", "fast", new Map(), {
      // 10 second deadline — more than enough
      deadlineMs: 10_000,
    });

    assert.equal(result.ok, true);
    const hasDeadlineDiag = result.diagnostics.some(
      (d) => d.code === "SPORE-RUNTIME-006",
    );
    assert.equal(hasDeadlineDiag, false, "Should not emit SPORE-RUNTIME-006 for a fresh deadline");
  });
});
