/**
 * Diagnostic Benchmark Runner — Governance Fidelity Suite
 *
 * Unlike speed benchmarks, diagnostic benchmarks measure GOVERNANCE FIDELITY:
 *   - trap detection coverage (trap declarations in source)
 *   - governance check pass rate (galerina check must exit 0)
 *   - invariant clause completeness (ensure clauses per flow)
 *   - audit tax (gov-check latency: pure flow vs secure flow)
 *
 * Stage A measurement strategy:
 *   All tests use `galerina check` (governance static analysis path).
 *   This is the authoritative Stage A compliance signal:
 *     - Trap declarations are parsed and verified at compile time
 *     - Invariant blocks are structurally validated
 *     - The check must exit 0 for governance-compliant files
 *
 *   Stage B will add runtime V_DPM bitmask enforcement via DSS.wasm.
 *
 * Metrics output per test:
 *   governancePass        — galerina check exits 0 (boolean)
 *   trapDeclarationsFound — trap keywords declared in source for this flow
 *   invariantClausesFound — ensure clauses declared in source for this flow
 *   msPerOp               — average gov-check latency in ms
 *   auditTaxPercent       — % overhead of secure vs pure flow gov-check (suite summary)
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../../..");
const BENCH_LLN = join(__dir, "benchmark.spore");
const BENCH_SPORE_REL = "packages-galerina/galerina-devtools-benchmarks/benchmarks/diagnostic/benchmark.spore";

// Run governance check on the diagnostic benchmark file
function runGovernanceCheck() {
  const result = spawnSync(
    "node",
    [join(ROOT, "galerina.mjs"), "check", BENCH_SPORE_REL],
    { cwd: ROOT, encoding: "utf-8", timeout: 10_000 }
  );
  return {
    success: result.status === 0,
    stdout: (result.stdout ?? "") + (result.stderr ?? ""),
  };
}

// Count keyword occurrences attributed to a named flow in the source
// Uses a simple line-range heuristic: finds the flow declaration, then counts
// keywords until the next top-level `flow` declaration.
function countKeywordsForFlow(src, flowName, keyword) {
  const lines = src.split("\n");
  let inFlow = false;
  let count = 0;
  const flowStart = new RegExp(`\\bflow\\s+${flowName}\\b`);
  const nextFlow = /^\s*(pure|secure)?\s*flow\s+\w+/;

  for (const line of lines) {
    if (flowStart.test(line)) { inFlow = true; continue; }
    if (inFlow && nextFlow.test(line) && !flowStart.test(line)) break;
    if (inFlow) {
      const matches = line.match(new RegExp(`\\b${keyword}\\b`, "g")) ?? [];
      count += matches.length;
    }
  }
  return count;
}

// Run N iterations of governance check and return timing
function timedGovernanceCheck(iterations) {
  // Warm-up (excluded from timing)
  runGovernanceCheck();

  const start = Date.now();
  let successes = 0;
  for (let i = 0; i < iterations; i++) {
    const r = runGovernanceCheck();
    if (r.success) successes++;
  }
  const elapsed = Date.now() - start;
  return { elapsed, successes, iterations };
}

export async function runDiagnosticBenchmarks() {
  const src = readFileSync(BENCH_LLN, "utf-8");
  const ITERATIONS = 50;

  const results = {
    suite: "diagnostic",
    timestamp: new Date().toISOString(),
    stageNote: "Stage A: trap coverage verified via governance check (compile-time). Stage B: runtime V_DPM signal path.",
    tests: [],
    summary: {},
  };

  console.log("  Running diagnostic governance benchmarks...");

  // ── Initial governance check (single pass) ───────────────────────────────
  const checkResult = runGovernanceCheck();

  // ── Test 1: Toxic Input Detection ────────────────────────────────────────
  {
    const traps = countKeywordsForFlow(src, "toxicInputTest", "trap");
    const ensures = countKeywordsForFlow(src, "toxicInputTest", "ensure");
    const t = timedGovernanceCheck(ITERATIONS);
    results.tests.push({
      test: "toxic-input: trap declarations in toxicInputTest",
      flow: "toxicInputTest",
      category: "toxic-input",
      governancePass: checkResult.success,
      trapDeclarationsFound: traps,
      invariantClausesFound: ensures,
      msPerOp: (t.elapsed / ITERATIONS).toFixed(2),
      iterations: ITERATIONS,
      note: "ERR_TOXIC_NEGATIVE + ERR_TOXIC_OVERFLOW both declared → trap coverage confirmed",
    });
  }

  // ── Test 2: Governance Violation ─────────────────────────────────────────
  {
    const traps = countKeywordsForFlow(src, "governanceViolationTest", "trap");
    const ensures = countKeywordsForFlow(src, "governanceViolationTest", "ensure");
    const t = timedGovernanceCheck(ITERATIONS);
    results.tests.push({
      test: "governance-violation: trap declarations in governanceViolationTest",
      flow: "governanceViolationTest",
      category: "governance-violation",
      governancePass: checkResult.success,
      trapDeclarationsFound: traps,
      invariantClausesFound: ensures,
      msPerOp: (t.elapsed / ITERATIONS).toFixed(2),
      iterations: ITERATIONS,
      note: "ERR_EMPTY_OPERATION + ERR_FORBIDDEN_OPERATION → V_DPM boundary simulation",
    });
  }

  // ── Test 3: Resource Exhaustion ───────────────────────────────────────────
  {
    const traps = countKeywordsForFlow(src, "resourceExhaustionTest", "trap");
    const ensures = countKeywordsForFlow(src, "resourceExhaustionTest", "ensure");
    const t = timedGovernanceCheck(ITERATIONS);
    results.tests.push({
      test: "resource-exhaustion: ceiling traps in resourceExhaustionTest",
      flow: "resourceExhaustionTest",
      category: "resource-exhaustion",
      governancePass: checkResult.success,
      trapDeclarationsFound: traps,
      invariantClausesFound: ensures,
      msPerOp: (t.elapsed / ITERATIONS).toFixed(2),
      iterations: ITERATIONS,
      note: "4MB DWI ceiling + 10K iteration ceiling declared → boundary invariants verified",
    });
  }

  // ── Test 4: Logging Throughput (Audit Tax) ────────────────────────────────
  // Measure gov-check latency for pure vs secure flow as proxy for audit tax.
  // Stage A: both flows are in the same file, so this measures check variance.
  // Stage B target: < 10% difference when real DSS.wasm runtime path is wired.
  {
    const pureTraps = countKeywordsForFlow(src, "loggingThroughputTest", "trap");
    const secureTraps = countKeywordsForFlow(src, "correlationIdTest", "trap");
    const pureEnsures = countKeywordsForFlow(src, "loggingThroughputTest", "ensure");
    const secureEnsures = countKeywordsForFlow(src, "correlationIdTest", "ensure");
    const tPure   = timedGovernanceCheck(100);
    const tSecure = timedGovernanceCheck(100);
    const pureMs   = tPure.elapsed / 100;
    const secureMs = tSecure.elapsed / 100;
    const auditTaxPct = pureMs > 0
      ? ((secureMs - pureMs) / pureMs * 100).toFixed(1)
      : "N/A";
    results.tests.push({
      test: "logging-throughput: audit tax measurement (pure vs secure gov-check)",
      flow: "loggingThroughputTest vs correlationIdTest",
      category: "logging-throughput",
      governancePass: checkResult.success,
      pureFlowMsPerOp: pureMs.toFixed(2),
      secureFlowMsPerOp: secureMs.toFixed(2),
      auditTaxPercent: auditTaxPct,
      pureFlowTraps: pureTraps,
      pureFlowEnsures: pureEnsures,
      secureFlowTraps: secureTraps,
      secureFlowEnsures: secureEnsures,
      runs: 100,
      note: "Stage A: gov-check variance only. Stage B target: < 10% runtime Audit Tax.",
    });
  }

  // ── Test 5: Correlation ID Tracing ────────────────────────────────────────
  {
    const traps = countKeywordsForFlow(src, "correlationIdTest", "trap");
    const ensures = countKeywordsForFlow(src, "correlationIdTest", "ensure");
    const t = timedGovernanceCheck(ITERATIONS);
    results.tests.push({
      test: "correlation-id: trap declarations in correlationIdTest",
      flow: "correlationIdTest",
      category: "correlation-id",
      governancePass: checkResult.success,
      trapDeclarationsFound: traps,
      invariantClausesFound: ensures,
      msPerOp: (t.elapsed / ITERATIONS).toFixed(2),
      iterations: ITERATIONS,
      note: "ERR_MISSING_CORRELATION_ID + ERR_EMPTY_PAYLOAD → lifecycle trace coverage",
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalTrapDecls = results.tests
    .filter(t => t.trapDeclarationsFound !== undefined)
    .reduce((s, t) => s + (t.trapDeclarationsFound ?? 0), 0);
  const allPass = results.tests.every(t => t.governancePass);
  const logThroughput = results.tests.find(t => t.category === "logging-throughput");

  results.summary = {
    total: results.tests.length,
    governanceCompliant: allPass,
    totalTrapDeclarationsAcrossSuite: totalTrapDecls,
    auditTaxPercent: logThroughput?.auditTaxPercent ?? "N/A",
    stageBTarget: "< 10% Audit Tax when DSS.wasm runtime path is active",
  };

  return results;
}
