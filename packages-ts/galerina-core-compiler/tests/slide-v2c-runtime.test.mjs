import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { before, describe, it } from "node:test";
import { promisify } from "node:util";

import { checkTypes, executeFlow, parseProgram } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF_HOSTED = join(HERE, "..", "src", "self-hosted");
const execFileAsync = promisify(execFile);
const FILES = [
  "slide-v2a-logical-model.fungi",
  "slide-v2a-validator.fungi",
  "slide-v2a-cbor-importer.fungi",
  "slide-v2c-aggregate-model.fungi",
  "slide-v2c-aggregate-validator.fungi",
  "slide-v2c-executable-model.fungi",
  "slide-v2c-executable-validator.fungi",
  "slide-v2c-cbor-validator.fungi",
  "slide-v2c-cbor-importer.fungi",
  "slide-v2c-runtime.fungi",
];

let parsed;
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

async function execute(
  index,
  steps = 96,
  copies = 4096,
  body = canonicalBytes,
  depth = 4,
) {
  const result = await run(
    "executeSLIDEV2CWithAllBudgets",
    new Map([
      ["body", { __tag: "bytes", value: body }],
      ["checkedIndex", intValue(index)],
      ["runtimeStepBudget", intValue(steps)],
      ["runtimeCopyBudget", intValue(copies)],
      ["runtimeDepthBudget", intValue(depth)],
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
  parsed = parseProgram(source, "slide-v2c-runtime.fungi", {
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
  const vector = await run("slideV2CCanonicalReferenceBytes");
  canonicalBytes = vector.value.value;
});

describe("validated SLIDE V2-C immutable aggregate execution", () => {
  it("represents missing runtime values without an out-of-range Int sentinel", async () => {
    const empty = await run("emptySLIDEV2CRuntimeStore");
    const missing = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(missing.audit.result, "ok", JSON.stringify(missing.audit));
    assert.equal(field(missing.value, "present").value, false);
    assert.equal(field(missing.value, "value").value, 0);

    const stored = await run(
      "slideV2CRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
        ["value", intValue(-2147483648)],
        ["failureId", intValue(0)],
      ]),
    );
    const minimum = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(minimum.audit.result, "ok", JSON.stringify(minimum.audit));
    assert.equal(field(minimum.value, "present").value, true);
    assert.equal(field(minimum.value, "value").value, -2147483648);

    const outside = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(48)],
      ]),
    );
    assert.equal(outside.audit.result, "ok", JSON.stringify(outside.audit));
    assert.equal(field(outside.value, "present").value, false);
    assert.equal(field(outside.value, "value").value, 0);

    const negative = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(-1)],
      ]),
    );
    assert.equal(negative.audit.result, "ok", JSON.stringify(negative.audit));
    assert.equal(field(negative.value, "present").value, false);

    const lastStored = await run(
      "slideV2CRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(47)],
        ["value", intValue(-2147483648)],
        ["failureId", intValue(0)],
      ]),
    );
    const lastSlot = await run(
      "slideV2CRuntimeRead",
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
    const malformed = await run(
      "slideV2CRuntimeRead",
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
        ["failures", { __tag: "list", items: [intValue(0)] }],
        ["defined", { __tag: "list", items: [intValue(1)] }],
      ]),
    };
    const rewritten = await run(
      "slideV2CRuntimeStoreValue",
      new Map([
        ["store", malformedBase],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
        ["failureId", intValue(0)],
      ]),
    );
    const afterWrite = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", rewritten.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(afterWrite.audit.result, "ok", JSON.stringify(afterWrite.audit));
    assert.equal(field(afterWrite.value, "present").value, false);

    const newlyWritten = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", rewritten.value],
        ["resultId", intValue(1)],
      ]),
    );
    assert.equal(newlyWritten.audit.result, "ok", JSON.stringify(newlyWritten.audit));
    assert.equal(field(newlyWritten.value, "present").value, true);
    assert.equal(field(newlyWritten.value, "value").value, 17);

    for (const [truncatedField, replacement] of [
      ["values", []],
      ["failures", []],
      ["defined", []],
    ]) {
      const malformedSource = {
        __tag: "record",
        fields: new Map([
          ["values", { __tag: "list", items: [intValue(23)] }],
          ["failures", { __tag: "list", items: [intValue(0)] }],
          ["defined", { __tag: "list", items: [intValue(1)] }],
        ]),
      };
      malformedSource.fields.set(truncatedField, {
        __tag: "list",
        items: replacement.map(intValue),
      });
      const rewrittenSource = await run(
        "slideV2CRuntimeStoreValue",
        new Map([
          ["store", malformedSource],
          ["resultId", intValue(1)],
          ["value", intValue(17)],
          ["failureId", intValue(0)],
        ]),
      );
      const absentPriorSlot = await run(
        "slideV2CRuntimeRead",
        new Map([
          ["store", rewrittenSource.value],
          ["resultId", intValue(0)],
        ]),
      );
      const retainedNewSlot = await run(
        "slideV2CRuntimeRead",
        new Map([
          ["store", rewrittenSource.value],
          ["resultId", intValue(1)],
        ]),
      );
      assert.equal(absentPriorSlot.audit.result, "ok", JSON.stringify(absentPriorSlot.audit));
      assert.equal(field(absentPriorSlot.value, "present").value, false);
      assert.equal(retainedNewSlot.audit.result, "ok", JSON.stringify(retainedNewSlot.audit));
      assert.equal(field(retainedNewSlot.value, "present").value, true);
      assert.equal(field(retainedNewSlot.value, "value").value, 17);
    }

    const failedSlot = await run(
      "slideV2CRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
        ["value", intValue(23)],
        ["failureId", intValue(4)],
      ]),
    );
    const withSecondSlot = await run(
      "slideV2CRuntimeStoreValue",
      new Map([
        ["store", failedSlot.value],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
        ["failureId", intValue(0)],
      ]),
    );
    const preservedFailure = await run(
      "slideV2CRuntimeFailureAt",
      new Map([
        ["store", withSecondSlot.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(preservedFailure.audit.result, "ok", JSON.stringify(preservedFailure.audit));
    assert.equal(preservedFailure.value.value, 4);
    const retainedFailureValue = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", withSecondSlot.value],
        ["resultId", intValue(0)],
      ]),
    );
    const retainedNewSlot = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", withSecondSlot.value],
        ["resultId", intValue(1)],
      ]),
    );
    assert.equal(retainedFailureValue.audit.result, "ok", JSON.stringify(retainedFailureValue.audit));
    assert.equal(field(retainedFailureValue.value, "present").value, true);
    assert.equal(field(retainedFailureValue.value, "value").value, 23);
    assert.equal(field(withSecondSlot.value, "failures").items[0].value, 4);
    assert.equal(retainedNewSlot.audit.result, "ok", JSON.stringify(retainedNewSlot.audit));
    assert.equal(field(retainedNewSlot.value, "present").value, true);
    assert.equal(field(retainedNewSlot.value, "value").value, 17);

    const missingDefined = structuredClone(stored.value);
    missingDefined.fields.set("defined", { __tag: "list", items: [] });
    const missingMarker = await run(
      "slideV2CRuntimeRead",
      new Map([
        ["store", missingDefined],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(missingMarker.audit.result, "ok", JSON.stringify(missingMarker.audit));
    assert.equal(field(missingMarker.value, "present").value, false);

    const missingFailures = structuredClone(stored.value);
    missingFailures.fields.set("failures", { __tag: "list", items: [] });
    const failureAt = await run(
      "slideV2CRuntimeFailureAt",
      new Map([
        ["store", missingFailures],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(failureAt.audit.result, "ok", JSON.stringify(failureAt.audit));
    assert.equal(failureAt.value.value, 4);
  });

  it("instruction-drives checked-index success through record and variant projection", async () => {
    for (const [index, expected] of [[0, 3], [1, 5], [2, 8]]) {
      const result = await execute(index);
      assert.equal(field(result, "status").value, "SUCCEEDED");
      assert.equal(field(result, "value").value, expected);
      assert.equal(field(result, "failureId").value, 0);
      assert.equal(field(result, "steps").value, 15);
      assert.equal(field(result, "copiedBytes").value, 56);
      assert.equal(field(result, "aggregateDepth").value, 3);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("carries out-of-range indexing as registered typed failure 4", async () => {
    for (const index of [-1, 3, 2147483647, -2147483648]) {
      const result = await execute(index);
      assert.equal(field(result, "status").value, "FAILED");
      assert.equal(field(result, "failureId").value, 4);
      assert.equal(field(result, "steps").value, 15);
      assert.equal(field(result, "copiedBytes").value, 56);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("enforces exact step and copy budgets before result exposure", async () => {
    const exact = await execute(1, 15, 56);
    assert.equal(field(exact, "status").value, "SUCCEEDED");
    for (const result of [
      await execute(1, 14, 56),
      await execute(1, 15, 55),
      await execute(1, 0, 56),
      await execute(1, 15, -1),
    ]) {
      assert.equal(field(result, "status").value, "REFUSED");
      assert.equal(field(field(result, "decision"), "verdict").value, -1);
      assert.equal(field(result, "steps").value, 0);
      assert.equal(field(result, "copiedBytes").value, 0);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("caps surplus caller budgets at admitted ceilings", async () => {
    const result = await execute(2, 1000000, 1000000, canonicalBytes, 1000000);
    assert.equal(field(result, "status").value, "SUCCEEDED");
    assert.equal(field(result, "steps").value, 15);
    assert.equal(field(result, "copiedBytes").value, 56);
  });

  it("enforces aggregate-depth budget before nested construction", async () => {
    const exact = await execute(2, 15, 56, canonicalBytes, 3);
    assert.equal(field(exact, "status").value, "SUCCEEDED");
    assert.equal(field(exact, "aggregateDepth").value, 3);

    for (const depth of [2, 1, 0, -1]) {
      const result = await execute(2, 15, 56, canonicalBytes, depth);
      assert.equal(field(result, "status").value, "REFUSED");
      assert.equal(field(field(result, "decision"), "verdict").value, -1);
      assert.equal(field(result, "steps").value, 0);
      assert.equal(field(result, "copiedBytes").value, 0);
      assert.equal(field(result, "aggregateDepth").value, 0);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("never executes malformed, truncated, or suffixed bodies", async () => {
    for (const body of [
      new Uint8Array(),
      canonicalBytes.slice(0, -1),
      Uint8Array.from([...canonicalBytes, 0]),
      (() => {
        const value = canonicalBytes.slice();
        value[0] = 0xb4;
        return value;
      })(),
    ]) {
      const result = await execute(1, 96, 4096, body);
      assert.equal(field(result, "status").value, "REFUSED");
      assert.equal(field(field(result, "decision"), "verdict").value, -1);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("runs pinned bytes in a fresh process without a producer, AST, WAT, or Wasm", async () => {
    const sourcePaths = FILES.map((name) => join(SELF_HOSTED, name));
    const distPath = join(HERE, "..", "dist", "index.js");
    const bodyHex = Buffer.from(canonicalBytes).toString("hex");
    const script = `
      import { readFile } from "node:fs/promises";
      import { parseProgram, checkTypes, executeFlow } from ${JSON.stringify(pathToFileURL(distPath).href)};
      const sources = await Promise.all(
        ${JSON.stringify(sourcePaths)}.map((path) => readFile(path, "utf8")),
      );
      const source = sources
        .map((item, index) =>
          index === 0 ? item : item.replace(/^@version 1\\r?\\n/, ""),
        )
        .join("\\n");
      const parsed = parseProgram(source, "fresh-slide-v2c-runtime.fungi", {
        requireVersionHeader: true,
      });
      const diagnostics = [
        ...parsed.diagnostics,
        ...checkTypes(parsed.ast).diagnostics,
      ].filter((diagnostic) => diagnostic.severity === "error");
      if (diagnostics.length > 0) {
        throw new Error(JSON.stringify(diagnostics));
      }
      const result = await executeFlow(
        "executeSLIDEV2CBytes",
        new Map([
          ["body", {
            __tag: "bytes",
            value: Uint8Array.from(Buffer.from(${JSON.stringify(bodyHex)}, "hex")),
          }],
          ["checkedIndex", { __tag: "int", value: 2 }],
        ]),
        parsed.ast,
        parsed.flows,
        undefined,
        undefined,
        { pureFastPath: false },
      );
      if (result.audit.result !== "ok") {
        throw new Error(JSON.stringify(result.audit));
      }
      const out = Object.fromEntries(
        [...result.value.fields].map(([key, value]) => [key, value.value]),
      );
      process.stdout.write(JSON.stringify(out));
    `;
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { maxBuffer: 1024 * 1024 },
    );
    assert.deepEqual(JSON.parse(stdout), {
      status: "SUCCEEDED",
      value: 8,
      failureId: 0,
      steps: 15,
      copiedBytes: 56,
      aggregateDepth: 3,
      authorityReleased: false,
    });
  });
});
