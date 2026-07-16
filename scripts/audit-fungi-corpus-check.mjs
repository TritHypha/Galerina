#!/usr/bin/env node
// audit-fungi-corpus-check.mjs — fail-CLOSED gate: every `.fungi` in the repo that is SUPPOSED to
// compile must still pass `galerina check`. A ratcheted baseline holds today's known-bad so the gate
// lands green, while any NEW breakage is RED.
//
// WHY THIS EXISTS (2026-07-15): the flagship `examples/auth-service/sovereignTransaction.fungi` had
// rotted to a HARD ERROR — `authority { }` nested inside `contract { }`, rejected deny-by-default
// (FUNGI-SYNTAX-011) — and NOTHING noticed. phase-close checks `tests/patterns/*.fungi` (9 files) and
// the twin audit covers the self-hosted twins, but the 447-file tracked `.fungi` corpus had no compile
// gate. An example that does not compile teaches broken syntax to everyone who copies it. The instance
// was fixed; THIS is the detector, so the class cannot recur.
//
// DESIGN
//  - FIND via myco (the graph-indexed finder — house rule: no glob/grep discovery), token query
//    `-f fungi` then an `.fungi`-extension filter (the dotted query `.fungi` under-matched: 283 of 447 —
//    caught by the git cross-check below). UNION with `git ls-files "*.fungi"` (git's index IS the
//    tracked-corpus source of truth); any tracked file myco missed is reported as FINDER DRIFT so a
//    finder hole can never silently shrink the gate.
//  - ADJUDICATE via the REAL `galerina check` (spawned per file — the CLI refuses directories), never a
//    re-implementation: a private copy of the pipeline would drift from the CLI and the gate would lie.
//  - CACHE by (size, mtimeMs) under build/fungi-corpus-check/ so only CHANGED files re-check: the first
//    sweep costs minutes, every later run seconds — cheap enough for the phase-close cadence.
//  - SKIP what other gates own: docs/examples/** (audit-example-diagnostics.mjs owns that corpus,
//    including its expected.diagnostics.txt sidecars) and any file with an in-file
//    `expected_diagnostics:` header or a sidecar — those are negative fixtures, SUPPOSED to fail.
//  - RATCHET: the baseline may only SHRINK. New failure / new code on a known-bad file / a baselined
//    file that now passes (record the win!) — all RED.
//
// Usage:
//   node scripts/audit-fungi-corpus-check.mjs --self-test          # prove the detector fires (CI first)
//   node scripts/audit-fungi-corpus-check.mjs                      # enforce: exit 1 on NEW breakage
//   node scripts/audit-fungi-corpus-check.mjs --update-baseline    # re-record (deliberate; diff-reviewed)
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "baselines", "fungi-corpus-check.json");
const CACHE_DIR = join(ROOT, "build", "fungi-corpus-check");
const CACHE = join(CACHE_DIR, "cache.json");
const MYCO = resolve(ROOT, "..", "subprojects", "myco", "dist", "cli.js");
// node/git are real executables — spawn them directly. `shell:true` would be needed only for .cmd
// shims (npm) and triggers Node's DEP0190 arg-concatenation warning; no shell = no concat hazard.
const SPAWN = { encoding: "utf8", shell: false };

// ── FIND ─────────────────────────────────────────────────────────────────────────────────────
function mycoFungi() {
  if (!existsSync(MYCO)) return { list: null, note: "myco dist not built (subprojects/myco)" };
  const r = spawnSync("node", [MYCO, "-f", "fungi", ROOT, "--json", "--no-color", "-n", "9000"],
    { ...SPAWN, timeout: 180000 });
  const stdout = r.stdout ?? "";
  const jsonStart = stdout.indexOf("{"); // an index-refresh banner may precede the JSON — skip to it
  if (jsonStart < 0) return { list: null, note: `myco returned no JSON (exit ${r.status})` };
  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    if (parsed.summary?.truncated) return { list: null, note: "myco result truncated — raise -n" };
    const list = [...new Set((parsed.matches ?? [])
      .map((m) => String(m.path ?? "").replace(/\\/g, "/"))
      .filter((p) => p.endsWith(".fungi")))];
    return { list, note: null };
  } catch (e) { return { list: null, note: `myco JSON parse failed: ${String(e).slice(0, 80)}` }; }
}
function gitFungi() {
  const r = spawnSync("git", ["ls-files", "*.fungi"], { ...SPAWN, cwd: ROOT, timeout: 60000 });
  return (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim().replace(/\\/g, "/")).filter((s) => s.endsWith(".fungi"));
}
function findFungi() {
  const tracked = gitFungi();
  const { list: viaMyco, note } = mycoFungi();
  if (viaMyco === null) {
    // Degraded (myco unavailable): git's index still gives the full TRACKED corpus — the gate holds.
    return { files: tracked, finder: `git ls-files only (myco degraded: ${note})`, finderDrift: [] };
  }
  const union = [...new Set([...viaMyco, ...tracked])].sort();
  const finderDrift = tracked.filter((f) => !viaMyco.includes(f)); // tracked but missed by the graph finder
  return { files: union, finder: `myco graph finder (${viaMyco.length}) ∪ git index (${tracked.length})`, finderDrift };
}

// ── scope: what OTHER gates own, and negative fixtures ──────────────────────────────────────
const ownedElsewhere = (rel) =>
  rel.startsWith("docs/examples/") // audit-example-diagnostics.mjs owns that corpus
  || rel.startsWith("build/");     // generated tree — no authored .fungi belongs there (incl. the self-test plants)
const isNegativeFixture = (rel) => {
  try { if (/expected_diagnostics\s*:/i.test(readFileSync(join(ROOT, rel), "utf8"))) return true; } catch { return true; }
  return existsSync(join(ROOT, dirname(rel), "expected.diagnostics.txt")); // sidecar convention
};

// ── ADJUDICATE (real CLI) + cache by (size, mtime) ───────────────────────────────────────────
function checkFile(rel) {
  const r = spawnSync("node", [join(ROOT, "galerina.mjs"), "check", rel],
    { ...SPAWN, cwd: ROOT, timeout: 60000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // A real code ends in a numeric segment (FUNGI-SYNTAX-011); the CLI's "+N FUNGI-TYPE-* advisory"
  // footer must not pollute the baseline's code lists.
  return { ok: r.status === 0, codes: [...new Set([...out.matchAll(/(FUNGI-[A-Z][A-Z0-9]*-\d+[A-Za-z]?)/g)].map((m) => m[1]))].sort() };
}
const loadJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };

// ── compiler-build fingerprint (cache invalidation) ───────────────────────────────────────────
// The per-file cache keys on the .fungi's (size, mtime) — but the ADJUDICATOR is `galerina.mjs check`,
// the COMPILED compiler. If the compiler changes (e.g. a new checker rule) while no .fungi changes, a
// pure (size, mtime) cache replays STALE verdicts and the gate silently trusts old results — a fail-OPEN
// (found 2026-07-16: a fresh tri-lint rule left every .fungi mtime untouched, so the gate never re-ran).
// So the whole cache is scoped to a fingerprint of the adjudicator (galerina.mjs + the core-compiler
// dist): change the compiler and every entry misses, forcing a real re-check. Over-invalidation (a no-op
// rebuild busts the cache) is the SAFE direction for a fail-closed gate.
function statMark(p) {
  try { const s = statSync(p); return `${relative(ROOT, p).replace(/\\/g, "/")}:${s.size}:${Math.round(s.mtimeMs)}`; }
  catch { return ""; }
}
function compilerFingerprint() {
  const marks = [statMark(join(ROOT, "galerina.mjs"))];
  const walk = (dir) => {
    let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && (e.name.endsWith(".js") || e.name.endsWith(".cjs"))) marks.push(statMark(abs));
    }
  };
  walk(join(ROOT, "packages-galerina", "galerina-core-compiler", "dist"));
  return createHash("sha256").update(marks.sort().join("|")).digest("hex").slice(0, 16);
}

function sweep(candidates) {
  const fp = compilerFingerprint();
  const raw = loadJson(CACHE, { entries: {} });
  const cache = (raw.fingerprint === fp ? raw.entries : {}) ?? {}; // compiler changed => whole cache misses
  const fresh = {};
  const failing = {};
  let checked = 0, cached = 0;
  for (const rel of candidates) {
    let st; try { st = statSync(join(ROOT, rel)); } catch { continue; } // vanished between find and sweep
    const key = `${st.size}:${Math.round(st.mtimeMs)}`;
    const hit = cache[rel];
    let verdict;
    if (hit !== undefined && hit.key === key) { verdict = hit; cached++; }
    else { const { ok, codes } = checkFile(rel); verdict = { key, ok, codes }; checked++; }
    fresh[rel] = verdict;
    if (!verdict.ok) failing[rel] = verdict.codes;
  }
  try { mkdirSync(CACHE_DIR, { recursive: true }); writeFileSync(CACHE, JSON.stringify({ generated: "audit-fungi-corpus-check", fingerprint: fp, entries: fresh }, null, 2)); } catch { /* cache is an optimisation, never a failure */ }
  return { failing, checked, cached };
}

// ── SELF-TEST: a gate that cannot fail is worse than none ────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const { files, finder, finderDrift } = findFungi();
  const tracked = gitFungi();
  ok(files.length >= tracked.length && tracked.length > 300, `corpus found: ${files.length} .fungi via ${finder}`);
  ok(finderDrift.length === 0, finderDrift.length === 0
    ? "graph finder covers the FULL tracked corpus (0 finder drift vs git index)"
    : `FINDER DRIFT: myco missed ${finderDrift.length} tracked .fungi (e.g. ${finderDrift[0]}) — fix the query/index`);
  // The detector must FIRE on a planted broken file…
  mkdirSync(join(ROOT, "build", "_selftest"), { recursive: true });
  const bad = "build/_selftest/broken-selftest.fungi";
  writeFileSync(join(ROOT, bad), `@version 1\npure flow x() -> Int\ncontract {\n  totally_unknown_block { level 1 }\n}\n{\n  return 1\n}\n`);
  const badRes = checkFile(bad);
  ok(!badRes.ok && badRes.codes.includes("FUNGI-SYNTAX-011"), `detector FIRES on a planted broken .fungi (${badRes.codes.join(",")})`);
  // …and stay SILENT on a clean one (non-vacuous both ways).
  const good = "build/_selftest/good-selftest.fungi";
  writeFileSync(join(ROOT, good), `@version 1\npure flow x() -> Int\ncontract {\n  intent { "ok" }\n}\n{\n  return 1\n}\n`);
  ok(checkFile(good).ok, "detector stays SILENT on a clean .fungi");
  ok(/^[0-9a-f]{16}$/.test(compilerFingerprint()) && compilerFingerprint() === compilerFingerprint(),
    "compiler fingerprint is a stable hash — cache is scoped to the compiler build (a new rule busts it)");
  ok(ownedElsewhere("docs/examples/Level-4-Security/169-secret-comparison/example.fungi"), "docs/examples/** deferred to audit-example-diagnostics");
  ok(isNegativeFixture("scripts/audit-fungi-corpus-check.mjs"), "negative-fixture marker detection works (this file mentions the header)");
  console.log(process.exitCode ? "  fungi-corpus-check self-test FAILED" : "  fungi-corpus-check self-test: finder coverage + detector verified ✅");
  process.exit(process.exitCode ?? 0);
}

// ── enforce / record ─────────────────────────────────────────────────────────────────────────
const { files, finder, finderDrift } = findFungi();
const candidates = files.filter((f) => !ownedElsewhere(f) && !isNegativeFixture(f));
const { failing, checked, cached } = sweep(candidates);
const base = loadJson(BASELINE, { knownFailing: {} }).knownFailing ?? {};

if (process.argv.includes("--update-baseline")) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify({
    note: "Known-failing .fungi (galerina check). RATCHET: may only SHRINK — fix a file => remove it here; never baseline a NEW break. See task #75 for the VALUESTATE-004 adjudication.",
    generated: "audit-fungi-corpus-check",
    knownFailing: failing,
  }, null, 2) + "\n");
  console.log(`  baseline recorded: ${Object.keys(failing).length} known-failing of ${candidates.length} checked (${checked} fresh, ${cached} cached; ${finder}).`);
  process.exit(0);
}

const nowFailing = Object.keys(failing);
const NEW_BREAKS = nowFailing.filter((f) => !(f in base));
const NEW_CODES = nowFailing.filter((f) => f in base && failing[f].some((c) => !(base[f] ?? []).includes(c)))
  .map((f) => `${f}  new: ${failing[f].filter((c) => !(base[f] ?? []).includes(c)).join(", ")}`);
const FIXED = Object.keys(base).filter((f) => !(f in failing));

console.log(`  fungi-corpus-check: ${candidates.length} checkable of ${files.length} .fungi (${finder}); ${checked} checked, ${cached} cached; ${nowFailing.length} failing vs ${Object.keys(base).length} baselined.`);
if (finderDrift.length) console.log(`  ⚠️  finder drift: myco missed ${finderDrift.length} tracked .fungi (union with the git index kept the gate complete) — file on the myco roadmap.`);

const problems = [];
if (NEW_BREAKS.length) problems.push(`NEW breakage (${NEW_BREAKS.length}):\n${NEW_BREAKS.map((f) => `     ${f}  [${failing[f].join(", ")}]`).join("\n")}`);
if (NEW_CODES.length) problems.push(`NEW diagnostic on a known-bad file (${NEW_CODES.length}):\n${NEW_CODES.map((s) => `     ${s}`).join("\n")}`);
if (FIXED.length) problems.push(`FIXED — remove from the baseline so it only shrinks (${FIXED.length}):\n${FIXED.map((f) => `     ${f}`).join("\n")}`);

if (problems.length) {
  console.error(`\n  ❌ fungi-corpus-check:\n\n  ${problems.join("\n\n  ")}\n`);
  console.error(`  Fix: every repo .fungi must pass \`node galerina.mjs check <file>\`. A NEGATIVE example belongs to`);
  console.error(`  docs/examples/** (audit-example-diagnostics) or carries an \`expected_diagnostics:\` header. To`);
  console.error(`  re-record deliberately: --update-baseline (review the diff; the baseline may only shrink).`);
  process.exit(1);
}
console.log(`  ✅ fungi-corpus-check: no new breakage (${nowFailing.length} known-bad held at the ratchet — task #75).`);
