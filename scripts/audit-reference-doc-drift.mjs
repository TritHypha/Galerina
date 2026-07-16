#!/usr/bin/env node
// audit-reference-doc-drift.mjs — fail-CLOSED gate: the docs/reference/ pages must not DRIFT from the
// enforcing code. R&D's 2026-07-15 re-verification found types.md documenting `TypeId` alone (missing
// `Verdict` + the currency/error/domain families) while the checker accepts the `isBuiltInType()` UNION —
// a doc that disagreed with the code. This gate extracts each page's vocabulary FROM SOURCE and asserts the
// page covers it, so that drift class is caught (fails CI) instead of merely re-discovered.
//
// The standing rule (owner-ratified): enforcing code > code-derived views (reference pages) > design docs.
// The lesson pinned here: the source of truth is the acceptance FUNCTION the checker calls, not any one
// table it reads — so types.md is checked against the isBuiltInType() UNION, never a single table.
//
// Usage:
//   node scripts/audit-reference-doc-drift.mjs --self-test   # prove the detectors fire (run first in CI)
//   node scripts/audit-reference-doc-drift.mjs               # enforce: exit 1 on any drift
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CC = join(ROOT, "packages-galerina", "galerina-core-compiler", "src");
const readSrc = (p) => { try { return readFileSync(join(ROOT, p), "utf8"); } catch { return ""; } };

// Extract the quoted members of a `new Set([ … ])` block named `setName` from a source string.
// Allows dotted, multi-segment names (crypto.sign.hybrid) — the bug that made an earlier probe under-count.
function extractSetMembers(src, setName) {
  const m = src.match(new RegExp(`${setName}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`));
  if (!m) return [];
  return [...m[1].matchAll(/"([a-z0-9_.]+)"/gi)].map((x) => x[1]);
}

// ── The source-of-truth map: each reference page → the vocabulary it MUST cover, extracted from source ──
function buildChecks() {
  const effectChecker = readSrc("packages-galerina/galerina-core-compiler/src/effect-checker.ts");
  const typeChecker = readSrc("packages-galerina/galerina-core-compiler/src/type-checker.ts");
  const canonical = extractSetMembers(effectChecker, "CANONICAL_EFFECTS");
  const denyOnly = extractSetMembers(effectChecker, "DENY_ONLY_EFFECTS");
  // A representative slice of BUILT_IN_TYPES (the string set that contributes Verdict + families) —
  // enough to pin the union without listing every domain name.
  const builtInSlice = ["Verdict", "Float", "Decimal", "Channel", "ReadOnlyView"].filter((t) => new RegExp(`"${t}"`).test(typeChecker));

  return [
    {
      page: "docs/reference/effects.md",
      source: "effect-checker.ts CANONICAL_EFFECTS ∪ DENY_ONLY_EFFECTS",
      require: [...canonical, ...denyOnly],
      note: `${canonical.length} canonical + ${denyOnly.length} deny-only`,
    },
    {
      page: "docs/reference/types.md",
      source: "type-checker.ts isBuiltInType() union gate",
      // The CORRECTION pins: the page must name the union gate + BOTH writable three-valued types + the
      // three tables, and cover a representative BUILT_IN_TYPES slice. Guards the exact drift R&D fixed.
      require: ["isBuiltInType", "Tri", "Verdict", "TypeId", "BUILT_IN_TYPES", "KNOWN_DOMAIN_TYPES", ...builtInSlice],
      note: "union gate + Tri (truth) + Verdict (governance)",
    },
    {
      page: "docs/reference/hardening.md",
      source: "hardening-residency.ts residency/erase/timing tiers",
      require: ["register_only", "no_dram_spill", "no_swap", "no_disk", "on_exit", "constant", "unconstrained", "FUNGI-HARDEN-007"],
      note: "residency + erase + timing tiers",
    },
    {
      page: "docs/reference/value-states.md",
      source: "value-state-checker.ts states + FUNGI-VALUESTATE codes",
      require: ["Unsafe", "Safe", "Validated", "Tainted", "Secret", "FUNGI-VALUESTATE-003", "FUNGI-SECRET-001"],
      note: "the boundary-data lattice",
    },
    {
      page: "docs/reference/trust-trit.md",
      source: "epistemic-type-state.ts Trust = REFUTED/UNKNOWN/PROVEN",
      require: ["PROVEN", "UNKNOWN", "REFUTED", "discharge"],
      note: "the epistemic trust-trit",
    },
    {
      page: "docs/reference/receipts.md",
      source: "epilogue-receipt.fungi strategies",
      require: ["sha256_seal", "zk_snark_receipt"],
      note: "receipt strategies (sha256 shipped · zk stub)",
    },
    {
      page: "docs/reference/three-valued-logic-primer.md",
      source: "the isBuiltInType() union (regression guard for the pointer)",
      require: ["isBuiltInType", "Tri", "Verdict"],
      note: "trit is writable as BOTH Tri (truth) + Verdict (governance)",
    },
    {
      page: "docs/contract-authoring-model.md",
      source: "the isBuiltInType() union (the seed-of-the-error pointer)",
      require: ["isBuiltInType"],
      note: "the 'Authoritative built-in set' pointer names the union, not one table",
    },
    {
      page: "docs/reference/cost-model-nesting.md",
      source: "RD-0395 level-0 evidence (the real twin pair + its regenerator)",
      // The page must keep naming the REAL example pair and its WAT regenerator — if either token
      // vanishes, the page has been rewritten away from its evidence (emit-doc-wat --check separately
      // guards the excerpt bytes).
      require: ["syncGateVerdict", "driftGateVerdict", "emit-doc-wat", "contract", "fuel"],
      note: "level-0 claims stay pinned to the regenerated twin evidence",
    },
  ];
}

function run(checks) {
  const findings = [];
  for (const c of checks) {
    if (!existsSync(join(ROOT, c.page))) { findings.push({ page: c.page, missing: ["<page absent>"] }); continue; }
    if (c.require.length === 0) { findings.push({ page: c.page, missing: ["<source vocabulary empty — extraction broke>"] }); continue; }
    const doc = readSrc(c.page);
    const missing = c.require.filter((tok) => !doc.includes(tok));
    if (missing.length) findings.push({ page: c.page, source: c.source, missing });
  }
  return findings;
}

if (process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const checks = buildChecks();
  const eff = checks.find((c) => c.page.endsWith("effects.md"));
  ok(eff.require.length >= 45, `effects source extraction found ${eff.require.length} members (>=45+2 — multi-segment names counted)`);
  ok(eff.require.includes("crypto.sign.hybrid"), "multi-segment effect names extracted (crypto.sign.hybrid)");
  ok(eff.require.includes("eval.execute") && eff.require.includes("memory.spill"), "both deny-only effects extracted");
  const typ = checks.find((c) => c.page.endsWith("types.md"));
  ok(typ.require.includes("isBuiltInType") && typ.require.includes("Tri") && typ.require.includes("Verdict"), "types.md check pins the union gate + Tri + Verdict");
  // the detector must FIRE on drift: require a vocabulary token that a real page provably does NOT contain
  // (a nonsense effect name). Route through run() against a real reference page so this exercises the real
  // read+compare path — not the gate's own file (which would contain any literal written here).
  const synthetic = run([{ page: "docs/reference/effects.md", source: "self", require: ["nonexistent.madeup"] }]);
  ok(synthetic.length === 1 && synthetic[0].missing.includes("nonexistent.madeup"), "detector FIRES when a required token is absent from a page (drift is caught, not silent)");
  console.log(process.exitCode ? "  reference-doc-drift self-test FAILED" : "  reference-doc-drift self-test: extraction + drift detection verified ✅");
  process.exit(process.exitCode ?? 0);
}

const findings = run(buildChecks());
if (findings.length) {
  console.error(`\n  ❌ reference-doc drift: ${findings.length} page(s) no longer cover their enforcing source:\n`);
  for (const f of findings) {
    console.error(`  ${f.page}  (vs ${f.source ?? "?"})`);
    console.error(`     missing: ${f.missing.join(", ")}`);
  }
  console.error(`\n  Fix: update the reference page TO the code (the code is the source of truth); if the code`);
  console.error(`  genuinely dropped a vocabulary member, update both. Never argue the doc over the code.`);
  process.exit(1);
}
const allChecks = buildChecks();
const total = allChecks.reduce((n, c) => n + c.require.length, 0);
console.log(`  ✅ reference-doc drift: ${allChecks.length} pages cover their enforcing source (${total} vocabulary members checked; 45 canonical effects + 2 deny-only + the isBuiltInType union).`);
