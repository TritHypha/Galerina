// W01 G3: build modes, build layout, app.source-map.json and binary-error mapping.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateJsOutputPlan,
  createJsBundleReport,
  jsBuildModePolicy,
  jsBuildLayout,
  validateJsSourceMap,
  mapBinaryError,
  JS_SOURCE_MAP_MAX_MAPPINGS,
} from "../dist/index.js";

const errorCodes = (diags) => diags.filter((d) => d.severity === "error").map((d) => d.code);

const plan = (overrides = {}) => ({
  flow: "checkout-ui",
  runtime: "browser",
  moduleFormat: "esm",
  imports: ["./dom-glue.js"],
  accessesEnvironment: false,
  accessesSecrets: false,
  sourceMap: { mode: "none", includeSourcesContent: false, production: true },
  ...overrides,
});

const map = (overrides = {}) => ({
  version: 1,
  file: "app.js",
  sources: ["src/main.fungi", "src/routes/home.fungi"],
  mappings: [
    { generated: { line: 1, column: 0 }, source: 0, original: { line: 1, column: 0 } },
    { generated: { line: 1, column: 10 }, source: 0, original: { line: 2, column: 4 } },
    { generated: { line: 3, column: 2 }, source: 1, original: { line: 7, column: 1 } },
  ],
  ...overrides,
});

describe("build modes (L916, L917)", () => {
  it("debug: external map, no minification, test report allowed, not production", () => {
    const p = jsBuildModePolicy("debug");
    assert.equal(p.defaultSourceMap, "external");
    assert.equal(p.minify, false);
    assert.equal(p.testReportAllowed, true);
    assert.equal(p.production, false);
    assert.ok(Object.isFrozen(p));
  });

  it("release: no map by default, inline never allowed, production", () => {
    const p = jsBuildModePolicy("release");
    assert.equal(p.defaultSourceMap, "none");
    assert.equal(p.allowedSourceMaps.includes("inline"), false);
    assert.equal(p.minify, true);
    assert.equal(p.production, true);
  });

  it("unknown modes have no policy", () => {
    assert.equal(jsBuildModePolicy("staging"), undefined);
    assert.equal(jsBuildModePolicy("__proto__"), undefined);
  });

  it("a release plan with no map is admitted", () => {
    assert.deepEqual(errorCodes(validateJsOutputPlan(plan({ buildMode: "release" }))), []);
  });

  it("release refuses inline maps on any runtime", () => {
    const diags = validateJsOutputPlan(plan({
      buildMode: "release",
      runtime: "node",
      sourceMap: { mode: "inline", includeSourcesContent: false, production: true },
    }));
    assert.ok(errorCodes(diags).includes("FUNGI-JS-020"));
  });

  it("release external map needs outsideShippedOutput", () => {
    const shipped = validateJsOutputPlan(plan({
      buildMode: "release",
      sourceMap: { mode: "external", includeSourcesContent: false, production: true },
    }));
    assert.ok(errorCodes(shipped).includes("FUNGI-JS-021"));
    const outside = validateJsOutputPlan(plan({
      buildMode: "release",
      sourceMap: { mode: "external", includeSourcesContent: false, production: true, outsideShippedOutput: true },
    }));
    assert.deepEqual(errorCodes(outside), []);
  });

  it("release refuses sourcesContent and non-production flags; debug refuses production", () => {
    const rel = validateJsOutputPlan(plan({
      buildMode: "release",
      runtime: "node",
      sourceMap: { mode: "none", includeSourcesContent: true, production: false },
    }));
    assert.ok(errorCodes(rel).includes("FUNGI-JS-019"));
    assert.ok(errorCodes(rel).includes("FUNGI-JS-022"));
    const dbg = validateJsOutputPlan(plan({
      buildMode: "debug",
      sourceMap: { mode: "external", includeSourcesContent: false, production: true },
    }));
    assert.ok(errorCodes(dbg).includes("FUNGI-JS-019"));
  });

  it("debug plans may use inline or external maps", () => {
    for (const mode of ["inline", "external"]) {
      const diags = validateJsOutputPlan(plan({
        buildMode: "debug",
        sourceMap: { mode, includeSourcesContent: true, production: false },
      }));
      assert.deepEqual(errorCodes(diags), [], mode);
    }
  });

  it("unknown build modes and malformed outsideShippedOutput are refused", () => {
    assert.ok(errorCodes(validateJsOutputPlan(plan({ buildMode: "staging" }))).includes("FUNGI-JS-018"));
    const bad = validateJsOutputPlan(plan({
      sourceMap: { mode: "none", includeSourcesContent: false, production: true, outsideShippedOutput: "yes" },
    }));
    assert.equal(bad.length, 1);
    assert.equal(bad[0].severity, "error");
  });

  it("plans without buildMode keep their previous behaviour", () => {
    assert.deepEqual(errorCodes(validateJsOutputPlan(plan({
      runtime: "node",
      sourceMap: { mode: "inline", includeSourcesContent: false, production: false },
    }))), []);
  });
});

describe("build folder layout (L918)", () => {
  it("debug layout includes the source map and optional test report", () => {
    const layout = jsBuildLayout("debug");
    assert.equal(layout.root, "build/debug/");
    const paths = layout.entries.map((e) => e.path);
    assert.ok(paths.includes("build/debug/app.js"));
    assert.ok(paths.includes("build/debug/app.source-map.json"));
    assert.equal(layout.entries.find((e) => e.path.endsWith("app.test-report.json")).required, false);
    assert.ok(Object.isFrozen(layout.entries));
  });

  it("release layout ships no source map", () => {
    const layout = jsBuildLayout("release");
    assert.equal(layout.root, "build/release/");
    assert.equal(layout.entries.some((e) => e.role === "source-map"), false);
    assert.match(layout.note, /outside build\/release\//);
  });

  it("unknown modes have no layout", () => {
    assert.equal(jsBuildLayout("../x"), undefined);
  });
});

describe("app.source-map.json v1 (L936, L1021, L1070)", () => {
  it("admits a well-formed map and freezes it", () => {
    const result = validateJsSourceMap(map());
    assert.equal(result.ok, true);
    assert.equal(result.map.mappings.length, 3);
    assert.ok(Object.isFrozen(result.map.mappings[0]));
  });

  it("refuses absolute, traversal, scheme, backslash and non-.fungi sources", () => {
    const bad = [
      "/srv/app/main.fungi", // path-leak-audit:allow
      "../outside.fungi",
      "src/../main.fungi",
      "C:/work/main.fungi", // path-leak-audit:allow
      "file:main.fungi",
      "src\\main.fungi",
      "src/main.ts",
      "",
      "src//main.fungi",
    ];
    for (const source of bad) {
      const result = validateJsSourceMap(map({ sources: [source], mappings: [] }));
      assert.equal(result.ok, false, source);
      assert.equal(result.diagnostics[0].code, "FUNGI-JS-024", source);
    }
  });

  it("refuses duplicate sources, bad versions and bad file names", () => {
    assert.equal(validateJsSourceMap(map({ sources: ["a.fungi", "a.fungi"], mappings: [] })).ok, false);
    assert.equal(validateJsSourceMap(map({ version: 2 })).diagnostics[0].code, "FUNGI-JS-023");
    assert.equal(validateJsSourceMap(map({ file: "../app.js" })).diagnostics[0].code, "FUNGI-JS-024");
  });

  it("refuses out-of-range indices and invalid positions", () => {
    const cases = [
      { generated: { line: 1, column: 0 }, source: 5, original: { line: 1, column: 0 } },
      { generated: { line: 0, column: 0 }, source: 0, original: { line: 1, column: 0 } },
      { generated: { line: 1, column: -1 }, source: 0, original: { line: 1, column: 0 } },
      { generated: { line: 1.5, column: 0 }, source: 0, original: { line: 1, column: 0 } },
      { generated: { line: 1, column: 0 }, source: 0, original: { line: 1, column: Number.MAX_VALUE } },
    ];
    for (const m of cases) {
      const result = validateJsSourceMap(map({ mappings: [m] }));
      assert.equal(result.ok, false);
      assert.equal(result.diagnostics[0].code, "FUNGI-JS-025");
    }
  });

  it("refuses unsorted and duplicate generated positions", () => {
    const [a, b] = map().mappings;
    assert.equal(validateJsSourceMap(map({ mappings: [b, a] })).diagnostics[0].code, "FUNGI-JS-027");
    assert.equal(validateJsSourceMap(map({ mappings: [a, a] })).diagnostics[0].code, "FUNGI-JS-027");
  });

  it("refuses surplus fields, accessors and more than the mapping cap", () => {
    assert.equal(validateJsSourceMap({ ...map(), sourcesContent: ["x"] }).ok, false);
    const withGetter = map();
    Object.defineProperty(withGetter, "file", { get: () => "app.js", enumerable: true });
    assert.equal(validateJsSourceMap(withGetter).ok, false);
    const big = Array.from({ length: JS_SOURCE_MAP_MAX_MAPPINGS + 1 }, (_, i) => ({
      generated: { line: i + 1, column: 0 }, source: 0, original: { line: 1, column: 0 },
    }));
    assert.equal(validateJsSourceMap(map({ mappings: big })).diagnostics[0].code, "FUNGI-JS-026");
  });

  it("accepts exactly the mapping cap", () => {
    const max = Array.from({ length: JS_SOURCE_MAP_MAX_MAPPINGS }, (_, i) => ({
      generated: { line: i + 1, column: 0 }, source: 0, original: { line: 1, column: 0 },
    }));
    assert.equal(validateJsSourceMap(map({ mappings: max })).ok, true);
  });
});

describe("mapBinaryError (L1022, L1070)", () => {
  it("maps exact and nearest-preceding positions on the same line", () => {
    assert.deepEqual(mapBinaryError(map(), { line: 1, column: 10 }),
      { status: "mapped", source: "src/main.fungi", line: 2, column: 4, exact: true });
    assert.deepEqual(mapBinaryError(map(), { line: 1, column: 15 }),
      { status: "mapped", source: "src/main.fungi", line: 2, column: 4, exact: false });
    assert.deepEqual(mapBinaryError(map(), { line: 3, column: 9 }),
      { status: "mapped", source: "src/routes/home.fungi", line: 7, column: 1, exact: false });
  });

  it("never guesses across lines", () => {
    assert.deepEqual(mapBinaryError(map(), { line: 2, column: 0 }), { status: "unmapped", reason: "no-mapping-on-line" });
    assert.deepEqual(mapBinaryError(map(), { line: 3, column: 1 }), { status: "unmapped", reason: "no-mapping-on-line" });
    assert.deepEqual(mapBinaryError(map(), { line: 9, column: 0 }), { status: "unmapped", reason: "no-mapping-on-line" });
  });

  it("fails closed on invalid maps and positions", () => {
    assert.equal(mapBinaryError(map({ sources: ["/abs.fungi"] }), { line: 1, column: 0 }).reason, "invalid-map"); // path-leak-audit:allow
    assert.equal(mapBinaryError(map(), { line: 0, column: 0 }).reason, "invalid-position");
    assert.equal(mapBinaryError(map(), "1:0").reason, "invalid-position");
  });

  it("binary search agrees with a linear scan on a large map", () => {
    const mappings = [];
    for (let line = 1; line <= 500; line += 1) {
      for (let column = 0; column < 40; column += 4) {
        mappings.push({ generated: { line, column }, source: 0, original: { line: line * 2, column } });
      }
    }
    const big = map({ sources: ["src/main.fungi"], mappings });
    for (const probe of [{ line: 1, column: 0 }, { line: 250, column: 7 }, { line: 500, column: 39 }, { line: 77, column: 100 }]) {
      const linear = [...mappings].reverse().find((m) =>
        m.generated.line === probe.line && m.generated.column <= probe.column);
      const got = mapBinaryError(big, probe);
      assert.equal(got.status, "mapped");
      assert.equal(got.line, linear.original.line);
      assert.equal(got.column, linear.original.column);
    }
  });
});

describe("target report (L1072)", () => {
  const modules = [{ path: "app.js", exports: [], imports: ["./dom-glue.js"] }];

  it("a clean release plan produces passing checks", () => {
    const report = createJsBundleReport({ plan: plan({ buildMode: "release" }), entry: "app.js", modules });
    assert.ok(report.checks.every((c) => c.passed));
    assert.equal(report.runtime, "browser");
  });

  it("a release plan shipping an external map fails source-map-disclosure", () => {
    const report = createJsBundleReport({
      plan: plan({ buildMode: "release", sourceMap: { mode: "external", includeSourcesContent: false, production: true } }),
      entry: "app.js",
      modules,
    });
    const check = report.checks.find((c) => c.check === "source-map-disclosure");
    assert.equal(check.passed, false);
    assert.ok(report.diagnostics.some((d) => d.code === "FUNGI-JS-021"));
  });

  it("a production inline map now fails every check (error, not warning)", () => {
    const report = createJsBundleReport({
      plan: plan({ sourceMap: { mode: "inline", includeSourcesContent: false, production: true } }),
      entry: "app.js",
      modules,
    });
    assert.equal(report.diagnostics.find((d) => d.code === "FUNGI-JS-011").severity, "error");
    assert.ok(report.checks.every((c) => !c.passed));
  });
});
