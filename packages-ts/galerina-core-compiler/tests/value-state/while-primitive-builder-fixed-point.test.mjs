import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProgram, parseProgram, checkTypes, checkValueStates } from "../../dist/index.js";

function checkValueStateSource(source, fileName) {
  const parsed = parseProgram(source, fileName);
  assert.deepEqual(parsed.diagnostics, [], "fixture must parse before value-state analysis");
  const types = checkTypes(parsed.ast);
  assert.deepEqual(types.diagnostics, [], "fixture must type-check before value-state analysis");
  return checkValueStates(parsed.ast, "production").diagnostics;
}

test("a public loop that builds a String from Char.toString reaches a value-state fixed point", () => {
  const source = `@version 1
pure flow appendChar(ch: Char) -> String
contract { effects {} }
{
  mut word: String = ""
  mut count: Int = 0
  while count < 1 {
    word = word + ch.toString()
    count = count + 1
  }
  return word
}`;

  const result = checkProgram(source, "while-primitive-builder.fungi");
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("a public loop that builds an Array<String> with append reaches a value-state fixed point", () => {
  const source = `@version 1
pure flow appendChar(ch: Char) -> Array<String>
contract { effects {} }
{
  mut words: Array<String> = []
  mut count: Int = 0
  while count < 1 {
    words = words.append(ch.toString())
    count = count + 1
  }
  return words
}`;

  const result = checkProgram(source, "while-primitive-array-builder.fungi");
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

test("a secret-derived Array append loop converges and rejects the later sink", () => {
  const source = `@version 1
secure flow appendSecret(key: SecureString) -> Int {
  mut words: Array<SecureString> = []
  mut count: Int = 0
  while count < 2 {
    words = words.append(key)
    count = count + 1
  }
  print(words)
  return 0
}`;

  assert.doesNotThrow(() => {
    const diagnostics = checkValueStateSource(source, "while-secret-array-builder.fungi");
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-SECRET-001"),
      JSON.stringify(diagnostics));
  });
});

test("a secret-controlled loop converges and rejects the secret-dependent result sink", () => {
  const source = `@version 1
secure flow secretControlledBuilder(key: SecureString, flag: Bool) -> Int {
  mut value: String = ""
  while !key {
    value = value + "x"
  }
  print(value)
  return 0
}`;

  assert.doesNotThrow(() => {
    const diagnostics = checkValueStateSource(source, "while-secret-control-builder.fungi");
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-SECRET-001"),
      JSON.stringify(diagnostics));
    assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-SECRET-004"),
      JSON.stringify(diagnostics));
  });
});

test("a loop-local structured declaration keeps one lexical identity across analysis replays", () => {
  const source = `@version 1
secure flow appendSecret(key: SecureString) -> Array<SecureString> {
  mut values: Array<SecureString> = [key]
  mut count: Int = 0
  while count < 2 {
    let next = [key]
    values = next.append(key)
    count = count + 1
  }
  return values
}`;

  assert.doesNotThrow(() =>
    checkValueStateSource(source, "while-loop-local-declaration-identity.fungi"));
});
