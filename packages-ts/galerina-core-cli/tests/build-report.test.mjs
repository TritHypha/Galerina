import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { buildWorkspace, FUNGI_BUILD_005 } from "../dist/build/build-contracts.js";
import {
  createBuildReport,
  renderBuildReport,
  writeBuildReport,
  BUILD_REPORT_FILE,
  BUILD_REPORT_SCHEMA,
} from "../dist/build/build-reporter.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-brep-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const input = {
  workspace: "apps/demo",
  target: "node",
  strict: true,
  outDir: "dist",
};

describe("createBuildReport / writeBuildReport", () => {
  it("builds a frozen report with withheld diagnostic messages and exclusive create", async () => {
    const result = await buildWorkspace(input);
    const report = createBuildReport(result);
    assert.equal(report.schema, BUILD_REPORT_SCHEMA);
    assert.equal(report.success, false);
    assert.equal(report.diagnostics[0].code, FUNGI_BUILD_005);
    assert.equal(report.diagnostics[0].message, "diagnostic message withheld");
    assert.ok(Object.isFrozen(report));
    assert.ok(report.limitations.length >= 1);
    const text = renderBuildReport(report);
    assert.ok(text.endsWith("\n"));

    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      const written = await writeBuildReport(result, join(dir, "out"));
      assert.equal(written.report.success, false);
      assert.ok(existsSync(join(dir, "out", BUILD_REPORT_FILE)));
      const disk = JSON.parse(readFileSync(join(dir, "out", BUILD_REPORT_FILE), "utf8"));
      assert.equal(disk.schema, BUILD_REPORT_SCHEMA);
      await assert.rejects(() => writeBuildReport(result, join(dir, "out")));
    });
  });

  it("withholds diagnostic messages and never throws on hostile result getters", () => {
    const hostile = {
      get success() {
        throw new Error("boom-success");
      },
      get artefacts() {
        throw new Error("boom-artefacts");
      },
      get diagnostics() {
        throw new Error("boom-diag");
      },
      get manifestPath() {
        throw new Error("boom-manifest");
      },
      get duration() {
        return Number.NaN;
      },
    };
    const report = createBuildReport(/** @type {any} */ (hostile));
    assert.equal(report.success, true); // empty diagnostics via catch -> []
    assert.equal(report.duration, 0);
    assert.equal(report.manifestPath, "");
    assert.deepEqual([...report.artefacts], []);
  });

  it("rejects malformed generatedAt", async () => {
    const result = await buildWorkspace(input);
    assert.throws(() => createBuildReport(result, { generatedAt: "not-a-date" }), RangeError);
  });
});
