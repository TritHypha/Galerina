import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isServerOnlyImport,
  validateJsOutputPlan,
  validateEsModuleMetadata,
  validateFrameworkAdapterMetadata,
  createJsBundleReport,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);
const errorCodes = (diags) => diags.filter((d) => d.severity === "error").map((d) => d.code);

const browserPlan = {
  flow: "checkout-ui",
  runtime: "browser",
  moduleFormat: "esm",
  imports: ["./dom-glue.js", "galerina-web-render"],
  accessesEnvironment: false,
  accessesSecrets: false,
  sourceMap: { mode: "external", includeSourcesContent: false, production: true },
};

describe("isServerOnlyImport — deny-by-default module surface", () => {
  it("flags node: scheme and classic builtins; passes relative/browser specifiers", () => {
    assert.equal(isServerOnlyImport("node:fs"), true);
    assert.equal(isServerOnlyImport("fs"), true);
    assert.equal(isServerOnlyImport("fs/promises"), true);
    assert.equal(isServerOnlyImport("node:fs/promises"), true);
    assert.equal(isServerOnlyImport("node:test"), true);
    assert.equal(isServerOnlyImport("timers/promises"), true);
    assert.equal(isServerOnlyImport("child_process"), true);
    assert.equal(isServerOnlyImport("crypto"), true);
    assert.equal(isServerOnlyImport("./local.js"), false);
    assert.equal(isServerOnlyImport("galerina-web-render"), false);
  });
});

describe("validateJsOutputPlan — browser is fail-closed", () => {
  it("accepts a clean production browser ESM plan", () => {
    assert.deepEqual(codes(validateJsOutputPlan(browserPlan)), []);
  });

  it("blocks server-only imports in a browser plan (node:fs AND bare fs)", () => {
    const diags = validateJsOutputPlan({ ...browserPlan, imports: ["node:fs", "fs", "./ok.js"] });
    assert.deepEqual(errorCodes(diags), [
      "FUNGI-JS-007",
      "FUNGI-JS-007",
    ]);
  });

  it("allows the same imports for the optional Node target", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      runtime: "node",
      imports: ["node:fs", "path"],
      sourceMap: { mode: "external", includeSourcesContent: false, production: true },
    });
    assert.deepEqual(codes(diags), []);
  });

  it("denies environment and secret access for browser output", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      accessesEnvironment: true,
      accessesSecrets: true,
    });
    assert.deepEqual(errorCodes(diags).sort(), [
      "FUNGI-JS-008",
      "FUNGI-JS-009",
    ]);
  });

  it("browser output must be ESM (cjs is Node-only)", () => {
    const diags = validateJsOutputPlan({ ...browserPlan, moduleFormat: "cjs" });
    assert.deepEqual(errorCodes(diags), ["FUNGI-JS-006"]);
  });

  it("requires a flow and a known runtime", () => {
    const bad = validateJsOutputPlan({ ...browserPlan, flow: " ", runtime: "deno" });
    assert.deepEqual(codes(bad), [
      "FUNGI-JS-003",
      "FUNGI-JS-004",
    ]);
  });

  it("production browser: sourcesContent is an error, inline map a warning", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      sourceMap: { mode: "inline", includeSourcesContent: true, production: true },
    });
    assert.ok(errorCodes(diags).includes("FUNGI-JS-012"));
    const warn = diags.find((d) => d.code === "FUNGI-JS-011");
    assert.equal(warn?.severity, "warning");
  });

  it("non-production browser plans may carry inline maps (dev loop)", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      sourceMap: { mode: "inline", includeSourcesContent: true, production: false },
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects accessor, inherited and surplus plan records without reading accessors", () => {
    let reads = 0;
    const accessorPlan = { ...browserPlan };
    Object.defineProperty(accessorPlan, "flow", {
      enumerable: true,
      get() {
        reads += 1;
        return "checkout-ui";
      },
    });
    assert.deepEqual(errorCodes(validateJsOutputPlan(accessorPlan)), ["FUNGI-JS-001"]);
    assert.equal(reads, 0);

    assert.deepEqual(
      errorCodes(validateJsOutputPlan({ ...browserPlan, extra: true })),
      ["FUNGI-JS-001"],
    );
    const sparseImports = [];
    sparseImports.length = 1;
    assert.deepEqual(
      errorCodes(validateJsOutputPlan({ ...browserPlan, imports: sparseImports })),
      ["FUNGI-JS-001"],
    );
    class ArraySubclass extends Array {}
    assert.deepEqual(
      errorCodes(validateJsOutputPlan({ ...browserPlan, imports: new ArraySubclass("./ok.js") })),
      ["FUNGI-JS-001"],
    );
    assert.deepEqual(
      errorCodes(validateJsOutputPlan(new Proxy({ ...browserPlan }, {}))),
      ["FUNGI-JS-001"],
    );
  });
});

describe("validateEsModuleMetadata / validateFrameworkAdapterMetadata", () => {
  it("module: requires a path; warns (not errors) on zero exports", () => {
    const diags = validateEsModuleMetadata({ path: "", exports: [], imports: [] });
    assert.deepEqual(codes(diags).sort(), [
      "FUNGI-JS-013",
      "FUNGI-JS-014",
    ]);
    assert.equal(diags.find((d) => d.code === "FUNGI-JS-014")?.severity, "warning");
  });

  it("adapter: requires a framework name", () => {
    assert.deepEqual(
      codes(validateFrameworkAdapterMetadata({ framework: " " })),
      ["FUNGI-JS-015"],
    );
    assert.deepEqual(codes(validateFrameworkAdapterMetadata({ framework: "react", mountPoint: "#app" })), []);
  });
});

describe("createJsBundleReport — check outcomes are DERIVED, never caller-asserted", () => {
  it("clean browser bundle: all three checks pass", () => {
    const report = createJsBundleReport({
      plan: browserPlan,
      entry: "dist/checkout-ui.js",
      modules: [{ path: "dist/checkout-ui.js", exports: ["mount"], imports: [] }],
      adapters: [{ framework: "react", mountPoint: "#app" }],
    });
    assert.deepEqual(report.checks.map((c) => [c.check, c.passed]), [
      ["server-only-imports-blocked", true],
      ["browser-secret-access-denied", true],
      ["source-map-disclosure", true],
    ]);
    assert.deepEqual(report.diagnostics, []);
  });

  it("a leaking plan cannot produce a passing report", () => {
    const report = createJsBundleReport({
      plan: { ...browserPlan, imports: ["node:fs"], accessesSecrets: true },
      entry: "dist/bad.js",
      modules: [],
    });
    const byName = Object.fromEntries(report.checks.map((c) => [c.check, c.passed]));
    assert.equal(byName["server-only-imports-blocked"], false);
    assert.equal(byName["browser-secret-access-denied"], false);
    assert.ok(report.diagnostics.length >= 2);
  });

  it("checks module imports and refuses an invalid plan instead of passing absent checks", () => {
    const leakingModule = createJsBundleReport({
      plan: { ...browserPlan, imports: ["./declared.js"] },
      entry: "dist/bad-module.js",
      modules: [{ path: "dist/bad-module.js", exports: [], imports: ["fs/promises"] }],
    });
    assert.equal(leakingModule.checks.find((c) => c.check === "server-only-imports-blocked")?.passed, false);
    assert.ok(errorCodes(leakingModule.diagnostics).includes("FUNGI-JS-007"));

    const invalidPlan = createJsBundleReport({
      plan: { ...browserPlan, runtime: "deno" },
      entry: "dist/invalid.js",
      modules: [],
    });
    assert.equal(invalidPlan.checks.every((check) => check.passed === false), true);
  });

  it("returns immutable report snapshots rather than caller-owned aliases", () => {
    const modules = [{ path: "dist/checkout-ui.js", exports: ["mount"], imports: [] }];
    const adapters = [{ framework: "react", mountPoint: "#app" }];
    const report = createJsBundleReport({
      plan: browserPlan,
      entry: "dist/checkout-ui.js",
      modules,
      adapters,
    });

    modules[0].exports.push("mutated-after-report");
    adapters[0].mountPoint = "#other";
    assert.deepEqual(report.modules[0].exports, ["mount"]);
    assert.equal(report.adapters[0].mountPoint, "#app");
    assert.throws(() => report.modules[0].exports.push("report-alias"), TypeError);
  });
});
