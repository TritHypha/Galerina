import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sameBindingDeclarationIdentity,
  sameSecretValueExpression,
} from "../../dist/value-state-checker.js";
import { checkTypes, checkValueStates, parseProgram } from "../../dist/index.js";

function checkerDiagnostics(source, fileName) {
  const parsed = parseProgram(source, fileName);
  assert.deepEqual(parsed.diagnostics.filter((item) => item.severity === "error"), [],
    "fixture must parse before value-state analysis");
  const typed = checkTypes(parsed.ast);
  assert.deepEqual(typed.diagnostics.filter((item) => item.severity === "error"), [],
    "fixture must type-check before value-state analysis");
  return checkValueStates(parsed.ast, "production").diagnostics
    .map(({ code, severity }) => `${code}:${severity}`)
    .sort();
}

function capture(offset, declarationIdentity = {}) {
  return {
    expression: { kind: "identifier", value: "x" },
    bindings: new Map([[
      "x",
      {
        name: "x",
        typeName: "SecureString",
        declarationIdentity,
        declaredAt: { file: "identity.fungi", line: 1, column: 20, offset },
        secretValueExpressions: [],
      },
    ]]),
    shadowedResultConstructors: new Set(),
  };
}

test("provenance equality preserves declaration identity when source offsets differ", () => {
  const shadowed = capture(2);
  const target = capture(20);

  assert.equal(sameSecretValueExpression(shadowed, target), false);
  assert.equal(sameSecretValueExpression(target, shadowed), false);
});

test("provenance equality remains stable for the same declaration", () => {
  const identity = {};
  assert.equal(sameSecretValueExpression(capture(20, identity), capture(20, identity)), true);
});

function nestedCapture(offset, declarationIdentity, nested) {
  return {
    expression: { kind: "identifier", value: "x" },
    bindings: new Map([[
      "x",
      {
        name: "x",
        typeName: "SecureString",
        declarationIdentity,
        declaredAt: { file: "identity.fungi", line: 1, column: 1, offset },
        secretValueExpressions: nested === undefined ? [] : [nested],
      },
    ]]),
    shadowedResultConstructors: new Set(),
  };
}

test("provenance equality traverses repeated names to the nested declaration identity", () => {
  const outer = {};
  const middle = {};
  const shadowedLeaf = nestedCapture(2, {}, undefined);
  const targetLeaf = nestedCapture(20, {}, undefined);
  const left = nestedCapture(10, outer,
    nestedCapture(11, middle, shadowedLeaf));
  const right = nestedCapture(10, outer,
    nestedCapture(11, middle, targetLeaf));

  assert.equal(sameSecretValueExpression(left, right), false);
  assert.equal(sameSecretValueExpression(right, left), false);
});

test("provenance equality distinguishes different snapshots that reuse one declaration token", () => {
  const repeatedDeclaration = {};
  const left = nestedCapture(10, repeatedDeclaration,
    nestedCapture(11, repeatedDeclaration, nestedCapture(2, {}, undefined)));
  const right = nestedCapture(10, repeatedDeclaration,
    nestedCapture(11, repeatedDeclaration, nestedCapture(20, {}, undefined)));

  assert.equal(sameSecretValueExpression(left, right), false);
  assert.equal(sameSecretValueExpression(right, left), false);
});

test("declaration identity does not collapse distinct bindings with colliding locations", () => {
  const location = { file: "identity.fungi", line: 1, column: 1, offset: 20 };
  const first = { name: "x", declarationIdentity: {}, declaredAt: location };
  const second = { name: "x", declarationIdentity: {}, declaredAt: location };

  assert.equal(sameBindingDeclarationIdentity(first, second), false);
  assert.equal(sameBindingDeclarationIdentity(first, { ...first }), true);
});

test("declaration identity distinguishes offsets within one line and column", () => {
  const first = {
    name: "x",
    declarationIdentity: {},
    declaredAt: { file: "identity.fungi", line: 1, column: 1, offset: 2 },
  };
  const second = {
    name: "x",
    declarationIdentity: {},
    declaredAt: { file: "identity.fungi", line: 1, column: 1, offset: 20 },
  };

  assert.equal(sameBindingDeclarationIdentity(first, second), false);
});

function cyclicCapture(declarationIdentity) {
  const capture = {
    expression: { kind: "identifier", value: "x" },
    bindings: new Map(),
    shadowedResultConstructors: new Set(),
  };
  capture.bindings.set("x", {
    name: "x",
    typeName: "SecureString",
    declarationIdentity,
    declaredAt: { file: "identity.fungi", line: 1, column: 1, offset: 10 },
    secretValueExpressions: [capture],
  });
  return capture;
}

test("provenance equality encodes cycles without conflating declarations", () => {
  const declarationIdentity = {};
  assert.equal(sameSecretValueExpression(
    cyclicCapture(declarationIdentity),
    cyclicCapture(declarationIdentity),
  ), true);
  assert.equal(sameSecretValueExpression(cyclicCapture({}), cyclicCapture({})), false);
});

test("checker join and loop widening preserve the same refusals when branch order is reversed", () => {
  const prefix = `@version 1
secure flow joinOrder(key: SecureString, alternate: SecureString, flag: Bool) -> Int {
  mut chosen: SecureString = key
  if flag {
    chosen = key
  } else {
    chosen = alternate
  }
  mut count: Int = 0
  while count < 1 {
    chosen = chosen
    count = count + 1
  }
  print(chosen)
  return 0
}`;
  const reversed = prefix
    .replace("chosen = key\n  } else {\n    chosen = alternate", "chosen = alternate\n  } else {\n    chosen = key");
  assert.notEqual(reversed, prefix, "branch-order control must actually reverse the assignments");

  assert.deepEqual(checkerDiagnostics(prefix, "join-order-forward.fungi"), [
    "FUNGI-SECRET-001:error",
  ]);
  assert.deepEqual(checkerDiagnostics(reversed, "join-order-reversed.fungi"), [
    "FUNGI-SECRET-001:error",
  ]);
});
