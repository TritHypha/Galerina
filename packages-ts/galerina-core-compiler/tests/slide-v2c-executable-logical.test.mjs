import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

import { checkTypes, executeFlow, parseProgram } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_HOSTED = join(HERE, "..", "src", "self-hosted");
const FILES = [
  "slide-v2a-logical-model.fungi",
  "slide-v2a-validator.fungi",
  "slide-v2c-aggregate-model.fungi",
  "slide-v2c-aggregate-validator.fungi",
  "slide-v2c-executable-model.fungi",
  "slide-v2c-executable-validator.fungi",
];

let parsed;
let program;
let aggregate;

function field(record, name) {
  assert.equal(record.__tag, "record");
  const value = record.fields.get(name);
  assert.ok(value, `missing field ${name}`);
  return value;
}

function intValue(value) {
  return { __tag: "int", value };
}

function arrayValue(items) {
  return { __tag: "list", items };
}

function clone(value) {
  return structuredClone(value);
}

function functionAt(candidate, index) {
  return field(candidate, "functions").items[index];
}

function blockAt(fn, index) {
  return field(fn, "blocks").items[index];
}

async function run(flowName, args = new Map()) {
  return executeFlow(
    flowName,
    args,
    parsed.ast,
    parsed.flows,
    undefined,
    undefined,
    { pureFastPath: false },
  );
}

async function validate(candidate, aggregateCandidate = aggregate) {
  const result = await run(
    "validateSLIDEV2CExecutableProgram",
    new Map([
      ["program", candidate],
      ["aggregate", aggregateCandidate],
    ]),
  );
  assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
  return result.value;
}

before(async () => {
  const sources = await Promise.all(
    FILES.map((name) => readFile(join(SELF_HOSTED, name), "utf8")),
  );
  const source = sources
    .map((value, index) =>
      index === 0 ? value : value.replace(/^@version 1\r?\n/, ""),
    )
    .join("\n");
  parsed = parseProgram(source, "slide-v2c-executable-model.fungi", {
    requireVersionHeader: true,
  });
  assert.deepEqual(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    checkTypes(parsed.ast).diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ),
    [],
  );
  const [programResult, aggregateResult] = await Promise.all([
    run("materializeSLIDEV2CExecutableProgram"),
    run("materializeSLIDEV2CAggregateProgram"),
  ]);
  assert.equal(programResult.audit.result, "ok", JSON.stringify(programResult.audit));
  assert.equal(aggregateResult.audit.result, "ok", JSON.stringify(aggregateResult.audit));
  program = programResult.value;
  aggregate = aggregateResult.value;
});

describe("SLIDE V2-C complete executable logical graph", () => {
  it("keeps both frozen V2-A functions and appends one aggregate function", async () => {
    assert.deepEqual(
      field(program, "functions").items.map((fn) => field(fn, "functionId").value),
      [1, 2, 3],
    );
    const decision = await validate(program);
    assert.equal(field(decision, "verdict").value, 1);
    assert.equal(field(decision, "authorityReleased").value, false);
  });

  it("makes every aggregate operation part of executable function 3", () => {
    const block = blockAt(functionAt(program, 2), 0);
    assert.deepEqual(
      field(block, "instructions").items.map(
        (instruction) => field(instruction, "opcodeId").value,
      ),
      [12, 13, 1, 2, 2, 2, 14, 15, 16, 4, 17, 18, 19, 20],
    );
    assert.equal(field(field(block, "terminator"), "terminatorId").value, 4);
    assert.deepEqual(
      field(field(block, "terminator"), "operands").items.map((value) => value.value),
      [13],
    );
  });

  const mutations = [
    [
      "function count ceiling drift",
      (candidate) => field(candidate, "limits").fields.set("functionCount", intValue(2)),
      "SLIDE-V2C-EXECUTABLE-007",
    ],
    [
      "embedded V2-A opcode drift",
      (candidate) => field(blockAt(functionAt(candidate, 0), 0), "instructions").items[1].fields.set("opcodeId", intValue(99)),
      "SLIDE-V2C-EXECUTABLE-017",
    ],
    [
      "aggregate capability injection",
      (candidate) => functionAt(candidate, 2).fields.set("requestedCapabilityIds", arrayValue([intValue(1)])),
      "SLIDE-V2C-EXECUTABLE-010",
    ],
    [
      "parameter index drift",
      (candidate) => field(blockAt(functionAt(candidate, 2), 0), "instructions").items[2].fields.set("immediate", intValue(1)),
      "SLIDE-V2C-EXECUTABLE-013",
    ],
    [
      "unchecked aggregate index",
      (candidate) => field(blockAt(functionAt(candidate, 2), 0), "instructions").items[8].fields.set("opcodeId", intValue(99)),
      "SLIDE-V2C-EXECUTABLE-012",
    ],
    [
      "dynamic record projection",
      (candidate) => field(blockAt(functionAt(candidate, 2), 0), "instructions").items[11].fields.set("immediate", intValue(2)),
      "SLIDE-V2C-EXECUTABLE-014",
    ],
    [
      "return fallthrough edge",
      (candidate) => field(blockAt(functionAt(candidate, 2), 0), "terminator").fields.set(
        "edges",
        arrayValue([{ __tag: "record", fields: new Map([
          ["targetBlockId", intValue(0)],
          ["arguments", arrayValue([])],
        ]) }]),
      ),
      "SLIDE-V2C-EXECUTABLE-016",
    ],
    [
      "descriptor payload divergence",
      (candidate) => field(candidate, "constants").items[0].fields.set(
        "payload",
        { __tag: "bytes", value: Uint8Array.of(1) },
      ),
      "SLIDE-V2C-EXECUTABLE-019",
    ],
    [
      "surplus aggregate function",
      (candidate) => field(candidate, "functions").items.push(clone(functionAt(candidate, 2))),
      "SLIDE-V2C-EXECUTABLE-005",
    ],
  ];

  for (const [name, mutate, expectedFailure] of mutations) {
    it(`fails closed for ${name}`, async () => {
      const candidate = clone(program);
      mutate(candidate);
      const decision = await validate(candidate);
      assert.equal(field(decision, "verdict").value, -1);
      assert.equal(field(decision, "failureId").value, expectedFailure);
      assert.equal(field(decision, "authorityReleased").value, false);
    });
  }
});
