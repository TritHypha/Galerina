#!/usr/bin/env node
// =============================================================================
// audit-gate-selftests.mjs — META-GATE: prove every audit/lint gate is NON-VACUOUS.
// =============================================================================
// The "who watches the watchers" gate (owner ask 2026-07-12: "do we have anything that audits and tests
// the dev tools / audits / graphs to make sure they are doing the correct job and just not exiting?").
//
// A gate that exits 0 WITHOUT actually checking anything is a fail-open disguised as green — the deepest
// way a guard can lie. `dev-tool-index.mjs` already detects whether a tool's SOURCE mentions `--self-test`
// (a string match). This gate goes one level deeper — it RUNS each audit/lint tool's `--self-test` and
// proves it (a) is genuinely handled and (b) PASSES. It is the SEC-002 discipline ("a neutered guard is
// itself a fail-open") applied to the guard SUITE, not to one guard.
//
// For each `audit-*` / `lint-*` tool:
//   • declares `--self-test` AND the run exits 0 with self-test evidence  → GUARDED (ok)
//   • declares `--self-test` but the run EXITS NON-ZERO                   → SELFTEST_FAILS  (VIOLATION — blocking)
//   • declares `--self-test` but exits 0 with NO self-test evidence       → SELFTEST_VACUOUS (advisory: flag looks ignored)
//   • its non-vacuity is proven by a FIXTURE TEST instead of a flag       → GUARDED_BY_TEST (ok; see SELFTEST_VIA_TEST)
//   • declares NO `--self-test`                                          → NO_SELFTEST (advisory baseline — burn down)
//
// Enforcement is deliberately fail-closed-but-realistic (mirrors lint-conventions --soft):
//   BLOCKING (exit = count): a DECLARED self-test that FAILS to pass. Zero false positives — if a gate
//     claims a self-test, that self-test must be green, else the gate may already be neutered.
//   ADVISORY (counted, listed, never gates): a tool with no self-test, or a self-test that ran green but
//     produced no evidence. These are the burn-down baseline; a tool moving OUT of advisory is progress,
//     and (future) a NEW audit/lint tool landing with no self-test can be made blocking once the baseline is 0.
//
// SAFETY: we only RUN `--self-test` on tools whose source contains the literal flag `"--self-test"` (so the
// flag is actually wired), and NEVER on tools in NEVER_RUN (e.g. audit-mutation, which ignores unknown flags
// and would run its full 24-mutant mutation against real security source — its non-vacuity is proven by a
// hermetic fixture test instead). Each run is capped by a timeout so a hung self-test can't wedge the cadence.
//
// Flags:  --json   machine-readable.   --soft   report-only (exit 0).   --root <dir>  scripts dir to scan
//         (default: this script's dir; overridden by the hermetic self-test).   --self-test  run own proof.
//
// Build-free (reads the filesystem + spawns `node <tool> --self-test`). Pattern mirrors the audit-* family:
// pure detector + --self-test + `VIOLATIONS: N` + exit = count. Run from repo root.
// =============================================================================
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const soft = argv.includes("--soft");
const rootArg = argv.includes("--root") ? argv[argv.indexOf("--root") + 1] : undefined;
const SELFTEST = argv.includes("--self-test");
const RUN_TIMEOUT_MS = 60000; // a single gate self-test that runs longer than this is itself a defect.

// Tools whose non-vacuity is proven by a hermetic FIXTURE TEST rather than a `--self-test` flag. Credited as
// GUARDED_BY_TEST (honest) — but only after VERIFYING the referenced test still exists and references the tool
// (a deleted/renamed proof drops the gate back to advisory, surfacing the loss; the map can't lie). Keep this
// list justified — each entry is a real fixture in scripts/tests/ that runs the tool end-to-end in the cadence.
const SELFTEST_VIA_TEST = {
  "audit-mutation.mjs":            { test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "hermetic KILL/SURVIVE/git-safety fixture (--config); never run via --self-test (it ignores unknown flags → would mutate real security source)" },
  "audit-coverage.mjs":           { test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "fixture: curated-registry present→0 phantoms; absent→fail-closed exit 2" },
  "audit-doc-drift.mjs":          { test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "fixture: living-doc stale count flagged; dated/-log exempt; missing-corpus fail-closed" },
  "audit-provenance.mjs":         { test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "fixture: stamped+fresh clean; source-newer→STALE; missing-sidecar→UNSTAMPED" },
  "audit-effect-canonicality.mjs":{ test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "fixture: bitmask⊄canonical detected + REAL-repo single-source regression guard" },
  "audit-muted-diagnostics.mjs":  { test: "scripts/tests/dev-tools-scripts.test.mjs", proves: "fixture: un-allowlisted mode-gated SECURITY mute detected + REAL-repo regression guard" },
};
// Hard safety denylist: never spawn `--self-test` on these regardless of source (destructive/heavy on an
// unrecognised flag). audit-mutation is the load-bearing case (mutates real fail-closed security source).
const NEVER_RUN = new Set(["audit-mutation.mjs"]);

// ── Pure core: classify one gate from its probed state (unit-testable, no FS / no spawn) ───────────────
// declaresSelfTest — source contains the literal `"--self-test"` flag (so it is actually wired, not merely
//   mentioned in prose). ran — { exit, hasEvidence } from spawning `--self-test`, or null when not run.
export function classifyGate(name, { category, declaresSelfTest, viaTest, ran }) {
  if (category !== "audit" && category !== "lint") {
    return { name, category, status: "NOT_A_GATE", violation: false, advisory: false,
      reason: "not an audit/lint gate — self-test discipline not enforced here" };
  }
  if (viaTest) {
    return { name, category, status: "GUARDED_BY_TEST", violation: false, advisory: false,
      reason: `non-vacuity proven by fixture test: ${viaTest}` };
  }
  if (!declaresSelfTest) {
    return { name, category, status: "NO_SELFTEST", violation: false, advisory: true,
      reason: "audit/lint gate declares no --self-test — a neutering of this detector would not be self-detected (burn-down baseline)" };
  }
  if (ran.exit !== 0) {
    return { name, category, status: "SELFTEST_FAILS", violation: true, advisory: false,
      reason: `--self-test exited ${ran.exit} — the gate's own self-test does not pass (a broken/neutered detector)` };
  }
  if (!ran.hasEvidence) {
    return { name, category, status: "SELFTEST_VACUOUS", violation: false, advisory: true,
      reason: "--self-test exited 0 but produced no self-test evidence — the flag may be silently ignored (exits green without proving anything)" };
  }
  return { name, category, status: "GUARDED", violation: false, advisory: false,
    reason: "--self-test is wired and passes with evidence" };
}

// ── category detector (mirrors dev-tool-index.mjs::toolCategory — keep in sync) ─────────────────────────
function toolCategory(name) {
  if (/^audit-/.test(name)) return "audit";
  if (/^lint-/.test(name)) return "lint";
  if (/graph/.test(name)) return "graph";
  if (/(^|-)(index|registry)|^kb-|^code-|^gen-code/.test(name)) return "index";
  if (/^run-|^status|component-health/.test(name)) return "runner";
  if (/^gen-|^fix-|galerina-new/.test(name)) return "generator";
  return "util";
}

// ── discovery: the same set dev-tool-index scans (scripts/*.{mjs,cjs}, minus proofs + self) ─────────────
function discover(scriptsDir) {
  const out = [];
  for (const f of readdirSync(scriptsDir)) {
    if (!/\.(mjs|cjs)$/.test(f)) continue;
    if (/-proof\.mjs$/.test(f)) continue;            // proofs live in proofs/ (own keep-green gate)
    if (f === "audit-gate-selftests.mjs") continue;  // don't scan self (its self-test is separate)
    const p = join(scriptsDir, f);
    if (!statSync(p).isFile()) continue;
    out.push({ name: f, path: p, src: readFileSync(p, "utf8") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// A gate "declares" a self-test only if the literal flag string is present (a wired argv check), NOT merely
// the words "self test" in a comment — that stricter bar is what makes the VACUOUS check meaningful.
const declaresSelfTest = (src) => src.includes('"--self-test"') || src.includes("'--self-test'");

function runSelfTest(scriptsDir, name) {
  const r = spawnSync(process.execPath, [join(scriptsDir, name), "--self-test"], {
    cwd: dirname(scriptsDir), // repo root when scanning the real scripts/ dir
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    shell: false,
  });
  if (r.status === null) {
    // timed out or could not execute — treat as a failing self-test (loud, not silent)
    return { exit: r.signal ? 124 : 1, hasEvidence: false, note: r.error?.message || `killed by ${r.signal}` };
  }
  const output = `${r.stdout || ""}${r.stderr || ""}`;
  return { exit: r.status, hasEvidence: /self[-\s]?test/i.test(output) };
}

// Credit a fixture-test proof ONLY if it is real: the referenced test file exists AND still names the tool.
// Returns the resolved "test — proves" string when valid, or { stale } when the map entry can no longer be honoured.
function resolveViaTest(scriptsDir, name) {
  const entry = SELFTEST_VIA_TEST[name];
  if (!entry) return { viaTest: null };
  const testAbs = join(dirname(scriptsDir), entry.test);
  const ok = existsSync(testAbs) && readFileSync(testAbs, "utf8").includes(name);
  return ok
    ? { viaTest: `${entry.test} — ${entry.proves}` }
    : { viaTest: null, stale: `SELFTEST_VIA_TEST maps ${name} to ${entry.test}, but that test is missing or no longer references ${name} — the fixture proof is gone; treat as un-self-tested until restored` };
}

// ── scan: classify every discovered tool ──────────────────────────────────────────────────────────────
export function scan(scriptsDir = HERE) {
  const results = [];
  for (const tool of discover(scriptsDir)) {
    const category = toolCategory(tool.name);
    const { viaTest, stale } = resolveViaTest(scriptsDir, tool.name);
    const declares = declaresSelfTest(tool.src);
    let ran = null;
    if ((category === "audit" || category === "lint") && declares && !viaTest && !NEVER_RUN.has(tool.name)) {
      ran = runSelfTest(scriptsDir, tool.name);
    }
    const r = classifyGate(tool.name, { category, declaresSelfTest: declares, viaTest, ran });
    if (stale) r.note = stale; // a lost fixture proof is surfaced loudly on the (now-advisory) gate
    results.push(r);
  }
  return results;
}

// ── self-test: a hermetic tmp scripts dir with 4 fake gates proves each verdict fires AND stays targeted ─
// (a neutered meta-gate is itself a fail-open — so this must catch the broken/vacuous fakes and clear the good one.)
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "gate-selftests-"));
  const mk = (name, body) => writeFileSync(join(dir, name), body);
  try {
    // GOOD: wires --self-test, prints evidence, exits 0 → GUARDED
    mk("audit-fake-good.mjs",
      `if (process.argv.includes("--self-test")) { console.log("[self-test] ok — fake good"); process.exit(0); }\nprocess.exit(0);\n`);
    // BROKEN: wires --self-test but it FAILS (exit 1) → SELFTEST_FAILS (violation)
    mk("audit-fake-broken.mjs",
      `if (process.argv.includes("--self-test")) { console.log("[self-test] FAIL — fake broken"); process.exit(1); }\nprocess.exit(0);\n`);
    // VACUOUS: contains the literal "--self-test" but IGNORES it — exits 0 with no self-test evidence → advisory
    mk("audit-fake-vacuous.mjs",
      `// this tool claims a "--self-test" in source but never branches on it\nconsole.log("scanned 0 files");\nprocess.exit(0);\n`);
    // NONE: no --self-test flag at all → NO_SELFTEST (advisory)
    mk("audit-fake-none.mjs", `console.log("scanned 0 files");\nprocess.exit(0);\n`);
    // A non-gate (util) with no self-test must be NOT_A_GATE (not advisory, not violation)
    mk("util-fake-helper.mjs", `console.log("helper");\nprocess.exit(0);\n`);

    const byName = Object.fromEntries(scan(dir).map((r) => [r.name, r]));
    const checks = [
      ["good → GUARDED", byName["audit-fake-good.mjs"]?.status === "GUARDED"],
      ["broken → SELFTEST_FAILS (violation)", byName["audit-fake-broken.mjs"]?.status === "SELFTEST_FAILS" && byName["audit-fake-broken.mjs"]?.violation === true],
      ["vacuous → SELFTEST_VACUOUS (advisory, not violation)", byName["audit-fake-vacuous.mjs"]?.status === "SELFTEST_VACUOUS" && byName["audit-fake-vacuous.mjs"]?.violation === false],
      ["none → NO_SELFTEST (advisory)", byName["audit-fake-none.mjs"]?.status === "NO_SELFTEST" && byName["audit-fake-none.mjs"]?.advisory === true],
      ["util → NOT_A_GATE", byName["util-fake-helper.mjs"]?.status === "NOT_A_GATE"],
      ["exactly one violation across the fixture", scan(dir).filter((r) => r.violation).length === 1],
    ];
    // (b) every SELFTEST_VIA_TEST credit must currently RESOLVE against the REAL repo (its fixture exists +
    //     still references the tool) — a renamed/deleted proof makes the credit dishonest, and this catches it.
    for (const key of Object.keys(SELFTEST_VIA_TEST)) {
      checks.push([`via-test credit honest: ${key}`, resolveViaTest(HERE, key).viaTest !== null]);
    }
    const failed = checks.filter(([, ok]) => !ok);
    for (const [n, ok] of checks) console.log(`[self-test] ${ok ? "ok" : "FAIL"} — ${n}`);
    if (failed.length) { console.log(`[self-test] FAIL — ${failed.length} meta-gate check(s) broke`); process.exit(1); }
    console.log("[self-test] PASS — broken + vacuous + missing self-tests all classified correctly, good one cleared");
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────
if (SELFTEST) { selfTest(); process.exit(0); }

const results = scan(rootArg || HERE);
const violations = results.filter((r) => r.violation);
const advisories = results.filter((r) => r.advisory);
const gates = results.filter((r) => r.category === "audit" || r.category === "lint");
const guarded = gates.filter((r) => r.status === "GUARDED" || r.status === "GUARDED_BY_TEST");

if (asJson) {
  console.log(JSON.stringify({
    tool: "gate-selftests",
    totals: { gates: gates.length, guarded: guarded.length, violations: violations.length, advisories: advisories.length },
    results,
  }, null, 2));
} else {
  const line = (r) => {
    const mark = r.violation ? "✗" : r.advisory ? "•" : "✓";
    return `${mark} ${r.name.padEnd(34)} [${r.status}] — ${r.reason}` + (r.note ? `\n     ⚠ ${r.note}` : "");
  };
  console.log("# Gate self-test integrity — run every audit/lint gate's --self-test and prove it is non-vacuous\n");
  for (const r of gates) console.log(line(r));
  console.log(`\nGATES: ${gates.length} · GUARDED: ${guarded.length} · advisory (no/weak self-test): ${advisories.length} · VIOLATIONS: ${violations.length}`);
  if (advisories.length) {
    console.log(`\nAdvisory baseline (audit/lint gates without a proven --self-test) — burn down over time:`);
    for (const r of advisories) console.log(`  • ${r.name} (${r.status})`);
  }
  console.log(violations.length === 0
    ? "\n✅ every DECLARED gate self-test passes — no neutered detector."
    : `\n❌ ${violations.length} gate self-test(s) FAIL — a detector may be neutered (fail-open disguised as green).`);
  console.log(`VIOLATIONS: ${violations.length}`);
}

process.exit(soft ? 0 : Math.min(violations.length, 250));
