// =============================================================================
// domain-boolean-logic.test.mjs
//
// Comprehensive tests for Galerina boolean logic syntax — real-world patterns.
// Tests cover: Bool literals, boolean operators (&&/||/!), readable forms
// (and/or/unless/is), comparisons, if statements, match on Bool,
// Bool in Option/Result, and Bool in flow params/returns.
//
// Uses parseProgram for zero-error parse checks and checkTypes for type checks.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parse(src) {
  return parseProgram(src, "test.spore");
}

function check(src) {
  const p = parse(src);
  return checkTypes(p.ast);
}

function noErrors(result) {
  return result.diagnostics.filter((d) => d.severity === "error");
}

function assertNoParseErrors(src, label) {
  const result = parse(src);
  const errors = noErrors(result);
  assert.equal(
    errors.length,
    0,
    `${label ?? "Expected no parse errors"}, got:\n${errors.map((e) => `  ${e.code ?? ""}: ${e.message}`).join("\n")}`,
  );
  return result;
}

function assertNoTypeErrors(src, label) {
  const result = check(src);
  const errors = noErrors(result);
  assert.equal(
    errors.length,
    0,
    `${label ?? "Expected no type errors"}, got:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join("\n")}`,
  );
  return result;
}

function findNode(node, kind) {
  if (node === undefined) return undefined;
  if (node.kind === kind) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findNodeWhere(node, pred) {
  if (node === undefined) return undefined;
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNodeWhere(child, pred);
    if (found !== undefined) return found;
  }
  return undefined;
}

// =============================================================================
// 1. Basic boolean literals and Bool type
// =============================================================================

describe("Bool — basic literals and type annotation", () => {
  it("true literal parses inside a pure flow with no errors", () => {
    assertNoParseErrors(
      `pure flow isEnabled() -> Bool {
  let flag: Bool = true
  return flag
}`,
      "true literal in let binding",
    );
  });

  it("false literal parses inside a pure flow with no errors", () => {
    assertNoParseErrors(
      `pure flow isDisabled() -> Bool {
  let flag: Bool = false
  return flag
}`,
      "false literal in let binding",
    );
  });

  it("true literal produces a boolLiteral AST node with value 'true'", () => {
    const result = parse(`pure flow test() -> Bool {
  return true
}`);
    const node = findNode(result.ast, "boolLiteral");
    assert.ok(node !== undefined, "Expected boolLiteral node");
    assert.equal(node.value, "true");
  });

  it("false literal produces a boolLiteral AST node with value 'false'", () => {
    const result = parse(`pure flow test() -> Bool {
  return false
}`);
    const node = findNode(result.ast, "boolLiteral");
    assert.ok(node !== undefined, "Expected boolLiteral node");
    assert.equal(node.value, "false");
  });

  it("Bool is accepted as a parameter type without type errors", () => {
    assertNoTypeErrors(
      `pure flow check(isActive: Bool) -> Bool {
  return isActive
}`,
      "Bool parameter type",
    );
  });

  it("Bool is accepted as a return type without type errors", () => {
    assertNoTypeErrors(
      `pure flow alwaysTrue() -> Bool {
  return true
}`,
      "Bool return type",
    );
  });

  it("Bool as mut binding parses without errors in guarded flow", () => {
    assertNoParseErrors(
      `guarded flow toggle(initial: Bool) -> Bool
contract { effects { state.write } }
{
  mut current: Bool = initial
  current = false
  return current
}`,
      "mut Bool binding",
    );
  });
});

// =============================================================================
// 2. Boolean operators: &&, ||, !
// =============================================================================

describe("Bool — symbolic operators &&, ||, !", () => {
  it("&& operator parses correctly in a return expression", () => {
    const result = assertNoParseErrors(
      `pure flow both(a: Bool, b: Bool) -> Bool {
  return a && b
}`,
      "&& operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.ok(node !== undefined, "Expected binaryExpr node with value '&&'");
  });

  it("|| operator parses correctly in a return expression", () => {
    const result = assertNoParseErrors(
      `pure flow either(a: Bool, b: Bool) -> Bool {
  return a || b
}`,
      "|| operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(node !== undefined, "Expected binaryExpr node with value '||'");
  });

  it("! prefix operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow negate(flag: Bool) -> Bool {
  return !flag
}`,
      "! prefix operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "unaryExpr" && n.value === "!");
    assert.ok(node !== undefined, "Expected unaryExpr node with value '!'");
  });

  it("chained && and || respect precedence — && binds tighter", () => {
    const result = assertNoParseErrors(
      `pure flow precedence(a: Bool, b: Bool, c: Bool) -> Bool {
  return a || b && c
}`,
      "|| and && precedence",
    );
    // Top-level should be || (looser binding)
    const orNode = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(orNode !== undefined, "Expected top-level || node");
    const andNode = orNode?.children?.[1];
    assert.equal(andNode?.kind, "binaryExpr");
    assert.equal(andNode?.value, "&&");
  });

  it("double negation !!flag parses as nested unaryExpr nodes", () => {
    const result = assertNoParseErrors(
      `pure flow doubleNeg(flag: Bool) -> Bool {
  return !!flag
}`,
      "double negation",
    );
    const outer = findNodeWhere(result.ast, (n) => n.kind === "unaryExpr" && n.value === "!");
    assert.ok(outer !== undefined, "Expected outer unaryExpr");
    assert.equal(outer?.children?.[0]?.kind, "unaryExpr");
    assert.equal(outer?.children?.[0]?.value, "!");
  });

  it("complex boolean expression with && and || and ! parses without errors", () => {
    assertNoParseErrors(
      `pure flow complex(a: Bool, b: Bool, c: Bool) -> Bool {
  return (a && !b) || c
}`,
      "complex boolean expression",
    );
  });
});

// =============================================================================
// 3. Readable forms: and, or, unless, is not
// =============================================================================

describe("Bool — readable forms: and, or, unless, is not", () => {
  it("'a and b' parses to binaryExpr with value '&&' and readableForm 'and'", () => {
    const result = assertNoParseErrors(
      `pure flow bothReadable(a: Bool, b: Bool) -> Bool {
  return a and b
}`,
      "'and' readable form",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.ok(node !== undefined, "Expected binaryExpr '&&' node");
    assert.equal(node.readableForm, "and");
  });

  it("'a or b' parses to binaryExpr with value '||' and readableForm 'or'", () => {
    const result = assertNoParseErrors(
      `pure flow eitherReadable(a: Bool, b: Bool) -> Bool {
  return a or b
}`,
      "'or' readable form",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(node !== undefined, "Expected binaryExpr '||' node");
    assert.equal(node.readableForm, "or");
  });

  it("'unless condition {}' parses as ifStmt with negated condition", () => {
    const result = assertNoParseErrors(
      `pure flow guardedReturn(flag: Bool) -> Bool {
  unless flag {
    return false
  }
  return true
}`,
      "unless statement",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    assert.equal(ifNode.value, "unless");
    assert.equal(ifNode.readableForm, "unless");
    const negated = ifNode.children?.[0];
    assert.equal(negated?.kind, "unaryExpr");
    assert.equal(negated?.value, "!");
  });

  it("'unless' with else branch parses correctly with 3 children", () => {
    const result = assertNoParseErrors(
      `pure flow toggleGuard(flag: Bool) -> Bool {
  unless flag {
    return true
  } else {
    return false
  }
  return flag
}`,
      "unless with else",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    assert.equal(ifNode.children?.length, 3);
  });

  it("'a is not b' parses to binaryExpr with value '!=' and readableForm 'is not'", () => {
    const result = assertNoParseErrors(
      `pure flow checkNotEqual(a: Bool, b: Bool) -> Bool {
  return a is not b
}`,
      "'is not' readable form",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "!=");
    assert.ok(node !== undefined, "Expected binaryExpr '!=' node");
    assert.equal(node.readableForm, "is not");
  });

  it("mixed 'and'/'or' readable forms with correct precedence", () => {
    const result = assertNoParseErrors(
      `pure flow mixedReadable(a: Bool, b: Bool, c: Bool) -> Bool {
  return a and b or c
}`,
      "mixed and/or precedence",
    );
    // 'a and b or c' should parse as (a && b) || c — || at top
    const orNode = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(orNode !== undefined, "Expected top-level || node");
    const andNode = orNode?.children?.[0];
    assert.equal(andNode?.value, "&&");
    assert.equal(andNode?.readableForm, "and");
  });
});

// =============================================================================
// 4. Comparisons: ==, !=, >, <, >=, <=
// =============================================================================

describe("Bool — symbolic comparison operators", () => {
  it("== operator parses in a condition and produces binaryExpr", () => {
    const result = assertNoParseErrors(
      `pure flow exactMatch(a: Int, b: Int) -> Bool {
  return a == b
}`,
      "== operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "==");
    assert.ok(node !== undefined, "Expected binaryExpr '==' node");
  });

  it("!= operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow notEqual(a: Int, b: Int) -> Bool {
  return a != b
}`,
      "!= operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "!=");
    assert.ok(node !== undefined, "Expected binaryExpr '!=' node");
  });

  it("> operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow greater(x: Int, y: Int) -> Bool {
  return x > y
}`,
      "> operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">");
    assert.ok(node !== undefined, "Expected binaryExpr '>' node");
  });

  it("< operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow lesser(x: Int, y: Int) -> Bool {
  return x < y
}`,
      "< operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<");
    assert.ok(node !== undefined, "Expected binaryExpr '<' node");
  });

  it(">= operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow atLeast(x: Int, min: Int) -> Bool {
  return x >= min
}`,
      ">= operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">=");
    assert.ok(node !== undefined, "Expected binaryExpr '>=' node");
  });

  it("<= operator parses correctly", () => {
    const result = assertNoParseErrors(
      `pure flow atMost(x: Int, max: Int) -> Bool {
  return x <= max
}`,
      "<= operator",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<=");
    assert.ok(node !== undefined, "Expected binaryExpr '<=' node");
  });

  it("comparison combined with && operator parses correctly", () => {
    assertNoParseErrors(
      `pure flow inRange(x: Int, min: Int, max: Int) -> Bool {
  return x >= min && x <= max
}`,
      "comparison with &&",
    );
  });
});

// =============================================================================
// 5. Readable comparisons: is greater than, is less than, is not
// =============================================================================

describe("Bool — readable comparison forms", () => {
  it("'x is greater than y' parses to binaryExpr '>' with correct readableForm", () => {
    const result = assertNoParseErrors(
      `pure flow readableGreater(age: Int, limit: Int) -> Bool {
  return age is greater than limit
}`,
      "'is greater than'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">");
    assert.ok(node !== undefined, "Expected binaryExpr '>' node");
    assert.equal(node.readableForm, "is greater than");
  });

  it("'x is less than y' parses to binaryExpr '<'", () => {
    const result = assertNoParseErrors(
      `pure flow readableLess(age: Int, limit: Int) -> Bool {
  return age is less than limit
}`,
      "'is less than'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<");
    assert.ok(node !== undefined, "Expected binaryExpr '<' node");
    assert.equal(node.readableForm, "is less than");
  });

  it("'x is greater than or equal to y' parses to binaryExpr '>='", () => {
    const result = assertNoParseErrors(
      `pure flow readableGte(score: Int, threshold: Int) -> Bool {
  return score is greater than or equal to threshold
}`,
      "'is greater than or equal to'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">=");
    assert.ok(node !== undefined, "Expected binaryExpr '>=' node");
    assert.equal(node.readableForm, "is greater than or equal to");
  });

  it("'x is less than or equal to y' parses to binaryExpr '<='", () => {
    const result = assertNoParseErrors(
      `pure flow readableLte(score: Int, cap: Int) -> Bool {
  return score is less than or equal to cap
}`,
      "'is less than or equal to'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<=");
    assert.ok(node !== undefined, "Expected binaryExpr '<=' node");
    assert.equal(node.readableForm, "is less than or equal to");
  });

  it("'x is not y' parses to binaryExpr '!=' with readableForm 'is not'", () => {
    const result = assertNoParseErrors(
      `pure flow readableNotEq(status: Int, expected: Int) -> Bool {
  return status is not expected
}`,
      "'is not' readable comparison",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "!=");
    assert.ok(node !== undefined, "Expected binaryExpr '!=' node");
    assert.equal(node.readableForm, "is not");
  });

  it("'x is equal to y' parses to binaryExpr '==' with readableForm 'is equal to'", () => {
    const result = assertNoParseErrors(
      `pure flow readableEq(a: Int, b: Int) -> Bool {
  return a is equal to b
}`,
      "'is equal to'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "==");
    assert.ok(node !== undefined, "Expected binaryExpr '==' node");
    assert.equal(node.readableForm, "is equal to");
  });

  it("'x is not greater than y' parses to binaryExpr '<=' with readableForm 'is not greater than'", () => {
    const result = assertNoParseErrors(
      `pure flow readableNotGt(x: Int, y: Int) -> Bool {
  return x is not greater than y
}`,
      "'is not greater than'",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<=");
    assert.ok(node !== undefined, "Expected binaryExpr '<=' node");
    assert.equal(node.readableForm, "is not greater than");
  });
});

// =============================================================================
// 6. Real-world if statements
// =============================================================================

describe("Bool — real-world if statements", () => {
  it("if isActive { } parses as ifStmt with identifier condition", () => {
    const result = assertNoParseErrors(
      `flow checkActive(isActive: Bool) -> String {
  if isActive {
    return "active"
  }
  return "inactive"
}`,
      "if isActive condition",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    const condition = ifNode.children?.[0];
    assert.equal(condition?.kind, "identifier");
    assert.equal(condition?.value, "isActive");
  });

  it("if age > 18 { } parses as ifStmt with binaryExpr condition", () => {
    const result = assertNoParseErrors(
      `flow isAdult(age: Int) -> Bool {
  if age > 18 {
    return true
  }
  return false
}`,
      "if age > 18",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    const condition = ifNode.children?.[0];
    assert.equal(condition?.kind, "binaryExpr");
    assert.equal(condition?.value, ">");
  });

  it("if/else structure parses with 3 children on ifStmt", () => {
    const result = assertNoParseErrors(
      `flow classify(score: Int) -> String {
  if score >= 50 {
    return "pass"
  } else {
    return "fail"
  }
}`,
      "if/else with comparison",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    assert.equal(ifNode.children?.length, 3);
  });

  it("if with && compound condition parses correctly", () => {
    assertNoParseErrors(
      `flow canAccess(isActive: Bool, age: Int) -> Bool {
  if isActive && age >= 18 {
    return true
  }
  return false
}`,
      "if with && compound condition",
    );
  });

  it("if with || compound condition parses correctly", () => {
    assertNoParseErrors(
      `flow hasPermission(isAdmin: Bool, isOwner: Bool) -> Bool {
  if isAdmin || isOwner {
    return true
  }
  return false
}`,
      "if with || compound condition",
    );
  });

  it("if with negated condition !flag parses correctly", () => {
    const result = assertNoParseErrors(
      `flow skipIfDisabled(enabled: Bool) -> Bool {
  if !enabled {
    return false
  }
  return true
}`,
      "if with ! condition",
    );
    const ifNode = findNode(result.ast, "ifStmt");
    const condition = ifNode?.children?.[0];
    assert.equal(condition?.kind, "unaryExpr");
    assert.equal(condition?.value, "!");
  });

  it("nested if statements parse without errors", () => {
    assertNoParseErrors(
      `flow multiCheck(a: Bool, b: Bool, score: Int) -> String {
  if a {
    if b {
      return "both"
    }
    return "only a"
  }
  return "neither"
}`,
      "nested if statements",
    );
  });
});

// =============================================================================
// 7. match on Bool
// =============================================================================

describe("Bool — match expressions on Bool values", () => {
  it("match on a Bool variable parses without errors", () => {
    assertNoParseErrors(
      `flow describe(flag: Bool) -> String {
  match flag {
    true => {
      return "yes"
    }
    false => {
      return "no"
    }
    _ => {
      return "unknown"
    }
  }
}`,
      "match on Bool",
    );
  });

  it("match on Bool produces a matchExpr AST node", () => {
    const result = parse(`flow describe(flag: Bool) -> String {
  match flag {
    true => {
      return "yes"
    }
    false => {
      return "no"
    }
    _ => {
      return "other"
    }
  }
}`);
    const node = findNode(result.ast, "matchExpr");
    assert.ok(node !== undefined, "Expected matchExpr node");
  });

  it("match on Bool has correct arm patterns (true, false, _)", () => {
    const result = parse(`flow describe(flag: Bool) -> String {
  match flag {
    true => {
      return "yes"
    }
    false => {
      return "no"
    }
    _ => {
      return "other"
    }
  }
}`);
    const matchNode = findNode(result.ast, "matchExpr");
    const arms = matchNode?.children?.filter((c) => c.kind === "matchArm");
    assert.ok(arms !== undefined && arms.length >= 2, "Expected at least 2 match arms");
    const patterns = arms.map((a) => a.value);
    assert.ok(patterns.includes("true"), "Expected 'true' arm pattern");
    assert.ok(patterns.includes("false"), "Expected 'false' arm pattern");
  });

  it("match on Bool literal expression parses without errors", () => {
    assertNoParseErrors(
      `flow alwaysYes() -> String {
  match true {
    true => {
      return "yes"
    }
    _ => {
      return "no"
    }
  }
}`,
      "match on true literal",
    );
  });

  it("match on Bool comparison result parses without errors", () => {
    assertNoParseErrors(
      `flow checkThreshold(score: Int, threshold: Int) -> String {
  let passed: Bool = score >= threshold
  match passed {
    true => {
      return "passed"
    }
    false => {
      return "failed"
    }
    _ => {
      return "unknown"
    }
  }
}`,
      "match on Bool from comparison",
    );
  });
});

// =============================================================================
// 8. Bool in Option<Bool>
// =============================================================================

describe("Bool — Bool inside Option<Bool>", () => {
  it("Option<Bool> as parameter type parses without type errors", () => {
    assertNoTypeErrors(
      `flow checkOptional(maybeFlag: Option<Bool>) -> Bool {
  return false
}`,
      "Option<Bool> parameter",
    );
  });

  it("Option<Bool> as return type parses without parse errors", () => {
    assertNoParseErrors(
      `flow getOptionalFlag(active: Bool) -> Option<Bool> {
  return active
}`,
      "Option<Bool> return type",
    );
  });

  it("match on Option<Bool> with Some and None arms parses without errors", () => {
    assertNoParseErrors(
      `flow handleOptBool(maybeFlag: Option<Bool>) -> Bool {
  match maybeFlag {
    Some(val) => {
      return val
    }
    None => {
      return false
    }
    _ => {
      return false
    }
  }
}`,
      "match on Option<Bool>",
    );
  });

  it("Option<Bool> let binding parses without errors", () => {
    assertNoParseErrors(
      `flow processOpt(input: Bool) -> Bool {
  let result: Option<Bool> = input
  return input
}`,
      "let binding with Option<Bool>",
    );
  });

  it("Option<Bool> in a record type context parses without errors", () => {
    assertNoTypeErrors(
      `flow processRecord(hasFeature: Option<Bool>, fallback: Bool) -> Bool {
  return fallback
}`,
      "Option<Bool> alongside Bool",
    );
  });
});

// =============================================================================
// 9. Bool in Result<Bool, Error>
// =============================================================================

describe("Bool — Bool inside Result<Bool, Error>", () => {
  it("Result<Bool, Error> as return type parses without type errors", () => {
    assertNoTypeErrors(
      `flow validateFlag(flag: Bool) -> Result<Bool, Error> {
  return Ok(flag)
}`,
      "Result<Bool, Error> return type",
    );
  });

  it("Result<Bool, String> as parameter type parses without errors", () => {
    assertNoParseErrors(
      `flow handleResult(res: Result<Bool, String>) -> Bool {
  return false
}`,
      "Result<Bool, String> parameter",
    );
  });

  it("match on Result<Bool, Error> parses correctly", () => {
    assertNoParseErrors(
      `flow unwrapResult(res: Result<Bool, Error>) -> Bool {
  match res {
    Ok(val) => {
      return val
    }
    Err(e) => {
      return false
    }
    _ => {
      return false
    }
  }
}`,
      "match on Result<Bool, Error>",
    );
  });

  it("? error propagation on Result<Bool, Error> parses without errors", () => {
    assertNoParseErrors(
      `flow propagateResult(res: Result<Bool, Error>) -> Result<Bool, Error> {
  let val: Bool = res?
  return Ok(val)
}`,
      "error propagation on Result<Bool, Error>",
    );
  });

  it("Result<Bool, Error> let binding parses without errors", () => {
    assertNoParseErrors(
      `flow computeResult(a: Bool, b: Bool) -> Result<Bool, Error> {
  let combined: Bool = a && b
  return Ok(combined)
}`,
      "Result<Bool, Error> combined with &&",
    );
  });

  it("nested Result with Bool parses without errors", () => {
    assertNoParseErrors(
      `flow nestedResult(x: Int) -> Result<Bool, Error> {
  let isPositive: Bool = x > 0
  return Ok(isPositive)
}`,
      "nested Result with Bool from comparison",
    );
  });
});

// =============================================================================
// 10. Bool in flow params and returns (real-world patterns)
// =============================================================================

describe("Bool — Bool in flow signatures (params and returns)", () => {
  it("pure flow with multiple Bool params parses without errors", () => {
    assertNoParseErrors(
      `pure flow allTrue(a: Bool, b: Bool, c: Bool) -> Bool {
  return a && b && c
}`,
      "multiple Bool params",
    );
  });

  it("secure flow with Bool param parses without errors", () => {
    assertNoParseErrors(
      `secure flow authorise(isAdmin: Bool, readonly request: Request) -> Result<Bool, Error>
contract { effects { audit.write } }
{
  return Ok(isAdmin)
}`,
      "secure flow with Bool param",
    );
  });

  it("guarded flow returning Bool parses without errors", () => {
    assertNoParseErrors(
      `guarded flow toggleFeature(enabled: Bool) -> Bool
contract { effects { state.write } }
{
  return !enabled
}`,
      "guarded flow returning Bool",
    );
  });

  it("flow with Bool and non-Bool params parses without errors", () => {
    assertNoParseErrors(
      `flow eligibilityCheck(age: Int, isVerified: Bool, score: Float) -> Bool {
  if !isVerified {
    return false
  }
  return age >= 18 && score > 0.5
}`,
      "mixed param types with Bool logic",
    );
  });

  it("flow using Bool readable form in return passes parse check", () => {
    assertNoParseErrors(
      `pure flow accessGranted(hasRole: Bool, isActive: Bool) -> Bool {
  return hasRole and isActive
}`,
      "Bool flow using 'and' readable form",
    );
  });

  it("flow with Bool in unless guard parses without errors", () => {
    assertNoParseErrors(
      `flow safeProcess(enabled: Bool, value: Int) -> Int {
  unless enabled {
    return 0
  }
  return value
}`,
      "Bool in unless guard in flow",
    );
  });

  it("pure flow chaining Bool comparisons with 'and' readable form", () => {
    assertNoParseErrors(
      `pure flow rangeCheck(x: Int, lo: Int, hi: Int) -> Bool {
  return x >= lo and x <= hi
}`,
      "Bool comparison chain with 'and'",
    );
  });

  it("flow returning Bool from 'is greater than' readable comparison", () => {
    const result = assertNoParseErrors(
      `pure flow isOldEnough(age: Int) -> Bool {
  return age is greater than 17
}`,
      "Bool from readable comparison in flow",
    );
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">");
    assert.ok(node !== undefined, "Expected binaryExpr '>' from 'is greater than'");
    assert.equal(node.readableForm, "is greater than");
  });
});
