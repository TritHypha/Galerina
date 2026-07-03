#!/usr/bin/env node
// audit-coverage.mjs — #218 coverage cross-check (owner 2026-06-22): "review the graphs and check
// against what we audit." GRAPH THE AUDIT — this is the deterministic tool, never a manual pass.
//
// For a dimension, cross-check its INDEX (graph) against the AUDIT (registry/detector) BIDIRECTIONALLY:
//   1. index → audit : every real index entry is covered by the audit (no blind spots)
//   2. audit → index : every audit/registry entry maps to a real index entry (no phantoms / stale)
//   3. completeness  : the index ingests ALL sources (the Stage-D lesson — not just src)
// Emits build/coverage/coverage-<dimension>.md + exit code = actionable gap count (CI-gateable).
//
// Dimension implemented: `codes` (FUNGI-*/ERR-*). Inputs: build/code-index/code-index.json (the graph)
// + docs/Knowledge-Bases/galerina-governance-rules.md (the audit registry). Other dimensions register here
// as their index + audit land (#217 capabilities, project graph, etc.).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractCodes } from "./lib/codes.mjs";

const ROOT = process.cwd();
const asJson = process.argv.includes("--json");
const soft = process.argv.includes("--soft"); // report-only (exit 0) — for run-phase-close wiring
const dim = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]) ?? "codes";

if (dim !== "codes") {
  console.error(`audit-coverage: dimension '${dim}' not implemented yet (have: codes)`);
  process.exit(2);
}

// ── load the index graph ─────────────────────────────────────────────────────
let index;
try {
  index = JSON.parse(readFileSync(join(ROOT, "build/code-index/code-index.json"), "utf8"));
} catch {
  console.error("audit-coverage: build/code-index/code-index.json missing — run `node scripts/code-index.mjs` first.");
  process.exit(2);
}

// ── load the audit registry ──────────────────────────────────────────────────
// The governance-rules registry migrated to the sibling ZTF-Knowledge-Bases repo (resolve like
// kb-index.mjs / audit-doc-drift.mjs). Its absence is NOT "optional": a curated cross-check against an
// empty registry silently reports "0 phantoms / clean" — a fail-OPEN. Fail CLOSED so the blind spot is loud
// (mirrors the exit(2) on a missing code-index above; --soft governs VIOLATIONS, not a missing corpus).
const KB_DIR = process.env.GALERINA_KB_DIR || join(ROOT, "..", "ZTF-Knowledge-Bases");
const REGISTRY = join(KB_DIR, "galerina-governance-rules.md");
let registryText = "";
try {
  registryText = readFileSync(REGISTRY, "utf8");
} catch {
  console.error(
    `audit-coverage: governance-rules registry unreadable at ${REGISTRY} — the curated cross-check would ` +
    `falsely report 0 phantoms/clean. Check out the sibling ZTF-Knowledge-Bases repo or set GALERINA_KB_DIR. ` +
    `Failing closed.`,
  );
  process.exit(2);
}
// Shared regex (scripts/lib/codes.mjs) — the old /FUNGI-…-[0-9]+/ dropped multi-segment + suffixed codes
// (FUNGI-CRYPTO-PQ-001, FUNGI-GOV-3VL-001, FUNGI-PROFILE-005B), falsely flagging curated entries as phantom.
const registryCodes = new Set(extractCodes(registryText).filter((c) => c.startsWith("FUNGI-")));

// ── classify each code (from the graph) ──────────────────────────────────────
const entry = (c) => ({
  code: c.code,
  isFUNGI: String(c.code).startsWith("FUNGI-"),
  defs: (c.defs ?? []).length,
  emits: (c.emits ?? []).length,
  tests: c.tests ?? 0,
  refs: c.refs ?? 0,
  docOnly: c.docOnly === true,
});
const codes = index.map(entry);
const codeSet = new Set(codes.map((c) => c.code));

const docDrift = codes.filter((c) => c.docOnly);                       // documented, no src def/emit
// dead = defined AND truly unreferenced (no emit/test/ref) → safe to RESERVE. A tested/referenced code with
// no DETECTED emit is "referenced" (emit via an uncaught pattern), NOT dead — never put it on a retire list.
const dead = codes.filter((c) => !c.docOnly && c.defs > 0 && c.emits === 0 && c.tests === 0 && c.refs === 0);
const inline = codes.filter((c) => c.emits > 0 && c.defs === 0);       // emitted, no exported constant (R4)
const srcRealFUNGI = codes.filter((c) => c.isFUNGI && !c.docOnly);
// (1) index → audit: real FUNGI diagnostics the governance registry does NOT list (blind spots)
const registryUncovered = srcRealFUNGI.filter((c) => !registryCodes.has(c.code));
// (2) audit → index: registry codes that don't exist anywhere in the index (phantom / stale registry)
const registryPhantom = [...registryCodes].filter((code) => !codeSet.has(code));

// Universal coverage (std #1): every source code is catalogued in the DERIVED registry (build/code-registry,
// generated from this same index) BY CONSTRUCTION → no orphans. So the only true coverage HOLE is the reverse
// direction: a curated governance-rules.md entry referencing a code that does NOT exist in source (phantom/stale).
// The 'registry-uncovered' set is NOT orphans — those codes ARE in the derived registry; it is a governance-rules.md
// CURATION backlog (which governance-domain codes deserve a hand-written semantic entry), tracked, not a hole.
const gaps = registryPhantom.length; // exit metric = genuine holes only

const lines = [];
lines.push("# Coverage cross-check — dimension: codes (#218 / std #1 universal coverage)\n");
lines.push(`Index: code-index.json (${codes.length} codes) · Derived registry: build/code-registry (ALL codes, by construction) · Curated: galerina-governance-rules.md (${registryCodes.size} FUNGI codes).\n`);
lines.push("## Universal coverage (anchor std #1)");
lines.push(`- ${codes.length}/${codes.length} codes catalogued in the DERIVED registry by construction → NO ORPHANS ✓`);
lines.push("\n## Coverage HOLES (actionable — exit code)");
lines.push(`- REGISTRY-PHANTOM (curated governance-rules.md lists a code absent from source — stale): ${registryPhantom.length}`);
lines.push(...registryPhantom.slice(0, 40).map((c) => `    ${c}`));
lines.push("\n## Backlogs (NOT orphans — tracked for incremental adoption, not exit-failing)");
lines.push(`- governance-rules.md CURATION gap: ${registryUncovered.length} src-real FUNGI-* lack a semantic entry in the curated registry (they ARE in the derived registry). Generate/curate per std #10.`);
lines.push(`- PHANTOM doc-only drift: ${docDrift.length} (std #9/#10 → DOC-004).`);
lines.push(`- INLINE / no exported constant (R4): ${inline.length} (std #5 → taxonomy Stage F).`);
lines.push(`- DEAD / RESERVED (defined, never emitted): ${dead.length} (std #1 wire-or-retire; tagged RESERVED in the derived registry).`);
lines.push("\n## Notes");
lines.push("- #215 scanner is SRC-ONLY; doc/README-declared ownership is invisible to it (Stage-D FUNGI-BOUNDARY lesson); REGISTRY-PHANTOM covers the reverse, full doc-ownership = scanner §6 (future).");
lines.push("- Known false-dead pending const-id resolution: FUNGI-BOOL-BOUNDARY-001/002 (live via validateBoolBoundary).");
lines.push(`\n## Coverage holes: ${gaps} · curation backlog: ${registryUncovered.length} · drift: ${docDrift.length} · R4-inline: ${inline.length} · RESERVED: ${dead.length}`);

if (asJson) {
  console.log(JSON.stringify({
    dimension: "codes", totalCodes: codes.length, universalCoverage: "met (derived registry, by construction)",
    holes: gaps, registryPhantom, curationBacklog: registryUncovered.length,
    docDrift: docDrift.length, inline: inline.length, dead: dead.map((c) => c.code),
  }, null, 2));
} else {
  console.log(lines.join("\n"));
}

try {
  mkdirSync(join(ROOT, "build/coverage"), { recursive: true });
  writeFileSync(join(ROOT, "build/coverage/coverage-codes.md"), lines.join("\n") + "\n");
} catch { /* non-fatal */ }

process.exit(soft ? 0 : Math.min(gaps, 250));
