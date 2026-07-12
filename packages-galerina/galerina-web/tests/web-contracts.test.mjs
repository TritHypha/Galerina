import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WEB_FAMILY_PACKAGES,
  WEB_RUNTIME_CHECKS,
  createBrowserRuntimeReport,
  createWebFamilyReportIndex,
  deriveWebReportStatus,
  isServerOnlyImport,
  validateBrowserRuntimeProfile,
  validateWebFamilyReportEntry,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

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

describe("the coordinated web family", () => {
  it("names exactly the five web packages", () => {
    assert.deepEqual(WEB_FAMILY_PACKAGES, [
      "@galerina/web-render",
      "@galerina/web-state",
      "@galerina/web-router",
      "@galerina/web-events",
      "@galerina/web-components",
    ]);
  });
});

describe("browser runtime profile — literal true, re-checked at runtime", () => {
  it("accepts a fail-closed, secret-free profile with browser-safe imports", () => {
    assert.deepEqual(codes(validateBrowserRuntimeProfile(goodProfile)), []);
  });

  it("fails closed when an untyped caller relaxes the literal-true fields", () => {
    const diags = validateBrowserRuntimeProfile({
      ...goodProfile,
      failClosed: false,
      secretFreeSurface: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_FAIL_CLOSED_REQUIRED",
      "Galerina_WEB_SECRET_FREE_SURFACE_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });

  it("requires a profile name", () => {
    const diags = validateBrowserRuntimeProfile({ ...goodProfile, name: " " });
    assert.deepEqual(codes(diags), ["Galerina_WEB_PROFILE_NAME_REQUIRED"]);
  });
});

describe("browser-safe imports — server-only modules denied by name", () => {
  it("recognises node: scheme and classic builtin specifiers as server-only", () => {
    for (const spec of ["node:fs", "node:crypto", "fs", "child_process", "process", "http2"]) {
      assert.equal(isServerOnlyImport(spec), true, spec);
    }
  });

  it("does not flag browser-legal specifiers", () => {
    for (const spec of ["@galerina/web-render", "./local.js", "lit-html"]) {
      assert.equal(isServerOnlyImport(spec), false, spec);
    }
  });

  it("ERRORS on every server-only import in the declared list", () => {
    const diags = validateBrowserRuntimeProfile({
      ...goodProfile,
      imports: ["node:fs", "fs", "@galerina/web-render"],
    });
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN",
      "Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN",
    ]);
    assert.deepEqual(
      diags.map((d) => d.path),
      ["profile.imports.0", "profile.imports.1"],
    );
  });

  it("rejects empty import specifiers", () => {
    const diags = validateBrowserRuntimeProfile({ ...goodProfile, imports: [" "] });
    assert.deepEqual(codes(diags), ["Galerina_WEB_IMPORT_SPECIFIER_REQUIRED"]);
  });
});

describe("createBrowserRuntimeReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean profile", () => {
    const report = createBrowserRuntimeReport({ profile: goodProfile });
    assert.equal(report.profile, "app-browser-runtime");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_RUNTIME_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createBrowserRuntimeReport({
      profile: { ...goodProfile, failClosed: false, imports: ["node:fs"] },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_FAIL_CLOSED_REQUIRED",
      "Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN",
    ]);
    assert.equal(report.checks.failClosed, "fail");
    assert.equal(report.checks.imports, "fail");
    assert.equal(report.checks.profile, "pass");
    assert.equal(report.checks.secretFreeSurface, "pass");
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebReportStatus([]), "success");
    assert.equal(
      deriveWebReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("family report entries — status must agree with the counts", () => {
  it("accepts a clean success entry", () => {
    assert.deepEqual(codes(validateWebFamilyReportEntry(entryFor("@galerina/web-render"))), []);
  });

  it("ERRORS on success claimed alongside errors (STATUS_CONTRADICTION)", () => {
    const diags = validateWebFamilyReportEntry(
      entryFor("@galerina/web-render", { status: "success", errorCount: 3 }),
    );
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATUS_CONTRADICTION"]);
    assert.equal(diags[0].severity, "error");
  });

  it("warns on failure carrying no errors", () => {
    const diags = validateWebFamilyReportEntry(
      entryFor("@galerina/web-render", { status: "failed", errorCount: 0 }),
    );
    assert.deepEqual(codes(diags), ["Galerina_WEB_FAILURE_UNEXPLAINED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects unknown statuses, bad kinds and negative counts", () => {
    const diags = validateWebFamilyReportEntry({
      kind: "not-a-report",
      producer: "@galerina/web-render",
      status: "green",
      errorCount: -1,
      warningCount: 0.5,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_REPORT_COUNT_INVALID",
      "Galerina_WEB_REPORT_COUNT_INVALID",
      "Galerina_WEB_REPORT_KIND_INVALID",
      "Galerina_WEB_REPORT_STATUS_UNKNOWN",
    ]);
  });

  it("warns on a producer outside the coordinated family", () => {
    const diags = validateWebFamilyReportEntry(entryFor("@galerina/data-html"));
    assert.deepEqual(codes(diags), ["Galerina_WEB_PRODUCER_UNKNOWN"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("createWebFamilyReportIndex — coverage gaps visible, overall derived", () => {
  it("reports overall success only for a full clean sweep", () => {
    const index = createWebFamilyReportIndex({
      entries: fullEntries,
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(index.overallStatus, "success");
    assert.deepEqual(index.missingProducers, []);
    assert.deepEqual(index.diagnostics, []);
    assert.deepEqual(index.warnings, []);
  });

  it("caps the family at partial when a producer is missing (coverage gap)", () => {
    const index = createWebFamilyReportIndex({
      entries: fullEntries.filter((entry) => entry.producer !== "@galerina/web-events"),
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(index.overallStatus, "partial");
    assert.deepEqual(index.missingProducers, ["@galerina/web-events"]);
    assert.deepEqual(codes(index.diagnostics), ["Galerina_WEB_REPORT_COVERAGE_GAP"]);
    assert.deepEqual(index.warnings, [index.diagnostics[0].message]);
  });

  it("fails the family when any entry fails or contradicts itself", () => {
    const failing = fullEntries.map((entry) =>
      entry.producer === "@galerina/web-router"
        ? { ...entry, status: "failed", errorCount: 2 }
        : entry,
    );
    const index = createWebFamilyReportIndex({
      entries: failing,
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(index.overallStatus, "failed");

    const contradicted = createWebFamilyReportIndex({
      entries: fullEntries.map((entry) =>
        entry.producer === "@galerina/web-render"
          ? { ...entry, errorCount: 4 }
          : entry,
      ),
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(contradicted.overallStatus, "failed");
    assert.deepEqual(codes(contradicted.diagnostics), [
      "Galerina_WEB_STATUS_CONTRADICTION",
    ]);
  });

  it("caps at partial when any entry is partial", () => {
    const index = createWebFamilyReportIndex({
      entries: fullEntries.map((entry) =>
        entry.producer === "@galerina/web-state"
          ? { ...entry, status: "partial", warningCount: 1 }
          : entry,
      ),
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(index.overallStatus, "partial");
  });

  it("rejects duplicate report entries", () => {
    const index = createWebFamilyReportIndex({
      entries: [...fullEntries, entryFor("@galerina/web-render")],
      generatedAt: "2026-07-10T00:00:00.000Z",
    });
    assert.equal(index.overallStatus, "failed");
    assert.deepEqual(codes(index.diagnostics), ["Galerina_WEB_REPORT_DUPLICATE"]);
  });

  it("rejects an unparseable generatedAt timestamp", () => {
    const index = createWebFamilyReportIndex({
      entries: fullEntries,
      generatedAt: "not-a-time",
    });
    assert.equal(index.overallStatus, "failed");
    assert.deepEqual(codes(index.diagnostics), ["Galerina_WEB_TIMESTAMP_INVALID"]);
  });
});
