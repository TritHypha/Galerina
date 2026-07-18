#!/usr/bin/env node
/**
 * audit-kernel-fungi-twins.mjs — fail-closed gate for the Stage-6 governed-surface `.fungi` twins.
 *
 * Governed DECISION surfaces are being converted to `.fungi` twins under `src/self-hosted/` (checker-
 * verified now; build-wired when the execution switch #143 lands) — first the app-kernel, now also the
 * tower-citizen governance core. A twin that is only checked ONCE rots silently — this gate runs
 * `galerina check` on EVERY twin in every declared twin dir on every audit pass, so a twin that stops
 * type-checking or governance-verifying is a RED gate, never a silent drift. Zero-dep; spawns the same
 * `galerina check` a developer runs.
 *
 * (Filename kept as `kernel-fungi-twins` for the dev-tool-index reference; scope is now all TWIN_DIRS.)
 *
 * Exit 0 = every twin in every existing dir is check-clean. Exit 1 = at least one twin failed, or a
 * declared twin dir is missing (fail-closed: the gate cannot silently pass when it cannot look).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GALERINA = join(ROOT, "galerina.mjs");

// Declared self-hosted twin dirs (repo-relative). Add a package's `src/self-hosted` here when it gains twins.
const TWIN_DIRS = [
  "packages-galerina/galerina-framework-app-kernel/src/self-hosted",
  "packages-galerina/galerina-tower-citizen/src/self-hosted",
  "packages-galerina/galerina-core-runtime/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-memory/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-io/src/self-hosted",
  "packages-galerina/galerina-core-network/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-time/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-power/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-egress/src/self-hosted",
  "packages-galerina/galerina-core-sentinel-state/src/self-hosted",
];

// ── RD-0361 R4 AUTHORITY LEDGER (the trust-root flip). A twin listed in docs/security/rd0361-authoritative-
// twins.json is AUTHORITATIVE: its WASM is the decider and its .ts is a differential SHADOW. This gate ENFORCES,
// fail-closed, that every authoritative twin STAYS check-clean AND still `differential` (its execution-cutover
// test proves WASM===.ts). An authoritative twin that regresses to `shadow` (its differential proof was dropped)
// or fails `galerina check` is a RED gate — the exact trust-root fail-open (flip to trusted, then quietly remove
// the proof) this ledger exists to catch. A present-but-malformed ledger is itself RED (deny-by-default); an
// absent ledger simply means nothing is flipped yet.
const LEDGER_PATH = join(ROOT, "docs", "security", "rd0361-authoritative-twins.json");
function loadAuthoritative() {
  if (!existsSync(LEDGER_PATH)) return { set: new Set(), error: null };
  let raw;
  try { raw = JSON.parse(readFileSync(LEDGER_PATH, "utf8")); }
  catch (e) { return { set: new Set(), error: `authority ledger is malformed JSON (${e.message})` }; }
  if (!raw || !Array.isArray(raw.twins)) return { set: new Set(), error: "authority ledger has no `twins` array" };
  const set = new Set();
  for (const t of raw.twins) {
    if (!t || typeof t.file !== "string" || typeof t.dir !== "string") {
      return { set: new Set(), error: "authority ledger has a twin entry missing `file`/`dir`" };
    }
    set.add(`${t.dir}/${t.file}`);
  }
  return { set, error: null };
}

// Execution column (RD-0361): a twin is a `shadow` (checker-verified only) until a keep-green test builds it,
// #105-admits it, and executes it — then it is `differential` (WASM verdict proven ≡ the .ts / spec). It becomes
// `authoritative` once the #143 execution switch (this ledger, on the owner's nod) flips it to the decider of
// record. Raw state is detected from the twin's package tests/: a test that references the twin's filename AND
// calls admitAndInstantiate proves execution. Makes RD-0361 progress MEASURABLE per RD-0366 ("measure, don't narrate").
function rawExecutionState(dir, twinFile) {
  const testsDir = join(ROOT, dir.replace(/\/src\/self-hosted$/, ""), "tests");
  if (!existsSync(testsDir)) return "shadow";
  for (const f of readdirSync(testsDir)) {
    if (!f.endsWith(".test.mjs")) continue;
    let src = "";
    try { src = readFileSync(join(testsDir, f), "utf8"); } catch { continue; }
    if (src.includes(twinFile) && src.includes("admitAndInstantiate")) return "differential";
  }
  return "shadow";
}

// The RED-on-regression rule (pure, self-tested). rawState ∈ {shadow, differential}:
//   authoritative-declared + differential (proof present) → "authoritative"
//   authoritative-declared + shadow      (proof GONE)     → "regressed"   (RED — trust-root fail-open)
//   not declared                                          → rawState unchanged
function classifyWithAuthority(rawState, isAuthoritative) {
  if (!isAuthoritative) return rawState;
  return rawState === "differential" ? "authoritative" : "regressed";
}

// Anti-neuter: prove the RED-on-regression detector fires before trusting the enforcing sweep.
if (process.argv.includes("--self-test")) {
  const cases = [
    ["differential", true, "authoritative"],
    ["shadow", true, "regressed"],
    ["differential", false, "differential"],
    ["shadow", false, "shadow"],
  ];
  for (const [raw, auth, want] of cases) {
    const got = classifyWithAuthority(raw, auth);
    if (got !== want) {
      console.error(`SELF-TEST FAIL: classifyWithAuthority(${raw}, ${auth}) = ${got}, want ${want} (RED-on-regression neutered)`);
      process.exit(2);
    }
  }
  console.log("  self-test: authority classifier fires — differential→authoritative, shadow-when-declared→regressed (RED) ✅");
  process.exit(0);
}

let failed = 0;
let checked = 0;
const exec = { shadow: 0, differential: 0, authoritative: 0, regressed: 0 };

const { set: authoritative, error: ledgerError } = loadAuthoritative();
if (ledgerError) {
  console.error(`fungi-twins: ${ledgerError} — fail-closed (the R4 authority ledger cannot be trusted).`);
  failed += 1;
}
// Every authoritative-declared twin MUST be seen in the sweep — a ledger entry whose twin is absent (typo /
// moved / deleted) is a flip target that no longer exists, and must not silently pass (you believe a trust root
// is verified when it isn't there at all). Tracked here, enforced after the sweep.
const seenAuthoritative = new Set();

for (const dir of TWIN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) {
    console.error(`fungi-twins: declared twin dir missing (${dir}) — fail-closed`);
    failed += 1;
    continue;
  }
  const twins = readdirSync(abs).filter((f) => f.endsWith(".fungi")).sort();
  for (const twin of twins) {
    const rel = `${dir}/${twin}`;
    const r = spawnSync(process.execPath, [GALERINA, "check", rel], { cwd: ROOT, encoding: "utf8" });
    // Fail-closed: check must exit 0 AND report no POSITIVE error count ("0 errors" is clean;
    // "3 errors" is not). Matching a bare /error/ is wrong — it hits the word in "0 errors".
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const checkOk = r.status === 0 && !/[1-9]\d* error/i.test(out);
    if (authoritative.has(rel)) seenAuthoritative.add(rel);
    const state = classifyWithAuthority(rawExecutionState(dir, twin), authoritative.has(rel));
    exec[state] += 1;
    // A `regressed` twin is an authoritative twin whose differential proof is gone — a trust-root RED even if
    // `galerina check` still passes (check-clean is necessary, not sufficient, for an authoritative twin).
    const ok = checkOk && state !== "regressed";
    const note = state === "regressed"
      ? "  →  AUTHORITATIVE twin regressed to shadow: its execution-cutover differential proof is GONE (trust-root fail-open)"
      : (checkOk ? "" : "  →  " + out.trim().split("\n").slice(-1)[0]);
    console.log(`  ${ok ? "OK  " : "FAIL"} [${state.padEnd(13)}] ${rel}${note}`);
    checked += 1;
    if (!ok) failed += 1;
  }
}

// Fail-closed: an authoritative-declared twin that never appeared in the sweep is a missing flip target.
for (const key of authoritative) {
  if (!seenAuthoritative.has(key)) {
    console.error(`fungi-twins: authoritative twin declared in the R4 ledger but NOT found in any twin dir (${key}) — fail-closed (a flip target that does not exist).`);
    failed += 1;
  }
}

if (checked === 0 && failed === 0) {
  console.log("fungi-twins: no twins yet (0 checked) — vacuously green");
  process.exit(0);
}
console.log(`fungi-twins: ${checked - failed}/${checked} check-clean across ${TWIN_DIRS.length} dir(s)`);
const flip = exec.authoritative > 0 ? ` — #143 R4 flip LIVE (${exec.authoritative} authoritative)` : " (#143 not flipped)";
console.log(`execution column (RD-0361): ${exec.shadow} shadow · ${exec.differential} differential (execute through #105) · ${exec.authoritative} authoritative${exec.regressed ? ` · ${exec.regressed} REGRESSED (RED)` : ""}${flip}`);
process.exit(failed === 0 ? 0 : 1);
