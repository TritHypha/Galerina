import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPLAIN_TRACE_LABELS,
  FUNGI_EXPLAIN_001,
  FUNGI_EXPLAIN_002,
  FUNGI_EXPLAIN_003,
  FUNGI_EXPLAIN_004,
  buildTrace,
  createExplainResult,
  explainManifest,
  isExplainTraceLabel,
  readExplainResult,
} from "../dist/index.js";

const codes = (xs) => xs.map((d) => d.code);

const manifest = (over = {}) => ({
  effects: ["fs.read", "net.fetch"],
  capabilities: ["cap.read"],
  boundaries: ["boundary.fs"],
  imports: ["pkg.core"],
  ...over,
});

const options = (over = {}) => ({
  includeEffects: true,
  includeCapabilities: true,
  includeBoundaries: true,
  includeImports: true,
  ...over,
});

test("isExplainTraceLabel admits only the closed vocabulary", () => {
  for (const t of EXPLAIN_TRACE_LABELS) assert.equal(isExplainTraceLabel(t), true);
  for (const bad of ["", "route", "EFFECT", null, 1, {}, undefined]) {
    assert.equal(isExplainTraceLabel(bad), false, String(bad));
  }
});

test("explainManifest accepts a closed slice under options", () => {
  const result = explainManifest(manifest(), options());
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.traces.length, 5);
  assert.deepEqual(
    result.traces.map((t) => [t.step, t.label, t.output]),
    [
      [0, "import", "pkg.core"],
      [1, "effect", "fs.read"],
      [2, "effect", "net.fetch"],
      [3, "capability", "cap.read"],
      [4, "boundary", "boundary.fs"],
    ],
  );
  assert.deepEqual(result.effects, ["fs.read", "net.fetch"]);
  assert.deepEqual(result.capabilities, ["cap.read"]);
  assert.deepEqual(result.boundaries, ["boundary.fs"]);
});

test("buildTrace returns traces on success and empty on refuse", () => {
  assert.equal(buildTrace(manifest(), options()).length, 5);
  assert.deepEqual(buildTrace(null, options()), []);
  assert.deepEqual(buildTrace(manifest(), null), []);
});

test("explainManifest refuses non-plain input, accessors, unknown keys and missing fields", () => {
  assert.deepEqual(codes(explainManifest(null, options()).diagnostics), [FUNGI_EXPLAIN_001]);
  assert.deepEqual(codes(explainManifest([], options()).diagnostics), [FUNGI_EXPLAIN_001]);
  const proto = Object.create({ x: 1 });
  Object.assign(proto, manifest());
  assert.deepEqual(codes(explainManifest(proto, options()).diagnostics), [FUNGI_EXPLAIN_001]);
  const accessor = {};
  Object.defineProperty(accessor, "effects", { get: () => ["fs.read"], enumerable: true });
  Object.assign(accessor, {
    capabilities: ["cap.read"],
    boundaries: ["boundary.fs"],
    imports: ["pkg.core"],
  });
  assert.deepEqual(codes(explainManifest(accessor, options()).diagnostics), [FUNGI_EXPLAIN_001]);
  assert.deepEqual(codes(explainManifest({ ...manifest(), extra: true }, options()).diagnostics), [
    FUNGI_EXPLAIN_001,
  ]);
  const missing = { effects: ["fs.read"], capabilities: ["cap.read"], boundaries: ["boundary.fs"] };
  assert.deepEqual(codes(explainManifest(missing, options()).diagnostics), [FUNGI_EXPLAIN_001]);
});

test("explainManifest never throws on hostile proxies and never echoes keys/values", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("ownKeys");
      },
      get: () => {
        throw new Error("get");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("desc");
      },
    },
  );
  assert.doesNotThrow(() => explainManifest(hostile, options()));
  const diags = explainManifest(manifest({ effects: ["Net.Fetch"] }), options()).diagnostics;
  const blob = JSON.stringify(diags);
  assert.equal(blob.includes("Net.Fetch"), false);
  assert.equal(blob.includes("fs.read"), false);
  assert.deepEqual(codes(diags), [FUNGI_EXPLAIN_002]);
});

test("explainManifest emits 003 when no include facet is true", () => {
  assert.deepEqual(
    codes(
      explainManifest(
        manifest(),
        options({
          includeEffects: false,
          includeCapabilities: false,
          includeBoundaries: false,
          includeImports: false,
        }),
      ).diagnostics,
    ),
    [FUNGI_EXPLAIN_003],
  );
});

test("explainManifest respects include flags for lists and traces", () => {
  const result = explainManifest(
    manifest(),
    options({
      includeEffects: true,
      includeCapabilities: false,
      includeBoundaries: false,
      includeImports: false,
    }),
  );
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(
    result.traces.map((t) => t.label),
    ["effect", "effect"],
  );
  assert.deepEqual(result.effects, ["fs.read", "net.fetch"]);
  assert.deepEqual(result.capabilities, []);
  assert.deepEqual(result.boundaries, []);
});

test("createExplainResult and readExplainResult round-trip closed success", () => {
  const built = explainManifest(manifest(), options());
  const created = createExplainResult(
    built.traces,
    built.effects,
    built.capabilities,
    built.boundaries,
    built.diagnostics,
  );
  const read = readExplainResult(created);
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.deepEqual(read.value.traces.map((t) => t.output), built.traces.map((t) => t.output));
    assert.deepEqual(read.value.effects, built.effects);
  }
});

test("readExplainResult emits 004 when steps are not contiguous from zero", () => {
  const bad = {
    traces: [
      {
        step: 1,
        label: "effect",
        input: "manifest.effects",
        output: "fs.read",
        diagnostics: [],
      },
    ],
    effects: ["fs.read"],
    capabilities: [],
    boundaries: [],
    diagnostics: [],
  };
  const read = readExplainResult(bad);
  assert.equal(read.ok, false);
  if (!read.ok) assert.deepEqual(codes(read.diagnostics), [FUNGI_EXPLAIN_004]);
});

test("createExplainResult snapshots diagnostic entries (no getter spread)", () => {
  let reads = 0;
  const entry = {};
  Object.defineProperty(entry, "code", {
    enumerable: true,
    get: () => {
      reads += 1;
      return FUNGI_EXPLAIN_001;
    },
  });
  Object.defineProperty(entry, "severity", { enumerable: true, value: "error" });
  Object.defineProperty(entry, "message", { enumerable: true, value: "x" });
  Object.defineProperty(entry, "field", { enumerable: true, value: "record" });
  const created = createExplainResult([], [], [], [], [entry]);
  // Accessor-bearing diagnostic entry must be refused by snapshot (001), not copied live.
  assert.deepEqual(codes(created.diagnostics), [FUNGI_EXPLAIN_001]);
  assert.equal(created.diagnostics[0].message.includes("dense array"), true);
  // Getter may have been observed during snapshot; must not remain live on the result.
  reads = 0;
  void created.diagnostics[0].code;
  assert.equal(reads, 0);
});
