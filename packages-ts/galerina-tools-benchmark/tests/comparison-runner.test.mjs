import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BENCHMARK_COMPARISON_SCHEMA,
  DEFAULT_RUNTIME_COMPARISON_OPERATIONS,
  FUNGI_BENCH_CMP_RUN_001,
  FUNGI_BENCH_CMP_RUN_002,
  FUNGI_BENCH_CMP_RUN_003,
  FUNGI_BENCH_CMP_RUN_004,
  FUNGI_BENCH_RUN_002,
  RUNTIME_COMPARISON_CASE_IDS,
  RUNTIME_COMPARISON_INPUT_KIND,
  runCompiledComparison,
  runLightBenchmark,
  runRuntimeComparison,
} from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

const node = () => ({ name: "node", version: "20.20.2" });
const compiler = () => ({ name: "galerina", version: "1.0.0-beta.2", flags: ["--profile=default"] });
const artefact = () => ({ digestSha256: "a".repeat(64) });
const codes = (r) => r.diagnostics.map((d) => d.code);

function expectedDigest(caseId, operations) {
  const bytes = new TextEncoder().encode(`${RUNTIME_COMPARISON_INPUT_KIND}\n${caseId}\n${operations}\n`);
  return createHash("sha256").update(bytes).digest("hex");
}

describe("Phase 9 in-package comparison runners", () => {
  it("exposes the closed runtime comparison case set", () => {
    assert.deepEqual([...RUNTIME_COMPARISON_CASE_IDS], [
      "logic.bool_branch",
      "logic.tri_match",
      "logic.result_option",
    ]);
    assert.ok(Object.isFrozen(RUNTIME_COMPARISON_CASE_IDS));
  });

  it("builds a runtime-only comparison report from logic.bool_branch", () => {
    const r = runRuntimeComparison({
      caseId: "logic.bool_branch",
      runtime: node(),
      operations: 1000,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.report.schema, BENCHMARK_COMPARISON_SCHEMA);
    assert.equal(r.report.caseId, "logic.bool_branch");
    assert.equal(r.report.shareable, false);
    assert.equal(r.report.authority, "NON_AUTHORIZING");
    assert.equal(r.report.sameInput, true);
    assert.deepEqual(r.report.sides.map((s) => s.side), ["runtime"]);
    assert.equal(r.report.sides[0].status, "passed");
    assert.equal(r.report.sides[0].runtime.name, "node");
    assert.equal(r.report.inputDigestSha256, expectedDigest("logic.bool_branch", 1000));
    assert.equal(Object.hasOwn(r.report, "durationRatioRuntimeOverCompiled"), false);
    assert.ok(Number.isSafeInteger(r.report.sides[0].durationMs));
  });

  it("runs each closed light logic case", () => {
    for (const caseId of RUNTIME_COMPARISON_CASE_IDS) {
      const r = runRuntimeComparison({ caseId, runtime: node(), operations: 500 });
      assert.equal(r.ok, true, caseId + JSON.stringify(r));
      assert.equal(r.report.sides[0].status, "passed", caseId);
      assert.equal(r.report.inputDigestSha256, expectedDigest(caseId, 500), caseId);
    }
  });

  it("defaults operations to the closed comparison default", () => {
    const r = runRuntimeComparison({ caseId: "logic.bool_branch", runtime: node() });
    assert.equal(r.ok, true);
    assert.equal(r.report.inputDigestSha256, expectedDigest("logic.bool_branch", DEFAULT_RUNTIME_COMPARISON_OPERATIONS));
  });

  it("refuses unknown, hardware, full-mode and hostile case ids unread", () => {
    for (const caseId of ["cpu.hash_sha256_32mb", "json.stream_validate_10mb", "gpu.vector_small_if_available", "logic.logic5_match", "python", "LOGIC.bool_branch"]) {
      const r = runRuntimeComparison({ caseId, runtime: node() });
      assert.equal(r.ok, false, caseId);
      assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_002]);
    }
  });

  it("refuses malformed runtime identity and surplus fields without echoing secrets", () => {
    const secret = "/srv/scratch/secret-token";
    const r = runRuntimeComparison({ caseId: "logic.bool_branch", runtime: node(), extra: secret });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_001]);
    assert.ok(!JSON.stringify(r).includes("secret-token"));
    assert.deepEqual(codes(runRuntimeComparison({ caseId: "logic.bool_branch", runtime: { name: "Node JS", version: "20" } })), [FUNGI_BENCH_CMP_RUN_001]);
    assert.deepEqual(codes(runRuntimeComparison({ caseId: "logic.bool_branch", runtime: node(), operations: 0 })), [FUNGI_BENCH_CMP_RUN_001]);
    assert.deepEqual(codes(runRuntimeComparison({ caseId: "logic.bool_branch", runtime: node(), operations: 10_001 })), [FUNGI_BENCH_CMP_RUN_001]);
  });

  it("compiled comparison refuses without an admitted artefact", () => {
    const r = runCompiledComparison({
      caseId: "logic.bool_branch",
      runtime: node(),
      compiler: compiler(),
    });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_003]);
  });

  it("compiled comparison refuses a malformed artefact digest", () => {
    const r = runCompiledComparison({
      caseId: "logic.bool_branch",
      runtime: node(),
      compiler: compiler(),
      admittedArtifact: { digestSha256: "ZZ" },
    });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_003]);
  });

  it("compiled comparison still refuses execution when an artefact digest is present", () => {
    const r = runCompiledComparison({
      caseId: "logic.bool_branch",
      runtime: node(),
      compiler: compiler(),
      admittedArtifact: artefact(),
    });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_004]);
  });

  it("compiled comparison refuses a path-bearing artefact unread", () => {
    const secret = "C:\\secrets\\payload.wasm";
    const r = runCompiledComparison({
      caseId: "logic.bool_branch",
      runtime: node(),
      compiler: compiler(),
      admittedArtifact: { digestSha256: "a".repeat(64), path: secret },
    });
    assert.equal(r.ok, false);
    assert.deepEqual(codes(r), [FUNGI_BENCH_CMP_RUN_001]);
    assert.ok(!JSON.stringify(r).includes("payload.wasm"));
  });

  it("keeps full and stress refused on the light runner (L31 pin)", () => {
    const input = {
      benchmarkId: "bench_test_001",
      loVersion: "2.0.0",
      system: {
        osFamily: "linux", architecture: "x64", cpuCoresBucket: "8", memoryBucket: "unknown",
        gpuBackend: "none", lowBitBackend: "none",
      },
      now: () => 1,
    };
    for (const mode of ["full", "stress"]) {
      const r = runLightBenchmark({ ...input, mode });
      assert.equal(r.ok, false, mode);
      assert.equal(r.diagnostics[0].code, FUNGI_BENCH_RUN_002);
    }
  });

  it("comparison-runner source stays free of fs/env/network/child_process/crypto", () => {
    const src = readFileSync(join(SRC, "comparison-runner.ts"), "utf8");
    assert.doesNotMatch(src, /\b(?:node:fs|node:os|node:child_process|node:net|node:crypto|process\.env)\b/u);
    assert.match(src, /node:util\/types/u);
  });
});
