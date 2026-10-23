import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const checkerPath = fileURLToPath(new URL("../../dist/value-state-checker.js", import.meta.url));
const checkerDirectoryUrl = pathToFileURL(`${dirname(checkerPath)}${sep}`).href;
const comparatorNeedle = "return shape(left) === shape(right);";

async function loadChecker({ forceProvenanceEqual = false } = {}) {
  let source = readFileSync(checkerPath, "utf8")
    .replaceAll('from "./', `from "${checkerDirectoryUrl}`);

  if (forceProvenanceEqual) {
    assert.ok(source.includes(comparatorNeedle), "controlled mutation target must exist");
    source = source.replace(comparatorNeedle, "return true;");
  }

  source += "\nexport { ValueStateChecker };";
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(moduleUrl);
}

function runJoinAndWiden(ValueStateChecker, target, alternatives) {
  const checker = new ValueStateChecker(new Set(), new Set(), new Set(), new Set(), "production");
  checker.restoreScopes([new Map([["x", target]])]);
  checker.joinSecretStates(
    checker.snapshotScopes(),
    alternatives.map((candidate) => [
      new Map([["x", { ...target, secretValueExpressions: [candidate] }]]),
    ]),
  );

  const retained = checker.lookupBinding("x").secretValueExpressions.length;
  checker.widenCyclicLoopProvenance();
  return {
    retained,
    unknown: checker.lookupBinding("x").secretValueUnknown,
  };
}

function provenanceAlternatives() {
  const targetIdentity = Object.freeze({});
  const sharedSnapshotIdentity = Object.freeze({});
  const shadowIdentity = Object.freeze({});

  const binding = (name, declarationIdentity) => ({
    name,
    typeName: "SecureString",
    declarationIdentity,
    secretValueUnknown: false,
    secretValueExpressions: [],
  });
  const capture = (value) => ({
    expression: { kind: "identifier", value: value.name },
    bindings: new Map([[value.name, value]]),
    shadowedResultConstructors: new Set(),
  });
  const nest = (child) => capture({
    ...binding("y", sharedSnapshotIdentity),
    secretValueExpressions: [child],
  });

  const target = binding("x", targetIdentity);
  const shadowed = nest(nest(capture(binding("x", shadowIdentity))));
  const targetValue = nest(nest(capture({ ...target })));
  return { target, alternatives: [shadowed, targetValue] };
}

test("actual join and loop widening retain both nested provenance alternatives in either order", async () => {
  const { ValueStateChecker } = await loadChecker();
  const { target, alternatives: [shadowed, targetValue] } = provenanceAlternatives();

  assert.deepEqual([
    runJoinAndWiden(ValueStateChecker, target, [shadowed, targetValue]),
    runJoinAndWiden(ValueStateChecker, target, [targetValue, shadowed]),
  ], [
    { retained: 2, unknown: true },
    { retained: 2, unknown: true },
  ]);
});

test("the join/widen witness turns red when provenance comparison is forced equal", async () => {
  const { ValueStateChecker } = await loadChecker({ forceProvenanceEqual: true });
  const { target, alternatives: [shadowed, targetValue] } = provenanceAlternatives();
  const observed = [
    runJoinAndWiden(ValueStateChecker, target, [shadowed, targetValue]),
    runJoinAndWiden(ValueStateChecker, target, [targetValue, shadowed]),
  ];

  assert.notDeepEqual(observed, [
    { retained: 2, unknown: true },
    { retained: 2, unknown: true },
  ]);
  assert.deepEqual(observed, [
    { retained: 1, unknown: false },
    { retained: 1, unknown: true },
  ]);
});
