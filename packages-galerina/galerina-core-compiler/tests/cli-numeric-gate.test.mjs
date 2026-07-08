/**
 * CLI regression — the FUNGI-NUMERIC-001 numeric gate at the `galerina check` / `galerina build` surface,
 * driven through the REAL CLI (spawn `node galerina.mjs`). Pins the #52 lift: both 64-bit scalars are now
 * ADMITTED at the CLI in the default/unset GALERINA_PROFILE (the everyday local path).
 *
 * Background — two holes this path once had (both fixed; kept here as the regression they pin):
 *   HOLE #2 (`check`): it filtered checkValueStates() to FUNGI-VALUESTATE-008 ALONE, so any OTHER
 *     fail-closed value-state error was discarded → `check` printed "0 errors" on a file the production
 *     build rejects. Now `check` surfaces ALL error-severity value-state diagnostics and exits non-zero.
 *   HOLE #1 (`build`): the dev/unset branch never ran checkValueStates, so an unlowerable numeric value
 *     was emitted as a silently-truncating module. Now the value-state gate runs UNCONDITIONALLY,
 *     regardless of profile.
 *
 * The lift (#52): Int64 (faithful i64, walker ≡ WASM byte-exact) AND UInt64 (carried on the walker via the
 * exact-trapping u64-arith layer; WASM declines) are BOTH lowered now, so the FUNGI-NUMERIC-001 scalar-width
 * gate set (`BACKEND_UNLOWERABLE_SCALAR`) is empty — a scalar Int64/UInt64 flow is ADMITTED by both `check`
 * and a default `build`. The four tests below assert exactly that (no FUNGI-NUMERIC-001, exit 0).
 *
 * Spawns the root galerina.mjs (cwd = repo root) so it exercises the exact dist + CLI wiring a user hits.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BUILD = join(ROOT, "build");
const fixtures = [];

function fixture(name, src) {
  // W4 versioning: every on-disk .fungi artifact carries the header — including test-authored ones
  if (!src.startsWith("@version")) src = "@version 1\n" + src;
  mkdirSync(BUILD, { recursive: true });
  const p = join(BUILD, name);
  writeFileSync(p, src);
  fixtures.push(p);
  return p;
}
function cli(cmd, file, env = {}) {
  const r = spawnSync(process.execPath, ["galerina.mjs", cmd, file],
    { cwd: ROOT, encoding: "utf-8", timeout: 120000, env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

after(() => {
  // Remove fixtures + any build artifacts the Int64 build emitted.
  for (const p of fixtures) { try { rmSync(p, { force: true }); } catch { /* ignore */ } }
  for (const ext of [".wasm", ".wat", ".lmanifest", ".lmanifest.json", ".fuse.json", ".governance-impact.json"]) {
    try { rmSync(join(BUILD, `__numgate_u64${ext}`), { force: true }); } catch { /* ignore */ }
    try { rmSync(join(BUILD, `__numgate_i64${ext}`), { force: true }); } catch { /* ignore */ }
  }
});

const U64 = `pure flow wideU() -> UInt64 contract { effects {} } { let x: UInt64 = 42  return x }\n`;
const I64 = `pure flow wideI(n: Int) -> Int64 contract { effects {} } { return n }\n`;

test("check: a LIFTED width (UInt64) is admitted — no FUNGI-NUMERIC-001, exit 0 (#52 unlock)", () => {
  const f = fixture("__numgate_u64.fungi", U64);
  const r = cli("check", f);
  assert.doesNotMatch(r.out, /FUNGI-NUMERIC-001/, "UInt64 must NOT be gated post-unlock");
  assert.equal(r.status, 0, `check of a UInt64 flow must succeed\n${r.out}`);
});

test("check: a LIFTED width (Int64) is admitted — clean, exit 0 (no false rejection)", () => {
  const f = fixture("__numgate_i64.fungi", I64);
  const r = cli("check", f);
  assert.doesNotMatch(r.out, /FUNGI-NUMERIC-001/, "Int64 must NOT be gated post-lift");
  assert.match(r.out, /0 errors/, "check must report Int64 clean");
  assert.equal(r.status, 0, `check of an Int64 flow must succeed\n${r.out}`);
});

test("build: a LIFTED width (UInt64) is admitted in the default profile (walker-only; WASM declines)", () => {
  const f = fixture("__numgate_u64.fungi", U64);
  const r = cli("build", f, { GALERINA_PROFILE: "" });
  assert.doesNotMatch(r.out, /FUNGI-NUMERIC-001/, "UInt64 must NOT be rejected by the build gate (it is unlocked)");
  assert.equal(r.status, 0, `default build of a UInt64 flow must succeed (walker carries it; WASM declines)\n${r.out}`);
});

test("build: a LIFTED width (Int64) builds in the default profile (lift end-to-end)", () => {
  const f = fixture("__numgate_i64.fungi", I64);
  const r = cli("build", f, { GALERINA_PROFILE: "" });
  assert.doesNotMatch(r.out, /FUNGI-NUMERIC-001/, "Int64 must NOT be rejected by the build gate");
  assert.equal(r.status, 0, `default build of an Int64 flow must succeed (faithful i64 emission)\n${r.out}`);
});
