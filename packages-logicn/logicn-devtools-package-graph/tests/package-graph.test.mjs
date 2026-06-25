import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanPackage, buildGraph, runBoundaryGate } from "../dist/index.js";

// Build a throwaway fixture package on disk.
function makeFixture(files, pkgName = "@logicn/fixture") {
  const root = mkdtempSync(join(tmpdir(), "pkg-graph-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: pkgName }));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("scanner classifies internal / node_core / workspace / thirdparty imports", () => {
  const root = makeFixture({
    "src/index.ts": `import { a } from "./a.js";\nimport { readFileSync } from "node:fs";\nimport { x } from "@logicn/other";\nimport axios from "axios";`,
    "src/a.ts": `export const a = 1;`,
  });
  const scan = scanPackage(root);
  const idx = scan.files.find(f => f.path === "src/index.ts");
  const kinds = idx.imports.map(i => `${i.specifier}:${i.kind}`).sort();
  assert.deepEqual(kinds, [
    "./a.js:internal",
    "@logicn/other:workspace",
    "axios:thirdparty",
    "node:fs:node_core",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("graph resolves internal edges and external surface", () => {
  const root = makeFixture({
    "src/index.ts": `import { a } from "./a.js";\nimport { readFileSync } from "node:fs";`,
    "src/a.ts": `export const a = 1;`,
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.fileCount, 2);
  assert.equal(graph.stats.internalEdgeCount, 1); // index -> a
  assert.equal(graph.stats.nodeCoreCount, 1);     // node:fs
  assert.equal(graph.stats.thirdpartyCount, 0);
  rmSync(root, { recursive: true, force: true });
});

test("orphan detection flags unreferenced non-entry files", () => {
  const root = makeFixture({
    "src/index.ts": `export const main = 1;`,
    "src/used.ts": `export const u = 1;`,
    "src/orphan.ts": `export const o = 1;`, // imported by nobody
    "src/consumer.ts": `import { u } from "./used.js";`, // also an orphan (nothing imports it)
  });
  const graph = buildGraph(scanPackage(root));
  // index.ts is an entry point (never orphan). used.ts is imported. orphan.ts + consumer.ts are orphans.
  assert.ok(graph.orphans.includes("src/orphan.ts"));
  assert.ok(graph.orphans.includes("src/consumer.ts"));
  assert.ok(!graph.orphans.includes("src/index.ts"));
  assert.ok(!graph.orphans.includes("src/used.ts"));
  rmSync(root, { recursive: true, force: true });
});

test("comments do not produce phantom imports", () => {
  const root = makeFixture({
    "src/index.ts": `// import axios from "axios";\n/* import lodash from "lodash"; */\nexport const x = 1;`,
  });
  const graph = buildGraph(scanPackage(root));
  assert.equal(graph.stats.thirdpartyCount, 0); // commented-out imports ignored
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: generation (no --check) creates a baseline", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  const graph = buildGraph(scanPackage(root));
  const result = runBoundaryGate(root, graph, false); // generation mode establishes the baseline
  assert.equal(result.status, "BASELINE_CREATED");
  assert.ok(existsSync(join(root, ".graph", "boundary-policy.json")));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: a MISSING policy under --check FAILS (no delete-to-launder)", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  // Establish the baseline (generation mode).
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);
  // Attacker (or accident) deletes the policy AND adds a forbidden import at the same time.
  rmSync(join(root, ".graph", "boundary-policy.json"), { force: true });
  writeFileSync(join(root, "src", "index.ts"),
    `import { readFileSync } from "node:fs";\nimport axios from "axios";`);
  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true); // enforce
  // MUST fail — never silently re-baseline a deleted policy (that would re-bless axios green).
  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.some((v) => v.includes("missing")));
  // And it must NOT re-create the policy under --check (no laundering).
  assert.ok(!existsSync(join(root, ".graph", "boundary-policy.json")));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: new external dep fails --check after baseline", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  // First run — baseline (generation) with only node:fs
  runBoundaryGate(root, buildGraph(scanPackage(root)), false);

  // Now add a forbidden third-party import
  writeFileSync(join(root, "src", "index.ts"),
    `import { readFileSync } from "node:fs";\nimport axios from "axios";`);
  const graph2 = buildGraph(scanPackage(root));
  const result = runBoundaryGate(root, graph2, true);

  assert.equal(result.status, "FAIL");
  assert.ok(result.violations.includes("axios"));
  rmSync(root, { recursive: true, force: true });
});

test("boundary gate: dep already in allowlist passes", () => {
  const root = makeFixture({
    "src/index.ts": `import { readFileSync } from "node:fs";`,
  });
  runBoundaryGate(root, buildGraph(scanPackage(root)), false); // baseline (generation) includes node:fs
  // Re-run --check with the same imports — should PASS
  const result = runBoundaryGate(root, buildGraph(scanPackage(root)), true);
  assert.equal(result.status, "PASS");
  assert.equal(result.violations.length, 0);
  rmSync(root, { recursive: true, force: true });
});
