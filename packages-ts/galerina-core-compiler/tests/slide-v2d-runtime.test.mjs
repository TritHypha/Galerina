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
const REQUIRED_FILES = [
  "slide-v2a-logical-model.fungi",
  "slide-v2a-validator.fungi",
  "slide-v2a-cbor-importer.fungi",
  "slide-v2c-aggregate-model.fungi",
  "slide-v2c-aggregate-validator.fungi",
  "slide-v2c-executable-model.fungi",
  "slide-v2c-executable-validator.fungi",
  "slide-v2c-cbor-importer.fungi",
  "slide-v2d-memory-model.fungi",
  "slide-v2d-memory-validator.fungi",
  "slide-v2d-executable-model.fungi",
  "slide-v2d-executable-validator.fungi",
  "slide-v2d-cbor-validator.fungi",
  "slide-v2d-cbor-importer.fungi",
];
const RUNTIME_SOURCE = "slide-v2d-runtime.fungi";

let parsed;
let canonicalBytes;
let sourcePaths;

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
  {
    steps = 112,
    copies = 4096,
    depth = 4,
    memory = 12,
    guards = 1,
    body = canonicalBytes,
  } = {},
) {
  const result = await run(
    "executeSLIDEV2DWithAllBudgets",
    new Map([
      ["body", { __tag: "bytes", value: body }],
      ["checkedIndex", intValue(index)],
      ["runtimeStepBudget", intValue(steps)],
      ["runtimeCopyBudget", intValue(copies)],
      ["runtimeDepthBudget", intValue(depth)],
      ["runtimeMemoryBudget", intValue(memory)],
      ["runtimeGuardBudget", intValue(guards)],
    ]),
  );
  assert.equal(result.audit.result, "ok", JSON.stringify(result.audit));
  return result.value;
}

function assertNoPartialRuntime(result) {
  assert.equal(field(result, "status").value, "REFUSED");
  assert.equal(field(field(result, "decision"), "verdict").value, -1);
  for (const name of [
    "steps",
    "copiedBytes",
    "aggregateDepth",
    "semanticMemoryBytes",
    "guardChecks",
    "guardedAccesses",
    "observedElements",
  ]) {
    assert.equal(field(result, name).value, 0, name);
  }
  assert.equal(field(result, "nativeCertificatePresent").value, false);
  assert.equal(field(result, "authorityReleased").value, false);
}

before(async () => {
  const names = [...REQUIRED_FILES];
  const sources = await Promise.all(
    names.map((name) => readFile(join(SELF_HOSTED, name), "utf8")),
  );
  try {
    sources.push(await readFile(join(SELF_HOSTED, RUNTIME_SOURCE), "utf8"));
    names.push(RUNTIME_SOURCE);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  sourcePaths = names.map((name) => join(SELF_HOSTED, name));
  const source = sources
    .map((value, index) =>
      index === 0 ? value : value.replace(/^@version 1\r?\n/, ""),
    )
    .join("\n");
  parsed = parseProgram(source, RUNTIME_SOURCE, { requireVersionHeader: true });
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
  assert.ok(
    parsed.flows.some((flow) => flow.name === "executeSLIDEV2DWithAllBudgets"),
    "detached guarded V2-D runtime is not implemented",
  );
  canonicalBytes = (await run("slideV2DCanonicalReferenceBytes")).value.value;
});

describe("validated SLIDE V2-D guarded safe-value execution", () => {
  it("represents missing runtime values without an out-of-range Int sentinel", async () => {
    const empty = await run("emptySLIDEV2DRuntimeStore");
    const missing = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(missing.audit.result, "ok", JSON.stringify(missing.audit));
    assert.equal(field(missing.value, "present").value, false);
    assert.equal(field(missing.value, "value").value, 0);

    const stored = await run(
      "slideV2DRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
        ["value", intValue(-2147483648)],
        ["failureId", intValue(0)],
      ]),
    );
    const minimum = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(minimum.audit.result, "ok", JSON.stringify(minimum.audit));
    assert.equal(field(minimum.value, "present").value, true);
    assert.equal(field(minimum.value, "value").value, -2147483648);

    const outside = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(48)],
      ]),
    );
    assert.equal(outside.audit.result, "ok", JSON.stringify(outside.audit));
    assert.equal(field(outside.value, "present").value, false);
    assert.equal(field(outside.value, "value").value, 0);

    const negative = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", stored.value],
        ["resultId", intValue(-1)],
      ]),
    );
    assert.equal(negative.audit.result, "ok", JSON.stringify(negative.audit));
    assert.equal(field(negative.value, "present").value, false);

    const lastStored = await run(
      "slideV2DRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(47)],
        ["value", intValue(-2147483648)],
        ["failureId", intValue(0)],
      ]),
    );
    const lastSlot = await run(
      "slideV2DRuntimeRead",
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
      "slideV2DRuntimeRead",
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
      "slideV2DRuntimeStoreValue",
      new Map([
        ["store", malformedBase],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
        ["failureId", intValue(0)],
      ]),
    );
    const afterWrite = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", rewritten.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(afterWrite.audit.result, "ok", JSON.stringify(afterWrite.audit));
    assert.equal(field(afterWrite.value, "present").value, false);

    const newlyWritten = await run(
      "slideV2DRuntimeRead",
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
        "slideV2DRuntimeStoreValue",
        new Map([
          ["store", malformedSource],
          ["resultId", intValue(1)],
          ["value", intValue(17)],
          ["failureId", intValue(0)],
        ]),
      );
      const absentPriorSlot = await run(
        "slideV2DRuntimeRead",
        new Map([
          ["store", rewrittenSource.value],
          ["resultId", intValue(0)],
        ]),
      );
      const retainedNewSlot = await run(
        "slideV2DRuntimeRead",
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
      "slideV2DRuntimeStoreValue",
      new Map([
        ["store", empty.value],
        ["resultId", intValue(0)],
        ["value", intValue(23)],
        ["failureId", intValue(4)],
      ]),
    );
    const withSecondSlot = await run(
      "slideV2DRuntimeStoreValue",
      new Map([
        ["store", failedSlot.value],
        ["resultId", intValue(1)],
        ["value", intValue(17)],
        ["failureId", intValue(0)],
      ]),
    );
    const preservedFailure = await run(
      "slideV2DRuntimeFailureAt",
      new Map([
        ["store", withSecondSlot.value],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(preservedFailure.audit.result, "ok", JSON.stringify(preservedFailure.audit));
    assert.equal(preservedFailure.value.value, 4);
    const retainedFailureValue = await run(
      "slideV2DRuntimeRead",
      new Map([
        ["store", withSecondSlot.value],
        ["resultId", intValue(0)],
      ]),
    );
    const retainedNewSlot = await run(
      "slideV2DRuntimeRead",
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
      "slideV2DRuntimeRead",
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
      "slideV2DRuntimeFailureAt",
      new Map([
        ["store", missingFailures],
        ["resultId", intValue(0)],
      ]),
    );
    assert.equal(failureAt.audit.result, "ok", JSON.stringify(failureAt.audit));
    assert.equal(failureAt.value.value, 4);
  });

  it("observes one element only after its exact guard succeeds", async () => {
    for (const [index, expected] of [[0, 3], [1, 5], [2, 8]]) {
      const result = await execute(index);
      assert.equal(field(result, "status").value, "SUCCEEDED");
      assert.equal(field(result, "value").value, expected);
      assert.equal(field(result, "failureId").value, 0);
      assert.equal(field(result, "steps").value, 16);
      assert.equal(field(result, "copiedBytes").value, 56);
      assert.equal(field(result, "aggregateDepth").value, 3);
      assert.equal(field(result, "semanticMemoryBytes").value, 12);
      assert.equal(field(result, "guardChecks").value, 1);
      assert.equal(field(result, "guardedAccesses").value, 1);
      assert.equal(field(result, "observedElements").value, 1);
      assert.equal(field(result, "nativeCertificatePresent").value, false);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("returns registered failure 4 before any out-of-range observation", async () => {
    for (const index of [-1, 3, 2147483647, -2147483648]) {
      const result = await execute(index);
      assert.equal(field(result, "status").value, "FAILED");
      assert.equal(field(result, "failureId").value, 4);
      assert.equal(field(result, "steps").value, 16);
      assert.equal(field(result, "semanticMemoryBytes").value, 12);
      assert.equal(field(result, "guardChecks").value, 1);
      assert.equal(field(result, "guardedAccesses").value, 0);
      assert.equal(field(result, "observedElements").value, 0);
      assert.equal(field(result, "authorityReleased").value, false);
    }
  });

  it("requires exact step, copy, depth, memory, and guard budgets", async () => {
    const exact = await execute(1, {
      steps: 16,
      copies: 56,
      depth: 3,
      memory: 12,
      guards: 1,
    });
    assert.equal(field(exact, "status").value, "SUCCEEDED");
    for (const result of [
      await execute(1, { steps: 15 }),
      await execute(1, { copies: 55 }),
      await execute(1, { depth: 2 }),
      await execute(1, { memory: 11 }),
      await execute(1, { guards: 0 }),
      await execute(1, { steps: 0 }),
      await execute(1, { memory: -1 }),
    ]) {
      assertNoPartialRuntime(result);
    }
  });

  it("caps surplus caller budgets at admitted ceilings", async () => {
    const result = await execute(2, {
      steps: 1_000_000,
      copies: 1_000_000,
      depth: 1_000_000,
      memory: 1_000_000,
      guards: 1_000_000,
    });
    assert.equal(field(result, "status").value, "SUCCEEDED");
    assert.equal(field(result, "steps").value, 16);
    assert.equal(field(result, "copiedBytes").value, 56);
    assert.equal(field(result, "semanticMemoryBytes").value, 12);
    assert.equal(field(result, "guardChecks").value, 1);
  });

  it("never executes malformed or structurally refused bytes", async () => {
    for (const body of [
      new Uint8Array(),
      canonicalBytes.slice(0, -1),
      Uint8Array.from([...canonicalBytes, 0]),
      (() => {
        const value = canonicalBytes.slice();
        value[2] = 1;
        return value;
      })(),
      (() => {
        const value = canonicalBytes.slice();
        value[value.length - 1] = 3;
        return value;
      })(),
    ]) {
      assertNoPartialRuntime(await execute(1, { body }));
    }
  });

  it("runs pinned bytes in a fresh process without producer, encoder, AST, WAT, or Wasm", async () => {
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
      const parsed = parseProgram(source, "fresh-slide-v2d-runtime.fungi", {
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
        "executeSLIDEV2DBytes",
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
      steps: 16,
      copiedBytes: 56,
      aggregateDepth: 3,
      semanticMemoryBytes: 12,
      guardChecks: 1,
      guardedAccesses: 1,
      observedElements: 1,
      nativeCertificatePresent: false,
      authorityReleased: false,
    });
  });
});
