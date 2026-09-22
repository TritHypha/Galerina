/**
 * RD-1295 cli-check isolation. Export names are not evidence.
 * Graph checks walk emitted JS and resolve package subpaths.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  Verdict,
  collapse,
  authorize,
  decideAtBoundary,
  allOf,
  vAnd,
  governAiProposal,
  TOWER_PROFILE_GOVERNANCE,
  TOWER_COMPOSITION_CLI_CHECK,
  CLI_CHECK_ALLOWED_STEMS,
} from "../dist/governance.js";
import {
  walkLoadGraph,
  enforceClosedSet,
  cliCheckAllowedFiles,
  kernelAllowedFiles,
  isTowerRootBarrel,
  resolveEsmPackageFromImporter,
  KERNEL_FORBIDDEN_MODULES,
  KERNEL_PERMITTED_EXTERNALS,
} from "../dist/load-graph.js";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, "..");
const DIST = join(PKG, "dist");
const FIX = join(here, "fixtures", "rd-1295-graph");
const RESOLVE_FIX = join(here, "fixtures", "rd-1295-resolve");
const NETWORK_DIST = resolve(here, "..", "..", "galerina-core-network", "dist");

function real(p) {
  return realpathSync.native(p);
}

function fixture(name) {
  return join(FIX, name, "entry.js");
}

test("cli-check is kernel-free and is not tower.governance.v1", () => {
  assert.equal(TOWER_PROFILE_GOVERNANCE, "tower.governance.v1");
  assert.equal(TOWER_COMPOSITION_CLI_CHECK, "cli-check");
  assert.equal(CLI_CHECK_ALLOWED_STEMS.includes("tower-runtime"), false);
  assert.equal(CLI_CHECK_ALLOWED_STEMS.includes("plugin-sandbox"), false);
  assert.equal(CLI_CHECK_ALLOWED_STEMS.includes("audit-logger"), false);
});

test("cli-check governance entry admits Allow and denies Unknown/Deny at the boundary", () => {
  const { ALLOW, DENY, INDETERMINATE } = Verdict;
  assert.equal(collapse(ALLOW), "allow");
  assert.equal(authorize(ALLOW), true);
  assert.equal(decideAtBoundary(ALLOW).authorized, true);
  assert.equal(decideAtBoundary(DENY).authorized, false);
  assert.equal(decideAtBoundary(INDETERMINATE).authorized, false);
  assert.ok(
    JSON.stringify(decideAtBoundary(INDETERMINATE).diagnostic).includes("FUNGI-GOV-3VL-001"),
    "unknown at the boundary must emit FUNGI-GOV-3VL-001",
  );
  assert.equal(allOf([ALLOW, ALLOW]), ALLOW);
  assert.equal(vAnd(ALLOW, INDETERMINATE), INDETERMINATE);
  assert.equal(vAnd(ALLOW, DENY), DENY);
});

test("No-Coercion: an AI ALLOW cannot enlarge a core DENY", () => {
  const { ALLOW, DENY } = Verdict;
  const result = governAiProposal([
    { action: "database.delete", coreVerdict: DENY, aiVerdict: ALLOW },
    { action: "database.read", coreVerdict: ALLOW, aiVerdict: ALLOW },
  ]);
  assert.equal(result.containmentHeld, true);
  assert.equal(result.noCoercionHeld, true);
  assert.deepEqual(result.admitted, ["database.read"]);
  assert.deepEqual(result.blockedHallucinations, ["database.delete"]);
});

test("Q1 clean: relative import and re-export are recorded", async () => {
  const graph = await walkLoadGraph(fixture("clean"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.equal(graph.files.length, 2);
  assert.ok(graph.edges.some((e) => e.kind === "static" && e.specifier === "./leaf.js"));
});

test("Q1 clean: commented imports are not edges", async () => {
  const graph = await walkLoadGraph(fixture("clean-comment"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.files.length, 1);
});

test("Q1 clean: from/import text inside strings is not an edge", async () => {
  const graph = await walkLoadGraph(fixture("clean-string"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.files.length, 1);
});

test("Q1 clean: ordinary template text has no import edges", async () => {
  const graph = await walkLoadGraph(fixture("clean-template-text"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.equal(graph.edges.length, 0);
});

test("Q1 clean: benign substitutions have no import edges", async () => {
  const graph = await walkLoadGraph(fixture("clean-benign-sub"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.equal(graph.edges.length, 0);
});

test("Q1: allowed literal import inside a substitution is recorded", async () => {
  const graph = await walkLoadGraph(fixture("sub-allowed-import"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.ok(graph.edges.some((e) => e.kind === "dynamic" && e.specifier === "node:path"));
  assert.deepEqual(graph.externals, ["node:path"]);
  const report = enforceClosedSet(graph, [real(fixture("sub-allowed-import"))]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.unpermittedExternals, ["node:path"]);
});

test("Q1 hostile: forbidden Tower barrel inside a substitution is refused", async () => {
  const graph = await walkLoadGraph(fixture("sub-forbidden-barrel"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /forbidden-tower-barrel/);
});

test("Q1: nested substitution import is recorded", async () => {
  const graph = await walkLoadGraph(fixture("sub-nested-import"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.ok(graph.edges.some((e) => e.specifier === "node:fs"));
});

test("Q1 hostile: side-effect import is a load edge", async () => {
  const graph = await walkLoadGraph(fixture("hostile-side-effect"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.ok(graph.edges.some((e) => e.kind === "side-effect" && e.specifier === "./tpl-simulator.js"));
  assert.ok(graph.files.some((f) => f.replace(/\\/g, "/").endsWith("/tpl-simulator.js")));
});

test("Q1 hostile: export-from is a load edge", async () => {
  const graph = await walkLoadGraph(fixture("hostile-export"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.ok(graph.edges.some((e) => e.kind === "export" && e.specifier === "./tpl-simulator.js"));
});

test("Q1 hostile: literal dynamic import is a load edge", async () => {
  const graph = await walkLoadGraph(fixture("hostile-dynamic"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  assert.ok(graph.edges.some((e) => e.kind === "dynamic" && e.specifier === "./tpl-simulator.js"));
});

test("Q1 hostile: unresolved relative import is refused", async () => {
  const graph = await walkLoadGraph(fixture("hostile-unresolved"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /unresolved-relative/);
});

test("Q1 hostile: non-literal dynamic import is refused", async () => {
  const graph = await walkLoadGraph(fixture("hostile-unsupported"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /unsupported-dynamic-import/);
});

test("Q1 hostile: interpolated template import is refused", async () => {
  const graph = await walkLoadGraph(fixture("hostile-template"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /unsupported-dynamic-import/);
});

test("Q1 hostile: Tower root barrel specifier is refused", async () => {
  assert.equal(isTowerRootBarrel("@galerina/tower-citizen"), true);
  const graph = await walkLoadGraph(fixture("hostile-barrel"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /forbidden-tower-barrel/);
});

test("Q1 hostile: known inference subpath is walked but refused by cli-check", async () => {
  const graph = await walkLoadGraph(fixture("hostile-subpath"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const report = enforceClosedSet(graph, [...cliCheckAllowedFiles(PKG), real(fixture("hostile-subpath"))]);
  assert.equal(report.ok, false);
  assert.ok(report.extras.includes(real(join(DIST, "hybrid-engine.js"))));
  assert.ok(report.forbidden.includes("hybrid-engine"));
});

test("Q2 positive: legitimate cli-check graph is a closed allowed set", async () => {
  const graph = await walkLoadGraph(join(DIST, "governance.js"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const allowed = cliCheckAllowedFiles(PKG);
  const report = enforceClosedSet(graph, allowed);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.extras, []);
  assert.deepEqual(report.forbidden, []);
  assert.deepEqual(graph.externals, ["node:crypto"]);
});

test("Q2 hostile: an unlisted module fails closed-set even if not forbidden", async () => {
  const graph = await walkLoadGraph(fixture("hostile-unlisted"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const allowed = [real(fixture("hostile-unlisted")), real(join(FIX, "hostile-unlisted", "allowed.js"))];
  const report = enforceClosedSet(graph, allowed);
  assert.equal(report.ok, false);
  assert.ok(report.extras.some((f) => f.replace(/\\/g, "/").endsWith("/extra.js")));
});

test("Q2 hostile: same basename outside the allowed realpath fails", async () => {
  const graph = await walkLoadGraph(fixture("hostile-same-basename"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const distGates = real(join(DIST, "trit-gates.js"));
  const report = enforceClosedSet(graph, [real(fixture("hostile-same-basename")), distGates]);
  assert.equal(report.ok, false);
  const impersonator = real(join(FIX, "outside", "trit-gates.js"));
  assert.ok(report.extras.includes(impersonator));
  assert.ok(!report.extras.includes(distGates));
});

test("Q2 hostile: a known forbidden stem fails", async () => {
  const graph = await walkLoadGraph(fixture("hostile-side-effect"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const report = enforceClosedSet(graph, [real(fixture("hostile-side-effect"))]);
  assert.equal(report.ok, false);
  assert.ok(report.forbidden.includes("tpl-simulator"));
});

test("Q3: importer-anchored subpath from cert-gate is dist/governance.js, not the barrel", () => {
  const certGate = join(NETWORK_DIST, "cert-gate.js");
  const resolved = resolveEsmPackageFromImporter(certGate, "@galerina/tower-citizen/governance");
  assert.equal("kind" in resolved && resolved.kind === "file", true, JSON.stringify(resolved));
  if (!("kind" in resolved) || resolved.kind !== "file") return;
  assert.equal(resolved.path, real(join(DIST, "governance.js")));
  const barrel = resolveEsmPackageFromImporter(certGate, "@galerina/tower-citizen");
  assert.equal("kind" in barrel && barrel.kind === "file", true, JSON.stringify(barrel));
  if (!("kind" in barrel) || barrel.kind !== "file") return;
  assert.equal(barrel.path, real(join(DIST, "index.js")));
  assert.notEqual(resolved.path, barrel.path);
});

function writeIsolatedGovernanceInstance(id) {
  const root = mkdtempSync(join(tmpdir(), `rd1295-gov-${id}-`));
  const pkg = join(root, "node_modules", "@galerina", "tower-citizen");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, "package.json"), `${JSON.stringify({
    name: "@galerina/tower-citizen",
    type: "module",
    exports: { "./governance": { import: "./governance.js" } },
  }, null, 2)}\n`);
  writeFileSync(join(pkg, "governance.js"), `export const instance = ${JSON.stringify(id)};\n`);
  writeFileSync(
    join(root, "entry.js"),
    `import { instance } from "@galerina/tower-citizen/governance";\nexport { instance };\n`,
  );
  writeFileSync(
    join(root, "probe.mjs"),
    `export const resolved = import.meta.resolve("@galerina/tower-citizen/governance");\n`,
  );
  return root;
}

test("Q2 resolve: two package instances match Node's importer-anchored load", async () => {
  const dest = {};
  const roots = [];
  try {
    for (const id of ["a", "b"]) {
      const dir = writeIsolatedGovernanceInstance(id);
      roots.push(dir);
      const entry = join(dir, "entry.js");
      const graph = await walkLoadGraph(entry);
      assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
      const loaded = await import(pathToFileURL(entry).href);
      assert.equal(loaded.instance, id);
      const probeMod = await import(pathToFileURL(join(dir, "probe.mjs")).href);
      const nodeDest = real(fileURLToPath(probeMod.resolved));
      const walkerDest = resolveEsmPackageFromImporter(entry, "@galerina/tower-citizen/governance");
      assert.equal("kind" in walkerDest && walkerDest.kind === "file", true, JSON.stringify(walkerDest));
      if (!("kind" in walkerDest) || walkerDest.kind !== "file") return;
      assert.equal(walkerDest.path, nodeDest);
      assert.ok(graph.files.includes(nodeDest));
      dest[id] = nodeDest;
    }
    assert.notEqual(dest.a, dest.b);
    assert.notEqual(dest.a, real(join(DIST, "governance.js")));
    assert.notEqual(dest.b, real(join(DIST, "governance.js")));
  } finally {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  }
});

test("Q2 resolve: missing package is refused", async () => {
  const graph = await walkLoadGraph(join(RESOLVE_FIX, "unresolved", "entry.js"));
  assert.equal(graph.ok, false);
  assert.match(graph.reason, /unresolved-package/);
});

function writeConditionPackage(order) {
  const root = mkdtempSync(join(tmpdir(), "rd1295-cond-"));
  const pkg = join(root, "node_modules", "rd1295-condition-probe");
  mkdirSync(pkg, { recursive: true });
  const conditions = {};
  for (const key of order) conditions[key] = `./${key}.js`;
  writeFileSync(join(pkg, "package.json"), `${JSON.stringify({
    name: "rd1295-condition-probe",
    type: "module",
    exports: { ".": conditions },
  })}\n`);
  writeFileSync(join(pkg, "node.js"), `export const marker = "node";\nexport const resolvedPath = import.meta.url;\n`);
  writeFileSync(join(pkg, "import.js"), `export const marker = "import";\nexport const resolvedPath = import.meta.url;\n`);
  writeFileSync(join(root, "entry.js"), `export { marker, resolvedPath } from "rd1295-condition-probe";\n`);
  writeFileSync(join(root, "probe.mjs"), `export const resolved = import.meta.resolve("rd1295-condition-probe");\n`);
  return root;
}

test("Q1 resolve: node-before-import matches Node and rejects an import.js allow-list", async () => {
  const root = writeConditionPackage(["node", "import"]);
  try {
    const entry = join(root, "entry.js");
    const loaded = await import(pathToFileURL(entry).href);
    assert.equal(loaded.marker, "node");
    const nodeDest = real(fileURLToPath((await import(pathToFileURL(join(root, "probe.mjs")).href)).resolved));
    assert.equal(nodeDest, real(join(root, "node_modules", "rd1295-condition-probe", "node.js")));
    const walkerDest = resolveEsmPackageFromImporter(entry, "rd1295-condition-probe");
    assert.equal("kind" in walkerDest && walkerDest.kind === "file", true, JSON.stringify(walkerDest));
    if (!("kind" in walkerDest) || walkerDest.kind !== "file") return;
    assert.equal(walkerDest.path, nodeDest);
    const graph = await walkLoadGraph(entry);
    assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
    assert.ok(graph.files.includes(nodeDest));
    const importJs = real(join(root, "node_modules", "rd1295-condition-probe", "import.js"));
    const wrong = enforceClosedSet(graph, [real(entry), importJs], [], []);
    assert.equal(wrong.ok, false, "closed-set must not admit import.js when Node loaded node.js");
    assert.ok(wrong.extras.includes(nodeDest));
    const right = enforceClosedSet(graph, [real(entry), nodeDest], [], []);
    assert.equal(right.ok, true, JSON.stringify(right));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Q1 resolve: import-before-node still selects import (object-key order, not a fixed import-first list)", async () => {
  const root = writeConditionPackage(["import", "node"]);
  try {
    const entry = join(root, "entry.js");
    const loaded = await import(pathToFileURL(entry).href);
    assert.equal(loaded.marker, "import");
    const nodeDest = real(fileURLToPath((await import(pathToFileURL(join(root, "probe.mjs")).href)).resolved));
    const walkerDest = resolveEsmPackageFromImporter(entry, "rd1295-condition-probe");
    assert.equal("kind" in walkerDest && walkerDest.kind === "file", true, JSON.stringify(walkerDest));
    if (!("kind" in walkerDest) || walkerDest.kind !== "file") return;
    assert.equal(walkerDest.path, nodeDest);
    assert.equal(nodeDest, real(join(root, "node_modules", "rd1295-condition-probe", "import.js")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Q1 resolve: package self-reference wins over a nested same-name copy", async () => {
  const root = mkdtempSync(join(tmpdir(), "rd1295-self-"));
  try {
    writeFileSync(join(root, "package.json"), `${JSON.stringify({
      name: "rd1295-self-probe",
      type: "module",
      exports: { ".": "./self.js" },
    })}\n`);
    writeFileSync(join(root, "self.js"), `export const marker = "self";\n`);
    const nested = join(root, "node_modules", "rd1295-self-probe");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "package.json"), `${JSON.stringify({
      name: "rd1295-self-probe",
      type: "module",
      exports: { ".": "./shadow.js" },
    })}\n`);
    writeFileSync(join(nested, "shadow.js"), `export const marker = "shadow";\n`);
    writeFileSync(join(root, "entry.js"), `export { marker } from "rd1295-self-probe";\n`);
    writeFileSync(join(root, "probe.mjs"), `export const resolved = import.meta.resolve("rd1295-self-probe");\n`);
    const entry = join(root, "entry.js");
    const loaded = await import(pathToFileURL(entry).href);
    assert.equal(loaded.marker, "self");
    const nodeDest = real(fileURLToPath((await import(pathToFileURL(join(root, "probe.mjs")).href)).resolved));
    assert.equal(nodeDest, real(join(root, "self.js")));
    const walkerDest = resolveEsmPackageFromImporter(entry, "rd1295-self-probe");
    assert.equal("kind" in walkerDest && walkerDest.kind === "file", true, JSON.stringify(walkerDest));
    if (!("kind" in walkerDest) || walkerDest.kind !== "file") return;
    assert.equal(walkerDest.path, nodeDest);
    const graph = await walkLoadGraph(entry);
    assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
    assert.ok(graph.files.includes(nodeDest));
    const shadow = real(join(nested, "shadow.js"));
    const wrong = enforceClosedSet(graph, [real(entry), shadow], [], []);
    assert.equal(wrong.ok, false, "closed-set must not admit the nested shadow when Node loaded self.js");
    assert.ok(wrong.extras.includes(nodeDest));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Q1 resolve: require-only exports refuse for ESM import", () => {
  const root = mkdtempSync(join(tmpdir(), "rd1295-cjs-"));
  try {
    const pkg = join(root, "node_modules", "rd1295-cjs-probe");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), `${JSON.stringify({
      name: "rd1295-cjs-probe",
      exports: { ".": { require: "./cjs.js" } },
    })}\n`);
    writeFileSync(join(pkg, "cjs.js"), "module.exports = 1;\n");
    const entry = join(root, "entry.js");
    writeFileSync(entry, `import x from "rd1295-cjs-probe";\nexport default x;\n`);
    const resolved = resolveEsmPackageFromImporter(entry, "rd1295-cjs-probe");
    assert.equal("ok" in resolved && resolved.ok === false, true, JSON.stringify(resolved));
    if (!("ok" in resolved) || resolved.ok !== false) return;
    assert.match(resolved.reason, /unsupported-esm-export/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Q3: cert-gate load graph is cli-check plus itself", async () => {
  const certGate = real(join(NETWORK_DIST, "cert-gate.js"));
  const graph = await walkLoadGraph(certGate);
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const allowed = [...cliCheckAllowedFiles(PKG), certGate];
  const report = enforceClosedSet(graph, allowed);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.ok(graph.files.includes(real(join(DIST, "governance.js"))));
  assert.equal(graph.files.some((f) => f.replace(/\\/g, "/").endsWith("/index.js") && f.includes("tower-citizen")), false);
});

test("Q3: admission-feedback load graph is cli-check plus cert-gate", async () => {
  const admission = real(join(NETWORK_DIST, "admission-feedback.js"));
  const certGate = real(join(NETWORK_DIST, "cert-gate.js"));
  const graph = await walkLoadGraph(admission);
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const allowed = [...cliCheckAllowedFiles(PKG), certGate, admission];
  const report = enforceClosedSet(graph, allowed);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.ok(graph.files.includes(certGate));
});

test("kernel entry does not load TPL, photonic, custody, dataplane or hybrid", async () => {
  const graph = await walkLoadGraph(join(DIST, "kernel.js"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const towerFiles = graph.files.filter((f) => f.replace(/\\/g, "/").includes("/galerina-tower-citizen/dist/"));
  const report = enforceClosedSet(
    { ...graph, files: towerFiles },
    kernelAllowedFiles(PKG),
    KERNEL_PERMITTED_EXTERNALS,
    KERNEL_FORBIDDEN_MODULES,
  );
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(graph.files.some((f) => f.replace(/\\/g, "/").endsWith("/tpl-simulator.js")), false);
  assert.equal(graph.files.some((f) => f.replace(/\\/g, "/").endsWith("/hybrid-engine.js")), false);
});

test("kernel linter: a TPL import is a forbidden extra", async () => {
  const graph = await walkLoadGraph(fixture("hostile-kernel-tpl"));
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const report = enforceClosedSet(
    graph,
    [real(fixture("hostile-kernel-tpl"))],
    KERNEL_PERMITTED_EXTERNALS,
    KERNEL_FORBIDDEN_MODULES,
  );
  assert.equal(report.ok, false);
  assert.ok(report.forbidden.includes("tpl-simulator"));
});

test("kernel export map resolves without the barrel", () => {
  const certGate = join(NETWORK_DIST, "cert-gate.js");
  const resolved = resolveEsmPackageFromImporter(certGate, "@galerina/tower-citizen/kernel");
  assert.equal("kind" in resolved && resolved.kind === "file", true, JSON.stringify(resolved));
  if (!("kind" in resolved) || resolved.kind !== "file") return;
  assert.equal(resolved.path, real(join(DIST, "kernel.js")));
});

test("Q3: core-network barrel loads extra network modules but only cli-check Tower", async () => {
  const index = real(join(NETWORK_DIST, "index.js"));
  const graph = await walkLoadGraph(index);
  assert.equal(graph.ok, true, graph.ok ? "" : graph.reason);
  const towerAllowed = new Set(cliCheckAllowedFiles(PKG));
  const towerFiles = graph.files.filter((f) => f.replace(/\\/g, "/").includes("/galerina-tower-citizen/"));
  assert.deepEqual(
    towerFiles.filter((f) => !towerAllowed.has(f)),
    [],
    `core-network barrel loaded extra Tower files:\n${towerFiles.join("\n")}`,
  );
  const networkFiles = graph.files.filter((f) => f.replace(/\\/g, "/").includes("/galerina-core-network/dist/"));
  assert.ok(networkFiles.some((f) => f.replace(/\\/g, "/").endsWith("/egress-guard.js")));
  assert.ok(networkFiles.some((f) => f.replace(/\\/g, "/").endsWith("/cert-gate.js")));
  assert.equal(
    graph.files.some((f) => f.replace(/\\/g, "/").endsWith("/hybrid-engine.js")),
    false,
  );
});
