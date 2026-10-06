import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { explainManifest } from "../dist/explain/explain-trace.js";
import {
  createExplainReport,
  renderExplainReport,
  writeExplainReport,
  EXPLAIN_REPORT_FILE,
  EXPLAIN_REPORT_SCHEMA,
} from "../dist/explain/explain-reporter.js";

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-erep-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const manifest = {
  effects: ["fs.read"],
  capabilities: ["cap.read"],
  boundaries: ["boundary.fs"],
  imports: ["pkg.core"],
};
const options = {
  includeEffects: true,
  includeCapabilities: true,
  includeBoundaries: true,
  includeImports: true,
};

describe("explain-report", () => {
  it("createExplainReport withholds diagnostic messages and recomputes success", () => {
    const bad = explainManifest({ ...manifest, extra: 1 }, options);
    assert.ok(bad.diagnostics.length > 0);
    const report = createExplainReport(bad);
    assert.equal(report.schema, EXPLAIN_REPORT_SCHEMA);
    assert.equal(report.success, false);
    assert.ok(report.diagnostics.every((d) => d.message === "diagnostic message withheld"));
    assert.equal(JSON.stringify(report).includes("extra"), false);
  });

  it("writeExplainReport exclusive-creates explain-report.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      const result = explainManifest(manifest, options);
      const written = await writeExplainReport(result, join(dir, "out"));
      assert.equal(written.report.success, true);
      assert.ok(existsSync(join(dir, "out", EXPLAIN_REPORT_FILE)));
      const body = JSON.parse(readFileSync(join(dir, "out", EXPLAIN_REPORT_FILE), "utf8"));
      assert.equal(body.schema, EXPLAIN_REPORT_SCHEMA);
      assert.equal(body.traces.length, 4);
      writeFileSync(join(dir, "out", EXPLAIN_REPORT_FILE), "x");
      await assert.rejects(() => writeExplainReport(result, join(dir, "out")));
      void renderExplainReport;
    });
  });
});
