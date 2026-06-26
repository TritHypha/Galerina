/**
 * Tower Log Test Assertions
 *
 * Helpers for asserting on AuditEvents and DSS state in compiler tests.
 * These allow tests to verify not just "did the test pass" but
 * "what governance events fired during execution."
 *
 * AuditEntry shape (from interpreter.js):
 *   { event, fields: { code, flowId, trapKind, vdpmAtTrap, ... }, timestamp, runId, sourceFile }
 *
 * Static-check result shape (from verifyGovernance / checkValueStates):
 *   { diagnostics: [...], ... }
 *
 * NOTE: static checker results do not produce auditEntries — those are
 * emitted only by the runtime interpreter (executeFlow / executeFlowSync).
 * Use assertNoDiagCode() / assertHasDiagCode() for static-checker tests.
 */

import assert from "node:assert/strict";

// ── Runtime audit-entry helpers ──────────────────────────────────────────────

/**
 * Assert that the run result contains a specific AuditEvent.
 *
 * @param {object} runResult - The interpreter's run result
 * @param {object} expected  - Expected fields: { code, flowId, trapKind, event }
 */
export function assertAuditEvent(runResult, expected) {
  const entries = runResult?.auditEntries ?? runResult?.auditLog ?? [];
  const match = entries.find((e) => {
    if (expected.code &&
        e.code !== expected.code &&
        e.fields?.code !== expected.code) return false;
    if (expected.flowId &&
        e.flowId !== expected.flowId &&
        e.fields?.flowId !== expected.flowId) return false;
    if (expected.trapKind &&
        e.trapKind !== expected.trapKind &&
        e.fields?.trapKind !== expected.trapKind) return false;
    if (expected.event && e.event !== expected.event) return false;
    return true;
  });
  assert.ok(
    match,
    `Expected AuditEvent ${JSON.stringify(expected)} not found.\n` +
    `Actual entries: ${JSON.stringify(entries, null, 2)}`,
  );
}

/**
 * Assert that NO SPORE-INV-000 events fired (clean execution).
 * Use in tests that should complete without any traps.
 */
export function assertNoTraps(runResult) {
  const entries = runResult?.auditEntries ?? runResult?.auditLog ?? [];
  const traps = entries.filter(
    (e) =>
      e.code === "SPORE-INV-000" ||
      e.fields?.code === "SPORE-INV-000" ||
      e.event === "trap" ||
      e.event === "invariant_violation",
  );
  assert.equal(
    traps.length,
    0,
    `Expected no traps but found ${traps.length}:\n${JSON.stringify(traps, null, 2)}`,
  );
}

/**
 * Assert that exactly N traps fired.
 */
export function assertTrapCount(runResult, expectedCount) {
  const entries = runResult?.auditEntries ?? runResult?.auditLog ?? [];
  const traps = entries.filter(
    (e) =>
      e.event === "trap" ||
      e.event === "invariant_violation" ||
      e.event === "mmcp_violation" ||
      e.event === "dwi_fault",
  );
  assert.equal(
    traps.length,
    expectedCount,
    `Expected ${expectedCount} trap(s) but found ${traps.length}:\n${JSON.stringify(traps, null, 2)}`,
  );
}

/**
 * Assert DWI lifecycle events fired (for step keyword tests).
 */
export function assertDWILifecycle(runResult) {
  const entries = runResult?.auditEntries ?? runResult?.auditLog ?? [];
  const alloc = entries.find((e) => e.event === "dwi_allocated");
  const complete = entries.find(
    (e) => e.event === "dwi_completed" || e.event === "dwi_fault",
  );
  assert.ok(alloc, "Expected dwi_allocated event but none found");
  assert.ok(complete, "Expected dwi_completed or dwi_fault event but none found");
}

/**
 * Assert the simulated V_DPM state after execution.
 * @param {object} runResult
 * @param {number} expectedMask - Expected V_DPM bitmask value
 */
export function assertVdpmState(runResult, expectedMask) {
  const vdpm = runResult?.dssState?.vdpm ?? runResult?.vdpmFinalState;
  assert.equal(
    vdpm,
    expectedMask,
    `Expected V_DPM=${expectedMask} (0x${expectedMask.toString(16)}) but got ${vdpm}`,
  );
}

// ── Static-checker diagnostic helpers ────────────────────────────────────────

/**
 * Assert that no diagnostic with the given code is present.
 * Use for static-checker results (verifyGovernance, checkValueStates, etc.)
 * that do not produce auditEntries.
 *
 * @param {object} result    - Static check result with .diagnostics array
 * @param {string} code      - Diagnostic code to check for absence
 * @param {string} [message] - Optional extra failure context
 */
export function assertNoDiagCode(result, code, message) {
  const found = (result?.diagnostics ?? []).filter((d) => d.code === code);
  assert.equal(
    found.length,
    0,
    message ??
      `Expected no ${code} diagnostic but found ${found.length}:\n` +
      `${found.map((d) => d.message).join("\n")}`,
  );
}

/**
 * Assert that at least one diagnostic with the given code is present.
 * Use for static-checker results.
 *
 * @param {object} result    - Static check result with .diagnostics array
 * @param {string} code      - Diagnostic code that must be present
 * @param {string} [message] - Optional extra failure context
 */
export function assertHasDiagCode(result, code, message) {
  const found = (result?.diagnostics ?? []).filter((d) => d.code === code);
  assert.ok(
    found.length > 0,
    message ??
      `Expected at least one ${code} diagnostic but found none.\n` +
      `All codes: ${(result?.diagnostics ?? []).map((d) => d.code).join(", ")}`,
  );
}
