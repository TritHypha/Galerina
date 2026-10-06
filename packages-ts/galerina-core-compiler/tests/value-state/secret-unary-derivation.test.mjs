import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkTypes, checkValueStates } from "../../dist/index.js";

// RD-1413--1415: unary operations are not declassification boundaries.
// Exercise Fungi source through the real bootstrap parser/checkers. These tests
// establish compiler diagnostics only, not runtime erasure or host isolation.
function check(expression, declarations = "") {
  const source = `@version 1
secure flow probe(key: SecureString) -> Int {
  ${declarations}
  let derived = ${expression}
  print(derived)
  return 0
}`;
  const parsed = parseProgram(source, "secret-unary-derivation.fungi");
  assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
  const types = checkTypes(parsed.ast);
  assert.deepEqual(types.diagnostics, [], "independent type errors must not mask the check");
  return checkValueStates(parsed.ast, "production").diagnostics;
}

function checkBody(body) {
  const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Int {
  ${body}
  return 0
}`;
  const parsed = parseProgram(source, "secret-control-flow-derivation.fungi");
  assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
  const types = checkTypes(parsed.ast);
  assert.deepEqual(types.diagnostics, [], "independent type errors must not mask the check");
  return checkValueStates(parsed.ast, "production").diagnostics;
}

describe("Fungi secret derivation through unary operations", () => {
  it("fails closed when an unrecognized expression node has no traversable children", () => {
    const source = `@version 1
secure flow probe(key: SecureString) -> Int {
  let derived = true
  print(derived)
  return 0
}`;
    const parsed = parseProgram(source, "unknown-secret-expression.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    const types = checkTypes(parsed.ast);
    assert.deepEqual(types.diagnostics, []);

    const replacePublicLiteral = (node) => {
      if (node.kind === "boolLiteral") return { ...node, kind: "futureSecretExpression" };
      return {
        ...node,
        ...(node.children === undefined ? {} : { children: node.children.map(replacePublicLiteral) }),
      };
    };
    const evolvedAst = replacePublicLiteral(parsed.ast);
    const diagnostics = checkValueStates(evolvedAst, "production").diagnostics;
    assert.ok(
      diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `an unclassified future expression must not silently become public: ${JSON.stringify(diagnostics)}`,
    );
  });

  it("fails closed for an unrecognized expression passed directly to a logging sink", () => {
    const parsed = parseProgram(`@version 1
secure flow probe(key: SecureString) -> Int {
  print(true)
  return 0
}`, "unknown-secret-sink.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const replacePublicLiteral = (node) => ({
      ...node,
      ...(node.kind === "boolLiteral" ? { kind: "futureSecretExpression" } : {}),
      ...(node.children === undefined ? {} : { children: node.children.map(replacePublicLiteral) }),
    });
    const diagnostics = checkValueStates(replacePublicLiteral(parsed.ast), "production").diagnostics;
    assert.ok(
      diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `unknown values must not bypass the sink-specific traversal: ${JSON.stringify(diagnostics)}`,
    );
  });

  for (const expression of [
    "1",
    "true",
    "'x'",
    "requirement { true }",
    "match flag { _ => { fn unused() -> Int { return 0 }\n0 } }",
    "match flag { _ => { for item in [1] {}\n0 } }",
  ]) {
    it(`keeps the reviewed public literal ${expression} public`, () => {
      assert.deepEqual(check(expression), []);
    });
  }

  for (const expression of ["key", "!key", "!!key"]) {
    it(`refuses logging a secret-derived binding from ${expression}`, () => {
      const diagnostics = check(expression);
      assert.ok(
        diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
        `secret derivation must survive ${expression}: ${JSON.stringify(diagnostics)}`,
      );
    });
  }

  it("preserves secret derivation through an alias before negation", () => {
    assert.ok(check("!alias", "let alias = key").some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ));
  });

  it("preserves secret derivation through an alias after negation", () => {
    assert.ok(check("alias", "let alias = !key").some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ));
  });

  for (const expression of ["!true", "!!false", "!Crypto.constantTimeEquals(key, key)"]) {
    it(`preserves the permitted public result of ${expression}`, () => {
      assert.deepEqual(check(expression), []);
    });
  }

  it("does not declassify a secret comparison merely because an unrelated receiver uses the same method name", () => {
    const diagnostics = checkBody("let derived = Fake.constantTimeEquals(key, key)\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not declassify a locally shadowed bare comparison name", () => {
    const diagnostics = checkBody("let constantTimeEquals = key\n  let derived = constantTimeEquals(key, key)\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not declassify through a locally shadowed redact name", () => {
    const diagnostics = checkBody("let redact = key\n  let derived = redact(key)\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not declassify when the Crypto namespace itself is locally shadowed", () => {
    const diagnostics = checkBody("let Crypto = Fake\n  let derived = Crypto.constantTimeEquals(key, key)\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not warn on a direct public constant-time comparison result", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Int {
  print(Crypto.constantTimeEquals(key, key))
  return 0
}`;
    const parsed = parseProgram(source, "direct-constant-time-log.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("allows a trusted constant-time comparison result through serialization and audit sinks", () => {
    for (const sink of [
      "json.encode(Crypto.constantTimeEquals(key, key))",
      "serialize(Crypto.constantTimeEquals(key, key))",
      "AuditLog.write(Crypto.constantTimeEquals(key, key))",
    ]) {
      const diagnostics = checkBody(sink);
      assert.equal(
        diagnostics.filter((d) => d.code === "FUNGI-SECRET-003").length,
        0,
        `${sink} receives only the public comparison result: ${JSON.stringify(diagnostics)}`,
      );
    }
  });

  it("keeps a secret returned by a match arm secret at an output sink", () => {
    const diagnostics = checkBody("let derived = match 0 { _ => key }\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("keeps secret-dependent pattern selection secret even when arms return public values", () => {
    const diagnostics = checkBody("let derived = match key { true => flag\n    else => flag }\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not taint a public match with public arms", () => {
    assert.deepEqual(checkBody("let derived = match flag { true => flag\n    _ => flag }\n  print(derived)"), []);
  });

  it("does not treat a secret subject as control when every match arm is an unconditional wildcard", () => {
    const diagnostics = checkBody("let derived = match key { _ => flag }\n  print(derived)");
    assert.equal(diagnostics.some((d) => d.code === "FUNGI-SECRET-004"), false, JSON.stringify(diagnostics));
    assert.equal(diagnostics.some((d) => d.code === "FUNGI-SECRET-001"), false, JSON.stringify(diagnostics));
  });

  it("does not treat a secret subject as control when all dispatch is through public guards", () => {
    const diagnostics = checkBody("let derived = match key { when flag => flag\n    else => flag }\n  print(derived)");
    assert.equal(diagnostics.some((d) => d.code === "FUNGI-SECRET-004"), false, JSON.stringify(diagnostics));
    assert.equal(diagnostics.some((d) => d.code === "FUNGI-SECRET-001"), false, JSON.stringify(diagnostics));
  });

  it("does not treat a public arm binding as an outer secret with the same name", () => {
    assert.deepEqual(checkBody("let credential = key\n  let source = Some(flag)\n  let derived = match source { Some(credential) => credential\n    _ => flag }\n  print(derived)"), []);
  });

  it("tracks writes made under secret-dependent branch control to later sinks", () => {
    const diagnostics = checkBody("mut leaked = false\n  if !key { leaked = true }\n  print(leaked)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-004" && d.severity === "warning"));
  });

  it("tracks secret-dependent while control into the loop body", () => {
    const diagnostics = checkBody("while !key { let leaked = false\n    print(leaked)\n    return 0 }");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-004" && d.severity === "warning",
    ), JSON.stringify(diagnostics));
  });

  it("carries secret-dependent loop exit into a following sink", () => {
    const diagnostics = checkBody("mut leaked = false\n  while !key { leaked = true\n    return 0 }\n  print(leaked)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not reapply affine transfers from a secret-controlled loop body that always returns", () => {
    const source = `@version 1
type Lease = Authority<"slide.vok.lease.v1">
flow take(lease: Lease) -> Void {}
secure flow probe(lease: Lease, key: SecureString, flag: Bool) -> Bool {
  while !key {
    take(lease)
    return true
  }
  take(lease)
  return false
}`;
    const parsed = parseProgram(source, "secret-terminating-loop-affine.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-AFFINE-002").length, 0, JSON.stringify(diagnostics));
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-004"), JSON.stringify(diagnostics));
  });

  it("preserves affine consumption performed by a loop condition when the body always returns", () => {
    const source = `@version 1
type Lease = Authority<"slide.vok.lease.v1">
flow take(lease: Lease) -> Bool { return false }
flow probe(lease: Lease) -> Bool {
  while take(lease) { return true }
  take(lease)
  return false
}`;
    const parsed = parseProgram(source, "loop-condition-affine-consumption.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-AFFINE-002"), JSON.stringify(diagnostics));
  });

  it("does not count a terminating loop condition as a second affine use", () => {
    const source = `@version 1
type Lease = Authority<"slide.vok.lease.v1">
flow take(lease: Lease) -> Bool { return false }
flow probe(lease: Lease) -> Int {
  while take(lease) { return 0 }
  return 0
}`;
    const parsed = parseProgram(source, "terminating-loop-condition-single-use.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-AFFINE-002").length, 0, JSON.stringify(diagnostics));
  });

  it("still reports a later use without inventing a repeated condition use", () => {
    const source = `@version 1
type Lease = Authority<"slide.vok.lease.v1">
flow take(lease: Lease) -> Bool { return false }
flow probe(lease: Lease) -> Int {
  while take(lease) { return 0 }
  take(lease)
  return 0
}`;
    const parsed = parseProgram(source, "terminating-loop-condition-later-use.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics
      .filter((d) => d.code === "FUNGI-AFFINE-002");
    assert.equal(diagnostics.length, 1, JSON.stringify(diagnostics));
    assert.equal(diagnostics[0]?.location?.line, 6, JSON.stringify(diagnostics));
  });

  it("checks loop-body sinks against values carried from a prior iteration", () => {
    const diagnostics = checkBody("mut value = false\n  while flag {\n    print(value)\n    value = key\n  }");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.location?.line === 5,
    ), JSON.stringify(diagnostics));
  });

  it("carries loop state across iterations inside a match result", () => {
    const diagnostics = checkBody(`let result = match flag { _ => {
    mut a = false
    mut b = false
    mut i = 0
    while i < 2 {
      a = b
      b = !key
      i = i + 1
    }
    a
  } }
  print(result)`);
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not export a secret assigned only on a terminating loop path", () => {
    const diagnostics = checkBody("mut value = false\n  while flag {\n    value = key\n    return 0\n  }\n  print(value)");
    assert.equal(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.location?.line === 8,
    ), false, JSON.stringify(diagnostics));
  });

  it("does not report public loop control as secret-dependent", () => {
    const diagnostics = checkBody("while flag { let value = false\n    print(value)\n    return 0 }");
    assert.equal(diagnostics.some((d) => d.code === "FUNGI-SECRET-004"), false, JSON.stringify(diagnostics));
  });

  it("converges nested secret-control state in a public loop and preserves its continuation label", () => {
    const diagnostics = checkBody("while flag { if !key { return 0 } }\n  let value = false\n  print(value)");
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("tracks values declared under secret-dependent branch control", () => {
    const diagnostics = checkBody("if !key { let leaked = true\n    print(leaked) }");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("joins secret state across both arms when only one arm assigns a secret", () => {
    const diagnostics = checkBody("mut value = false\n  if flag { value = key } else { value = false }\n  print(value)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("joins the unexecuted path when a public condition has no else arm", () => {
    const diagnostics = checkBody("mut value = false\n  if flag { value = key }\n  print(value)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("allows declassification only when every branch produces a public result", () => {
    assert.deepEqual(checkBody("mut value = key\n  if flag { value = redact(key) } else { value = redact(key) }\n  print(value)"), []);
  });

  it("retains secret derivation through a K3 fold of a secret-dependent verdict", () => {
    const source = `@version 1
flow classify(candidate: SecureString) -> Verdict {
  return Verdict.Allow
}
secure flow probe(key: SecureString, flag: Bool) -> Int {
  let verdict = classify(key)
  let combined = all { verdict
    Verdict.Allow }
  print(combined)
  return 0
}`;
    const parsed = parseProgram(source, "secret-k3-fold.fungi");
    assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], "the Fungi expression must be well-typed");
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("tracks writes in secret-selected check and prefilter arms", () => {
    for (const branch of [
      `check(verdict) {
  if: { leaked = true }
  deny: { leaked = false }
  ambig: { leaked = false }
}`,
      `prefilter(verdict) {
  deny: { leaked = true }
  maybe: { leaked = false }
}`,
    ]) {
      const source = `@version 1
secure flow classify(candidate: SecureString) -> Verdict {
  return Verdict.Allow
}
secure flow probe(key: SecureString) -> Int {
  let verdict = classify(key)
  mut leaked = false
  ${branch}
  print(leaked)
  return 0
}`;
      const parsed = parseProgram(source, "secret-verdict-branch.fungi");
      assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
      assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], "the Fungi branch must be well-typed");
      const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
      assert.ok(diagnostics.some(
        (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
      ), JSON.stringify(diagnostics));
    }
  });

  it("tracks match-arm locals when classifying the returned expression", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    let alias = !key
    return alias
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "secret-match-local.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("respects a public block-local shadow while classifying a match result", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    let key = flag
    return key
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "public-match-shadow.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error"), []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("joins match-arm local reassignment before classifying its returned value", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    mut local = !key
    if flag { local = Crypto.constantTimeEquals(key, key) }
    else { local = Crypto.constantTimeEquals(key, key) }
    return local
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "match-local-join.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("resolves readonly intrinsic-name shadows inside match-result blocks", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let value = match flag { _ => {
    readonly redact = Fake
    redact(key)
  } }
  print(value)
  return flag
}`;
    const parsed = parseProgram(source, "match-result-readonly-shadow.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("does not export a nested block shadow into the enclosing match-arm result", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    let local = Crypto.constantTimeEquals(key, key)
    if flag { let local = !key }
    else { let local = flag }
    return local
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "match-nested-shadow.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error"), []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("does not let deeper nested shadow assignments declassify an outer match result", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let value = match flag { _ => {
    mut local = key
    if flag {
      mut local = false
      if flag { local = false } else { local = false }
    } else { local = redact(key) }
    local
  } }
  print(value)
  return flag
}`;
    const parsed = parseProgram(source, "match-deep-shadow-assignments.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error"), []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("keeps a match result secret when secret-controlled branches assign different values", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    mut local = false
    if !key { local = true }
    else { local = false }
    return local
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "match-secret-implicit-result.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("carries a secret match guard into later ordered fallback arms", () => {
    const diagnostics = checkBody("mut leaked = false\n  match flag { when !key => { let local = flag }\n    _ => { leaked = true } }\n  print(leaked)");
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("carries affine consumption from each failed ordered guard into the next guard", () => {
    const source = `@version 1
type Lease = Authority<"slide.vok.lease.v1">
flow take(lease: Lease) -> Bool { return false }
flow probe(lease: Lease, flag: Bool) -> Bool {
  match flag {
    when take(lease) => {}
    when take(lease) => {}
    _ => {}
  }
  return false
}`;
    const parsed = parseProgram(source, "ordered-match-guard-affine-consumption.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-AFFINE-002"), JSON.stringify(diagnostics));
  });

  it("does not taint a public match result with a discarded secret loop local", () => {
    const diagnostics = checkBody(`let value = match flag { _ => {
  while flag {
    let scratch = key
    return 0
  }
  0
} }
print(value)`);
    assert.equal(
      diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      JSON.stringify(diagnostics),
    );
  });

  it("does not retroactively taint an earlier public-guard arm because a later pattern reads the secret subject", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  mut observed = false
  match key {
    when flag => { observed = true }
    "marker" => {}
    _ => {}
  }
  print(observed)
  return flag
}`;
    const parsed = parseProgram(source, "ordered-match-later-secret-pattern.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error"), []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("propagates secrecy through an evaluated requirement expression", () => {
    const source = `@version 1
secure flow probe(key: SecureString) -> Int {
  let derived = requirement { !key }
  print(derived)
  return 0
}`;
    const parsed = parseProgram(source, "secret-requirement-result.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("does not join a match arm that cannot reach the following sink", () => {
    const diagnostics = checkBody("mut value = key\n  if flag { return 0 } else { value = redact(key) }\n  print(value)");
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("carries secret-dependent early-return control into the continuation", () => {
    const diagnostics = checkBody("mut leaked = false\n  if !key { return 0 }\n  leaked = true\n  print(leaked)");
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("preserves secret-dependent continuation through nested lexical blocks", () => {
    const diagnostics = checkBody("mut leaked = false\n  if flag { if !key { return 0 } }\n  leaked = true\n  print(leaked)");
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("does not taint continuation after an equivalent public nested early return", () => {
    const diagnostics = checkBody("mut leaked = false\n  if flag { if !flag { return 0 } }\n  leaked = true\n  print(leaked)");
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("does not leak a nested secret-control label into a disjoint public sibling arm", () => {
    const diagnostics = checkBody("if flag { if !key { return 0 } } else { let publicValue = false\n    print(publicValue) }");
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("carries a secret guard's terminating match path into the continuation", () => {
    const diagnostics = checkBody("let selected = match flag { when !key => { return 0 }\n    _ => flag }\n  let leaked = false\n  print(leaked)");
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });

  it("does not leak a secret-controlled match arm into a disjoint public arm", () => {
    const diagnostics = checkBody("match flag { true => { if !key { return 0 } }\n    _ => { let publicValue = false\n      print(publicValue) } }");
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("isolates secret control depth between public check and prefilter arms", () => {
    for (const branch of [
      `check(verdict) {
  if: { if !key { return 0 } }
  deny: {}
  ambig: { let publicValue = false
    print(publicValue) }
}`,
      `prefilter(verdict) {
  deny: { if !key { return 0 } }
  maybe: { let publicValue = false
    print(publicValue) }
}`,
    ]) {
      const source = `@version 1
flow classify() -> Verdict {
  return Verdict.Allow
}
secure flow probe(key: SecureString) -> Int {
  let verdict = classify()
  ${branch}
  return 0
}`;
      const parsed = parseProgram(source, "public-verdict-arm-isolation.fungi");
      assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
      assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], "the verdict arms must be well-typed");
      const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
      assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
    }
  });

  it("recognizes exhaustive nested forks that terminate before a secret-dependent continuation", () => {
    const forks = [
      `check(verdict) {
  if: { return 0 }
  deny: { return 0 }
  ambig: { return 0 }
}`,
      `prefilter(verdict) {
  deny: { return 0 }
  maybe: { return 0 }
}`,
      `match flag {
  true => { return 0 }
  _ => { return 0 }
}`,
    ];

    for (const [index, fork] of forks.entries()) {
      const sourceFor = (predicate) => `@version 1
flow classify() -> Verdict {
  return Verdict.Allow
}
secure flow probe(key: SecureString, flag: Bool) -> Int {
  let verdict = classify()
  if ${predicate} { ${fork} }
  let publicValue = false
  print(publicValue)
  return 0
}`;

      const parsed = parseProgram(sourceFor("!key"), `nested-terminal-fork-${index}.fungi`);
      assert.deepEqual(parsed.diagnostics, [], "the test must reach the value-state checker");
      assert.deepEqual(checkTypes(parsed.ast).diagnostics, [], "the test must be well-typed");
      const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
      assert.ok(
        diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
        `fork ${index} must carry the secret-controlled return outcome into the continuation: ${JSON.stringify(diagnostics)}`,
      );

      const publicControl = parseProgram(sourceFor("flag"), `public-terminal-fork-${index}.fungi`);
      assert.deepEqual(publicControl.diagnostics, [], "the public control must parse");
      assert.deepEqual(checkTypes(publicControl.ast).diagnostics, [], "the public control must be well-typed");
      const publicDiagnostics = checkValueStates(publicControl.ast, "production").diagnostics;
      assert.equal(
        publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
        0,
        `public outer predicate must not taint the continuation for fork ${index}: ${JSON.stringify(publicDiagnostics)}`,
      );
    }
  });

  it("recognizes exhaustive nested guarded matches that terminate before a secret-dependent continuation", () => {
    const sourceFor = (outerGuard) => `match flag {
  when ${outerGuard} => {
    match flag {
      when !flag => { return 0 }
      _ => { return 0 }
    }
  }
  _ => {}
}
let publicValue = false
print(publicValue)`;

    const secretDiagnostics = checkBody(sourceFor("!key"));
    assert.ok(
      secretDiagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `a secret-controlled nested guarded return must taint the continuation: ${JSON.stringify(secretDiagnostics)}`,
    );

    const publicDiagnostics = checkBody(sourceFor("!flag"));
    assert.equal(
      publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a public nested guarded return must not taint the continuation: ${JSON.stringify(publicDiagnostics)}`,
    );
  });

  it("retains a secret-dependent exit when a nested guarded match can also continue", () => {
    const sourceFor = (outerGuard) => `match flag {
  when ${outerGuard} => {
    match flag {
      when !flag => { return 0 }
      _ => {}
    }
  }
  _ => {}
}
let publicValue = false
print(publicValue)`;

    const secretDiagnostics = checkBody(sourceFor("!key"));
    assert.ok(
      secretDiagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `a secret-selected nested return must taint the later observable continuation: ${JSON.stringify(secretDiagnostics)}`,
    );

    const publicDiagnostics = checkBody(sourceFor("!flag"));
    assert.equal(
      publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `the public-outer control must not taint the continuation: ${JSON.stringify(publicDiagnostics)}`,
    );
  });

  it("treats an else catch-all as exhaustive when checking guarded-match termination", () => {
    const sourceFor = (outerGuard) => `match flag {
  when ${outerGuard} => {
    match flag {
      when !flag => { return 0 }
      else => { return 0 }
    }
  }
  _ => {}
}
let publicValue = false
print(publicValue)`;

    const secretDiagnostics = checkBody(sourceFor("!key"));
    assert.ok(
      secretDiagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `an else catch-all must preserve secret-dependent termination: ${JSON.stringify(secretDiagnostics)}`,
    );

    const publicDiagnostics = checkBody(sourceFor("!flag"));
    assert.equal(
      publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a public nested guarded return must not taint the continuation: ${JSON.stringify(publicDiagnostics)}`,
    );
  });

  it("retains a secret-dependent fault exit when a nested guarded match can also continue", () => {
    const sourceFor = (outerGuard) => `match flag {
  when ${outerGuard} => {
    match flag {
      when !flag => { fault "blocked" }
      else => {}
    }
  }
  _ => {}
}
let publicValue = false
print(publicValue)`;

    const secretDiagnostics = checkBody(sourceFor("!key"));
    assert.ok(
      secretDiagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `a secret-controlled nested fault must taint the continuing alternative: ${JSON.stringify(secretDiagnostics)}`,
    );

    const publicDiagnostics = checkBody(sourceFor("!flag"));
    assert.equal(
      publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a public nested fault must not taint the continuation: ${JSON.stringify(publicDiagnostics)}`,
    );
  });

  it("does not treat an uncalled local function return as an enclosing-flow exit", () => {
    const diagnostics = checkBody(`match flag {
  when !key => { fn unused() -> Int { return 0 } }
  _ => {}
}
let publicValue = false
print(publicValue)`);
    assert.equal(
      diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a local function's return cannot taint the enclosing continuation: ${JSON.stringify(diagnostics)}`,
    );
  });

  it("does not treat a fault in a statically unreachable branch as an enclosing-flow exit", () => {
    const diagnostics = checkBody(`match flag {
  when !key => { if false { fault "blocked" } }
  _ => {}
}
let publicValue = false
print(publicValue)`);
    assert.equal(
      diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a statically unreachable fault cannot taint the enclosing continuation: ${JSON.stringify(diagnostics)}`,
    );
  });

  for (const exit of ['return 0', 'fault "blocked"']) {
    it(`retains a secret-dependent ${exit.startsWith("return") ? "return" : "fault"} evaluated in an if condition`, () => {
      const diagnostics = checkBody(`match flag {
  when !key => {
    if (match flag {
      when !flag => { ${exit} }
      _ => flag
    }) {}
  }
  _ => {}
}
let publicValue = false
print(publicValue)`);
      assert.ok(
        diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
        `a secret-controlled exit during condition evaluation must taint the continuation: ${JSON.stringify(diagnostics)}`,
      );
    });

    it(`retains a secret-dependent ${exit.startsWith("return") ? "return" : "fault"} evaluated in a while condition`, () => {
      const diagnostics = checkBody(`match flag {
  when !key => {
    while (match flag {
      when !flag => { ${exit} }
      _ => flag
    }) {}
  }
  _ => {}
}
let publicValue = false
print(publicValue)`);
      assert.ok(
        diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
        `a secret-controlled exit during loop-condition evaluation must taint the continuation: ${JSON.stringify(diagnostics)}`,
      );
    });

    it(`does not report a public-dependent ${exit.startsWith("return") ? "return" : "fault"} evaluated in a while condition`, () => {
      const diagnostics = checkBody(`match flag {
  when !flag => {
    while (match flag {
      when !flag => { ${exit} }
      _ => flag
    }) {}
  }
  _ => {}
}
let publicValue = false
print(publicValue)`);
      assert.equal(
        diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
        0,
        `a public-controlled loop-condition exit cannot taint the continuation: ${JSON.stringify(diagnostics)}`,
      );
    });
  }

  it("does not treat a literal-false while body as a reachable enclosing-flow exit", () => {
    const diagnostics = checkBody(`match flag {
  when !key => { while false { fault "blocked" } }
  _ => {}
}
let publicValue = false
print(publicValue)`);
    assert.equal(
      diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length,
      0,
      `a literal-false loop cannot taint the enclosing continuation: ${JSON.stringify(diagnostics)}`,
    );
  });

  it("retains a secret-bearing continuing branch when joining a public alternative", () => {
    const diagnostics = checkBody(`mut value = key
if flag {
  match flag {
    when !flag => { return 0 }
    _ => {}
  }
} else {
  value = redact(key)
}
print(value)`);
    assert.ok(
      diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"),
      `the continuing secret-bearing path must survive the join: ${JSON.stringify(diagnostics)}`,
    );
  });

  it("warns when an ordered match guard branches on a secret", () => {
    const sourceFor = (guard) => `mut publicValue = false
match flag {
  when ${guard} => { return 0 }
  else => {}
}
print(publicValue)`;

    const secretDiagnostics = checkBody(sourceFor("!key"));
    assert.ok(
      secretDiagnostics.some((d) => d.code === "FUNGI-SECRET-004" && d.severity === "warning"),
      `a secret-dependent match guard must produce the existing branch warning: ${JSON.stringify(secretDiagnostics)}`,
    );

    const publicDiagnostics = checkBody(sourceFor("!flag"));
    assert.equal(
      publicDiagnostics.filter((d) => d.code === "FUNGI-SECRET-004").length,
      0,
      `a public match guard must not produce a secret-branch warning: ${JSON.stringify(publicDiagnostics)}`,
    );
  });

  it("does not carry one flow's secret-control context into the next flow", () => {
    const source = `@version 1
secure flow first(key: SecureString) -> Void {
  if !key { return }
}
flow second() -> Int {
  let publicValue = false
  print(publicValue)
  return 0
}`;
    const parsed = parseProgram(source, "flow-secret-context-isolation.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics, []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.equal(diagnostics.filter((d) => d.code === "FUNGI-SECRET-001").length, 0, JSON.stringify(diagnostics));
  });

  it("does not let assignments to match-arm shadow bindings declassify the outer binding", () => {
    const source = `@version 1
secure flow probe(key: SecureString, flag: Bool) -> Bool {
  let derived = match 0 { _ => {
    mut local = !key
    if flag {
      mut local = false
      local = false
    } else {
      mut local = false
      local = false
    }
    return local
  } }
  print(derived)
  return flag
}`;
    const parsed = parseProgram(source, "match-shadow-assignment.fungi");
    assert.deepEqual(parsed.diagnostics, []);
    assert.deepEqual(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error"), []);
    const diagnostics = checkValueStates(parsed.ast, "production").diagnostics;
    assert.ok(diagnostics.some((d) => d.code === "FUNGI-SECRET-001" && d.severity === "error"), JSON.stringify(diagnostics));
  });
});
