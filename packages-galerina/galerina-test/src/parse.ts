// node:test summary parsing.
//
// LIFTED (behaviour-preserving) from scripts/run-all-tests.cjs `parseCounts` so
// the harness reports the SAME counts the root runner does. Best-effort: a
// missing line yields `null` for that field and NEVER changes a verdict — the
// child's exit code is authoritative (see spawn.ts / runners.ts).

import type { TestCounts } from "./types.js";

/**
 * Parse a node:test run summary from captured output. Handles both the TAP
 * (`# tests N`) and the spec-reporter (`ℹ tests N`) formats.
 */
export function parseCounts(output: string): TestCounts {
  const grab = (label: string): number | null => {
    // `ℹ` is the spec-reporter's ℹ marker; `#` is the TAP marker.
    const m = output.match(
      new RegExp(`(?:^|\\n)\\s*(?:#|\\u2139)\\s*${label}\\s+(\\d+)`),
    );
    return m ? Number(m[1]) : null;
  };
  return { tests: grab("tests"), pass: grab("pass"), fail: grab("fail") };
}

/**
 * Parse the aggregate "<N> tests total" line that scripts/run-all-tests.cjs
 * prints in its summary (its cross-package total is not in node:test format, so
 * parseCounts alone returns null for a unit run). Returns null when absent.
 */
export function parseAggregateTotal(output: string): number | null {
  const m = output.match(/(\d+)\s+tests total/);
  return m ? Number(m[1]) : null;
}
