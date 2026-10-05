import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BENCHMARK_REPORT_FILE,
  BENCHMARK_REPORT_WRITE_LIMITATIONS,
  Galerina_BENCHMARK_CLI_001,
  Galerina_BENCHMARK_CLI_002,
  Galerina_BENCHMARK_CLI_003,
  Galerina_BENCHMARK_CLI_004,
  formatBenchmarkSummary,
  parseBenchmarkCliArgs,
  renderBenchmarkReport,
  validateBenchmarkReport,
  writeBenchmarkReport,
} from "../dist/index.js";

const example = JSON.parse(readFileSync(new URL("../examples/benchmark-report.example.json", import.meta.url), "utf8"));

describe("writeBenchmarkReport", () => {
  it("exclusively creates benchmark-report.json from a valid report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gal-bench-write-"));
    try {
      const r = await writeBenchmarkReport(example, dir);
      assert.equal(r.status, "WRITTEN");
      assert.deepEqual(r.diagnostics, []);
      assert.deepEqual(validateBenchmarkReport(r.report), []);
      const text = await readFile(join(dir, BENCHMARK_REPORT_FILE), "utf8");
      assert.equal(text, renderBenchmarkReport(r.report));
      assert.ok(BENCHMARK_REPORT_WRITE_LIMITATIONS.length >= 3);
      const again = await writeBenchmarkReport(example, dir);
      assert.equal(again.status, "IO_FAILED");
      assert.equal(again.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_IO");
      assert.ok(!JSON.stringify(again).includes(dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses invalid reports and invalid outDir without throwing or echoing", async () => {
    const bad = await writeBenchmarkReport({ ...structuredClone(example), mode: "turbo" }, ".");
    assert.equal(bad.status, "REFUSED");
    assert.ok(bad.diagnostics.some((d) => d.severity === "error"));
    const noDir = await writeBenchmarkReport(example, "");
    assert.equal(noDir.status, "REFUSED");
    assert.equal(noDir.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID");
    const missing = await writeBenchmarkReport(example, join(tmpdir(), "gal-bench-missing-" + Date.now()));
    assert.equal(missing.status, "IO_FAILED");
    assert.ok(!JSON.stringify(missing).includes("gal-bench-missing"));
  });

  it("refuses hostile getters on report without running them into the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gal-bench-hostile-"));
    try {
      let ran = false;
      const hostile = {
        ...structuredClone(example),
        get mode() {
          ran = true;
          return "light";
        },
      };
      const r = await writeBenchmarkReport(hostile, dir);
      assert.equal(r.status, "REFUSED");
      assert.equal(ran, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("parseBenchmarkCliArgs", () => {
  it("defaults to light and admits closed flags", () => {
    const a = parseBenchmarkCliArgs([]);
    assert.equal(a.ok, true);
    assert.deepEqual(a.args, { mode: "light", json: false, save: false, outDir: undefined });
    const b = parseBenchmarkCliArgs(["--full", "--json", "--save", "--out", "build/reports"]);
    assert.equal(b.ok, true);
    assert.deepEqual(b.args, { mode: "full", json: true, save: true, outDir: "build/reports" });
  });

  it("refuses conflicts, duplicates, equals-form, refused flags and path tokens", () => {
    assert.equal(parseBenchmarkCliArgs(["--light", "--full"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_002);
    assert.equal(parseBenchmarkCliArgs(["--json", "--json"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_001);
    assert.equal(parseBenchmarkCliArgs(["--out=build"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_001);
    assert.equal(parseBenchmarkCliArgs(["--save"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_003);
    assert.equal(parseBenchmarkCliArgs(["--out", "build/reports"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_003);
    assert.equal(parseBenchmarkCliArgs(["--network"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_004);
    assert.equal(parseBenchmarkCliArgs(["--save", "--out", "../x"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_003);
    assert.equal(parseBenchmarkCliArgs(["--save", "--out", "a/./b"]).diagnostics[0].code, Galerina_BENCHMARK_CLI_003);
    const echo = parseBenchmarkCliArgs(["--weird-secret-token"]);
    assert.equal(echo.ok, false);
    assert.ok(!JSON.stringify(echo).includes("weird-secret-token"));
  });
});

describe("formatBenchmarkSummary", () => {
  it("emits privacy-safe summary lines", () => {
    const lines = formatBenchmarkSummary(example);
    assert.equal(lines[0], "galerina benchmark summary");
    assert.ok(lines.some((l) => l.includes("mode=light")));
    assert.ok(lines.some((l) => l.includes("overall=5850")));
    const text = lines.join("\n");
    assert.ok(!text.includes("alice"));
    assert.ok(!text.includes("/home"));
    assert.deepEqual(formatBenchmarkSummary({ mode: "nope" }), ["benchmark summary unavailable"]);
  });
});
