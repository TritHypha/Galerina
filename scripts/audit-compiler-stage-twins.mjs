#!/usr/bin/env node
/**
 * audit-compiler-stage-twins.mjs — RD-0528 fail-closed gate for the self-hosted COMPILER stages.
 *
 * The 7 self-hosted compiler stages (galerina-core-compiler/src/self-hosted/*.fungi) are R3 byte-parity
 * with their .ts (wat-p9-*-parity, 422/422). RD-0528 gives them their OWN authority track, SEPARATE
 * from the kernel sentinel ledger (rd0361-authoritative-twins.json): flipping a kernel sentinel retires
 * ZERO lines of the .ts compiler (RD-0528 §2). This is the compiler-track sibling of
 * scripts/audit-kernel-fungi-twins.mjs.
 *
 * It (a) runs `galerina check` on EVERY compiler stage on every pass — a stage that stops
 * type-checking / governance-verifying is RED, never silent rot; and (b) reads the compiler authority
 * ledger (docs/security/rd0528-compiler-authoritative-stages.json) and ENFORCES, fail-closed, that
 * every AUTHORITATIVE stage stays check-clean AND still `differential` (a package test references it +
 * calls admitAndInstantiate). An authoritative stage whose differential proof is gone → `regressed`
 * (RED — the trust-root fail-open: flip to trusted, then quietly drop the proof). A malformed ledger,
 * a missing stage dir, or a declared stage not found in the sweep → RED (deny-by-default).
 *
 * Exit 0 = every stage check-clean and no authoritative regression. Exit 1 = otherwise.
 * `--self-test` proves the RED-on-regression classifier fires before the enforcing sweep is trusted.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GALERINA = join(ROOT, "galerina.mjs");
const STAGE_DIR = "packages-galerina/galerina-core-compiler/src/self-hosted";
const LEDGER_PATH = join(ROOT, "docs", "security", "rd0528-compiler-authoritative-stages.json");

// A present-but-malformed ledger is RED; an absent ledger means nothing is flipped yet.
function loadAuthoritative() {
  if (!existsSync(LEDGER_PATH)) return { set: new Set(), error: null };
  let raw;
  try { raw = JSON.parse(readFileSync(LEDGER_PATH, "utf8")); }
  catch (e) { return { set: new Set(), error: `compiler authority ledger is malformed JSON (${e.message})` }; }
  if (!raw || !Array.isArray(raw.twins)) return { set: new Set(), error: "compiler authority ledger has no `twins` array" };
  const set = new Set();
  for (const t of raw.twins) {
    if (!t || typeof t.file !== "string" || typeof t.dir !== "string") {
      return { set: new Set(), error: "compiler authority ledger has an entry missing `file`/`dir`" };
    }
    set.add(`${t.dir}/${t.file}`);
  }
  return { set, error: null };
}

// A stage is `differential` if a package test references its filename AND calls admitAndInstantiate
// (proves it builds → #105-admits → executes); else `shadow`. Same rule as the kernel gate.
function rawExecutionState(stageFile) {
  const testsDir = join(ROOT, "packages-galerina", "galerina-core-compiler", "tests");
  if (!existsSync(testsDir)) return "shadow";
  for (const f of readdirSync(testsDir)) {
    if (!f.endsWith(".test.mjs")) continue;
    let src = "";
    try { src = readFileSync(join(testsDir, f), "utf8"); } catch { continue; }
    if (src.includes(stageFile) && src.includes("admitAndInstantiate")) return "differential";
  }
  return "shadow";
}

// authoritative-declared + differential → authoritative; + shadow (proof GONE) → regressed (RED).
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
  console.log("  self-test: compiler authority classifier fires — differential→authoritative, shadow-when-declared→regressed (RED) ✅");
  process.exit(0);
}

let failed = 0, checked = 0;
const exec = { shadow: 0, differential: 0, authoritative: 0, regressed: 0 };
const { set: authoritative, error: ledgerError } = loadAuthoritative();
if (ledgerError) {
  console.error(`compiler-stage-twins: ${ledgerError} — fail-closed (the RD-0528 authority ledger cannot be trusted).`);
  failed += 1;
}

const abs = join(ROOT, STAGE_DIR);
if (!existsSync(abs)) {
  console.error(`compiler-stage-twins: stage dir missing (${STAGE_DIR}) — fail-closed`);
  process.exit(1);
}
const seenAuthoritative = new Set();
const stages = readdirSync(abs).filter((f) => f.endsWith(".fungi")).sort();
for (const stage of stages) {
  const rel = `${STAGE_DIR}/${stage}`;
  const r = spawnSync(process.execPath, [GALERINA, "check", rel], { cwd: ROOT, encoding: "utf8" });
  // Fail-closed: check must exit 0 AND report no POSITIVE error count ("0 errors" is clean).
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const checkOk = r.status === 0 && !/[1-9]\d* error/i.test(out);
  if (authoritative.has(rel)) seenAuthoritative.add(rel);
  const state = classifyWithAuthority(rawExecutionState(stage), authoritative.has(rel));
  exec[state] += 1;
  const ok = checkOk && state !== "regressed";
  const note = state === "regressed"
    ? "  →  AUTHORITATIVE stage regressed to shadow: its differential proof is GONE (trust-root fail-open)"
    : (checkOk ? "" : "  →  " + out.trim().split("\n").slice(-1)[0]);
  console.log(`  ${ok ? "OK  " : "FAIL"} [${state.padEnd(13)}] ${rel}${note}`);
  checked += 1;
  if (!ok) failed += 1;
}

// Fail-closed: an authoritative-declared stage that never appeared in the sweep is a missing flip target.
for (const key of authoritative) {
  if (!seenAuthoritative.has(key)) {
    console.error(`compiler-stage-twins: authoritative stage declared in the ledger but NOT found in the stage dir (${key}) — fail-closed.`);
    failed += 1;
  }
}

// Unlike the kernel gate's multi-dir sweep, this single dir MUST contain the stages — 0 found is a fault.
if (checked === 0) {
  console.error("compiler-stage-twins: no .fungi stages found in the stage dir — fail-closed");
  process.exit(1);
}
console.log(`compiler-stage-twins: ${checked - failed}/${checked} check-clean in ${STAGE_DIR}`);
const flip = exec.authoritative > 0 ? ` — RD-0528 flip LIVE (${exec.authoritative} authoritative)` : " (0 flipped — .ts still decider of record)";
console.log(`authority column (RD-0528): ${exec.shadow} shadow · ${exec.differential} differential (execute through #105) · ${exec.authoritative} authoritative${exec.regressed ? ` · ${exec.regressed} REGRESSED (RED)` : ""}${flip}`);
process.exit(failed === 0 ? 0 : 1);
