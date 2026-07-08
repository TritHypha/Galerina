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
  FUNGI_SYNTAX_001,
  FUNGI_SYNTAX_002,
  FUNGI_BINDING_001,
  FUNGI_BINDING_002,
  FUNGI_BINDING_003,
  FUNGI_BINDING_004,
  FUNGI_BLOCK_001,
  FUNGI_BLOCK_002,
  FUNGI_STRING_001,
  FUNGI_STRING_002,
  FUNGI_CHAR_001,
  FUNGI_CHAR_003,
  FUNGI_BYTE_001,
  FUNGI_BYTE_004,
  FUNGI_INTENT_DIAGNOSTICS,
  FUNGI_BINDING_DIAGNOSTICS,
  FUNGI_PIPELINE_DIAGNOSTICS,
  FUNGI_SYNTAX_DIAGNOSTICS,
  FUNGI_BLOCK_DIAGNOSTICS,
  FUNGI_STRING_DIAGNOSTICS,
  FUNGI_CHAR_DIAGNOSTICS,
  FUNGI_BYTE_DIAGNOSTICS,
  FUNGI_MEMORY_001,
  FUNGI_MEMORY_003,
  FUNGI_MEMORY_005,
  FUNGI_MEMORY_006,
  FUNGI_MEMORY_008,
  FUNGI_MEMORY_DIAGNOSTICS,
  FUNGI_RAWPTR_001,
  FUNGI_RAWPTR_DIAGNOSTICS,
  FUNGI_SAFETY_001,
  FUNGI_SAFETY_002,
  FUNGI_SAFETY_003,
  FUNGI_SAFETY_004,
  FUNGI_SAFETY_005,
  FUNGI_SAFETY_006,
  FUNGI_SAFETY_DIAGNOSTICS,
  FUNGI_SEC_020,
  FUNGI_SEC_021,
} from "../dist/index.js";

describe("galerina-core-compiler syntax safety contracts", () => {
  it("rejects Tri values used directly as branch conditions", () => {
    const result = validateCoreSyntaxSafety({
      file: "branch.fungi",
      text: `
pure flow checkFlow(signal: Tri) -> Bool {
  if signal {
    return true
  }
  return false
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === FUNGI_SAFETY_001.code),
      "Expected FUNGI-SAFETY-001 for Tri branch condition",
    );
  });

  it("rejects implicit Tri, Decision and Bool boundary assignments", () => {
    const result = validateCoreSyntaxSafety({
      file: "assignment.fungi",
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
      result.diagnostics.filter((d) => d.code === FUNGI_SAFETY_002.code).length,
      3,
      "Expected 3 × FUNGI-SAFETY-002 for implicit Tri/Decision/Bool conversions",
    );
  });

  it("rejects non-exhaustive Tri matches", () => {
    const result = validateCoreSyntaxSafety({
      file: "match.fungi",
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
        (d) => d.code === FUNGI_SAFETY_006.code && d.message.includes("Neutral"),
      ),
      "Expected FUNGI-SAFETY-006 mentioning missing Neutral case",
    );
  });

  it("treats unknown_as true as an error in secure flows", () => {
    const result = validateCoreSyntaxSafety({
      file: "secure-policy.fungi",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return tri.toBool(signal, unknown_as: true)
}
`,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.find((d) => d.code === FUNGI_SAFETY_003.code)?.severity,
      "error",
      "Expected FUNGI-SAFETY-003 as error severity in secure flow",
    );
  });

  // ── #153 FAIL-CLOSED: Tri→Bool/Decision with no unknown-state policy ──────────
  it("FAIL-CLOSED: secure-flow Tri.toBool WITHOUT an explicit unknown_as policy is an error", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-nopolicy.fungi",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return Tri.toBool(signal)
}
`,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.find((d) => d.code === FUNGI_SAFETY_003.code)?.severity,
      "error",
      "Expected FUNGI-SAFETY-003 error: HOLD/Neutral must not silently coerce without a declared policy",
    );
  });

  it("FAIL-CLOSED: plain-flow Tri.toDecision without a policy is a warning (not silently accepted)", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-decision-nopolicy.fungi",
      text: `
flow classify(signal: Tri) -> Decision {
  return Tri.toDecision(signal)
}
`,
    });

    assert.equal(
      result.diagnostics.find((d) => d.code === FUNGI_SAFETY_003.code)?.severity,
      "warning",
      "Expected FUNGI-SAFETY-003 warning for an unguarded Tri.toDecision in a plain flow",
    );
  });

  it("accepts Tri.toBool WITH an explicit non-truthy unknown_as policy", () => {
    const result = validateCoreSyntaxSafety({
      file: "tri-policy.fungi",
      text: `
secure flow canAccess(signal: Tri) -> Bool {
  return Tri.toBool(signal, unknown_as: Negative)
}
`,
    });

    assert.ok(
      !result.diagnostics.some((d) => d.code === FUNGI_SAFETY_003.code),
      `Did not expect FUNGI-SAFETY-003 when an explicit unknown_as policy is declared, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("blocks secret literals and unsafe dynamic execution", () => {
    const result = validateCoreSyntaxSafety({
      file: "secrets.fungi",
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
      result.diagnostics.some((d) => d.code === FUNGI_SAFETY_004.code),
      "Expected FUNGI-SAFETY-004 for raw secret literal",
    );
    assert.ok(
      result.diagnostics.some((d) => d.code === FUNGI_SAFETY_005.code),
      "Expected FUNGI-SAFETY-005 for eval() usage",
    );
  });

  it("accepts explicit exhaustive Tri handling", () => {
    const result = validateCoreSyntaxSafety({
      file: "safe.fungi",
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
      file: "bindings.fungi",
      text: `
flow setCount() {
  var count = 0
}
`,
    });

    const constResult = validateCoreSyntaxSafety({
      file: "bindings.fungi",
      text: `
flow setVersion() {
  const VERSION = "1.0.0"
}
`,
    });

    assert.equal(varResult.ok, false);
    assert.ok(
      varResult.diagnostics.some((d) => d.code === FUNGI_SYNTAX_001.code),
      "Expected FUNGI-SYNTAX-001 for var usage",
    );

    assert.equal(constResult.ok, false);
    assert.ok(
      constResult.diagnostics.some((d) => d.code === FUNGI_SYNTAX_002.code),
      "Expected FUNGI-SYNTAX-002 for const usage",
    );
  });

  it("does not flag var/const inside comment lines", () => {
    const result = validateCoreSyntaxSafety({
      file: "comments.fungi",
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

  it("checkBindingReassignment emits FUNGI-BINDING-001 for let, FUNGI-BINDING-002 for readonly, nothing for mut", () => {
    const loc = { file: "test.fungi", line: 5, column: 3 };

    const letDiags = checkBindingReassignment({ bindingKind: "let", bindingName: "count", location: loc });
    const readonlyDiags = checkBindingReassignment({ bindingKind: "readonly", bindingName: "config", location: loc });
    const mutDiags = checkBindingReassignment({ bindingKind: "mut", bindingName: "retries", location: loc });

    assert.ok(letDiags.some((d) => d.code === FUNGI_BINDING_001.code));
    assert.ok(readonlyDiags.some((d) => d.code === FUNGI_BINDING_002.code));
    assert.equal(mutDiags.length, 0);
  });

  it("checkReadonlyMutation emits FUNGI-BINDING-003 only for readonly bindings", () => {
    const loc = { file: "test.fungi", line: 8, column: 5 };

    const readonlyDiags = checkReadonlyMutation({ bindingKind: "readonly", bindingName: "cfg", propertyName: "apiUrl", location: loc });
    const letDiags = checkReadonlyMutation({ bindingKind: "let", bindingName: "user", propertyName: "name", location: loc });

    assert.ok(readonlyDiags.some((d) => d.code === FUNGI_BINDING_003.code));
    assert.equal(letDiags.length, 0);
  });

  it("checkMethodChain returns empty diagnostics (stub — pending type scope)", () => {
    const diags = checkMethodChain({
      receiver: "input",
      calls: [{ methodName: "validate" }, { methodName: "sanitize" }, { methodName: "save" }],
      location: { file: "test.fungi", line: 3, column: 1 },
    });

    assert.equal(diags.length, 0);
  });

  it("diagnostic constant arrays use correct FUNGI-* code prefixes", () => {
    assert.ok(FUNGI_SYNTAX_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-SYNTAX-")));
    assert.ok(FUNGI_BINDING_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-BINDING-")));
    assert.ok(FUNGI_PIPELINE_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-PIPELINE-")));
    assert.ok(FUNGI_INTENT_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-INTENT-")));
    assert.ok(FUNGI_BLOCK_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-BLOCK-")));
    assert.ok(FUNGI_STRING_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-STRING-")));
    assert.ok(FUNGI_CHAR_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-CHAR-")));
    assert.ok(FUNGI_BYTE_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-BYTE-")));
    assert.ok(FUNGI_MEMORY_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-MEMORY-")));
    assert.ok(FUNGI_RAWPTR_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-RAWPTR-")));
    assert.ok(FUNGI_SAFETY_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-SAFETY-")));
  });

  it("accepts a well-formed typed content block without errors", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.fungi",
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

  it("emits FUNGI-BLOCK-001 for an unknown content block type", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.fungi",
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
      result.diagnostics.some((d) => d.code === FUNGI_BLOCK_001.code),
      "Expected FUNGI-BLOCK-001 for unknown block type",
    );
  });

  it("emits FUNGI-BLOCK-002 for an unclosed typed content block", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.fungi",
      text: `
flow renderPage() -> Html {
  html <<PAGE
    <div>This block is never closed.
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === FUNGI_BLOCK_002.code),
      "Expected FUNGI-BLOCK-002 for unclosed content block",
    );
  });

  it("does not flag var/const keywords found inside a typed content block", () => {
    const result = validateCoreSyntaxSafety({
      file: "content.fungi",
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
      file: "test.fungi",
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
    assert.equal(FUNGI_STRING_001.code, "FUNGI-STRING-001");
    assert.equal(FUNGI_STRING_001.name, "INVALID_UTF8_DECODE");
    assert.equal(FUNGI_STRING_002.code, "FUNGI-STRING-002");
    assert.equal(FUNGI_STRING_002.name, "SECRET_STORED_AS_STRING");
    assert.equal(FUNGI_STRING_002.severity, "error");

    // Char
    assert.equal(FUNGI_CHAR_001.code, "FUNGI-CHAR-001");
    assert.equal(FUNGI_CHAR_001.name, "CHAR_BYTE_CONFUSION");
    assert.equal(FUNGI_CHAR_003.code, "FUNGI-CHAR-003");
    assert.equal(FUNGI_CHAR_003.name, "MULTI_CHAR_LITERAL");

    // Byte
    assert.equal(FUNGI_BYTE_001.code, "FUNGI-BYTE-001");
    assert.equal(FUNGI_BYTE_001.name, "BYTE_OUT_OF_RANGE");
    assert.equal(FUNGI_BYTE_004.code, "FUNGI-BYTE-004");
    assert.equal(FUNGI_BYTE_004.name, "RAW_BYTES_LOGGED");

    // All String/Char/Byte constants are severity "error" except FUNGI_STRING_004 (warning)
    assert.ok(FUNGI_STRING_DIAGNOSTICS.filter((d) => d.severity === "error").length === 3);
    assert.ok(FUNGI_CHAR_DIAGNOSTICS.every((d) => d.severity === "error"));
    assert.ok(FUNGI_BYTE_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("Memory diagnostic constants carry correct codes, names, and are all errors", () => {
    // Spot-check individual constants
    assert.equal(FUNGI_MEMORY_001.code, "FUNGI-MEMORY-001");
    assert.equal(FUNGI_MEMORY_001.name, "USE_AFTER_MOVE");
    assert.equal(FUNGI_MEMORY_001.severity, "error");

    assert.equal(FUNGI_MEMORY_003.code, "FUNGI-MEMORY-003");
    assert.equal(FUNGI_MEMORY_003.name, "BORROW_ESCAPES_SCOPE");

    assert.equal(FUNGI_MEMORY_005.code, "FUNGI-MEMORY-005");
    assert.equal(FUNGI_MEMORY_005.name, "MUTABLE_ALIAS");

    assert.equal(FUNGI_MEMORY_006.code, "FUNGI-MEMORY-006");
    assert.equal(FUNGI_MEMORY_006.name, "BOUNDS_VIOLATION");

    assert.equal(FUNGI_MEMORY_008.code, "FUNGI-MEMORY-008");
    assert.equal(FUNGI_MEMORY_008.name, "UNSAFE_MEMORY_REQUIRES_FALLBACK");

    // Array completeness and uniformity
    assert.equal(FUNGI_MEMORY_DIAGNOSTICS.length, 8);
    assert.ok(FUNGI_MEMORY_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-MEMORY-")));
    assert.ok(FUNGI_MEMORY_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("Safety diagnostic constants carry correct codes and names (FUNGI-SAFETY-* series)", () => {
    assert.equal(FUNGI_SAFETY_001.code, "FUNGI-SAFETY-001");
    assert.equal(FUNGI_SAFETY_001.name, "TRI_BRANCH_CONDITION");
    assert.equal(FUNGI_SAFETY_001.severity, "error");

    assert.equal(FUNGI_SAFETY_002.code, "FUNGI-SAFETY-002");
    assert.equal(FUNGI_SAFETY_002.name, "UNSAFE_LOGIC_ASSIGNMENT");

    assert.equal(FUNGI_SAFETY_003.code, "FUNGI-SAFETY-003");
    assert.equal(FUNGI_SAFETY_003.name, "TRI_UNKNOWN_AS_TRUE");

    assert.equal(FUNGI_SAFETY_004.code, "FUNGI-SAFETY-004");
    assert.equal(FUNGI_SAFETY_004.name, "SECRET_LITERAL");

    assert.equal(FUNGI_SAFETY_005.code, "FUNGI-SAFETY-005");
    assert.equal(FUNGI_SAFETY_005.name, "UNSAFE_DYNAMIC_CODE");

    assert.equal(FUNGI_SAFETY_006.code, "FUNGI-SAFETY-006");
    assert.equal(FUNGI_SAFETY_006.name, "TRI_MATCH_NOT_EXHAUSTIVE");

    assert.equal(FUNGI_SAFETY_DIAGNOSTICS.length, 6);
    assert.ok(FUNGI_SAFETY_DIAGNOSTICS.every((d) => d.code.startsWith("FUNGI-SAFETY-")));
    assert.ok(FUNGI_SAFETY_DIAGNOSTICS.every((d) => d.severity === "error"));
  });

  it("FUNGI_SEC_020 has code FUNGI-SEC-020, name RuntimeMutation, severity error, and suggestedFix", () => {
    assert.equal(FUNGI_SEC_020.code, "FUNGI-SEC-020");
    assert.equal(FUNGI_SEC_020.name, "RuntimeMutation");
    assert.equal(FUNGI_SEC_020.severity, "error");
    assert.ok(typeof FUNGI_SEC_020.message === "string" && FUNGI_SEC_020.message.length > 0);
    assert.ok(typeof FUNGI_SEC_020.suggestedFix === "string" && FUNGI_SEC_020.suggestedFix.length > 0);
  });

  it("FUNGI_SEC_021 has code FUNGI-SEC-021, name PrototypeMutation, severity error, and suggestedFix", () => {
    assert.equal(FUNGI_SEC_021.code, "FUNGI-SEC-021");
    assert.equal(FUNGI_SEC_021.name, "PrototypeMutation");
    assert.equal(FUNGI_SEC_021.severity, "error");
    assert.ok(typeof FUNGI_SEC_021.message === "string" && FUNGI_SEC_021.message.length > 0);
    assert.ok(typeof FUNGI_SEC_021.suggestedFix === "string" && FUNGI_SEC_021.suggestedFix.length > 0);
  });

  it("FUNGI_SEC_020 and FUNGI_SEC_021 are exported from dist/index.js", () => {
    // Verified by the fact that this test file imported them without error.
    assert.ok(FUNGI_SEC_020 !== undefined, "FUNGI_SEC_020 must be exported");
    assert.ok(FUNGI_SEC_021 !== undefined, "FUNGI_SEC_021 must be exported");
  });

  it("diagnostic constants export complete arrays check — including FUNGI-SAFETY-* and FUNGI-RAWPTR-*", () => {
    assert.equal(FUNGI_SYNTAX_DIAGNOSTICS.length, 6); // 2 original + 4 new (006-009)
    assert.equal(FUNGI_BINDING_DIAGNOSTICS.length, 6); // 4 original + FUNGI-BINDING-005 + FUNGI-BINDING-006 (Phase 11A.2)
    assert.equal(FUNGI_PIPELINE_DIAGNOSTICS.length, 5);
    assert.equal(FUNGI_INTENT_DIAGNOSTICS.length, 5);
    assert.equal(FUNGI_BLOCK_DIAGNOSTICS.length, 4);
    assert.equal(FUNGI_STRING_DIAGNOSTICS.length, 4);
    assert.equal(FUNGI_CHAR_DIAGNOSTICS.length, 4);
    assert.equal(FUNGI_BYTE_DIAGNOSTICS.length, 5);
    assert.equal(FUNGI_MEMORY_DIAGNOSTICS.length, 8);
    assert.equal(FUNGI_SAFETY_DIAGNOSTICS.length, 6);
    assert.equal(FUNGI_RAWPTR_DIAGNOSTICS.length, 1);
    assert.equal(FUNGI_RAWPTR_001.code, "FUNGI-RAWPTR-001");
    assert.equal(FUNGI_RAWPTR_001.name, "RAW_POINTER_OUTSIDE_UNSAFE");
    assert.equal(FUNGI_RAWPTR_001.severity, "error");
  });

  // ── Phase 3 scanner-level memory rules ───────────────────────────────────

  it("rejects mut binding declared inside a pure flow — FUNGI-BINDING-004", () => {
    const result = validateCoreSyntaxSafety({
      file: "pure-mut.fungi",
      text: `
pure flow accumulateValues(items: Array<Int>) -> Int {
  mut total: Int = 0
  return total
}
`,
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.diagnostics.some((d) => d.code === FUNGI_BINDING_004.code),
      "Expected FUNGI-BINDING-004 for mut in pure flow",
    );
  });

  it("allows mut binding in non-pure flows — no FUNGI-BINDING-004", () => {
    const result = validateCoreSyntaxSafety({
      file: "guarded-mut.fungi",
      text: `
guarded flow buildPayload(items: Array<String>) -> Array<String> {
  mut result: Array<String> = []
  return result
}
`,
    });

    assert.equal(result.ok, true);
    assert.ok(
      !result.diagnostics.some((d) => d.code === FUNGI_BINDING_004.code),
      "Should not emit FUNGI-BINDING-004 outside pure flow",
    );
  });

  it("checkMutInPureContext emits FUNGI-BINDING-004 for pure flows and nothing otherwise", () => {
    const loc = { file: "test.fungi", line: 4, column: 3 };

    const pureDiags = checkMutInPureContext({ flowSafetyLevel: "pure", bindingName: "counter", location: loc });
    const guardedDiags = checkMutInPureContext({ flowSafetyLevel: "guarded", bindingName: "counter", location: loc });
    const safeDiags = checkMutInPureContext({ flowSafetyLevel: "safe", bindingName: "counter", location: loc });

    assert.ok(pureDiags.some((d) => d.code === FUNGI_BINDING_004.code), "Expected FUNGI-BINDING-004 for pure");
    assert.equal(guardedDiags.length, 0, "No diagnostic for guarded");
    assert.equal(safeDiags.length, 0, "No diagnostic for safe");
  });

  it("rejects unsafe block without reason declaration — FUNGI-MEMORY-008", () => {
    const result = validateCoreSyntaxSafety({
      file: "unsafe-no-reason.fungi",
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
      result.diagnostics.some((d) => d.code === FUNGI_MEMORY_008.code),
      "Expected FUNGI-MEMORY-008 for unsafe block without reason",
    );
  });

  it("accepts unsafe block with reason declaration — no FUNGI-MEMORY-008", () => {
    const result = validateCoreSyntaxSafety({
      file: "unsafe-with-reason.fungi",
      text: `
flow copyBuffer() -> Result<Void, String> {
  unsafe block copyRaw reason "DMA requires direct pointer access" fallback safeMemcopy {
    return Ok(Void)
  }
}
`,
    });

    assert.ok(
      !result.diagnostics.some((d) => d.code === FUNGI_MEMORY_008.code),
      "Should not emit FUNGI-MEMORY-008 when reason is present",
    );
  });
});
