import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

import {
  checkTypes,
  executeFlow,
  parseProgram,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_HOSTED = join(HERE, "..", "src", "self-hosted");
const MODEL_PATH = join(
  SELF_HOSTED,
  "slide-v2a-logical-model.fungi",
);
const VALIDATOR_PATH = join(SELF_HOSTED, "slide-v2a-validator.fungi");
const ENCODER_PATH = join(SELF_HOSTED, "slide-v2a-cbor-encoder.fungi");
const IMPORTER_PATH = join(SELF_HOSTED, "slide-v2a-cbor-importer.fungi");
const DIGEST_PATH = join(SELF_HOSTED, "slide-v2a-semantic-digest.fungi");
const RUNTIME_PATH = join(SELF_HOSTED, "slide-v2a-runtime.fungi");

let parsed;
let importer;
let program;
let canonicalBytes;

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

function clone(value) {
  return structuredClone(value);
}

function functionAt(value, index) {
  return field(value, "functions").items[index];
}

function blockAt(fn, index) {
  return field(fn, "blocks").items[index];
}

function instructionAt(block, index) {
  return field(block, "instructions").items[index];
}

function edgeAt(block, index) {
  return field(field(block, "terminator"), "edges").items[index];
}

function mutateUniqueSequence(source, sequence, relativeOffset, replacement) {
  const matches = [];
  for (let i = 0; i <= source.length - sequence.length; i += 1) {
    if (sequence.every((byte, j) => source[i + j] === byte)) matches.push(i);
  }
  assert.equal(matches.length, 1, `sequence must occur exactly once: ${sequence}`);
  const value = source.slice();
  value[matches[0] + relativeOffset] = replacement;
  return value;
}

async function run(flowName, args = new Map()) {
  return runOn(parsed, flowName, args);
}

async function runOn(target, flowName, args = new Map()) {
  return executeFlow(
    flowName,
    args,
    target.ast,
    target.flows,
    undefined,
    undefined,
    { pureFastPath: false },
  );
}

async function validate(value) {
  const result = await run(
    "validateSLIDEV2AProgram",
    new Map([["program", value]]),
  );
  assert.equal(result.audit.result, "ok");
  return result.value;
}

before(async () => {
  const [modelSource, validatorSource, encoderSource, importerSource, digestSource, runtimeSource] = await Promise.all([
    readFile(MODEL_PATH, "utf8"),
    readFile(VALIDATOR_PATH, "utf8"),
    readFile(ENCODER_PATH, "utf8"),
    readFile(IMPORTER_PATH, "utf8"),
    readFile(DIGEST_PATH, "utf8"),
    readFile(RUNTIME_PATH, "utf8"),
  ]);
  const source =
    modelSource +
    "\n" +
    validatorSource.replace(/^@version 1\r?\n/, "") +
    "\n" +
    encoderSource.replace(/^@version 1\r?\n/, "");
  parsed = parseProgram(source, "slide-v2a-logical-model.fungi", {
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
  const independentSource =
    modelSource +
    "\n" +
    validatorSource.replace(/^@version 1\r?\n/, "") +
    "\n" +
    importerSource.replace(/^@version 1\r?\n/, "");
  const independentSourceWithDigest =
    independentSource +
    "\n" +
    digestSource.replace(/^@version 1\r?\n/, "") +
    "\n" +
    runtimeSource.replace(/^@version 1\r?\n/, "");
  importer = parseProgram(independentSourceWithDigest, "slide-v2a-cbor-importer.fungi", {
    requireVersionHeader: true,
  });
  assert.deepEqual(
    importer.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    [],
  );
  assert.deepEqual(
    checkTypes(importer.ast).diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    ),
    [],
  );
  const result = await run("materializeSLIDEV2AProgram");
  assert.equal(result.audit.result, "ok");
  program = result.value;
  const exported = await run(
    "exportSLIDEV2ACanonicalBody",
    new Map([["program", program]]),
  );
  assert.equal(exported.audit.result, "ok");
  assert.equal(field(exported.value, "verdict").value, 1);
  canonicalBytes = field(exported.value, "bytes").value;
});

describe("SLIDE executable GIR V2-A logical model", () => {
  it("represents missing runtime values without an out-of-range Int sentinel", async () => {
    const empty = await runOn(importer, "emptySLIDEV2AValueStore");
    const missing = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(missing.audit.result, "ok", JSON.stringify(missing.audit));
    assert.equal(field(missing.value, "present").value, false);
    assert.equal(field(missing.value, "value").value, 0);

    const stored = await runOn(
      importer,
      "slideV2AStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
        ["value", intValue(-2147483648)],
      ]),
    );
    const minimum = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(minimum.audit.result, "ok", JSON.stringify(minimum.audit));
    assert.equal(field(minimum.value, "present").value, true);
    assert.equal(field(minimum.value, "value").value, -2147483648);

    const outside = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(48)],
      ]),
    );
    assert.equal(outside.audit.result, "ok", JSON.stringify(outside.audit));
    assert.equal(field(outside.value, "present").value, false);
    assert.equal(field(outside.value, "value").value, 0);

    const negative = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(-1)],
      ]),
    );
    assert.equal(negative.audit.result, "ok", JSON.stringify(negative.audit));
    assert.equal(field(negative.value, "present").value, false);

    const lastStored = await runOn(
      importer,
      "slideV2AStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(47)],
        ["value", intValue(-2147483648)],
      ]),
    );
    const lastSlot = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", lastStored.value],
        ["resultId", intValue(47)],
      ]),
    );
    assert.equal(lastSlot.audit.result, "ok", JSON.stringify(lastSlot.audit));
    assert.equal(field(lastSlot.value, "present").value, true);
    assert.equal(field(lastSlot.value, "value").value, -2147483648);

    const malformedStore = structuredClone(stored.value);
    malformedStore.fields.set("values", { __tag: "list", items: [] });
    const malformed = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", malformedStore],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(malformed.audit.result, "ok", JSON.stringify(malformed.audit));
    assert.equal(field(malformed.value, "present").value, false);

    const malformedBase = {
      __tag: "record",
      fields: new Map([
        ["values", { __tag: "list", items: [] }],
        ["defined", { __tag: "list", items: [intValue(1)] }],
      ]),
    };
    const rewritten = await runOn(
      importer,
      "slideV2AStoreValue",
      new Map([
        ["store", malformedBase],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
      ]),
    );
    const afterWrite = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", rewritten.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(afterWrite.audit.result, "ok", JSON.stringify(afterWrite.audit));
    assert.equal(field(afterWrite.value, "present").value, false);

    const newlyWritten = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", rewritten.value],
        ["resultId", intValue(1)],
      ]),
    );
    assert.equal(newlyWritten.audit.result, "ok", JSON.stringify(newlyWritten.audit));
    assert.equal(field(newlyWritten.value, "present").value, true);
    assert.equal(field(newlyWritten.value, "value").value, 17);

    const truncatedDefined = {
      __tag: "record",
      fields: new Map([
        ["values", { __tag: "list", items: [intValue(23)] }],
        ["defined", { __tag: "list", items: [] }],
      ]),
    };
    const rewrittenDefined = await runOn(
      importer,
      "slideV2AStoreValue",
      new Map([
        ["store", truncatedDefined],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
      ]),
    );
    const stillUndefined = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", rewrittenDefined.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(stillUndefined.audit.result, "ok", JSON.stringify(stillUndefined.audit));
    assert.equal(field(stillUndefined.value, "present").value, false);
    const writtenDespiteTruncatedDefined = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", rewrittenDefined.value],
        ["resultId", intValue(1)],
      ]),
    );
    assert.equal(
      writtenDespiteTruncatedDefined.audit.result,
      "ok",
      JSON.stringify(writtenDespiteTruncatedDefined.audit),
    );
    assert.equal(field(writtenDespiteTruncatedDefined.value, "present").value, true);
    assert.equal(field(writtenDespiteTruncatedDefined.value, "value").value, 17);

    const missingDefined = structuredClone(stored.value);
    missingDefined.fields.set("defined", { __tag: "list", items: [] });
    const missingMarker = await runOn(
      importer,
      "slideV2AStoreRead",
      new Map([
        ["store", missingDefined],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(missingMarker.audit.result, "ok", JSON.stringify(missingMarker.audit));
    assert.equal(field(missingMarker.value, "present").value, false);
  });

  it("uses a new frontend-neutral major without changing R1", () => {
    assert.equal(field(program, "formatMajor").value, 2);
    assert.equal(
      field(program, "semanticProfileId").value,
      "slide.semantic.executable-gir.v2",
    );
    assert.equal(
      field(program, "registrySetId").value,
      "slide.registry.executable-gir.v2a",
    );
    assert.equal(field(program, "memoryObjectIds").items.length, 0);
    assert.equal(
      field(program, "registrySetDigest").value,
      "991257bbf4d6d352d3108e27cd423c22e9bf11394571cecb509bc5e8a74df327",
    );
  });

  it("materializes two typed functions with a call and block-parameter join", () => {
    const functions = field(program, "functions").items;
    assert.equal(functions.length, 2);
    assert.equal(field(functions[0], "functionId").value, 1);
    assert.equal(field(functions[1], "functionId").value, 2);

    const mainBlocks = field(functions[1], "blocks").items;
    assert.equal(mainBlocks.length, 7);
    assert.equal(field(mainBlocks[3], "blockId").value, 3);
    assert.deepEqual(
      field(mainBlocks[3], "parameters").items.map((parameter) => [
        field(parameter, "resultId").value,
        field(parameter, "typeId").value,
      ]),
      [[13, 1], [14, 1], [15, 3]],
    );
    assert.equal(
      field(field(mainBlocks[3], "terminator"), "terminatorId").value,
      3,
    );
  });

  it("declares zero effects, capabilities, back edges, and memory objects", () => {
    for (const fn of field(program, "functions").items) {
      assert.equal(field(fn, "declaredEffectIds").items.length, 0);
      assert.equal(field(fn, "requestedCapabilityIds").items.length, 0);
    }
    const limits = field(program, "limits");
    assert.equal(field(limits, "backEdges").value, 0);
    assert.equal(field(limits, "effects").value, 0);
    assert.equal(field(limits, "capabilities").value, 0);
    assert.equal(field(limits, "memoryObjects").value, 0);
    assert.equal(field(limits, "executionSteps").value, 64);
  });

  it("admits the exact closed V2-A graph", async () => {
    const decision = await validate(program);
    assert.equal(field(decision, "verdict").value, 1);
    assert.equal(field(decision, "status").value, "VALIDATED");
    assert.equal(field(decision, "failureId").value, "NONE");
  });

  it("exports deterministic canonical bytes only after semantic admission", async () => {
    const second = await run(
      "exportSLIDEV2ACanonicalBody",
      new Map([["program", program]]),
    );
    assert.equal(field(second.value, "verdict").value, 1);
    assert.deepEqual(field(second.value, "bytes").value, canonicalBytes);
    assert.equal(field(second.value, "byteLength").value, 540);
    assert.equal(canonicalBytes.length, 540);
    assert.equal(canonicalBytes[0], 0xb2);
    assert.equal(
      createHash("sha256").update(canonicalBytes).digest("hex"),
      "ee143f6de55eab66e7e2d6f23ab03816337165d771f8645040ba60ff06976a07",
    );
  });

  it("releases no partial bytes when the graph is not admitted", async () => {
    const candidate = clone(program);
    candidate.fields.set("memoryObjectIds", arrayValue([intValue(1)]));
    const result = await run(
      "exportSLIDEV2ACanonicalBody",
      new Map([["program", candidate]]),
    );
    assert.equal(field(result.value, "verdict").value, -1);
    assert.equal(field(result.value, "status").value, "REFUSED");
    assert.equal(field(result.value, "byteLength").value, 0);
    assert.equal(field(result.value, "bytes").value.length, 0);
  });

  it("independently decodes and semantically admits the canonical body", async () => {
    const result = await runOn(
      importer,
      "decodeSLIDEV2AProgram",
      new Map([["bytes", { __tag: "bytes", value: canonicalBytes }]]),
    );
    assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
    assert.equal(field(field(result.value, "decision"), "verdict").value, 1);
    assert.equal(field(result.value, "consumed").value, 540);
    const decoded = field(result.value, "program");
    assert.equal(field(decoded, "formatMajor").value, 2);
    assert.equal(field(decoded, "functions").items.length, 2);
    assert.equal(
      field(blockAt(functionAt(decoded, 1), 3), "parameters").items.length,
      3,
    );
  });

  it("binds only independently admitted bytes to the v2 semantic domain", async () => {
    const result = await runOn(
      importer,
      "bindSLIDEV2ASemanticDigest",
      new Map([["body", { __tag: "bytes", value: canonicalBytes }]]),
    );
    assert.equal(result.audit.result, "ok");
    assert.equal(field(field(result.value, "decision"), "verdict").value, 1);
    assert.equal(
      field(result.value, "bodyDigest").value,
      "ee143f6de55eab66e7e2d6f23ab03816337165d771f8645040ba60ff06976a07",
    );
    assert.equal(
      field(result.value, "semanticDigest").value,
      "910727d92460501cd592af8130dbef4acd6abd1432d7ea384ba52be66e9d3464",
    );

    const refused = await runOn(
      importer,
      "bindSLIDEV2ASemanticDigest",
      new Map([[
        "body",
        { __tag: "bytes", value: Uint8Array.from([...canonicalBytes, 0]) },
      ]]),
    );
    assert.equal(field(field(refused.value, "decision"), "verdict").value, -1);
    assert.equal(field(refused.value, "bodyDigest").value, "");
    assert.equal(field(refused.value, "semanticDigest").value, "");
  });

  async function executeV2A(bytes, left, right, admission) {
    const result = await runOn(
      importer,
      "executeSLIDEV2ABytes",
      new Map([
        ["body", { __tag: "bytes", value: bytes }],
        ["left", intValue(left)],
        ["right", intValue(right)],
        ["admission", intValue(admission)],
      ]),
    );
    assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
    return result.value;
  }

  async function executeV2AWithBudget(budget) {
    const result = await runOn(
      importer,
      "executeSLIDEV2AWithBudget",
      new Map([
        ["body", { __tag: "bytes", value: canonicalBytes }],
        ["left", intValue(2)],
        ["right", intValue(3)],
        ["admission", intValue(1)],
        ["runtimeBudget", intValue(budget)],
      ]),
    );
    assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
    return result.value;
  }

  it("instruction-drives call, branch, join, and all three K3 exits", async () => {
    const allowed = await executeV2A(canonicalBytes, 2, 3, 1);
    assert.equal(field(allowed, "status").value, "SUCCEEDED");
    assert.equal(field(allowed, "value").value, 6);
    assert.equal(field(allowed, "failureId").value, 0);
    assert.ok(field(allowed, "steps").value <= 64);

    const negativeBranch = await executeV2A(canonicalBytes, -2, 3, 1);
    assert.equal(field(negativeBranch, "status").value, "SUCCEEDED");
    assert.equal(field(negativeBranch, "value").value, 7);

    const denied = await executeV2A(canonicalBytes, 2, 3, -1);
    assert.equal(field(denied, "status").value, "FAILED");
    assert.equal(field(denied, "failureId").value, 2);

    const unresolved = await executeV2A(canonicalBytes, 2, 3, 0);
    assert.equal(field(unresolved, "status").value, "FAILED");
    assert.equal(field(unresolved, "failureId").value, 3);
  });

  it("preserves checked overflow and refuses invalid invocation or bytes", async () => {
    const calleeOverflow = await executeV2A(
      canonicalBytes,
      2147483647,
      0,
      1,
    );
    assert.equal(field(calleeOverflow, "status").value, "FAILED");
    assert.equal(field(calleeOverflow, "failureId").value, 1);

    const joinOverflow = await executeV2A(
      canonicalBytes,
      2147483646,
      1,
      1,
    );
    assert.equal(field(joinOverflow, "status").value, "FAILED");
    assert.equal(field(joinOverflow, "failureId").value, 1);

    for (const refused of [
      await executeV2A(canonicalBytes, 2, 3, 2),
      await executeV2A(
        Uint8Array.from([...canonicalBytes, 0]),
        2,
        3,
        1,
      ),
    ]) {
      assert.equal(field(refused, "status").value, "REFUSED");
      assert.equal(field(field(refused, "decision"), "verdict").value, -1);
    }
  });

  it("caps runner work at the admitted budget and fails closed on exhaustion", async () => {
    const exact = await executeV2AWithBudget(64);
    const surplus = await executeV2AWithBudget(1000);
    assert.equal(field(exact, "status").value, "SUCCEEDED");
    assert.equal(field(surplus, "status").value, "SUCCEEDED");
    assert.equal(field(exact, "steps").value, field(surplus, "steps").value);

    for (const budget of [0, 1, 8, 12]) {
      const refused = await executeV2AWithBudget(budget);
      assert.equal(field(refused, "status").value, "REFUSED");
      assert.equal(field(refused, "failureId").value, 4);
      assert.equal(
        field(refused, "decision").fields.get("failureId").value,
        "SLIDE-V2A-RUNTIME-015",
      );
    }
  });

  for (const [name, bytes] of [
    ["truncation", () => canonicalBytes.slice(0, -1)],
    ["suffix", () => Uint8Array.from([...canonicalBytes, 0])],
    ["root-key drift", () => {
      const value = canonicalBytes.slice();
      value[2] = 1;
      return value;
    }],
    ["non-shortest root length", () =>
      Uint8Array.from([0xb8, 0x12, ...canonicalBytes.slice(1)])],
    ["unknown decoded opcode", () =>
      mutateUniqueSequence(
        canonicalBytes,
        [0x85, 0x08, 0x05, 0x01, 0x81, 0x05, 0x01],
        2,
        0x09,
      )],
    ["decoded K3 successor drift", () =>
      mutateUniqueSequence(
        canonicalBytes,
        [0x86, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06],
        6,
        0x05,
      )],
    ["registry-digest drift", () => {
      const value = canonicalBytes.slice();
      const marker = new TextEncoder().encode(
        "991257bbf4d6d352d3108e27cd423c22e9bf11394571cecb509bc5e8a74df327",
      );
      let offset = -1;
      for (let i = 0; i <= value.length - marker.length; i += 1) {
        if (marker.every((byte, j) => value[i + j] === byte)) {
          offset = i;
          break;
        }
      }
      assert.notEqual(offset, -1);
      value[offset] ^= 1;
      return value;
    }],
  ]) {
    it(`independent import exposes no partial graph for ${name}`, async () => {
      const result = await runOn(
        importer,
        "decodeSLIDEV2AProgram",
        new Map([["bytes", { __tag: "bytes", value: bytes() }]]),
      );
      assert.equal(field(field(result.value, "decision"), "verdict").value, -1);
      assert.equal(field(field(result.value, "program"), "functions").items.length, 0);
    });
  }

  const mutations = [
    [
      "semantic profile drift",
      (candidate) => {
        candidate.fields.set(
          "semanticProfileId",
          stringValue("slide.semantic.galerina-gir.v1"),
        );
      },
      "SLIDE-V2A-PROGRAM-001",
    ],
    [
      "authority ceiling",
      (candidate) => {
        field(candidate, "limits").fields.set("capabilities", intValue(1));
      },
      "SLIDE-V2A-PROGRAM-002",
    ],
    [
      "unknown opcode",
      (candidate) => {
        instructionAt(blockAt(functionAt(candidate, 0), 0), 1).fields.set(
          "opcodeId",
          intValue(99),
        );
      },
      "SLIDE-V2A-PROGRAM-004",
    ],
    [
      "non-dominating operand",
      (candidate) => {
        field(
          instructionAt(blockAt(functionAt(candidate, 1), 3), 0),
          "operands",
        ).items[0] = intValue(16);
      },
      "SLIDE-V2A-PROGRAM-007",
    ],
    [
      "recursive call target",
      (candidate) => {
        instructionAt(blockAt(functionAt(candidate, 1), 1), 0).fields.set(
          "immediate",
          intValue(2),
        );
      },
      "SLIDE-V2A-PROGRAM-008",
    ],
    [
      "backward edge",
      (candidate) => {
        edgeAt(blockAt(functionAt(candidate, 1), 3), 0).fields.set(
          "targetBlockId",
          intValue(2),
        );
      },
      "SLIDE-V2A-PROGRAM-010",
    ],
    [
      "block argument count drift",
      (candidate) => {
        edgeAt(blockAt(functionAt(candidate, 1), 0), 0).fields.set(
          "arguments",
          arrayValue([intValue(0), intValue(1)]),
        );
      },
      "SLIDE-V2A-PROGRAM-011",
    ],
    [
      "requested capability injection",
      (candidate) => {
        functionAt(candidate, 1).fields.set(
          "requestedCapabilityIds",
          arrayValue([intValue(1)]),
        );
      },
      "SLIDE-V2A-PROGRAM-013",
    ],
    [
      "memory object injection",
      (candidate) => {
        candidate.fields.set("memoryObjectIds", arrayValue([intValue(1)]));
      },
      "SLIDE-V2A-PROGRAM-013",
    ],
    [
      "K3 obligation drift",
      (candidate) => {
        field(candidate, "k3Obligations").items[0].fields.set(
          "denyBlockId",
          intValue(6),
        );
      },
      "SLIDE-V2A-PROGRAM-017",
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
    });
  }
});
