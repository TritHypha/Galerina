#!/usr/bin/env node
// audit-mutation.mjs — TASK-SEC-002 (#219 standard "mutation / red-team test per gate", Stryker-style).
//
// For each registered FAIL-CLOSED gate: RE-INTRODUCE the hole (a known source mutation), run that gate's
// adversarial test, and assert the test now FAILS (mutant KILLED). A SURVIVING mutant = the test does NOT
// actually guard the hole = a gap. This is precisely the gate that would have caught the B5a fail-open
// (`if (!result)` admitting any truthy verifier return) before it shipped.
//
// SAFETY — we mutate fail-closed SECURITY source in place, so the discipline is strict:
//   1. every target file MUST be git-clean before we touch it (else abort — never mutate a dirty file);
//   2. the mutation is ALWAYS reverted with `git checkout -- <file>` in a finally;
//   3. after the whole run we assert every target file is git-clean again (loud error otherwise);
//   4. a final clean rebuild restores any build artifact (dist/) to match the clean source.
//
// Flags:  --soft  report-only (exit 0).   --json  machine-readable.   --config <path>  load a JSON mutant
// catalog (used by the hermetic fixture self-test).   --root <dir>  git root / path base (default cwd).
//
// Prints `VIOLATIONS: N` (surviving mutants) for the lint-conventions umbrella. Run from repo root.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const soft = argv.includes("--soft");
const asJson = argv.includes("--json");
const rootArg = argv[argv.indexOf("--root") + 1];
const ROOT = argv.includes("--root") ? rootArg : process.cwd();
// Guard like --root above: indexOf returns -1 when --config is absent, so a bare argv[0]
// (e.g. "--soft") must NOT be read as a config path (was an ENOENT crash on `--soft` alone).
const configArg = argv.includes("--config") ? argv[argv.indexOf("--config") + 1] : undefined;

const exe = (c) => (process.platform === "win32" && c === "npm" ? "npm.cmd" : c);

// ── built-in catalog: the B5a registry-index fail-closed gates (the review-confirmed fail-opens) ──────
const K = "packages-logicn/logicn-framework-app-kernel";
const KERNEL_BUILD = ["npm", "run", "build"];
const KERNEL_TEST = ["node", "--test", "tests/registry-index.test.mjs"];
const BUILTIN = [
  {
    id: "b5a-truthy-verifier",
    file: `${K}/src/registry-index.ts`,
    find: "  if (result !== true) {",
    replace: "  if (!result) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a signature-verify admits any TRUTHY (non-true) verifier return — the exact fail-open the review caught",
  },
  {
    id: "b5a-replay-floor",
    file: `${K}/src/registry-index.ts`,
    find: "  if (minIssuedAt !== undefined && !(index.issuedAt > minIssuedAt)) {",
    replace: "  if (minIssuedAt !== undefined && !(index.issuedAt >= minIssuedAt)) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a issuedAt freshness floor accepts EQUAL (replay) — strict-newer weakened to newer-or-equal",
  },
  {
    id: "b5a-duplicate-admit",
    file: `${K}/src/registry-index.ts`,
    find: "  if (matches.length > 1) {",
    replace: "  if (matches.length > 2) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a a single duplicate (name,version) pair is admitted — entry ORDER silently decides facts",
  },
];

const MUTANTS = configArg ? JSON.parse(readFileSync(configArg, "utf8")) : BUILTIN;

function git(args) { return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }); }
function isClean(file) { return git(["diff", "--quiet", "--", file]).status === 0; }
function restore(file) { git(["checkout", "--", file]); }
function run(spec, cmd) {
  // npm/npx are .cmd shims on Windows — spawning them needs shell:true (EINVAL otherwise, the CVE-2024-27980 fix).
  const needsShell = cmd[0] === "npm" || cmd[0] === "npx";
  return spawnSync(exe(cmd[0]), cmd.slice(1), { cwd: join(ROOT, spec.cwd), encoding: "utf8", shell: needsShell });
}

// Precondition: refuse to mutate if ANY target file is already dirty (stale leftover or real edit).
const targets = [...new Set(MUTANTS.map((m) => m.file))];
const dirty = targets.filter((f) => !isClean(f));
if (dirty.length) {
  const msg = `REFUSING TO MUTATE — target file(s) not git-clean: ${dirty.join(", ")}. Commit/stash/restore first.`;
  console.log(asJson ? JSON.stringify({ tool: "mutation", error: msg }) : msg + "\nVIOLATIONS: 0");
  process.exit(soft ? 0 : 255);
}

const results = [];
try {
  for (const m of MUTANTS) {
    const abs = join(ROOT, m.file);
    const orig = readFileSync(abs, "utf8");
    const occurrences = orig.split(m.find).length - 1;
    if (occurrences !== 1) { results.push({ id: m.id, killed: false, by: "anchor", note: `mutation anchor matched ${occurrences}× (need exactly 1)`, desc: m.desc }); continue; }
    let verdict;
    try {
      writeFileSync(abs, orig.replace(m.find, m.replace));
      let killedByBuild = false;
      if (m.build) {
        const b = run(m, m.build);
        if (b.status === null) throw new Error(`build runner could not execute (${b.error?.code}) for ${m.id}`);
        killedByBuild = b.status !== 0; // mutation broke compilation = a valid kill
      }
      if (killedByBuild) {
        verdict = { id: m.id, killed: true, by: "build", desc: m.desc };
      } else {
        const t = run(m, m.test);
        if (t.status === null) throw new Error(`test runner could not execute (${t.error?.code}) for ${m.id}`);
        verdict = { id: m.id, killed: t.status !== 0, by: "test", desc: m.desc };
      }
    } finally {
      restore(m.file); // ALWAYS revert, even if a runner threw
    }
    results.push(verdict);
  }
} finally {
  // Belt-and-suspenders: ensure every target is clean again, then rebuild dist from clean source.
  for (const f of targets) if (!isClean(f)) restore(f);
  if (MUTANTS.some((m) => m.build)) {
    const anyBuild = MUTANTS.find((m) => m.build);
    run(anyBuild, anyBuild.build); // clean rebuild so artifacts match restored source
  }
}

const leftDirty = targets.filter((f) => !isClean(f));
const survived = results.filter((r) => !r.killed);

if (asJson) {
  console.log(JSON.stringify({ tool: "mutation", total: results.length, killed: results.length - survived.length, survived, results, leftDirty }, null, 2));
} else {
  const out = ["# SEC-002 mutation / red-team gate (re-introduce the hole, prove the test catches it)\n"];
  for (const r of results) out.push(`${r.killed ? "✓ KILLED " : "✗ SURVIVED"} ${r.id}${r.note ? " — " + r.note : ""}${r.desc ? "\n    " + r.desc : ""}`);
  if (leftDirty.length) out.push(`\n⚠ SAFETY: target file(s) left DIRTY after restore: ${leftDirty.join(", ")} — inspect git status.`);
  out.push(`\nTOTAL: ${results.length} mutant(s) · ${results.length - survived.length} killed · ${survived.length} survived`);
  out.push(survived.length === 0 ? "ALL MUTANTS KILLED ✓ — every registered fail-closed gate is genuinely guarded." : "SURVIVING MUTANTS — a gate's test does NOT guard its fail-closed behavior.");
  out.push(`VIOLATIONS: ${survived.length}`);
  console.log(out.join("\n"));
}
process.exit(soft ? 0 : (leftDirty.length ? 255 : Math.min(survived.length, 250)));
