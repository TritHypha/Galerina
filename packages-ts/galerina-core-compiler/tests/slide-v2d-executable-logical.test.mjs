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
  "slide-v2d-memory-model.fungi",
  "slide-v2d-memory-validator.fungi",
  "slide-v2d-executable-model.fungi",
  "slide-v2d-executable-validator.fungi",
];

let parsed;
let program;

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

async function validate(candidate) {
  const result = await run(
    "validateSLIDEV2DExecutableProgram",
    new Map([["program", candidate]]),
  );
  assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
  return result.value;
}

function fn(candidate, index) {
  return field(candidate, "functions").items[index];
}

function block(candidate, functionIndex) {
  return field(fn(candidate, functionIndex), "blocks").items[0];
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
  parsed = parseProgram(source, "slide-v2d-executable-logical.fungi", {
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
  program = (await run("materializeSLIDEV2DExecutableProgram")).value;
});

describe("SLIDE V2-D complete guarded executable graph", () => {
  it("retains frozen base functions and validates the complete memory graph", async () => {
    const decision = await validate(program);
    assert.equal(field(decision, "verdict").value, 1);
    assert.equal(field(decision, "status").value, "LOGICAL_EXECUTABLE_MEMORY_VALIDATED");
    assert.equal(field(decision, "authorityReleased").value, false);
    assert.equal(field(program, "functions").items.length, 3);
    assert.equal(field(program, "memoryObjectIds").items[0].value, 1);
    assert.equal(field(program, "nativeCertificatePresent").value, false);
  });

  it("uses explicit guard/access in function 3 and preserves aggregate tables", () => {
    assert.deepEqual(
      field(block(program, 2), "instructions").items.slice(8, 10).map(
        (instruction) => field(instruction, "opcodeId").value,
      ),
      [21, 22],
    );
    assert.equal(field(program, "constants").items.length, 2);
    assert.equal(field(program, "recordDescriptors").items.length, 1);
    assert.equal(field(program, "variantDescriptors").items.length, 1);
  });

  const mutations = [
    ["format drift", (candidate) => candidate.fields.set("formatMinor", intValue(1)), "SLIDE-V2D-EXECUTABLE-001"],
    ["feature removal", (candidate) => field(candidate, "requiredFeatureIds").items.pop(), "SLIDE-V2D-EXECUTABLE-003"],
    ["surplus function", (candidate) => field(candidate, "functions").items.push(clone(fn(candidate, 2))), "SLIDE-V2D-EXECUTABLE-004"],
    ["memory object ID drift", (candidate) => candidate.fields.set("memoryObjectIds", arrayValue([intValue(2)])), "SLIDE-V2D-EXECUTABLE-005"],
    ["graph memory ceiling drift", (candidate) => field(candidate, "graphLimits").fields.set("memoryObjects", intValue(0)), "SLIDE-V2D-EXECUTABLE-007"],
    ["native certificate claim", (candidate) => candidate.fields.set("nativeCertificatePresent", { __tag: "bool", value: true }), "SLIDE-V2D-EXECUTABLE-009"],
    ["embedded V2-A drift", (candidate) => field(block(candidate, 0), "instructions").items[1].fields.set("opcodeId", intValue(99)), "SLIDE-V2D-EXECUTABLE-010"],
    ["guarded function drift", (candidate) => field(block(candidate, 2), "instructions").items[8].fields.set("opcodeId", intValue(99)), "SLIDE-V2D-EXECUTABLE-011"],
    ["memory descriptor drift", (candidate) => field(candidate, "memoryObjects").items[0].fields.set("initializationId", intValue(2)), "SLIDE-V2D-EXECUTABLE-011"],
    ["text constant drift", (candidate) => field(candidate, "constants").items[0].fields.set("payload", { __tag: "bytes", value: Uint8Array.of(1) }), "SLIDE-V2D-EXECUTABLE-014"],
    ["record descriptor drift", (candidate) => field(field(candidate, "recordDescriptors").items[0], "fieldIds").items.reverse(), "SLIDE-V2D-EXECUTABLE-015"],
    ["variant descriptor drift", (candidate) => field(field(candidate, "variantDescriptors").items[0], "caseIds").items.reverse(), "SLIDE-V2D-EXECUTABLE-016"],
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

