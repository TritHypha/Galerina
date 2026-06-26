import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateCoreSyntaxSafety,
  validateIntentEffects,
  checkBindingReassignment,
  checkReadonlyMutation,
  checkMethodChain,
  checkMutInPureContext,
  validateTypedContentBlock,
  SPORE_SYNTAX_001,
  SPORE_SYNTAX_002,
  SPORE_BINDING_001,
  SPORE_BINDING_002,
  SPORE_BINDING_003,
  SPORE_BINDING_004,
  SPORE_BLOCK_001,
  SPORE_BLOCK_002,
  SPORE_STRING_001,
  SPORE_STRING_002,
  SPORE_CHAR_001,
  SPORE_CHAR_003,
  SPORE_BYTE_001,
  SPORE_BYTE_004,
  SPORE_INTENT_DIAGNOSTICS,
  SPORE_BINDING_DIAGNOSTICS,
  SPORE_PIPELINE_DIAGNOSTICS,
  SPORE_SYNTAX_DIAGNOSTICS,
  SPORE_BLOCK_DIAGNOSTICS,
  SPORE_STRING_DIAGNOSTICS,
  SPORE_CHAR_DIAGNOSTICS,
  SPORE_BYTE_DIAGNOSTICS,
  SPORE_MEMORY_001,
  SPORE_MEMORY_003,
  SPORE_MEMORY_005,
  SPORE_MEMORY_006,
  SPORE_MEMORY_008,
  SPORE_MEMORY_DIAGNOSTICS,
  SPORE_RAWPTR_001,
  SPORE_RAWPTR_DIAGNOSTICS,
  SPORE_SAFETY_001,
  SPORE_SAFETY_002,
  SPORE_SAFETY_003,
  SPORE_SAFETY_004,
  SPORE_SAFETY_005,
  SPORE_SAFETY_006,
  SPORE_SAFETY_DIAGNOSTICS,
  SPORE_SEC_020,
  SPORE_SEC_021,
} from "../dist/index.js";

describe("galerina-core-compiler syntax safety contracts", () => {
  it("rejects Tri values used directly as branch conditions", () => {
    const result = validateCoreSyntaxSafety({
      file: "branch.spore",
      text: `
pure flow check(signal: Tri) -> Bool {
  if signal {
    return true
  }
  return false
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_SAFETY_001.code),
      "Expected SPORE-SAFETY-001 for Tri branch condition",
    );
  });

  it("rejects implicit Tri, Decision and Bool boundary assignments", () => {
    const result = validateCoreSyntaxSafety({
      file: "assignment.spore",
      text: `
secure flow decide(signal: Tri, decision: Decision) -> Decision {
  let allowed: Bool = signal
  let direct: Decision = signal
  let state: Tri = decision
  return Review
}
`,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.filter((d) => d.code === SPORE_SAFETY_002.code).length,
      3,
      "Expected 3 × SPORE-SAFETY-002 for implicit Tri/Decision/Bool conversions",
    );
  });

  it("rejects non-exhaustive Tri matches", () => {
    const result = validateCoreSyntaxSafety({
      file: "match.spore",
      text: `
pure flow signalAllowed(signal: Tri) -> Bool {
  match signal {
    Positive => return true
    Negative => return false
  }
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === SPORE_SAFETY_006.code && d.message.includes("Neutral"),
      ),
      "Expected SPORE-SAFETY-006 mentioning missing Neutral case",
    );
  });

  it("treats unknown_as true as an error in secure flows", () => {
    const result = validateCoreSyntaxSafety({
      file: "secure-policy.spore",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return tri.toBool(signal, unknown_as: true)
}
`,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.find((d) => d.code === SPORE_SAFETY_003.code)?.severity,
      "error",
      "Expected SPORE-SAFETY-003 as error severity in secure flow",
    );
  });

  // ── #153 FAIL-CLOSED: Tri→Bool/Decision with no unknown-state policy ──────────
  it("FAIL-CLOSED: secure-flow Tri.toBool WITHOUT an explicit unknown_as policy is an error", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-nopolicy.spore",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return Tri.toBool(signal)
}
`,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.find((d) => d.code === SPORE_SAFETY_003.code)?.severity,
      "error",
      "Expected SPORE-SAFETY-003 error: HOLD/Neutral must not silently coerce without a declared policy",
    );
  });

  it("FAIL-CLOSED: plain-flow Tri.toDecision without a policy is a warning (not silently accepted)", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-decision-nopolicy.spore",
      text: `
flow classify(signal: Tri) -> Decision {
  return Tri.toDecision(signal)
}
`,
    });

    assert.equal(
      result.diagnostics.find((d) => d.code === SPORE_SAFETY_003.code)?.severity,
      "warning",
      "Expected SPORE-SAFETY-003 warning for an unguarded Tri.toDecision in a plain flow",
    );
  });

  it("accepts Tri.toBool WITH an explicit non-truthy unknown_as policy", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-policy.spore",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return Tri.toBool(signal, unknown_as: Negative)
}
`,
    });

    assert.ok(
      !result.diagnostics.some((d) => d.code === SPORE_SAFETY_003.code),
      `Did not expect SPORE-SAFETY-003 when an explicit unknown_as policy is declared, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("blocks secret literals and unsafe dynamic execution", () => {
    const result = validateCoreSyntaxSafety({
      file: "secrets.spore",
      text: `
flow load() -> Bool {
  let api_key = "live-secret"
  eval("danger")
  return true
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_SAFETY_004.code),
      "Expected SPORE-SAFETY-004 for raw secret literal",
    );
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_SAFETY_005.code),
      "Expected SPORE-SAFETY-005 for eval() usage",
    );
  });

  it("accepts explicit exhaustive Tri handling", () => {
    const result = validateCoreSyntaxSafety({
      file: "safe.spore",
      text: `
secure flow riskToDecision(signal: Tri) -> Decision {
  match signal {
    Positive => Deny
    Neutral => Review
    Negative => Allow
  }
}
`,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("rejects var and const as unsupported binding keywords", () => {
    const varResult = validateCoreSyntaxSafety({
      file: "bindings.spore",
      text: `
flow setCount() {
  var count = 0
}
`,
    });

    const constResult = validateCoreSyntaxSafety({
      file: "bindings.spore",
      text: `
flow setVersion() {
  const VERSION = "1.0.0"
}
`,
    });

    assert.equal(varResult.ok, false);
    assert.ok(
      varResult.diagnostics.some((d) => d.code === SPORE_SYNTAX_001.code),
      "Expected SPORE-SYNTAX-001 for var usage",
    );

    assert.equal(constResult.ok, false);
    assert.ok(
      constResult.diagnostics.some((d) => d.code === SPORE_SYNTAX_002.code),
      "Expected SPORE-SYNTAX-002 for const usage",
    );
  });

  it("does not flag var/const inside comment lines", () => {
    const result = validateCoreSyntaxSafety({
      file: "comments.spore",
      text: `
/// This flow replaces the old var-based counter.
/// const is not supported — use let or readonly.
flow doWork() {
  let count = 0
}
`,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("checkBindingReassignment emits SPORE-BINDING-001 for let, SPORE-BINDING-002 for readonly, nothing for mut", () => {
    const loc = { file: "test.spore", line: 5, column: 3 };

    const letDiags = checkBindingReassignment({ bindingKind: "let", bindingName: "count", location: loc });
    const readonlyDiags = checkBindingReassignment({ bindingKind: "readonly", bindingName: "config", location: loc });
    const mutDiags = checkBindingReassignment({ bindingKind: "mut", bindingName: "retries", location: loc });

    assert.ok(letDiags.some((d) => d.code === SPORE_BINDING_001.code));
    assert.ok(readonlyDiags.some((d) => d.code === SPORE_BINDING_002.code));
    assert.equal(mutDiags.length, 0);
  });

  it("checkReadonlyMutation emits SPORE-BINDING-003 only for readonly bindings", () => {
    const loc = { file: "test.spore", line: 8, column: 5 };

    const readonlyDiags = checkReadonlyMutation({ bindingKind: "readonly", bindingName: "cfg", propertyName: "apiUrl", location: loc });
    const letDiags = checkReadonlyMutation({ bindingKind: "let", bindingName: "user", propertyName: "name", location: loc });

    assert.ok(readonlyDiags.some((d) => d.code === SPORE_BINDING_003.code));
    assert.equal(letDiags.length, 0);
  });

  it("checkMethodChain returns empty diagnostics (stub — pending type scope)", () => {
    const diags = checkMethodChain({
      receiver: "input",
      calls: [{ methodName: "validate" }, { methodName: "sanitize" }, { methodName: "save" }],
      location: { file: "test.spore", line: 3, column: 1 },
    });

    assert.equal(diags.length, 0);
  });

  it("diagnostic constant arrays use correct SPORE-* code prefixes", () => {
    assert.ok(SPORE_SYNTAX_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-SYNTAX-")));
    assert.ok(SPORE_BINDING_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-BINDING-")));
    assert.ok(SPORE_PIPELINE_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-PIPELINE-")));
    assert.ok(SPORE_INTENT_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-INTENT-")));
    assert.ok(SPORE_BLOCK_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-BLOCK-")));
    assert.ok(SPORE_STRING_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-STRING-")));
    assert.ok(SPORE_CHAR_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-CHAR-")));
    assert.ok(SPORE_BYTE_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-BYTE-")));
    assert.ok(SPORE_MEMORY_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-MEMORY-")));
    assert.ok(SPORE_RAWPTR_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-RAWPTR-")));
    assert.ok(SPORE_SAFETY_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-SAFETY-")));
  });

  it("accepts a well-formed typed content block without errors", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.spore",
      text: `
flow renderPage() -> Html {
  html <<HTML
    <div class="container">
      <h1>Hello Galerina</h1>
    </div>
  HTML
}
`,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("emits SPORE-BLOCK-001 for an unknown content block type", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.spore",
      text: `
flow renderFeed() {
  xml <<XML
    <feed/>
  XML
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_BLOCK_001.code),
      "Expected SPORE-BLOCK-001 for unknown block type",
    );
  });

  it("emits SPORE-BLOCK-002 for an unclosed typed content block", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.spore",
      text: `
flow renderPage() -> Html {
  html <<PAGE
    <div>This block is never closed.
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_BLOCK_002.code),
      "Expected SPORE-BLOCK-002 for unclosed content block",
    );
  });

  it("does not flag var/const keywords found inside a typed content block", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.spore",
      text: `
flow renderScript() {
  script <<SCRIPT
    const count = 0
    var message = "hello"
  SCRIPT
}
`,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("validateTypedContentBlock stub returns empty diagnostics", () => {
    const diags = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<div>hello</div>",
      file: "test.spore",
      startLine: 3,
    });

    assert.equal(diags.length, 0);
  });

  it("validateIntentEffects stub returns correct empty result shape", () => {
    const result = validateIntentEffects(
      "createOrder",
      "guarded",
      "create customer order",
      ["database.write", "network.call"],
      ["database.write", "network.call"],
      false,
    );

    assert.equal(result.flowName, "createOrder");
    assert.equal(result.safetyLevel, "guarded");
    assert.equal(result.intent, "create customer order");
    assert.deepEqual(result.declaredEffects, ["database.write", "network.call"]);
    assert.deepEqual(result.inferredEffects, ["database.write", "network.call"]);
    assert.deepEqual(result.mismatches, []);
    assert.deepEqual(result.diagnostics, []);
  });

  it("validateIntentEffects stub omits intent field when undefined", () => {
    const result = validateIntentEffects(
      "processWebhook",
      "guarded",
      undefined,
      [],
      ["network.call"],
      false,
    );

    assert.equal(result.flowName, "processWebhook");
    assert.equal(Object.hasOwn(result, "intent"), false);
    assert.deepEqual(result.mismatches, []);
    assert.deepEqual(result.diagnostics, []);
  });

  it("String/Char/Byte diagnostic constants carry correct codes and names", () => {
    // String
    assert.equal(SPORE_STRING_001.code, "SPORE-STRING-001");
    assert.equal(SPORE_STRING_001.name, "INVALID_UTF8_DECODE");
    assert.equal(SPORE_STRING_002.code, "SPORE-STRING-002");
    assert.equal(SPORE_STRING_002.name, "SECRET_STORED_AS_STRING");
    assert.equal(SPORE_STRING_002.severity, "error");

    // Char
    assert.equal(SPORE_CHAR_001.code, "SPORE-CHAR-001");
    assert.equal(SPORE_CHAR_001.name, "CHAR_BYTE_CONFUSION");
    assert.equal(SPORE_CHAR_003.code, "SPORE-CHAR-003");
    assert.equal(SPORE_CHAR_003.name, "MULTI_CHAR_LITERAL");

    // Byte
    assert.equal(SPORE_BYTE_001.code, "SPORE-BYTE-001");
    assert.equal(SPORE_BYTE_001.name, "BYTE_OUT_OF_RANGE");
    assert.equal(SPORE_BYTE_004.code, "SPORE-BYTE-004");
    assert.equal(SPORE_BYTE_004.name, "RAW_BYTES_LOGGED");

    // All String/Char/Byte constants are severity "error" except SPORE_STRING_004 (warning)
    assert.ok(SPORE_STRING_DIAGNOSTICS.filter((d) => d.severity === "error").length === 3);
    assert.ok(SPORE_CHAR_DIAGNOSTICS.every((d) => d.severity === "error"));
    assert.ok(SPORE_BYTE_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("Memory diagnostic constants carry correct codes, names, and are all errors", () => {
    // Spot-check individual constants
    assert.equal(SPORE_MEMORY_001.code, "SPORE-MEMORY-001");
    assert.equal(SPORE_MEMORY_001.name, "USE_AFTER_MOVE");
    assert.equal(SPORE_MEMORY_001.severity, "error");

    assert.equal(SPORE_MEMORY_003.code, "SPORE-MEMORY-003");
    assert.equal(SPORE_MEMORY_003.name, "BORROW_ESCAPES_SCOPE");

    assert.equal(SPORE_MEMORY_005.code, "SPORE-MEMORY-005");
    assert.equal(SPORE_MEMORY_005.name, "MUTABLE_ALIAS");

    assert.equal(SPORE_MEMORY_006.code, "SPORE-MEMORY-006");
    assert.equal(SPORE_MEMORY_006.name, "BOUNDS_VIOLATION");

    assert.equal(SPORE_MEMORY_008.code, "SPORE-MEMORY-008");
    assert.equal(SPORE_MEMORY_008.name, "UNSAFE_MEMORY_REQUIRES_FALLBACK");

    // Array completeness and uniformity
    assert.equal(SPORE_MEMORY_DIAGNOSTICS.length, 8);
    assert.ok(SPORE_MEMORY_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-MEMORY-")));
    assert.ok(SPORE_MEMORY_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("Safety diagnostic constants carry correct codes and names (SPORE-SAFETY-* series)", () => {
    assert.equal(SPORE_SAFETY_001.code, "SPORE-SAFETY-001");
    assert.equal(SPORE_SAFETY_001.name, "TRI_BRANCH_CONDITION");
    assert.equal(SPORE_SAFETY_001.severity, "error");

    assert.equal(SPORE_SAFETY_002.code, "SPORE-SAFETY-002");
    assert.equal(SPORE_SAFETY_002.name, "UNSAFE_LOGIC_ASSIGNMENT");

    assert.equal(SPORE_SAFETY_003.code, "SPORE-SAFETY-003");
    assert.equal(SPORE_SAFETY_003.name, "TRI_UNKNOWN_AS_TRUE");

    assert.equal(SPORE_SAFETY_004.code, "SPORE-SAFETY-004");
    assert.equal(SPORE_SAFETY_004.name, "SECRET_LITERAL");

    assert.equal(SPORE_SAFETY_005.code, "SPORE-SAFETY-005");
    assert.equal(SPORE_SAFETY_005.name, "UNSAFE_DYNAMIC_CODE");

    assert.equal(SPORE_SAFETY_006.code, "SPORE-SAFETY-006");
    assert.equal(SPORE_SAFETY_006.name, "TRI_MATCH_NOT_EXHAUSTIVE");

    assert.equal(SPORE_SAFETY_DIAGNOSTICS.length, 6);
    assert.ok(SPORE_SAFETY_DIAGNOSTICS.every((d) => d.code.startsWith("SPORE-SAFETY-")));
    assert.ok(SPORE_SAFETY_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("SPORE_SEC_020 has code SPORE-SEC-020, name RuntimeMutation, severity error, and suggestedFix", () => {
    assert.equal(SPORE_SEC_020.code, "SPORE-SEC-020");
    assert.equal(SPORE_SEC_020.name, "RuntimeMutation");
    assert.equal(SPORE_SEC_020.severity, "error");
    assert.ok(typeof SPORE_SEC_020.message === "string" && SPORE_SEC_020.message.length > 0);
    assert.ok(typeof SPORE_SEC_020.suggestedFix === "string" && SPORE_SEC_020.suggestedFix.length > 0);
  });

  it("SPORE_SEC_021 has code SPORE-SEC-021, name PrototypeMutation, severity error, and suggestedFix", () => {
    assert.equal(SPORE_SEC_021.code, "SPORE-SEC-021");
    assert.equal(SPORE_SEC_021.name, "PrototypeMutation");
    assert.equal(SPORE_SEC_021.severity, "error");
    assert.ok(typeof SPORE_SEC_021.message === "string" && SPORE_SEC_021.message.length > 0);
    assert.ok(typeof SPORE_SEC_021.suggestedFix === "string" && SPORE_SEC_021.suggestedFix.length > 0);
  });

  it("SPORE_SEC_020 and SPORE_SEC_021 are exported from dist/index.js", () => {
    // Verified by the fact that this test file imported them without error.
    assert.ok(SPORE_SEC_020 !== undefined, "SPORE_SEC_020 must be exported");
    assert.ok(SPORE_SEC_021 !== undefined, "SPORE_SEC_021 must be exported");
  });

  it("diagnostic constants export complete arrays check — including SPORE-SAFETY-* and SPORE-RAWPTR-*", () => {
    assert.equal(SPORE_SYNTAX_DIAGNOSTICS.length, 6); // 2 original + 4 new (006-009)
    assert.equal(SPORE_BINDING_DIAGNOSTICS.length, 6); // 4 original + SPORE-BINDING-005 + SPORE-BINDING-006 (Phase 11A.2)
    assert.equal(SPORE_PIPELINE_DIAGNOSTICS.length, 5);
    assert.equal(SPORE_INTENT_DIAGNOSTICS.length, 5);
    assert.equal(SPORE_BLOCK_DIAGNOSTICS.length, 4);
    assert.equal(SPORE_STRING_DIAGNOSTICS.length, 4);
    assert.equal(SPORE_CHAR_DIAGNOSTICS.length, 4);
    assert.equal(SPORE_BYTE_DIAGNOSTICS.length, 5);
    assert.equal(SPORE_MEMORY_DIAGNOSTICS.length, 8);
    assert.equal(SPORE_SAFETY_DIAGNOSTICS.length, 6);
    assert.equal(SPORE_RAWPTR_DIAGNOSTICS.length, 1);
    assert.equal(SPORE_RAWPTR_001.code, "SPORE-RAWPTR-001");
    assert.equal(SPORE_RAWPTR_001.name, "RAW_POINTER_OUTSIDE_UNSAFE");
    assert.equal(SPORE_RAWPTR_001.severity, "error");
  });

  // ── Phase 3 scanner-level memory rules ───────────────────────────────────

  it("rejects mut binding declared inside a pure flow — SPORE-BINDING-004", () => {
    const result = validateCoreSyntaxSafety({
      file: "pure-mut.spore",
      text: `
pure flow accumulateValues(items: Array<Int>) -> Int {
  mut total: Int = 0
  return total
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_BINDING_004.code),
      "Expected SPORE-BINDING-004 for mut in pure flow",
    );
  });

  it("allows mut binding in non-pure flows — no SPORE-BINDING-004", () => {
    const result = validateCoreSyntaxSafety({
      file: "guarded-mut.spore",
      text: `
guarded flow buildPayload(items: Array<String>) -> Array<String> {
  mut result: Array<String> = []
  return result
}
`,
    });

    assert.equal(result.ok, true);
    assert.ok(
      !result.diagnostics.some((d) => d.code === SPORE_BINDING_004.code),
      "Should not emit SPORE-BINDING-004 outside pure flow",
    );
  });

  it("checkMutInPureContext emits SPORE-BINDING-004 for pure flows and nothing otherwise", () => {
    const loc = { file: "test.spore", line: 4, column: 3 };

    const pureDiags = checkMutInPureContext({ flowSafetyLevel: "pure", bindingName: "counter", location: loc });
    const guardedDiags = checkMutInPureContext({ flowSafetyLevel: "guarded", bindingName: "counter", location: loc });
    const safeDiags = checkMutInPureContext({ flowSafetyLevel: "safe", bindingName: "counter", location: loc });

    assert.ok(pureDiags.some((d) => d.code === SPORE_BINDING_004.code), "Expected SPORE-BINDING-004 for pure");
    assert.equal(guardedDiags.length, 0, "No diagnostic for guarded");
    assert.equal(safeDiags.length, 0, "No diagnostic for safe");
  });

  it("rejects unsafe block without reason declaration — SPORE-MEMORY-008", () => {
    const result = validateCoreSyntaxSafety({
      file: "unsafe-no-reason.spore",
      text: `
flow copyBuffer() -> Result<Void, String> {
  unsafe block copyRaw {
    return Ok(Void)
  }
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_MEMORY_008.code),
      "Expected SPORE-MEMORY-008 for unsafe block without reason",
    );
  });

  it("accepts unsafe block with reason declaration — no SPORE-MEMORY-008", () => {
    const result = validateCoreSyntaxSafety({
      file: "unsafe-with-reason.spore",
      text: `
flow copyBuffer() -> Result<Void, String> {
  unsafe block copyRaw reason "DMA requires direct pointer access" fallback safeMemcopy {
    return Ok(Void)
  }
}
`,
    });

    assert.ok(
      !result.diagnostics.some((d) => d.code === SPORE_MEMORY_008.code),
      "Should not emit SPORE-MEMORY-008 when reason is present",
    );
  });
});
