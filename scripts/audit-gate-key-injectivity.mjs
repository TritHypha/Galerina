#!/usr/bin/env node
/**
 * audit-gate-key-injectivity.mjs — "can this gate tell two sites apart?"
 *
 * THE DEFECT CLASS, from a real one on 2026-07-19. `audit-report-blind-consumers` shipped with a
 * baseline key of `file::api::binding::kind`. `scripts/audit-stage-execution.mjs` has TWO ungated
 * `const asm = await assembleWAT(...)` calls, at :145 and :251 — same file, same binding name, same
 * defect kind — so both collapsed onto ONE baseline entry. Consequences, in order of nastiness:
 *
 *   1. Fix the site at :145 and the gate reports the file clean — while :251 stays blind.
 *   2. The baseline UNDERSTATES the debt, so the burn-down reports done with a live blind consumer.
 *   3. Nothing goes red at any point. It is a fail-open with a green tick on top.
 *
 * ★ A BASELINE IS AN IDENTITY SCHEME. If two real findings share one key, the baseline cannot hold
 * them apart, and "shrink-only" silently stops meaning what it says. That is checkable mechanically,
 * which is why this gate exists rather than a note asking people to be careful.
 *
 * THE INVARIANT: for every registered gate, findings at DISTINCT positions must have DISTINCT keys.
 * (Injective on position.) Plus: no baseline file may contain a duplicate key.
 *
 * ⚠ WHAT THIS DOES NOT CATCH — stated, not buried. The sibling half of the same defect was that the
 * analyser merged the two sites BEFORE keying them (it kept one binding per NAME), so only one
 * finding was ever emitted and there was nothing to collide. No key check can see a site that was
 * never reported. That half was caught by R&D running an INDEPENDENT detector over the same corpus
 * and comparing counts — 9 vs 5 — and no self-check replaces a second instrument. What this gate
 * does cover is the half that survives into the durable artifact, which is the half that rots.
 *
 * COVERAGE IS DECLARED, NOT ASSUMED: gates are listed in REGISTRY and must emit `key` on each
 * `--json` finding. Gates without that are reported as NOT COVERED, by name, on every run — an
 * uncovered gate you can see is a decision; one you cannot is a blind spot.
 *
 * RUN:  node scripts/audit-gate-key-injectivity.mjs [--self-test] [--json]
 * EXIT: 0 clean · 1 a key collision, a duplicate baseline key, or a self-test failure
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");

/** Gates that emit keyed, positioned findings via --json. Add one line to cover a new gate. */
const REGISTRY = [
  { script: "scripts/audit-report-blind-consumers.mjs", findingsAt: "findings" },
];

/** Where baseline artifacts live. Scanned wholesale — no per-file allowlist to drift. */
const BASELINE_DIRS = ["packages-galerina/galerina-core-compiler/tests/fixtures"];

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const posOf = (f) => `${f.file ?? "?"}:${f.line ?? "?"}`;

/** Findings at distinct positions must have distinct keys. Returns collision groups. */
export function findKeyCollisions(findings) {
  const byKey = new Map();
  for (const f of findings) {
    if (f.key === undefined) continue;
    if (!byKey.has(f.key)) byKey.set(f.key, []);
    byKey.get(f.key).push(f);
  }
  const collisions = [];
  for (const [key, group] of byKey) {
    const positions = new Set(group.map(posOf));
    if (positions.size > 1) collisions.push({ key, positions: [...positions] });
  }
  return collisions;
}

/** Duplicate keys inside a baseline file — the collision already materialised. */
export function findDuplicateBaselineKeys(entries) {
  const seen = new Map();
  const dupes = [];
  for (const e of entries ?? []) {
    if (e?.key === undefined) continue;
    seen.set(e.key, (seen.get(e.key) ?? 0) + 1);
  }
  for (const [key, n] of seen) if (n > 1) dupes.push({ key, count: n });
  return dupes;
}

function runGate(script) {
  const abs = join(ROOT, script);
  if (!existsSync(abs)) return { error: `script not found: ${script}` };
  const r = spawnSync(process.execPath, [abs, "--json"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  const out = r.stdout ?? "";
  const start = out.indexOf("{");
  if (start < 0) return { error: `no JSON on stdout (exit ${r.status})` };
  try { return { json: JSON.parse(out.slice(start)) }; }
  catch (e) { return { error: `unparseable --json: ${String(e).slice(0, 120)}` }; }
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────
const REAL_SHAPE = [
  // The actual 2026-07-19 case: two ungated sites, same file, same binding, same kind.
  { file: "scripts/audit-stage-execution.mjs", line: 145, key: "scripts/audit-stage-execution.mjs::assembleWAT::asm::VIOLATION" },
  { file: "scripts/audit-stage-execution.mjs", line: 251, key: "scripts/audit-stage-execution.mjs::assembleWAT::asm::VIOLATION" },
];
const FIXED_SHAPE = REAL_SHAPE.map((f, i) => ({ ...f, key: `${f.key}#${i + 1}` }));

function selfTest() {
  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

  check("the REAL collision (stage-execution :145 vs :251, one key) is detected",
    findKeyCollisions(REAL_SHAPE).length === 1);
  check("the collision report names both positions",
    findKeyCollisions(REAL_SHAPE)[0]?.positions.length === 2);
  check("the ordinal-keyed version is clean",
    findKeyCollisions(FIXED_SHAPE).length === 0);
  check("same key at the SAME position is not a collision (idempotent re-report)",
    findKeyCollisions([REAL_SHAPE[0], { ...REAL_SHAPE[0] }]).length === 0);
  check("findings without a key are skipped, not crashed on",
    findKeyCollisions([{ file: "a", line: 1 }]).length === 0);
  check("duplicate baseline keys are detected",
    findDuplicateBaselineKeys([{ key: "x" }, { key: "x" }, { key: "y" }]).length === 1);
  check("distinct baseline keys are clean",
    findDuplicateBaselineKeys([{ key: "x" }, { key: "y" }]).length === 0);

  // Surface: the registry must be real and reachable, or a green run means nothing.
  check("registry is non-empty", REGISTRY.length > 0);
  for (const g of REGISTRY) check(`registered gate exists: ${g.script}`, existsSync(join(ROOT, g.script)));
  const dirsOk = BASELINE_DIRS.some((d) => existsSync(join(ROOT, d)));
  check("at least one baseline directory exists", dirsOk);

  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

const report = { gates: [], baselines: [], uncovered: [] };
let violations = 0;

for (const g of REGISTRY) {
  const { json, error } = runGate(g.script);
  if (error) {
    report.gates.push({ script: g.script, error });
    violations++;
    continue;
  }
  const findings = json?.[g.findingsAt] ?? [];
  const keyed = findings.filter((f) => f.key !== undefined);
  if (findings.length > 0 && keyed.length === 0) {
    report.uncovered.push({ script: g.script, why: `emits ${findings.length} finding(s) with no 'key' field` });
    continue;
  }
  const collisions = findKeyCollisions(findings);
  report.gates.push({ script: g.script, findings: findings.length, keyed: keyed.length, collisions });
  violations += collisions.length;
}

// Every baseline file, wholesale.
for (const d of BASELINE_DIRS) {
  const abs = join(ROOT, d);
  let names = [];
  try { names = readdirSync(abs); } catch { continue; }
  for (const n of names) {
    if (!/baseline.*\.json$/i.test(n)) continue;
    const p = join(abs, n);
    try { statSync(p); } catch { continue; }
    let parsed;
    try { parsed = JSON.parse(readFileSync(p, "utf8")); } catch { report.baselines.push({ file: rel(p), error: "unparseable" }); violations++; continue; }
    const entries = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(entries)) { report.baselines.push({ file: rel(p), note: "no entries[] array — not key-based, skipped" }); continue; }
    const dupes = findDuplicateBaselineKeys(entries);
    report.baselines.push({ file: rel(p), entries: entries.length, keyed: entries.filter((e) => e?.key !== undefined).length, dupes });
    violations += dupes.length;
  }
}

if (argv.includes("--json")) {
  console.log(JSON.stringify({ ...report, violations }, null, 2));
  process.exit(violations > 0 ? 1 : 0);
}

console.log(`\naudit-gate-key-injectivity — can a gate's baseline tell two sites apart?`);
for (const g of report.gates) {
  if (g.error) { console.log(`    x ${g.script} — ${g.error}`); continue; }
  console.log(`    ${g.collisions.length === 0 ? "ok" : " x"} ${g.script}: ${g.findings} finding(s), ${g.keyed} keyed, ${g.collisions.length} collision(s)`);
  for (const c of g.collisions) console.log(`         COLLISION key=${c.key}\n           shared by: ${c.positions.join(" , ")}`);
}
for (const b of report.baselines) {
  if (b.error) { console.log(`    x ${b.file} — ${b.error}`); continue; }
  if (b.note) { console.log(`    - ${b.file} — ${b.note}`); continue; }
  console.log(`    ${b.dupes.length === 0 ? "ok" : " x"} ${b.file}: ${b.entries} entr(y|ies), ${b.keyed} keyed, ${b.dupes.length} duplicate key(s)`);
  for (const d of b.dupes) console.log(`         DUPLICATE key=${d.key} ×${d.count}`);
}
if (report.uncovered.length > 0) {
  console.log(`\n  NOT COVERED (declared, not silent):`);
  for (const u of report.uncovered) console.log(`    - ${u.script}: ${u.why}`);
}
console.log(`SUMMARY: ${report.gates.length} gate(s) · ${report.baselines.length} baseline(s) · ${violations} violation(s)`);
console.log(`\nVIOLATIONS: ${violations}`);
if (violations > 0) {
  console.log(`\nTwo findings at different positions share one key, so the baseline cannot hold them apart:`);
  console.log(`fix one site and the gate reports clean while the other stays live. Add a positional`);
  console.log(`component to the key — an ordinal survives line movement where a line number churns.`);
}
process.exit(violations > 0 ? 1 : 0);
