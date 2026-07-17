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
//
// ★ CROSS-REPO MEMBERS. Two checks read the PRIVATE sibling KB (ZTF-Knowledge-Bases). This repo is
// PUBLIC, so on a public runner that corpus is legitimately absent — and both tools then fail-closed and
// reported a "violation" that was NOT a drift, only the doc being elsewhere. The umbrella counted it as
// a real one. That number was honest for its surface and its surface was not the thing.
//
// So a cross-repo member is DECLARED, and when the corpus is absent it is SKIPPED — never silently: the
// report names the check, why it did not run, and WHERE it is enforced instead (the KB's own CI, which
// can read both trees with no cross-repo credential at all). A skip that does not say where the check
// still runs is just a hole with good manners.
import { spawnSync } from "node:child_process";
import { kbCorpusPresent, resolveKbDir } from "./lib/kb-dir.mjs";

const CHECKS = [
  {
    name: "diagnostic-codes",
    script: "scripts/audit-diagnostic-codes.mjs",
    desc: "FUNGI-*/ERR_* code conventions (V1 overload · V2 collision · V3 sev-vocab · V4 multi-sev · V5 name-case)",
  },
  {
    name: "doc-drift",
    script: "scripts/audit-doc-drift.mjs",
    desc: "DOC-004: doc 'living metrics' (global test/package COUNTS) vs the version.json authority — v1 heuristic (living docs only; #150 auto-count is the real remedy)",
    // Partially cross-repo: it scans the KB's root docs AND this repo's README/AGENTS/CHANGELOG, and
    // fail-closes on an unreadable corpus by design ("this audit once silently lost its whole corpus to
    // a fail-open catch{}"). That design is right; a public runner having no KB is the exception.
    crossRepo: { needs: "ZTF-Knowledge-Bases", enforcedIn: "ZTF-Knowledge-Bases CI (kb-guards.yml) — reads both trees, no cross-repo credential" },
  },
  {
    name: "provenance",
    script: "scripts/audit-provenance.mjs",
    desc: "BLD-003 (folds #216): generated artifacts (code-index/code-registry/kb-index) must carry a provenance sidecar + be fresh vs sources (MISSING/UNSTAMPED/STALE)",
  },
  {
    name: "mutation",
    script: "scripts/audit-mutation.mjs",
    desc: "SEC-002: re-introduce each fail-closed gate's hole + assert its test catches it (Stryker-style; would have caught the B5a fail-open)",
    heavy: true, // rebuilds + runs tests per mutant (~40s) — only with --full (CI/security tier), skipped in the fast phase-close sweep
  },
  {
    name: "fungi-quality",
    script: "scripts/lint-fungi.mjs",
    desc: "owner .fungi rules (2026-06-23): every flow has a human comment (rule 1) + a contract{intent} declaring clauses EXCEPT auto-settings (rule 2), and no AI slop / bad syntax (rule 3). Production src only — fixtures/examples/benchmarks whitelisted in governance/fungi-lint-allow.json. Baseline > 0 (report-only until the self-hosted/.fungi corpus is retrofitted).",
  },
  {
    name: "tier-boundary",
    script: "scripts/audit-tier-boundary.mjs",
    desc: "0056-ci-lint: open-core contamination guard — no NON-Apache license declaration in the package tree (PD-spec↛Apache) + no core→enterprise import (governance/tier-manifest.json, inert until /enterprise exists). Zero-baseline; also runs ENFORCING in conventions.yml.",
  },
  {
    name: "production-blockers",
    script: "scripts/audit-production-blockers.mjs",
    desc: "RD-0124 NOW-1: every PRODUCTION_BLOCKER code (production-check.ts) must have a real emitter — a blocker no pass can produce is a FALSE capability claim (the FUNGI-MEMORY-001/002/003/007 false memory-gate). Zero-baseline; also runs ENFORCING in conventions.yml.",
  },
  {
    name: "name-collisions",
    script: "scripts/audit-name-collisions.mjs",
    desc: "RD-0124: no confusingly-similar package names — no two names share a token-multiset (the graph-project/project-graph reordered-token bug) and no typo-twins (Levenshtein 1). Live package names vs governance/name-registry.json (known collisions allowlisted with a decided resolution). Zero-baseline; also runs ENFORCING in conventions.yml.",
  },
  {
    name: "diagnostic-doc-drift",
    script: "scripts/audit-diagnostic-doc-drift.mjs",
    desc: "RD-0124: the canonical diagnostic doc (compiler-diagnostics.md) must not misdescribe a wired code — for any FUNGI-* with a structured name/message in source AND a doc description, the two must share ≥1 meaningful word (zero-overlap = drift). Caught the FUNGI-RUNTIME-006 'Audit event stream write failed' (really RateLimitExceeded) bug + 14 more. Zero-baseline; runs ENFORCING in the KB's kb-guards.yml (the doc it validates lives there).",
    // WHOLLY cross-repo: the doc it compares against IS the KB's compiler-diagnostics.md. With no
    // corpus there is nothing to compare — the tool correctly fail-closes, and this repo's public CI is
    // simply not where that comparison can happen.
    crossRepo: { needs: "ZTF-Knowledge-Bases", enforcedIn: "ZTF-Knowledge-Bases CI (kb-guards.yml) — reads both trees, no cross-repo credential" },
  },
  {
    name: "overclaim-phrases",
    script: "scripts/audit-overclaim-phrases.mjs",
    desc: "RD-0126 overclaim-E / RD-0114-G2: no doc/.fungi/comment may pair an O(1)/single-clock/constant-time claim with fill/wipe/memory.fill within ~8 words — memory.fill is ONE opcode doing Θ(arena-size) work, not O(1) (the wat-emitter already phrases it right). Correction/refutation lines are exempt. Approved phrasing: 'one atomic instruction doing Θ(arena-size) work'. Zero-baseline; also runs ENFORCING in conventions.yml.",
  },
  {
    name: "graph-integrity",
    script: "scripts/audit-graph-integrity.mjs",
    desc: "RD-0121: structural validation of a GENERATED project graph — no dangling edge (from/to ref a real node), no duplicate node id, no stale sourcePath (node→nonexistent file), and the depends_on subgraph is a DAG (no cycle). Validate-IF-PRESENT: skips when build/graph/*.json (a ~3MB gitignored artifact) is absent, validates fail-closed when present. The detectors' --self-test runs ENFORCING in conventions.yml (build-free, anti-neuter).",
  },
  {
    name: "web-stub-guard",
    script: "scripts/audit-web-stub-guard.mjs",
    desc: "RD-0100: the deny-by-default galerina-web-* contracts must be born fail-closed. A STUB package (no src/dist) is inert and passes; an IMPLEMENTED web-* package MUST also ship a *.failclosed/acceptance.test exercising its FUNGI-WEB-* invariants (else the prose 'deny-by-default' fails OPEN the moment impl lands). The contract is governance/web-failclosed-contract.json. Zero-baseline (all 6 are stubs); also runs ENFORCING in conventions.yml.",
  },
  // #218 (coverage cross-check) runs separately as `audit-coverage.mjs`.
];

const soft = process.argv.includes("--soft");
const asJson = process.argv.includes("--json");
const full = process.argv.includes("--full"); // include heavy checks (mutation); default = fast tier only

const rows = [];
let total = 0;
let toolErrors = 0;
let skippedHeavy = 0;
let skippedCrossRepo = 0;
let skippedArtifact = 0; // the child skipped ITSELF — its input was absent (see the SKIPPED: check below)
// Ask the DISK whether the corpus is readable — not whether a path resolves, and emphatically not
// whether some secret is set. Resolved once, so every cross-repo member reports the same answer.
const kbPresent = kbCorpusPresent();
const kbDir = resolveKbDir();
for (const c of CHECKS) {
  if (c.heavy && !full) { skippedHeavy++; rows.push({ name: c.name, desc: c.desc, skipped: true }); continue; }
  if (c.crossRepo && !kbPresent) {
    skippedCrossRepo++;
    rows.push({ name: c.name, desc: c.desc, skipped: true, crossRepo: { ...c.crossRepo, lookedIn: kbDir } });
    continue;
  }
  const r = spawnSync(process.execPath, [c.script], { encoding: "utf8" });
  const stdout = r.stdout || "";
  // ★ THE THIRD KIND OF SKIP: the CHILD skipping ITSELF (R&D finding, 2026-07-17). The two above are
  // skips WE decide — heavy, and cross-repo. This one the child decides, because its input is not there
  // (audit-graph-integrity needs build/graph/*.json, a gitignored artifact absent from every clean
  // checkout). It used to announce that by printing `VIOLATIONS: 0` and exiting 0 — indistinguishable
  // from ran-and-clean — so this loop counted it among the "ran" and the summary of the first green
  // `conventions` in eight days reported RD-0121 as a check that passed. It has never run in CI, once.
  //
  // A skip must be a signal a parent cannot mistake for a zero. Checked BEFORE the VIOLATIONS parse: a
  // skipping child deliberately prints no VIOLATIONS line, so an older parent fails closed as a TOOL
  // ERROR rather than silently reading it as clean.
  const sm = stdout.match(/^SKIPPED:\s*(.+)$/m);
  if (sm) {
    skippedArtifact++;
    rows.push({ name: c.name, desc: c.desc, skipped: true, artifactAbsent: sm[1].trim() });
    continue;
  }
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
  console.log(JSON.stringify({ total, toolErrors, skippedHeavy, skippedCrossRepo, kbPresent, checks: rows }, null, 2));
} else {
  const out = ["# Galerina convention lint (TASK-ENV-001)\n"];
  for (const row of rows) {
    if (row.crossRepo) {
      out.push(`⊘ ${row.name} — SKIPPED (cross-repo: needs ${row.crossRepo.needs}, not readable here)`);
      out.push(`    looked in: ${row.crossRepo.lookedIn}`);
      out.push(`    ENFORCED IN: ${row.crossRepo.enforcedIn}`);
      out.push(`    ${row.desc}`);
      continue;
    }
    if (row.artifactAbsent) {
      out.push(`⊘ ${row.name} — SKIPPED BY THE CHECK ITSELF (its input is absent — this is NOT a pass)`);
      out.push(`    reason: ${row.artifactAbsent}`);
      out.push(`    ${row.desc}`);
      continue;
    }
    if (row.skipped) { out.push(`⊘ ${row.name} — SKIPPED (heavy; pass --full to run)`); out.push(`    ${row.desc}`); continue; }
    if (row.error) { out.push(`⚠ ${row.name} — TOOL ERROR: ${row.why}${row.stderr ? " — " + row.stderr : ""}`); continue; }
    out.push(`${row.violations === 0 ? "✓" : "✗"} ${row.name} — ${row.violations} violation(s)`);
    out.push(`    ${row.desc}`);
    if (row.totalLine) out.push(`    ${row.totalLine}`);
  }
  const ran = CHECKS.length - toolErrors - skippedHeavy - skippedCrossRepo - skippedArtifact;
  out.push(`\nTOTAL: ${total} violation(s) across ${ran} ran check(s)`
    + (skippedHeavy ? `  ·  ⊘ ${skippedHeavy} heavy skipped (--full)` : "")
    + (skippedCrossRepo ? `  ·  ⊘ ${skippedCrossRepo} cross-repo skipped (no KB here)` : "")
    + (skippedArtifact ? `  ·  ⊘ ${skippedArtifact} artifact-absent skipped (the check skipped ITSELF)` : "")
    + (toolErrors ? `  ·  ⚠ ${toolErrors} TOOL ERROR(s)` : ""));
  // The green must state its SURFACE and its EXCLUSIONS. "CONVENTIONS GREEN ✓" over 10 of 12 checks is
  // the false green this whole file is meant not to print — a reader takes the tick as "all conventions",
  // which is the claim the word CONVENTIONS makes. Name what did not run, or do not use the word.
  out.push(
    toolErrors > 0
      ? "GATE INCONCLUSIVE — a check failed to run (fix the tool error)."
      : total === 0
        ? (skippedCrossRepo || skippedArtifact
            ? `CONVENTIONS GREEN over ${ran}/${CHECKS.length} checks ✓ — NOT a verdict on the ${skippedCrossRepo + skippedArtifact} skipped check(s) above`
              + (skippedCrossRepo ? ` (${skippedCrossRepo} cross-repo: need the KB, enforced in its CI)` : "")
              + (skippedArtifact ? ` (${skippedArtifact} artifact-absent: the check's own input was missing — nothing was validated)` : "")
              + "."
            : "CONVENTIONS GREEN ✓")
        : `CONVENTIONS HAVE VIOLATIONS — a strict gate would FAIL${soft ? " (running --soft: reported, not enforced)" : ""}.`,
  );
  console.log(out.join("\n"));
}

// exit: tool error → distinct sentinel (255) so CI sees "broken gate" not "0/N violations"; else violation count.
process.exit(soft ? 0 : (toolErrors > 0 ? 255 : Math.min(total, 250)));
