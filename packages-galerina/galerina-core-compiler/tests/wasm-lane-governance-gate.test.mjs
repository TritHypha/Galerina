// =============================================================================
// wasm-lane-governance-gate.test.mjs — RD-0234c H1: the wasm targets must clear
// the FULL production security gate before emitting a runnable module.
// =============================================================================
// The fail-open (LIVE-REPRODUCED on dist/cli.js, language audit 2026-07-02): a whole
// build TARGET — `build --target=wasm-standalone` / `--target=wasm-hybrid` — skipped
// verifyGovernance + checkProductionReadiness (they were gated to build-production /
// build-deterministic only) yet still emitted a runnable `.wasm`. A flow that leaks a
// contract-DENIED response field (FUNGI-GOV-003), or any FUNGI-GOV / FUNGI-TENANT /
// FUNGI-PRIVACY / FUNGI-VAL violation, shipped INSIDE the `.wasm` — and a `.wasm` has no
// JS runtime left to enforce anything, so compile time is the only gate. Same Class-B
// mode-drift RD-0234b fixed for `--deterministic`, re-appearing one lane over.
//
// The fix (cli.ts): both wasm targets join build-production/-deterministic in the
// single-sourced PRODUCTION_STRICTNESS_MODES set, so governance runs at production
// strictness and the existing `totalErrors === 0` emit guard refuses to write the module.
//
// This test is the executable proof, asserting on the OBSERVABLE artifact — was an
// `output.wasm` written? — which is independent of exit code and of whether the fixture
// happens to lower. Each case runs in its own temp dir.
// =============================================================================
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const COMPILER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INTERNAL_CLI = join(COMPILER_ROOT, "dist", "cli.js");
const isWin = process.platform === "win32";
const PER_BUILD_MS = 120_000;

const tmpRoot = mkdtempSync(join(tmpdir(), "fungi-wasm-gov-"));
after(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best effort */ } });

// A flow that leaks a contract-DENIED response field — fires FUNGI-GOV-003 in
// verifyGovernance ONLY (not taint/monkey/attribute), so it is a clean discriminator for
// "did the governance verifier run for this mode?". Builds clean at dev strictness (so the
// pre-fix wasm lane happily emitted it).
const GOV_VIOLATING = [
  `secure flow getUser(id: String) -> String`,
  `contract {`,
  `  intent { "Return user data by id." }`,
  `  effects { database.read }`,
  `  response {`,
  `    returns UserDto`,
  `    denies { email }`,
  `  }`,
  `}`,
  `{`,
  `  let user = UsersDB.read(id)`,
  `  return user.email`,
  `}`,
  ``,
].join("\n");

// A trivially pure flow with no governance surface — must still emit a `.wasm` (proves the
// gate does not over-block a clean module).
const CLEAN = [
  `pure flow greetUser(name: String) -> String`,
  `contract {`,
  `  intent { "Return a personalised greeting for the user name." }`,
  `}`,
  `{`,
  `  return name`,
  `}`,
  ``,
].join("\n");

function stage(label, src) {
  const dir = join(tmpRoot, label + "-" + label.length + "x");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "case.fungi"), src);
  return dir;
}

function buildWasm(dir, target) {
  return spawnSync("node", [INTERNAL_CLI, "build", `--target=${target}`, dir],
    { cwd: COMPILER_ROOT, encoding: "utf8", timeout: PER_BUILD_MS, shell: isWin });
}

const wasmWritten = (dir) => existsSync(join(dir, "build", "wasm", "output.wasm"));

test("wasm-lane governance gate: internal CLI is built", () => {
  assert.ok(existsSync(INTERNAL_CLI), `internal CLI missing — build dist first: ${INTERNAL_CLI}`);
});

for (const target of ["wasm-standalone", "wasm-hybrid"]) {
  test(`VIOLATING (FUNGI-GOV-003) is caught + emits NO module via --target=${target}`, () => {
    const dir = stage(`viol-${target}`, GOV_VIOLATING);
    const r = buildWasm(dir, target);
    assert.ok(r.status !== null, `build did not run (timeout/spawn error): ${r.error ?? ""}`);
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    // 1. The governance verifier RAN for the wasm lane (it did not, pre-fix).
    assert.ok(out.includes("FUNGI-GOV-003"),
      `wasm lane skipped governance — FUNGI-GOV-003 not reported.\n${out}`);
    // 2. No runnable module was written for a governance-violating flow.
    assert.ok(!wasmWritten(dir),
      `wasm lane EMITTED output.wasm for a FUNGI-GOV-003-violating flow — H1 fail-open.\n${out}`);
  });
}

test("CLEAN pure flow still emits output.wasm via --target=wasm-standalone (no over-block)", () => {
  const dir = stage("clean-standalone", CLEAN);
  const r = buildWasm(dir, "wasm-standalone");
  assert.ok(r.status !== null, `build did not run (timeout/spawn error): ${r.error ?? ""}`);
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  assert.ok(!out.includes("FUNGI-GOV-003"), `clean flow falsely flagged FUNGI-GOV-003.\n${out}`);
  assert.ok(wasmWritten(dir),
    `production gate OVER-BLOCKED a clean pure flow — no output.wasm written.\n${out}`);
});
