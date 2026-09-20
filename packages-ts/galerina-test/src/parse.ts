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
    // `ℹ` is the spec-reporter's ℹ marker; `#` is the TAP marker. Require a
    // complete summary line and one unique value; progress/spoofed duplicates
    // must not become evidence by first-match accident.
    const matches = [...output.matchAll(
      new RegExp(`^\\s*(?:#|\\u2139)\\s*${label}\\s+([0-9]{1,16})\\s*$`, "gmu"),
    )];
    if (matches.length !== 1) return null;
    const raw = matches[0]?.[1];
    if (raw === undefined) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) ? value : null;
  };
  return { tests: grab("tests"), pass: grab("pass"), fail: grab("fail") };
}

/**
 * Parse the aggregate "<N> tests total" line that scripts/run-all-tests.cjs
 * prints in its summary (its cross-package total is not in node:test format, so
 * parseCounts alone returns null for a unit run). Returns null when absent.
 */
export function parseAggregateTotal(output: string): number | null {
  const matches = [...output.matchAll(/^[^\r\n]*?([0-9]{1,16})\s+tests total\s*$/gmu)];
  if (matches.length !== 1) return null;
  const raw = matches[0]?.[1];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}
