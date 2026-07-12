// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: born fail-closed. galerina-web is the umbrella that
// composes the family (U-1 = R2 + C1): the browser runtime must fail closed and present a secret-free
// surface (both literal `true`, re-checked at runtime), server-only imports are denied for the browser
// surface, and the family report index makes coverage gaps visible instead of implying an all-green
// family. Each test exercises the governance/web-failclosed-contract.json U-1 invariant.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateBrowserRuntimeProfile,
  isServerOnlyImport,
  createWebFamilyReportIndex,
  validateWebFamilyReportEntry,
  WEB_FAMILY_PACKAGES,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

const goodProfile = {
  name: "app-browser-runtime",
  failClosed: true,
  secretFreeSurface: true,
  imports: ["@galerina/web-render", "@galerina/web-state", "./app.js"],
};

const entryFor = (producer, overrides = {}) => ({
  kind: `app.${producer.split("/")[1]}-report.json`,
  producer,
  status: "success",
  errorCount: 0,
  warningCount: 0,
  ...overrides,
});

const fullEntries = WEB_FAMILY_PACKAGES.map((name) => entryFor(name));

describe("web umbrella fail-closed acceptance (FUNGI-WEB-050)", () => {
  it("U-1 FUNGI-WEB-050: failClosed and secretFreeSurface are literal-true, re-checked at runtime — an untyped caller relaxing them to false is DENIED", () => {
    const relaxed = validateBrowserRuntimeProfile({ ...goodProfile, failClosed: false, secretFreeSurface: false });
    const codes = errorCodes(relaxed);
    assert.ok(codes.includes("Galerina_WEB_FAIL_CLOSED_REQUIRED"));
    assert.ok(codes.includes("Galerina_WEB_SECRET_FREE_SURFACE_REQUIRED"));
    // Clean: a fail-closed, secret-free profile with browser-legal imports passes.
    assert.deepEqual(validateBrowserRuntimeProfile(goodProfile), []);
  });

  it("U-1 FUNGI-WEB-050 (CWE-79 via server leak): a node: / classic-builtin import is DENIED for the browser surface", () => {
    for (const spec of ["node:fs", "node:crypto", "fs", "child_process", "process", "http2"]) {
      assert.equal(isServerOnlyImport(spec), true, spec);
    }
    for (const spec of ["@galerina/web-render", "./local.js", "lit-html"]) {
      assert.equal(isServerOnlyImport(spec), false, spec);
    }
    const serverLeak = validateBrowserRuntimeProfile({ ...goodProfile, imports: ["node:fs"] });
    assert.deepEqual(errorCodes(serverLeak), ["Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN"]);
  });

  it("U-1 FUNGI-WEB-050: the family report index fails closed — success cannot coexist with errors, and a coverage gap caps the family at partial", () => {
    // STATUS_CONTRADICTION: an entry claiming success while carrying errors is denied at the umbrella boundary.
    const contradiction = validateWebFamilyReportEntry(entryFor("@galerina/web-render", { status: "success", errorCount: 3 }));
    assert.deepEqual(errorCodes(contradiction), ["Galerina_WEB_STATUS_CONTRADICTION"]);
    // Coverage gap: a missing producer is made visible and caps overall at partial (never a silent all-green).
    const gap = createWebFamilyReportIndex({
      entries: fullEntries.filter((e) => e.producer !== "@galerina/web-events"),
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(gap.overallStatus, "partial");
    assert.deepEqual(gap.missingProducers, ["@galerina/web-events"]);
    assert.ok(gap.diagnostics.some((d) => d.code === "Galerina_WEB_REPORT_COVERAGE_GAP"));
    // Clean: a full, clean sweep is the ONLY overall success.
    const clean = createWebFamilyReportIndex({ entries: fullEntries, generatedAt: "2026-07-10T00:00:00.000Z" });
    assert.equal(clean.overallStatus, "success");
    assert.deepEqual(clean.diagnostics, []);
  });
});
