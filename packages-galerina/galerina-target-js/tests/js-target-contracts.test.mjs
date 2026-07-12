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
      "Galerina_JS_SERVER_ONLY_IMPORT_IN_BROWSER",
      "Galerina_JS_SERVER_ONLY_IMPORT_IN_BROWSER",
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
      "Galerina_JS_BROWSER_ENVIRONMENT_ACCESS_DENIED",
      "Galerina_JS_BROWSER_SECRET_ACCESS_DENIED",
    ]);
  });

  it("browser output must be ESM (cjs is Node-only)", () => {
    const diags = validateJsOutputPlan({ ...browserPlan, moduleFormat: "cjs" });
    assert.deepEqual(errorCodes(diags), ["Galerina_JS_BROWSER_REQUIRES_ESM"]);
  });

  it("requires a flow and a known runtime", () => {
    const bad = validateJsOutputPlan({ ...browserPlan, flow: " ", runtime: "deno" });
    assert.deepEqual(codes(bad), [
      "Galerina_JS_PLAN_FLOW_REQUIRED",
      "Galerina_JS_RUNTIME_INVALID",
    ]);
  });

  it("production browser: sourcesContent is an error, inline map a warning", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      sourceMap: { mode: "inline", includeSourcesContent: true, production: true },
    });
    assert.ok(errorCodes(diags).includes("Galerina_JS_SOURCES_CONTENT_IN_PRODUCTION"));
    const warn = diags.find((d) => d.code === "Galerina_JS_SOURCE_MAP_INLINE_IN_PRODUCTION");
    assert.equal(warn?.severity, "warning");
  });

  it("non-production browser plans may carry inline maps (dev loop)", () => {
    const diags = validateJsOutputPlan({
      ...browserPlan,
      sourceMap: { mode: "inline", includeSourcesContent: true, production: false },
    });
    assert.deepEqual(codes(diags), []);
  });
});

describe("validateEsModuleMetadata / validateFrameworkAdapterMetadata", () => {
  it("module: requires a path; warns (not errors) on zero exports", () => {
    const diags = validateEsModuleMetadata({ path: "", exports: [], imports: [] });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_JS_MODULE_NO_EXPORTS",
      "Galerina_JS_MODULE_PATH_REQUIRED",
    ]);
    assert.equal(diags.find((d) => d.code === "Galerina_JS_MODULE_NO_EXPORTS")?.severity, "warning");
  });

  it("adapter: requires a framework name", () => {
    assert.deepEqual(
      codes(validateFrameworkAdapterMetadata({ framework: " " })),
      ["Galerina_JS_ADAPTER_FRAMEWORK_REQUIRED"],
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
});
