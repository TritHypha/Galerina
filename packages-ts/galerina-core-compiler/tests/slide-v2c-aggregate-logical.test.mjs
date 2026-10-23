import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

import { checkTypes, executeFlow, parseProgram } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_HOSTED = join(HERE, "..", "src", "self-hosted");
const MODEL_PATH = join(SELF_HOSTED, "slide-v2c-aggregate-model.fungi");
const VALIDATOR_PATH = join(SELF_HOSTED, "slide-v2c-aggregate-validator.fungi");

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

function stringValue(value) {
  return { __tag: "string", value };
}

function arrayValue(items) {
  return { __tag: "list", items };
}

function bytesValue(items) {
  return { __tag: "bytes", value: Uint8Array.from(items) };
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
    "validateSLIDEV2CAggregateProgram",
    new Map([["program", candidate]]),
  );
  assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
  return result.value;
}

before(async () => {
  const [modelSource, validatorSource] = await Promise.all([
    readFile(MODEL_PATH, "utf8"),
    readFile(VALIDATOR_PATH, "utf8"),
  ]);
  const source =
    modelSource +
    "\n" +
    validatorSource.replace(/^@version 1\r?\n/, "");
  parsed = parseProgram(source, "slide-v2c-aggregate-model.fungi", {
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
  const result = await run("materializeSLIDEV2CAggregateProgram");
  assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
  program = result.value;
});

describe("SLIDE V2-C immutable aggregate logical gate", () => {
  it("binds the versioned parent and V2-B context without authority", async () => {
    assert.equal(field(program, "formatMinor").value, 1);
    assert.equal(
      field(program, "registrySetId").value,
      "slide.registry.executable-gir.v2c",
    );
    assert.equal(
      field(program, "parentRegistryId").value,
      "slide.registry.executable-gir.v2a",
    );
    assert.equal(
      field(program, "authoritySidecarId").value,
      "slide.capability.lease-broker.v2b",
    );
    const decision = await validate(program);
    assert.equal(field(decision, "verdict").value, 1);
    assert.equal(field(decision, "authorityReleased").value, false);
  });

  it("uses dense append-only type and opcode identities", () => {
    assert.deepEqual(
      field(program, "typeIds").items.map((value) => value.value),
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      field(program, "opcodeIds").items.map((value) => value.value),
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it("materializes bounded immutable constants and registered descriptors", () => {
    const constants = field(program, "constants").items;
    assert.equal(constants.length, 2);
    assert.deepEqual(
      [...field(constants[0], "payload").value],
      [...new TextEncoder().encode("Galerina")],
    );
    assert.deepEqual([...field(constants[1], "payload").value], [0, 1, 2, 255]);
    const recordDescriptor = field(program, "recordDescriptors").items[0];
    assert.deepEqual(
      field(recordDescriptor, "fieldIds").items.map((value) => value.value),
      [1, 2, 3],
    );
    const variantDescriptor = field(program, "variantDescriptors").items[0];
    assert.deepEqual(
      field(variantDescriptor, "caseIds").items.map((value) => value.value),
      [1, 2],
    );
  });

  it("models aggregate operations without effects, memory, capabilities, or host calls", () => {
    assert.deepEqual(
      field(program, "instructions").items.map(
        (instruction) => field(instruction, "opcodeId").value,
      ),
      [12, 13, 2, 2, 2, 14, 15, 16, 17, 18, 19, 20],
    );
    assert.equal(field(program, "effectIds").items.length, 0);
    assert.equal(field(program, "capabilityIds").items.length, 0);
    assert.equal(field(program, "memoryObjectIds").items.length, 0);
    assert.equal(field(field(program, "limits"), "hostCalls").value, 0);
  });

  const mutations = [
    [
      "format drift",
      (candidate) => candidate.fields.set("formatMinor", intValue(0)),
      "SLIDE-V2C-AGGREGATE-001",
    ],
    [
      "registry descriptor drift",
      (candidate) => candidate.fields.set("registrySetDigest", stringValue("0".repeat(64))),
      "SLIDE-V2C-AGGREGATE-033",
    ],
    [
      "parent digest drift",
      (candidate) => candidate.fields.set("parentRegistryDigest", stringValue("0".repeat(64))),
      "SLIDE-V2C-AGGREGATE-003",
    ],
    [
      "authority sidecar drift",
      (candidate) => candidate.fields.set("authoritySidecarDigest", stringValue("0".repeat(64))),
      "SLIDE-V2C-AGGREGATE-004",
    ],
    [
      "memory ceiling injection",
      (candidate) => field(candidate, "limits").fields.set("memoryObjects", intValue(1)),
      "SLIDE-V2C-AGGREGATE-008",
    ],
    [
      "capability identity injection",
      (candidate) => candidate.fields.set("capabilityIds", arrayValue([intValue(1)])),
      "SLIDE-V2C-AGGREGATE-009",
    ],
    [
      "effect identity injection",
      (candidate) => candidate.fields.set("effectIds", arrayValue([intValue(1)])),
      "SLIDE-V2C-AGGREGATE-009",
    ],
    [
      "host-call ceiling injection",
      (candidate) => field(candidate, "limits").fields.set("hostCalls", intValue(1)),
      "SLIDE-V2C-AGGREGATE-008",
    ],
    [
      "back-edge ceiling injection",
      (candidate) => field(candidate, "limits").fields.set("backEdges", intValue(1)),
      "SLIDE-V2C-AGGREGATE-008",
    ],
    [
      "descriptor ceiling drift",
      (candidate) => field(candidate, "limits").fields.set("recordFields", intValue(7)),
      "SLIDE-V2C-AGGREGATE-007",
    ],
    [
      "type table gap",
      (candidate) => field(candidate, "typeIds").items[9] = intValue(11),
      "SLIDE-V2C-AGGREGATE-010",
    ],
    [
      "text payload mismatch",
      (candidate) => field(candidate, "constants").items[0].fields.set("payload", bytesValue([0xff])),
      "SLIDE-V2C-AGGREGATE-014",
    ],
    [
      "overlong UTF-8 payload",
      (candidate) => field(candidate, "constants").items[0].fields.set("payload", bytesValue([0xc0, 0xaf])),
      "SLIDE-V2C-AGGREGATE-014",
    ],
    [
      "text ceiling overflow",
      (candidate) => field(candidate, "constants").items[0].fields.set(
        "payload",
        bytesValue(new Array(257).fill(97)),
      ),
      "SLIDE-V2C-AGGREGATE-013",
    ],
    [
      "byte ceiling overflow",
      (candidate) => field(candidate, "constants").items[1].fields.set("payload", bytesValue(new Array(1025).fill(0))),
      "SLIDE-V2C-AGGREGATE-016",
    ],
    [
      "empty byte constant",
      (candidate) => field(candidate, "constants").items[1].fields.set("payload", bytesValue([])),
      "SLIDE-V2C-AGGREGATE-016",
    ],
    [
      "missing constant definition",
      (candidate) => field(candidate, "constants").items.pop(),
      "SLIDE-V2C-AGGREGATE-011",
    ],
    [
      "constant encoding drift",
      (candidate) => field(candidate, "constants").items[1].fields.set("encodingId", intValue(1)),
      "SLIDE-V2C-AGGREGATE-015",
    ],
    [
      "record field reorder",
      (candidate) => field(field(candidate, "recordDescriptors").items[0], "fieldIds").items.reverse(),
      "SLIDE-V2C-AGGREGATE-018",
    ],
    [
      "duplicate record descriptor",
      (candidate) => field(candidate, "recordDescriptors").items.push(
        structuredClone(field(candidate, "recordDescriptors").items[0]),
      ),
      "SLIDE-V2C-AGGREGATE-017",
    ],
    [
      "missing variant descriptor",
      (candidate) => field(candidate, "variantDescriptors").items.pop(),
      "SLIDE-V2C-AGGREGATE-017",
    ],
    [
      "record field type drift",
      (candidate) => field(field(candidate, "recordDescriptors").items[0], "fieldTypeIds").items[1] = intValue(1),
      "SLIDE-V2C-AGGREGATE-019",
    ],
    [
      "record field ceiling overflow",
      (candidate) => {
        const descriptor = field(candidate, "recordDescriptors").items[0];
        for (let i = 4; i <= 9; i += 1) {
          field(descriptor, "fieldIds").items.push(intValue(i));
          field(descriptor, "fieldTypeIds").items.push(intValue(1));
        }
      },
      "SLIDE-V2C-AGGREGATE-018",
    ],
    [
      "variant case type drift",
      (candidate) => field(field(candidate, "variantDescriptors").items[0], "payloadTypeIds").items[0] = intValue(1),
      "SLIDE-V2C-AGGREGATE-021",
    ],
    [
      "variant case identity drift",
      (candidate) => field(field(candidate, "variantDescriptors").items[0], "caseIds").items[1] = intValue(3),
      "SLIDE-V2C-AGGREGATE-021",
    ],
    [
      "variant case ceiling overflow",
      (candidate) => {
        const descriptor = field(candidate, "variantDescriptors").items[0];
        for (let i = 3; i <= 9; i += 1) {
          field(descriptor, "caseIds").items.push(intValue(i));
          field(descriptor, "payloadTypeIds").items.push(intValue(4));
        }
      },
      "SLIDE-V2C-AGGREGATE-020",
    ],
    [
      "unknown constant identity",
      (candidate) => field(candidate, "instructions").items[0].fields.set("immediate", intValue(2)),
      "SLIDE-V2C-AGGREGATE-023",
    ],
    [
      "unchecked index opcode",
      (candidate) => field(candidate, "instructions").items[7].fields.set("opcodeId", intValue(99)),
      "SLIDE-V2C-AGGREGATE-027",
    ],
    [
      "dynamic field identity",
      (candidate) => field(candidate, "instructions").items[9].fields.set("immediate", intValue(2)),
      "SLIDE-V2C-AGGREGATE-029",
    ],
    [
      "dynamic case identity",
      (candidate) => field(candidate, "instructions").items[11].fields.set("immediate", intValue(2)),
      "SLIDE-V2C-AGGREGATE-031",
    ],
    [
      "array operand surplus",
      (candidate) => field(field(candidate, "instructions").items[5], "operands").items.push(intValue(4)),
      "SLIDE-V2C-AGGREGATE-025",
    ],
    [
      "surplus operation",
      (candidate) => field(candidate, "instructions").items.push(
        structuredClone(field(candidate, "instructions").items[11]),
      ),
      "SLIDE-V2C-AGGREGATE-032",
    ],
  ];

  for (const [name, mutate, expectedFailure] of mutations) {
    it(`fails closed for ${name}`, async () => {
      const candidate = clone(program);
      mutate(candidate);
      const decision = await validate(candidate);
      assert.equal(field(decision, "verdict").value, -1);
      assert.equal(field(decision, "status").value, "REFUSED");
      assert.equal(field(decision, "failureId").value, expectedFailure);
      assert.equal(field(decision, "authorityReleased").value, false);
    });
  }
});
