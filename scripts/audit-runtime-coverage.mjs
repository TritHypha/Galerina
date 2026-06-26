#!/usr/bin/env node
/**
 * audit-runtime-coverage.mjs (#54) — the systemic backbone for the "compiler promises what the runtime
 * cannot honor" class. The type-checker green-lights numeric `a op b` broadly (inferType), but the
 * tree-walker only services a (tag, op) pair if it is in BINARY_DISPATCH (or the int/float fallback).
 * Any numeric tag that the walker handles for SOME operators but is MISSING others either traps at runtime
 * (Decimal '/' '%') or — pre-fix — computed a silent wrong value. This lint makes that gap VISIBLE and
 * fail-closed: every numeric tag must support the full operator set OR each missing op must be an
 * INTENTIONALLY-partial pair on the allowlist (with the working form recorded).
 *
 * Single source of truth: the lint DERIVES coverage from interpreter.ts BINARY_DISPATCH keys (not a
 * hand-list), so it cannot drift from the runtime. A new dispatch tag with a partial op set, or a
 * regression that drops a dispatch key, becomes a RED test.
 *
 * Anti-neuter: --self-test proves the gap detector fires on a planted hole before the enforcing scan.
 * Usage:  node scripts/audit-runtime-coverage.mjs [--self-test] [--soft] [--json]
 * Exit:   0 clean/soft · 1 uncovered (type,op) found · 2 detector neutered / cannot run.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INTERP = join(ROOT, "packages-galerina/galerina-core-compiler/src/interpreter.ts");

// The total operator set a numeric tag is expected to service (==/!= are handled by the generic
// logicNValuesEqual fallback for every tag, so they are excluded from the per-tag arithmetic expectation).
const EXPECTED_OPS = ["+", "-", "*", "/", "%", "<", "<=", ">", ">="];

// int & float are covered for ALL of EXPECTED_OPS by the homogeneous int/float fallback in evalBinary
// (interpreter.ts ~"left.__tag === 'int' || 'float'"), independent of explicit dispatch keys.
const FALLBACK_NUMERIC_TAGS = new Set(["int", "float"]);

// INTENTIONALLY-partial (tag, op) pairs: a runtime trap here is BY DESIGN (no total result without a
// missing decision). Each MUST record the working form the developer uses instead (the redirect target).
// This is the deny-by-default allowlist — anything NOT here that is missing is a real, flagged gap.
const INTENTIONAL_PARTIAL = {
  // SHIPPED (a43a638 + Part 2): the bare operator is a compile-reject (SPORE-NUMERIC-OP-001) that REDIRECTS to
  // the obligation-carrying method form, which is implemented (decDiv/decRem). The runtime keeps no dispatch
  // key for `/`/`%` (the redirect catches them at compile time; a stray call still fails closed).
  "decimal:/": 'exact decimal division is non-terminating — use a.divide(b, scale, mode) e.g. total.divide(qty, 2, "halfEven") (SPORE-NUMERIC-OP-001 / #53/#54)',
  "decimal:%": "exact decimal modulo — use a.remainder(b) (SPORE-NUMERIC-OP-001 / #53/#54)",
};

/** Parse the homogeneous (tag op tag) dispatch coverage from interpreter source text. Pure → self-testable. */
export function parseHomogeneousDispatch(src) {
  const re = /dispatchKey\("([a-z0-9]+)",\s*"([^"]+)",\s*"([a-z0-9]+)"\)/g;
  const byTag = {};
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, l, op, r] = m;
    if (l === r) (byTag[l] ??= new Set()).add(op);
  }
  return byTag; // { tag: Set(op) }
}

/** Which tags are NUMERIC (subject to the full-operator expectation): they have '-' or '*' dispatch, OR
 *  are a fallback numeric tag. String ('+' concat only) and bool (logical only) are correctly excluded. */
export function numericTags(byTag) {
  const tags = new Set(FALLBACK_NUMERIC_TAGS);
  for (const [tag, ops] of Object.entries(byTag)) if (ops.has("-") || ops.has("*")) tags.add(tag);
  return tags;
}

/** Core gap finder (pure, self-testable): returns [{tag, op, status, note}] for every EXPECTED op a
 *  numeric tag does not cover, classified intentional-partial vs an UNCOVERED gap. */
export function findCoverageGaps(byTag, allowlist = INTENTIONAL_PARTIAL) {
  const out = [];
  for (const tag of [...numericTags(byTag)].sort()) {
    const covered = new Set(byTag[tag] ?? []);
    if (FALLBACK_NUMERIC_TAGS.has(tag)) for (const op of EXPECTED_OPS) covered.add(op); // fallback covers all
    for (const op of EXPECTED_OPS) {
      if (covered.has(op)) continue;
      const key = `${tag}:${op}`;
      out.push({ tag, op, status: key in allowlist ? "intentional-partial" : "UNCOVERED", note: allowlist[key] ?? "" });
    }
  }
  return out;
}

function selfTest() {
  // 1) a numeric tag missing an op that is NOT allowlisted MUST be reported UNCOVERED.
  const planted = { money: new Set(["+", "-", "*", "<", "<=", ">", ">="]) }; // missing '/','%' , not allowlisted
  const g1 = findCoverageGaps(planted, {});
  const uncovered = g1.filter((x) => x.status === "UNCOVERED").map((x) => `${x.tag}:${x.op}`);
  if (!uncovered.includes("money:/") || !uncovered.includes("money:%")) {
    console.error("SELF-TEST FAIL: gap detector did not flag a planted partial-operator hole:", JSON.stringify(g1));
    process.exit(2);
  }
  // 2) an allowlisted missing pair must NOT be reported as UNCOVERED.
  const g2 = findCoverageGaps({ decimal: new Set(["+", "-", "*", "<", "<=", ">", ">="]) });
  if (g2.some((x) => x.status === "UNCOVERED")) {
    console.error("SELF-TEST FAIL: an intentional-partial pair was flagged UNCOVERED:", JSON.stringify(g2));
    process.exit(2);
  }
  // 3) a fully-covered numeric tag yields no gaps.
  const g3 = findCoverageGaps({ q: new Set(EXPECTED_OPS) }).filter((x) => x.status === "UNCOVERED");
  if (g3.length !== 0) { console.error("SELF-TEST FAIL: a full tag reported gaps:", JSON.stringify(g3)); process.exit(2); }
  console.log("  self-test: gap detector fires on a planted hole AND respects the allowlist ✅");
}

function main() {
  const argv = process.argv.slice(2);
  const soft = argv.includes("--soft");
  selfTest();
  if (argv.includes("--self-test")) { console.log("Runtime-coverage gate: self-test only — OK."); process.exit(0); }

  let src;
  try { src = readFileSync(INTERP, "utf8"); }
  catch (e) { console.error(`FAIL: cannot read interpreter (${INTERP}): ${e.message}`); process.exit(2); }

  const byTag = parseHomogeneousDispatch(src);
  const gaps = findCoverageGaps(byTag);
  const uncovered = gaps.filter((g) => g.status === "UNCOVERED");
  const intentional = gaps.filter((g) => g.status === "intentional-partial");

  if (argv.includes("--json")) { console.log(JSON.stringify({ byTag: Object.fromEntries(Object.entries(byTag).map(([t, s]) => [t, [...s]])), uncovered, intentional }, null, 2)); }

  console.log(`\n  Runtime operator coverage — numeric tags: ${[...numericTags(byTag)].sort().join(", ")}`);
  if (intentional.length) {
    console.log(`  intentional partial ops (redirect to a method form):`);
    for (const g of intentional) console.log(`     · ${g.tag} '${g.op}' — ${g.note}`);
  }
  if (uncovered.length === 0) {
    console.log(`  ✅ every numeric tag services the full operator set (or an allowlisted redirect). VIOLATIONS: 0\n`);
    process.exit(0);
  }
  console.error(`\n  ❌ UNCOVERED (type, op) — the type-checker accepts these but the walker has no path (latent trap):`);
  for (const g of uncovered) console.error(`     ${g.tag} '${g.op}'  — add a BINARY_DISPATCH key, or allowlist it as an intentional partial with its redirect form.`);
  console.error(`\n  VIOLATIONS: ${uncovered.length}`);
  process.exit(soft ? 0 : 1);
}

main();
