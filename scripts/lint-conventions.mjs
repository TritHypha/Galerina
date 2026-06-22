#!/usr/bin/env node
// lint-conventions.mjs — TASK-ENV-001: the umbrella convention linter (owner 2026-06-22, STRICT).
//
// PRINCIPLE: no convention is "binding" until a TOOL enforces it (else it's advisory and rots).
// This is the single gate that runs every registered convention check, aggregates the result, and
// exits with the total violation count — so a pre-commit hook / CI / run-phase-close can gate on it.
// New enforcers (TASK-SEC-002 mutation gate, TASK-DOC-004 doc↔source drift, #218 coverage cross-check)
// REGISTER here as they land — one place to see "are all conventions green?".
//
// Each check is a child script whose EXIT CODE = its violation count (0 = clean). Run from repo root.
//
// Flags:
//   --soft   always exit 0 (report-only) — for wiring into run-phase-close before the baseline hits 0.
//   --json   emit machine-readable JSON (for #218 coverage cross-check to consume).
import { spawnSync } from "node:child_process";

const CHECKS = [
  {
    name: "diagnostic-codes",
    script: "scripts/audit-diagnostic-codes.mjs",
    desc: "LLN-*/ERR_* code conventions (V1 overload · V2 collision · V3 sev-vocab · V4 multi-sev · V5 name-case)",
  },
  {
    name: "doc-drift",
    script: "scripts/audit-doc-drift.mjs",
    desc: "DOC-004: doc 'living metrics' (global test/package COUNTS) vs the version.json authority — v1 heuristic (living docs only; #150 auto-count is the real remedy)",
  },
  // TASK-SEC-002 (mutation/red-team per gate) and #218 (coverage cross-check, run separately as
  // `audit-coverage.mjs`) register additional check scripts here as they are built.
];

const soft = process.argv.includes("--soft");
const asJson = process.argv.includes("--json");

const rows = [];
let total = 0;
let toolErrors = 0;
for (const c of CHECKS) {
  const r = spawnSync(process.execPath, [c.script], { encoding: "utf8" });
  const stdout = r.stdout || "";
  // Each check MUST print a machine-readable `VIOLATIONS: N` line. Parse THAT, not the raw exit code —
  // so a child that crashes (uncaught → exit 1) or is killed by a signal (status null) is a TOOL ERROR,
  // not silently folded in as "1 violation" making the gate look almost-green.
  const vm = stdout.match(/^VIOLATIONS:\s*(\d+)\s*$/m);
  if (r.error || r.status === null || !vm) {
    toolErrors++;
    const why = r.error?.message || (r.status === null ? "killed by signal" : "no VIOLATIONS line (check crashed?)");
    rows.push({ name: c.name, desc: c.desc, error: true, why: why.split(/\r?\n/)[0], stderr: (r.stderr || "").split(/\r?\n/)[0] });
    continue;
  }
  const violations = Number(vm[1]);
  total += violations;
  const totalLine = stdout.split(/\r?\n/).filter((l) => /TOTAL/i.test(l)).pop()?.trim() ?? "";
  rows.push({ name: c.name, desc: c.desc, violations, totalLine });
}

if (asJson) {
  console.log(JSON.stringify({ total, toolErrors, checks: rows }, null, 2));
} else {
  const out = ["# LogicN convention lint (TASK-ENV-001)\n"];
  for (const row of rows) {
    if (row.error) { out.push(`⚠ ${row.name} — TOOL ERROR: ${row.why}${row.stderr ? " — " + row.stderr : ""}`); continue; }
    out.push(`${row.violations === 0 ? "✓" : "✗"} ${row.name} — ${row.violations} violation(s)`);
    out.push(`    ${row.desc}`);
    if (row.totalLine) out.push(`    ${row.totalLine}`);
  }
  out.push(`\nTOTAL: ${total} violation(s) across ${CHECKS.length - toolErrors} ran check(s)` + (toolErrors ? `  ·  ⚠ ${toolErrors} TOOL ERROR(s)` : ""));
  out.push(
    toolErrors > 0
      ? "GATE INCONCLUSIVE — a check failed to run (fix the tool error)."
      : total === 0
        ? "CONVENTIONS GREEN ✓"
        : `CONVENTIONS HAVE VIOLATIONS — a strict gate would FAIL${soft ? " (running --soft: reported, not enforced)" : ""}.`,
  );
  console.log(out.join("\n"));
}

// exit: tool error → distinct sentinel (255) so CI sees "broken gate" not "0/N violations"; else violation count.
process.exit(soft ? 0 : (toolErrors > 0 ? 255 : Math.min(total, 250)));
