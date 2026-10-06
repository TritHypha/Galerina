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

  it("keeps a secret returned by a match arm secret at an output sink", () => {
    const diagnostics = checkBody("let derived = match 0 { _ => key }\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("keeps secret-dependent match selection secret even when arms return public values", () => {
    const diagnostics = checkBody("let derived = match key { _ => flag }\n  print(derived)");
    assert.ok(diagnostics.some(
      (d) => d.code === "FUNGI-SECRET-001" && d.severity === "error",
    ), JSON.stringify(diagnostics));
  });

  it("does not taint a public match with public arms", () => {
    assert.deepEqual(checkBody("let derived = match flag { true => flag\n    _ => flag }\n  print(derived)"), []);
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
