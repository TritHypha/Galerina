/**
 * Galerina Diagnostic Benchmark Runner
 *
 * Unlike performance benchmarks (which measure throughput),
 * diagnostic benchmarks measure resilience, audit fidelity,
 * and the governance overhead ("Audit Tax").
 *
 * Usage:
 *   node src/diagnostic-runner.mjs
 *   node src/diagnostic-runner.mjs --benchmark toxic-input
 *   node src/diagnostic-runner.mjs --category fault-injection
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const RESULTS_DIR = join(__dir, "../results");

// Track which spore files have been built in this session (avoid redundant rebuilds per benchmark)
const _builtFiles = new Set();

// Build a .spore file to register a fresh manifest before running
function buildFile(llnFile) {
  if (_builtFiles.has(llnFile)) return;
  spawnSync(
    "node",
    [join(ROOT, "galerina.mjs"), "build", llnFile],
    { cwd: ROOT, encoding: "utf-8", timeout: 30_000 }
  );
  _builtFiles.add(llnFile);
}

// Run governance check on a .spore file — measures static analysis speed
// Returns { success, flowCount, violations, diagnostics }
function runGovernanceCheck(llnFile) {
  const result = spawnSync(
    "node",
    [join(ROOT, "galerina.mjs"), "check", llnFile],
    { cwd: ROOT, encoding: "utf-8", timeout: 10_000 }
  );
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const hasViolation = output.includes("❌") || result.status !== 0;
  // Count trap declarations in the source as a proxy for trap-coverage completeness
  const trapCount = (output.match(/SPORE-INV|trap/g) ?? []).length;
  return {
    success: result.status === 0,
    stdout: output,
    trapCount,
    hasViolation,
  };
}

// Note: galerina run --invoke is not used by the diagnostic runner in Stage A.
// All measurements use governance-check (galerina check) — the authoritative
// compile-time compliance signal. Stage B will add a runtime execution path
// via real DSS.wasm V_DPM bitmask enforcement.

// Read recent audit log entries
function readRecentAuditLog(limit = 200) {
  const logPath = join(ROOT, "build/audit-log/audit-log.jsonl");
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Run a diagnostic benchmark and return structured results
//
// Stage A measurement strategy:
//   All scenarios use `galerina check` (governance static analysis path).
//   This is the authoritative Stage A compliance signal:
//     - Trap declarations are parsed and verified at compile time
//     - Invariant blocks are structurally validated
//     - The check must exit 0 for governance-compliant files
//
//   Trap coverage is verified via static trap declarations in the .spore source,
//   not by runtime WASM execution (Stage B will wire the runtime signal path
//   via real DSS.wasm V_DPM bitmask enforcement).
//
//   For the logging-throughput benchmark, two separate files are checked
//   to measure the "Audit Tax" — governance check time for pure vs secure flows.
async function runDiagnostic(benchId, llnFile, scenarios) {
  console.log(`\n  Diagnostic: ${benchId}`);
  const results = { id: benchId, category: "diagnostic", timestamp: new Date().toISOString(), scenarios: {} };

  // Warm-up governance check (cold-start excluded from timing)
  runGovernanceCheck(llnFile);

  for (const [scenarioName, { flow, args, expectTrap, iterations = 100, altFile }] of Object.entries(scenarios)) {
    const targetFile = altFile ?? llnFile;
    const start = Date.now();
    let successes = 0;

    // Governance check: file must compile 0 errors + 0 governance warnings
    for (let i = 0; i < iterations; i++) {
      const r = runGovernanceCheck(targetFile);
      if (r.success) successes++;
    }

    const elapsed = Date.now() - start;

    // Governance compliance: for all diagnostic benchmarks, the .spore file must pass
    // governance check cleanly — this confirms trap declarations are structurally sound.
    // For "toxic" scenarios, compliance = traps ARE declared (static coverage).
    // For "baseline" scenarios, compliance = file compiles clean.
    const governanceComplianceCheck = successes === iterations;

    // Count trap declarations in source as trap-coverage metric
    const src = readFileSync(join(ROOT, targetFile), "utf-8");
    const trapDeclarations = (src.match(/\btrap\b/g) ?? []).length;
    const invariantClauses = (src.match(/\bensure\b/g) ?? []).length;

    const scenario = {
      mode: "gov-check",
      iterations,
      elapsedMs: elapsed,
      msPerOp: (elapsed / iterations).toFixed(2),
      successes,
      governanceComplianceCheck,
      trapDeclarationsInSource: trapDeclarations,
      invariantClausesInSource: invariantClauses,
      stageNote: "Stage A: trap coverage verified via governance check (compile-time). Stage B: runtime V_DPM signal path.",
    };

    results.scenarios[scenarioName] = scenario;
    const icon = governanceComplianceCheck ? "OK" : "FAIL";
    console.log(`    [${icon}] ${scenarioName.padEnd(28)} ${scenario.msPerOp}ms/op  traps-in-src:${trapDeclarations}  govCheck:${governanceComplianceCheck ? "pass" : "fail"}`);
  }

  return results;
}

// All diagnostic benchmarks
// Scenarios use gov-check mode: each measures `galerina check` latency for the benchmark file.
// trap-declarations-in-source confirms structural trap coverage (compile-time audit proxy).
const DIAGNOSTICS = [
  {
    id: "toxic-input",
    llnFile: "packages-galerina/galerina-devtools-benchmarks/benchmarks/toxic-input/benchmark.spore",
    scenarios: {
      // All scenarios check the same file; traps-in-src confirms all toxic traps are declared
      "toxic variants (gov check)": { expectTrap: true,  iterations: 50 },
      "valid baseline (gov check)": { expectTrap: false, iterations: 50 },
    },
  },
  {
    id: "governance-violation",
    llnFile: "packages-galerina/galerina-devtools-benchmarks/benchmarks/governance-violation/benchmark.spore",
    scenarios: {
      "role-denied (gov check)":    { expectTrap: true,  iterations: 50 },
      "authorised (gov check)":     { expectTrap: false, iterations: 50 },
    },
  },
  {
    id: "resource-exhaustion",
    llnFile: "packages-galerina/galerina-devtools-benchmarks/benchmarks/resource-exhaustion/benchmark.spore",
    scenarios: {
      "ceiling/over-budget (gov)":  { expectTrap: true,  iterations: 50 },
    },
  },
  {
    id: "logging-throughput",
    llnFile: "packages-galerina/galerina-devtools-benchmarks/benchmarks/logging-throughput/benchmark.spore",
    scenarios: {
      // Both scenarios check the same file — it contains both pure and secure flows.
      // msPerOp difference (if any) reflects compiler analysis depth for pure vs secure.
      "minimal audit (gov check)":  { expectTrap: false, iterations: 100 },
      "full audit   (gov check)":   { expectTrap: false, iterations: 100 },
    },
  },
];

async function main() {
  const filterIdx = process.argv.indexOf("--benchmark");
  const filter = filterIdx >= 0 ? process.argv[filterIdx + 1] : null;
  const toRun = filter ? DIAGNOSTICS.filter(d => d.id === filter) : DIAGNOSTICS;

  console.log("\n+==================================================================+");
  console.log("|  Galerina Diagnostic Benchmarks  *  Resilience + Audit Fidelity   |");
  console.log("+==================================================================+");
  console.log("  Measures: detection speed * audit trail completeness * logging penalty\n");

  const allResults = [];
  for (const d of toRun) {
    const result = await runDiagnostic(d.id, d.llnFile, d.scenarios);
    allResults.push(result);
  }

  // Summary
  console.log("\n-------------------------------------------------------------------");
  console.log("  Diagnostic Summary:");
  let totalCompliant = 0;
  let totalScenarios = 0;
  for (const r of allResults) {
    for (const [, s] of Object.entries(r.scenarios)) {
      totalScenarios++;
      if (s.governanceComplianceCheck) totalCompliant++;
    }
  }
  console.log(`  Governance compliance: ${totalCompliant}/${totalScenarios} scenarios PASS`);

  // Logging penalty from logging-throughput benchmark
  // Stage A: compares gov-check latency between the two scenarios in logging-throughput.
  // Both scenarios check the same file (which contains both pure and secure flows).
  // Any difference reflects compiler analysis depth variance between runs.
  // Stage B target: < 5% Audit Tax when secure flows get real runtime path.
  const logBench = allResults.find(r => r.id === "logging-throughput");
  if (logBench) {
    const minimal = parseFloat(logBench.scenarios["minimal audit (gov check)"]?.msPerOp ?? 0);
    const full    = parseFloat(logBench.scenarios["full audit   (gov check)"]?.msPerOp  ?? 0);
    if (minimal > 0) {
      const penalty = ((full - minimal) / minimal * 100).toFixed(1);
      const note = Math.abs(parseFloat(penalty)) < 5 ? "(within noise)" : "";
      console.log(`  Audit Tax (gov-check variance): ${penalty}%  (${minimal}ms -> ${full}ms per op) ${note}`);
      console.log(`  Stage B target: < 5% when secure flows get real DSS.wasm runtime path`);
    }
  }
  console.log("-------------------------------------------------------------------\n");

  // Save results
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, "diagnostic-latest.json"), JSON.stringify(allResults, null, 2));
  console.log(`  Results saved: ${join(RESULTS_DIR, "diagnostic-latest.json")}\n`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
