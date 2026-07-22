#!/usr/bin/env node
// =============================================================================
// audit-wasmtime-presence.mjs — RD-0529 A4: turn the wasmtime "availability check" into a real GATE
// =============================================================================
// THE FAIL-OPEN THIS CLOSES (measured): tests/wat-phase26.test.mjs:81 is a `wasmtime --version`
// probe that ends `assert.ok(true, "wasmtime availability is informational")` — it PASSES whether or
// not wasmtime is present. So the wasmtime execution engine can be entirely ABSENT in CI and every
// gate still reads green: "0 wasmtime tests ran" is indistinguishable from "all wasmtime tests pass".
// That is the same silent-skip class the report-blind-consumers gate closed for `assembleWAT` — a
// check that can no-op must not report the no-op like success.
//
// WHAT "wasmtime available" MEANS HERE. The corpus WASM runs on V8 (WebAssembly.instantiate); wasmtime
// is the SECOND engine the RD-0529 conformance harnesses (A1 corpus differential · A2 float/NaN/trap ·
// A3 fuel) execute against. That second engine is reachable two ways in this tree:
//   1. the `wasmtime` CLI on PATH (`wasmtime --version`), or
//   2. the Rust `subprojects/dss-host` harness, which links the `wasmtime` crate (get_typed_func /
//      Linker) — the exact path M1 proved 386 DSS points through. Buildable == cargo present AND the
//      dss-host crate still declares `wasmtime`.
// Either surface satisfies the harnesses, so AVAILABLE = (CLI on PATH) OR (cargo + dss-host wasmtime crate).
//
// PROFILE-AWARE, fail-closed where it counts:
//   · certified / CI profile  (env CI truthy, or GALERINA_CERTIFIED=1): wasmtime ABSENT ⟹ EXIT 1 (FAIL).
//     A1/A2/A3 CANNOT be silently skipped — if the engine is gone, the build goes red, loudly.
//   · dev profile (default):   wasmtime ABSENT ⟹ EXIT 0 but a LOUD warning (never a silent pass), and
//     it always states which engine WOULD run, so a local run can't be mistaken for wasmtime coverage.
//
// The decision is a PURE function of {cliPresent, harnessBuildable, profile} — the probing (spawns) is
// separated out, so the self-test drives the full truth table hermetically without needing (or trusting)
// the real machine's wasmtime. That same input "absent" yields EXIT 1 under CI and EXIT 0 under dev —
// proving the gate ENFORCES by profile rather than always-passing (the wat-phase26 anti-pattern).
//
// Usage:
//   node scripts/audit-wasmtime-presence.mjs --self-test   # prove the truth table (run first in CI)
//   node scripts/audit-wasmtime-presence.mjs               # enforce: exit 1 only if absent under CI
//   node scripts/audit-wasmtime-presence.mjs --json        # machine-readable verdict (A1/A2/A3 consult it)
//   CI=1 node scripts/audit-wasmtime-presence.mjs          # certified profile: absent ⟹ FAIL
// =============================================================================
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the certified/CI profile signal ───────────────────────────────────────────
// GitHub Actions + most CI set CI=true; some set CI=1. GALERINA_CERTIFIED=1 is the explicit opt-in for a
// certified run outside a CI env. A set-but-falsey CI ("false"/"0"/"") is NOT certified — presence alone
// is not truth (the fail-closed reading is "enforce"; we only relax to dev on an explicit non-CI value).
function isTruthyCI(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return s !== "" && s !== "false" && s !== "0" && s !== "no";
}
function detectProfile(env = process.env) {
  if (env.GALERINA_CERTIFIED === "1" || isTruthyCI(env.CI)) return "certified";
  return "dev";
}

// ── the PURE decision — the whole gate logic, no I/O (self-test drives this directly) ──
function decideWasmtimeGate({ cliPresent, harnessBuildable, profile }) {
  const available = Boolean(cliPresent || harnessBuildable);
  const engines = [];
  if (cliPresent) engines.push("wasmtime CLI on PATH");
  if (harnessBuildable) engines.push("dss-host Rust harness (wasmtime crate)");

  if (available) {
    return {
      available, profile, exitCode: 0, level: "ok",
      summary: `wasmtime execution AVAILABLE via ${engines.join(" + ")} — RD-0529 A1/A2/A3 can run`,
    };
  }
  if (profile === "certified") {
    return {
      available, profile, exitCode: 1, level: "fail",
      summary: "wasmtime ABSENT under certified/CI — the WASM→wasmtime conformance path (RD-0529 A1/A2/A3) would be SILENTLY UNTESTED. FAIL.",
    };
  }
  return {
    available, profile, exitCode: 0, level: "warn",
    summary: "wasmtime ABSENT (dev profile) — WASM→wasmtime conformance SKIPPED; this FAILS under CI. Install the wasmtime CLI, or a Rust+cargo toolchain for the dss-host harness.",
  };
}

// ── probes (isolated I/O) ──────────────────────────────────────────────────────
const isWin = process.platform === "win32";
function probeCli() {
  try {
    const r = spawnSync("wasmtime", ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true, shell: isWin });
    return r.status === 0 && /wasmtime/i.test((r.stdout || "") + (r.stderr || ""));
  } catch { return false; }
}
function probeHarness() {
  // The wasmtime Rust oracle is buildable iff cargo exists AND the dss-host crate still declares wasmtime.
  // Cheap presence proxy — no `cargo build` (that is A1's job; if it then fails to compile it goes red loudly,
  // which is exactly NOT a silent skip). A missing declaration means the crate was removed → no wasmtime path.
  let cargoOk = false;
  try {
    const c = spawnSync("cargo", ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true, shell: isWin });
    cargoOk = c.status === 0 && /cargo/i.test((c.stdout || "") + (c.stderr || ""));
  } catch { cargoOk = false; }
  if (!cargoOk) return false;
  const toml = join(ROOT, "subprojects", "dss-host", "Cargo.toml");
  if (!existsSync(toml)) return false;
  try { return /^\s*wasmtime\s*=/m.test(readFileSync(toml, "utf8")); } catch { return false; }
}

// ── self-test — the full truth table, hermetic (pure decision, synthetic inputs) ──
function selfTest() {
  const D = decideWasmtimeGate;
  const checks = [];

  // The core: the SAME "absent" input must FAIL under CI but PASS-with-warning under dev. If both were
  // equal the gate would be the wat-phase26 `assert.ok(true)` in disguise — this is the discriminator.
  const absentCI = D({ cliPresent: false, harnessBuildable: false, profile: "certified" });
  const absentDev = D({ cliPresent: false, harnessBuildable: false, profile: "dev" });
  checks.push(["★ absent + certified/CI → FAIL, exit 1 (the silent-skip fail-open is CLOSED)",
    absentCI.available === false && absentCI.exitCode === 1 && absentCI.level === "fail"]);
  checks.push(["★ absent + dev → loud SKIP, exit 0 (warned, never silent)",
    absentDev.available === false && absentDev.exitCode === 0 && absentDev.level === "warn"]);
  checks.push(["★ DISCRIMINATOR: identical 'absent' input differs ONLY by profile (exit 1 vs 0) — the gate enforces, it does not always-pass",
    absentCI.exitCode === 1 && absentDev.exitCode === 0]);

  // Availability by either engine — and specifically the harness-only case (this repo: no CLI, cargo+crate present).
  const cliOnly = D({ cliPresent: true, harnessBuildable: false, profile: "certified" });
  const harnessOnly = D({ cliPresent: false, harnessBuildable: true, profile: "certified" });
  const both = D({ cliPresent: true, harnessBuildable: true, profile: "dev" });
  checks.push(["CLI present (no harness) → AVAILABLE, exit 0 even under CI", cliOnly.available && cliOnly.exitCode === 0]);
  checks.push(["★ harness-only present (no CLI) → AVAILABLE, exit 0 — the Rust wasmtime oracle counts (M1's path)", harnessOnly.available && harnessOnly.exitCode === 0]);
  checks.push(["both present → AVAILABLE, names both engines", both.available && /CLI/.test(both.summary) && /Rust/.test(both.summary)]);

  // Profile detection — CI truthiness is a value test, not a presence test (set-but-false ⟹ dev).
  checks.push(["profile: CI=true → certified", detectProfile({ CI: "true" }) === "certified"]);
  checks.push(["profile: CI=1 → certified", detectProfile({ CI: "1" }) === "certified"]);
  checks.push(["profile: GALERINA_CERTIFIED=1 → certified", detectProfile({ GALERINA_CERTIFIED: "1" }) === "certified"]);
  checks.push(["profile: nothing set → dev", detectProfile({}) === "dev"]);
  checks.push(["profile: CI=false → dev (value, not mere presence)", detectProfile({ CI: "false" }) === "dev"]);
  checks.push(["profile: CI=0 → dev", detectProfile({ CI: "0" }) === "dev"]);

  // The probes must not throw on a real invocation (smoke — result value is machine-dependent, not asserted).
  let probesRan = true;
  try { probeCli(); probeHarness(); } catch { probesRan = false; }
  checks.push(["probes execute without throwing (result is machine-dependent, not asserted here)", probesRan]);

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ wasmtime-presence self-test FAILED — the gate does not enforce as designed"); process.exit(1); }
  console.log("\n  wasmtime-presence self-test: absent⟹FAIL under CI, absent⟹loud-skip under dev, available via either engine ✅");
  process.exit(0);
}

// ── main ───────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
if (process.argv.includes("--self-test")) selfTest();

const cliPresent = probeCli();
const harnessBuildable = probeHarness();
const profile = detectProfile();
const verdict = decideWasmtimeGate({ cliPresent, harnessBuildable, profile });

if (asJson) {
  console.log(JSON.stringify({ profile, cliPresent, harnessBuildable, ...verdict }, null, 2));
  process.exit(verdict.exitCode);
}

const icon = verdict.level === "ok" ? "✅" : verdict.level === "warn" ? "⚠️ " : "❌";
console.log(`\n  wasmtime-presence — is the second execution engine (wasmtime) actually reachable? [profile=${profile}]\n`);
// Report which engine actually ran/would run — the anti-"0 ran reads as green" line.
console.log(`    wasmtime CLI on PATH ............ ${cliPresent ? "PRESENT" : "absent"}`);
console.log(`    dss-host Rust harness (crate) .. ${harnessBuildable ? "BUILDABLE (cargo + wasmtime declared)" : "absent (no cargo, or crate undeclared)"}`);
console.log(`  ${icon} ${verdict.summary}`);
if (verdict.level === "warn") {
  console.log(`     (set CI=1 or GALERINA_CERTIFIED=1 to make this a hard FAIL — that is the certified posture.)`);
}
console.log(`SUMMARY: ${verdict.summary} [profile=${profile} · cli=${cliPresent ? "present" : "absent"} · harness=${harnessBuildable ? "buildable" : "absent"}]`);
process.exit(verdict.exitCode);
