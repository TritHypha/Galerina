import assert from "node:assert/strict";
import { constants } from "node:fs";
import { mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BENCHMARK_REPORT_FILE,
  BENCHMARK_REPORT_FILE_WRITE_OUTCOMES,
  BENCHMARK_REPORT_WRITE_LIMITATIONS,
  Galerina_BENCHMARK_CLI_001,
  Galerina_BENCHMARK_CLI_002,
  Galerina_BENCHMARK_CLI_003,
  Galerina_BENCHMARK_CLI_004,
  captureBenchmarkReport,
  formatBenchmarkSummary,
  parseBenchmarkCliArgs,
  renderBenchmarkReport,
  validateBenchmarkReport,
  writeBenchmarkReport,
} from "../dist/index.js";

const example = JSON.parse(readFileSync(new URL("../examples/benchmark-report.example.json", import.meta.url), "utf8"));

// Host-side writer supplied by the test (the package itself imports no filesystem module).
// Same semantics the package used to implement inline: resolve the directory, require it to
// be a directory, then O_CREAT | O_EXCL (| O_NOFOLLOW) so an existing file is never touched.
const nodeExclusiveWriter = Object.freeze({
  async createExclusive({ outDir, fileName, contents }) {
    let dir;
    try {
      dir = await realpath(outDir);
      if (!(await stat(dir)).isDirectory()) return { outcome: "DIR_INVALID" };
    } catch {
      return { outcome: "DIR_INVALID" };
    }
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    let handle;
    try {
      handle = await open(join(dir, fileName), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o644);
    } catch (error) {
      return { outcome: error?.code === "EEXIST" ? "EXISTS" : "IO_FAILED" };
    }
    try {
      await handle.writeFile(contents, "utf8");
      return { outcome: "CREATED" };
    } catch {
      return { outcome: "IO_FAILED" };
    } finally {
      await handle.close().catch(() => {});
    }
  },
});

// In-memory test double: records every request and answers with a scripted result.
const scriptedWriter = (answer) => {
  const calls = [];
  const writer = { createExclusive: async (request) => { calls.push(request); return typeof answer === "function" ? answer(request) : answer; } };
  return { writer, calls };
};

describe("writeBenchmarkReport", () => {
  it("exclusively creates benchmark-report.json from a valid report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gal-bench-write-"));
    try {
      const r = await writeBenchmarkReport(example, dir, nodeExclusiveWriter);
      assert.equal(r.status, "WRITTEN");
      assert.deepEqual(r.diagnostics, []);
      assert.deepEqual(validateBenchmarkReport(r.report), []);
      const text = await readFile(join(dir, BENCHMARK_REPORT_FILE), "utf8");
      assert.equal(text, renderBenchmarkReport(r.report));
      assert.ok(BENCHMARK_REPORT_WRITE_LIMITATIONS.length >= 4);
      const again = await writeBenchmarkReport(example, dir, nodeExclusiveWriter);
      assert.equal(again.status, "IO_FAILED");
      assert.equal(again.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_IO");
      assert.ok(!JSON.stringify(again).includes(dir));
      assert.equal(await readFile(join(dir, BENCHMARK_REPORT_FILE), "utf8"), text);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("never overwrites an existing benchmark-report.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gal-bench-keep-"));
    try {
      await writeFile(join(dir, BENCHMARK_REPORT_FILE), "owner-file\n", "utf8");
      const r = await writeBenchmarkReport(example, dir, nodeExclusiveWriter);
      assert.equal(r.status, "IO_FAILED");
      assert.equal(r.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_IO");
      assert.equal(await readFile(join(dir, BENCHMARK_REPORT_FILE), "utf8"), "owner-file\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses invalid reports and invalid outDir without throwing or echoing", async () => {
    const bad = await writeBenchmarkReport({ ...structuredClone(example), mode: "turbo" }, ".", nodeExclusiveWriter);
    assert.equal(bad.status, "REFUSED");
    assert.ok(bad.diagnostics.some((d) => d.severity === "error"));
    const noDir = await writeBenchmarkReport(example, "", nodeExclusiveWriter);
    assert.equal(noDir.status, "REFUSED");
    assert.equal(noDir.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID");
    const missing = await writeBenchmarkReport(example, join(tmpdir(), "gal-bench-missing-" + Date.now()), nodeExclusiveWriter);
    assert.equal(missing.status, "IO_FAILED");
    assert.equal(missing.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID");
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
      const r = await writeBenchmarkReport(hostile, dir, nodeExclusiveWriter);
      assert.equal(r.status, "REFUSED");
      assert.equal(ran, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("hands the writer one frozen closed request and nothing for refused input", async () => {
    const { writer, calls } = scriptedWriter({ outcome: "CREATED" });
    const r = await writeBenchmarkReport(example, "reports/out", writer);
    assert.equal(r.status, "WRITTEN");
    assert.equal(calls.length, 1);
    const [request] = calls;
    assert.ok(Object.isFrozen(request));
    assert.deepEqual(Object.keys(request), ["outDir", "fileName", "contents"]);
    assert.equal(request.outDir, "reports/out");
    assert.equal(request.fileName, BENCHMARK_REPORT_FILE);
    assert.equal(request.contents, renderBenchmarkReport(captureBenchmarkReport(example).report));
    await writeBenchmarkReport({ ...structuredClone(example), mode: "turbo" }, "reports/out", writer);
    await writeBenchmarkReport(example, "", writer);
    assert.equal(calls.length, 1);
  });

  it("refuses a missing or malformed writer capability before touching the report", async () => {
    let getterRan = false;
    let reportGetterRan = false;
    class WriterClass { createExclusive() { return { outcome: "CREATED" }; } }
    const withGetter = {};
    Object.defineProperty(withGetter, "createExclusive", { enumerable: true, get() { getterRan = true; return async () => ({ outcome: "CREATED" }); } });
    const fn = async () => ({ outcome: "CREATED" });
    const report = { ...structuredClone(example), get mode() { reportGetterRan = true; return "light"; } };
    for (const writer of [
      undefined, null, 1, "writer", fn, [], {},
      { createExclusive: 1 },
      { createExclusive: fn, extra: true },
      { [Symbol("createExclusive")]: fn },
      Object.assign(Object.create({ inherited: true }), { createExclusive: fn }),
      new WriterClass(),
      new Proxy({ createExclusive: fn }, {}),
      { createExclusive: new Proxy(fn, {}) },
      withGetter,
    ]) {
      const r = await writeBenchmarkReport(report, "reports/out", writer);
      assert.equal(r.status, "REFUSED");
      assert.equal(r.diagnostics[0].code, "Galerina_BENCHMARK_REPORT_WRITE_WRITER_INVALID");
      assert.equal(r.diagnostics[0].path, "writer");
    }
    assert.equal(getterRan, false);
    assert.equal(reportGetterRan, false);
  });

  it("maps closed writer outcomes and fails closed on throws, rejections and off-contract answers", async () => {
    assert.deepEqual([...BENCHMARK_REPORT_FILE_WRITE_OUTCOMES], ["CREATED", "EXISTS", "DIR_INVALID", "IO_FAILED"]);
    const expectFail = async (answer, code) => {
      const { writer } = scriptedWriter(answer);
      const r = await writeBenchmarkReport(example, "reports/out", writer);
      assert.equal(r.status, "IO_FAILED");
      assert.equal(r.diagnostics[0].code, code);
      assert.deepEqual(r.report, {});
      assert.doesNotMatch(JSON.stringify(r), /reports\/out|s3cr3t|EACCES/);
    };
    await expectFail({ outcome: "EXISTS" }, "Galerina_BENCHMARK_REPORT_WRITE_IO");
    await expectFail({ outcome: "IO_FAILED" }, "Galerina_BENCHMARK_REPORT_WRITE_IO");
    await expectFail({ outcome: "DIR_INVALID" }, "Galerina_BENCHMARK_REPORT_WRITE_DIR_INVALID");
    const INVALID = "Galerina_BENCHMARK_REPORT_WRITE_WRITER_RESULT_INVALID";
    let outcomeGetterRan = false;
    const getterResult = {};
    Object.defineProperty(getterResult, "outcome", { enumerable: true, get() { outcomeGetterRan = true; return "CREATED"; } });
    for (const answer of [
      undefined, null, "CREATED", { outcome: "WRITTEN" }, { outcome: "created" }, { outcome: "CREATED", path: "/s3cr3t" },
      {}, [], new Proxy({ outcome: "CREATED" }, {}), Object.assign(Object.create({ x: 1 }), { outcome: "CREATED" }), () => getterResult,
      () => { throw Object.assign(new Error("EACCES /s3cr3t/reports/out"), { code: "EACCES" }); },
      () => Promise.reject(new Error("EACCES /s3cr3t")),
      () => ({ then() { throw new Error("s3cr3t"); } }),
    ]) {
      await expectFail(answer, INVALID);
    }
    assert.equal(outcomeGetterRan, false);
    // A synchronous throw from the capability itself is contained too.
    const r = await writeBenchmarkReport(example, "reports/out", { createExclusive() { throw new Error("s3cr3t"); } });
    assert.equal(r.status, "IO_FAILED");
    assert.equal(r.diagnostics[0].code, INVALID);
  });

  it("built package imports no filesystem or path module (hardened border stays node:util/types)", async () => {
    const built = await readFile(new URL("../dist/index.js", import.meta.url), "utf8");
    assert.doesNotMatch(built, /from\s+["']node:(fs|fs\/promises|path)["']/);
    assert.doesNotMatch(built, /import\(\s*["']node:(fs|fs\/promises|path)["']\s*\)/);
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
