import { runGalerinaBenchmark } from "../../src/galerina-runner.mjs";
import { readAuditLog } from "../../src/audit-reader.mjs";

export async function runDiagnostic() {
  const results = { id: "toxic-input", category: "diagnostic", runs: [] };

  // Run 100 toxic inputs — all should trap
  const toxicStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await runGalerinaBenchmark("benchmarks/toxic-input/benchmark.spore", "processPayment", [-1, "USD"]);
  }
  const toxicMs = Date.now() - toxicStart;

  // Run 100 valid inputs — none should trap
  const validStart = Date.now();
  for (let i = 0; i < 100; i++) {
    await runGalerinaBenchmark("benchmarks/toxic-input/benchmark.spore", "processPaymentValid", [500, "USD"]);
  }
  const validMs = Date.now() - validStart;

  // Check audit log for completeness
  const auditEntries = await readAuditLog();
  const toxicEvents = auditEntries.filter(e => e.trapKind === "ERR_NEGATIVE_AMOUNT");

  results.toxicDetectionMs = toxicMs / 100;
  results.validExecutionMs = validMs / 100;
  results.loggingPenaltyPct = ((toxicMs - validMs) / validMs * 100).toFixed(1);
  results.auditEventsGenerated = toxicEvents.length;
  results.governanceComplianceCheck = toxicEvents.length >= 100;
  results.rollbackAlwaysClean = toxicEvents.every(e => e.rollbackStatus === "clean");

  return results;
}
