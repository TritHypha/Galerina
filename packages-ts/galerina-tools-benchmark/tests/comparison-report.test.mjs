import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  BENCHMARK_COMPARISON_SCHEMA,
  BENCHMARK_COMPARE_SIDES,
  createBenchmarkComparisonReport,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const D = "a".repeat(64);
const node = () => ({ name: "node", version: "20.20.2" });
const runtimeSide = (over = {}) => ({ side: "runtime", status: "passed", durationMs: 200, inputDigestSha256: D, runtime: node(), ...over });
const compiledSide = (over = {}) => ({
  side: "compiled", status: "passed", durationMs: 100, inputDigestSha256: D, runtime: node(),
  compiler: { name: "galerina", version: "1.0.0-beta.2", flags: ["--profile=default", "--no-cache"] }, ...over,
});
const make = (sides, caseId = "compare.external_runtime_json_100mb_optional") => createBenchmarkComparisonReport({ caseId, sides });
const codes = (r) => r.diagnostics.map((d) => d.code);

describe("Phase 9 comparison report (runtime|compiled)", () => {
  it("exposes the owner-decided side vocabulary", () => {
    assert.deepEqual([...BENCHMARK_COMPARE_SIDES], ["runtime", "compiled"]);
    assert.ok(Object.isFrozen(BENCHMARK_COMPARE_SIDES));
  });

  it("builds a closed, non-authorizing report for runtime + compiled on the same input", () => {
    const r = make([compiledSide(), runtimeSide()]);
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.report).sort(), [
      "authority", "caseId", "durationRatioRuntimeOverCompiled", "inputDigestSha256", "sameInput", "schema", "shareable", "sides",
    ]);
    assert.equal(r.report.schema, BENCHMARK_COMPARISON_SCHEMA);
    assert.equal(r.report.sameInput, true);
    assert.equal(r.report.inputDigestSha256, D);
    assert.equal(r.report.shareable, false);
    assert.equal(r.report.authority, "NON_AUTHORIZING");
    assert.deepEqual(r.report.sides.map((s) => s.side), ["runtime", "compiled"]);
    assert.equal(r.report.durationRatioRuntimeOverCompiled, 2);
    assert.ok(Object.isFrozen(r.report) && Object.isFrozen(r.report.sides) && Object.isFrozen(r.report.sides[1].compiler.flags));
  });

  it("refuses sides that did not use the same generated input data", () => {
    const r = make([runtimeSide(), compiledSide({ inputDigestSha256: "b".repeat(64) })]);
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), ["FUNGI-BENCH-CMP-002"]);
    for (const bad of ["A".repeat(64), "a".repeat(63), `${"a".repeat(63)}g`, 42, undefined]) {
      const side = runtimeSide();
      if (bad === undefined) delete side.inputDigestSha256; else side.inputDigestSha256 = bad;
      assert.equal(make([side]).ok, false);
    }
  });

  it("records the runtime version on every side and compiler version + flags on the compiled side only", () => {
    assert.equal(make([runtimeSide()]).ok, true);
    const noCompiler = compiledSide();
    delete noCompiler.compiler;
    assert.deepEqual(codes(make([noCompiler])), ["FUNGI-BENCH-CMP-003"]);
    assert.deepEqual(codes(make([runtimeSide({ compiler: compiledSide().compiler })])), ["FUNGI-BENCH-CMP-003"]);
    const noRuntimeVersion = runtimeSide({ runtime: { name: "node" } });
    assert.equal(make([noRuntimeVersion]).ok, false);
    assert.deepEqual(codes(make([compiledSide({ compiler: { name: "galerina", version: "1.0.0" } })])), ["FUNGI-BENCH-CMP-001"]);
  });

  it("refuses path-like, spaced, duplicate or excessive flags and versions without echoing them", () => {
    const secret = "/home/phill/secret-token";
    for (const flags of [[`--out=${secret}`], ["--a b"], ["--x", "--x"], ["-"], [`--key=C:\\Users\\x`], Array.from({ length: 33 }, (_, i) => `--f${i}`)]) {
      const r = make([compiledSide({ compiler: { name: "galerina", version: "1.0.0", flags } })]);
      assert.equal(r.ok, false, JSON.stringify(flags).slice(0, 40));
      assert.ok(codes(r).every((c) => c === "FUNGI-BENCH-CMP-003" || c === "FUNGI-BENCH-CMP-001"));
      assert.ok(!JSON.stringify(r).includes("phill") && !JSON.stringify(r).includes("Users"));
    }
    for (const version of ["1.0 beta", "../1.0", "", "x".repeat(65)]) {
      assert.deepEqual(codes(make([runtimeSide({ runtime: { name: "node", version } })])), ["FUNGI-BENCH-CMP-003"]);
    }
    assert.deepEqual(codes(make([runtimeSide({ runtime: { name: "Node JS", version: "20" } })])), ["FUNGI-BENCH-CMP-003"]);
  });

  it("refuses empty, oversized, duplicate or unknown side sets", () => {
    assert.deepEqual(codes(make([])), ["FUNGI-BENCH-CMP-004"]);
    assert.deepEqual(codes(make([runtimeSide(), runtimeSide()])), ["FUNGI-BENCH-CMP-004"]);
    assert.deepEqual(codes(make([runtimeSide(), compiledSide(), runtimeSide()])), ["FUNGI-BENCH-CMP-004"]);
    assert.deepEqual(codes(make([runtimeSide({ side: "python" })])), ["FUNGI-BENCH-CMP-004"]);
    assert.deepEqual(codes(make([runtimeSide({ side: "cpp" })])), ["FUNGI-BENCH-CMP-004"]);
  });

  it("validates status, duration and case id; a ratio appears only when both sides passed", () => {
    assert.deepEqual(codes(make([runtimeSide({ status: "fallback" })])), ["FUNGI-BENCH-CMP-005"]);
    for (const durationMs of [-1, Number.NaN, Infinity, 24 * 60 * 60 * 1000 + 1, "5"]) {
      assert.deepEqual(codes(make([runtimeSide({ durationMs })])), ["FUNGI-BENCH-CMP-005"]);
    }
    const passedNoDuration = runtimeSide();
    delete passedNoDuration.durationMs;
    assert.deepEqual(codes(make([passedNoDuration])), ["FUNGI-BENCH-CMP-005"]);
    for (const caseId of ["Compare.x", "compare", "compare..x", "compare.x/y", `c.${"x".repeat(95)}`]) {
      assert.deepEqual(codes(make([runtimeSide()], caseId)), ["FUNGI-BENCH-CMP-005"]);
    }
    const failed = make([runtimeSide(), compiledSide({ status: "failed" })]);
    assert.equal(failed.ok, true);
    assert.equal(Object.hasOwn(failed.report, "durationRatioRuntimeOverCompiled"), false);
    const zero = make([runtimeSide({ durationMs: 0 }), compiledSide()]);
    assert.equal(Object.hasOwn(zero.report, "durationRatioRuntimeOverCompiled"), false);
    const skipped = make([runtimeSide({ status: "skipped", durationMs: undefined })].map((s) => { delete s.durationMs; return s; }));
    assert.equal(skipped.ok, true);
  });

  it("refuses hostile shapes unread: proxies, accessors, symbols, unknown keys, prototypes, sparse arrays", () => {
    let touched = false;
    const accessor = runtimeSide();
    Object.defineProperty(accessor, "durationMs", { enumerable: true, get() { touched = true; return 1; } });
    const cases = [
      null, 7, "x", [],
      new Proxy({ caseId: "a.b", sides: [runtimeSide()] }, {}),
      { caseId: "a.b", sides: [runtimeSide()], extra: 1 },
      { caseId: "a.b", sides: [runtimeSide()], [Symbol("s")]: 1 },
      Object.assign(Object.create({ inherited: 1 }), { caseId: "a.b", sides: [runtimeSide()] }),
      { caseId: "a.b", sides: [accessor] },
      { caseId: "a.b", sides: [runtimeSide({ extra: true })] },
      { caseId: "a.b", sides: new Proxy([runtimeSide()], {}) },
      { caseId: "a.b", sides: Object.assign([runtimeSide()], { extra: 1 }) },
      { caseId: "a.b", sides: [, runtimeSide()] },
      { caseId: "a.b", sides: [runtimeSide({ runtime: new Proxy(node(), {}) })] },
    ];
    for (const input of cases) {
      const r = createBenchmarkComparisonReport(input);
      assert.equal(r.ok, false);
      assert.ok(r.diagnostics.length > 0 && r.diagnostics.every((d) => /^FUNGI-BENCH-CMP-00[1-5]$/u.test(d.code) && d.severity === "error"));
    }
    assert.equal(touched, false);
    const throwing = new Proxy({}, { ownKeys() { throw new Error("boom"); }, getPrototypeOf() { throw new Error("boom"); } });
    assert.doesNotThrow(() => createBenchmarkComparisonReport(throwing));
  });

  it("does not mutate or alias the caller's input", () => {
    const sides = [runtimeSide(), compiledSide()];
    const before = JSON.stringify(sides);
    const r = make(sides);
    assert.equal(JSON.stringify(sides), before);
    assert.notEqual(r.report.sides[0], sides[0]);
    assert.notEqual(r.report.sides[1].compiler.flags, sides[1].compiler.flags);
  });

  it("source stays pure: only node:util/types, no fs/env/network/clock/WebAssembly", async () => {
    const source = await readFile(join(HERE, "..", "src", "comparison-report.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    const imports = [...code.matchAll(/from\s+"([^"]+)"/gu)].map((m) => m[1]);
    assert.deepEqual(imports, ["node:util/types"]);
    assert.deepEqual(code.match(/\b(?:process|require|fetch|Date|performance|WebAssembly\.|globalThis|eval)\b/gu) ?? [], []);
  });
});
