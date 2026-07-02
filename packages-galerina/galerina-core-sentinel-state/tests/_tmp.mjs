// _tmp.mjs — unique, self-cleaning temp subdir per test run.
//
// Uniqueness is derived from process.pid + a monotonic counter (NOT Date.now /
// Math.random), so concurrent test files never collide and runs are reproducible
// within a process.
//
// Test hygiene: the OS recycles PIDs across `node --test` runs, so WITHOUT cleanup
// a fresh run can inherit a prior run's dir (stale contents → flaky, code-change-free
// failure), and the build/lss-test-* dirs accumulate without bound. This helper is
// shared by multiple test files that `node --test` runs IN PARALLEL, so the sweep is
// scoped to THIS process's own PID (build/lss-test-<pid>-*) — a global prefix sweep
// would delete a concurrently-running sibling's live dir mid-write (ENOENT). Own-PID
// scoping is race-free (live processes never share a PID) yet still: clears a prior
// SAME-PID run's leftovers at load (the exact stale-inheritance cause), cleans this
// run's dirs via after() (clean runs leak nothing), and self-heals crashed-run dirs
// when the OS eventually recycles that PID.
import { after } from "node:test";
import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SCRATCH_ROOT = "build";
const OWN_PREFIX = `lss-test-${process.pid}-`; // only ever touch THIS process's dirs

function sweepScratchDirs() {
  let entries;
  try {
    entries = readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return; // build/ not created yet — nothing to sweep
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith(OWN_PREFIX)) {
      rmSync(join(SCRATCH_ROOT, e.name), { recursive: true, force: true });
    }
  }
}

sweepScratchDirs();       // clear this PID's stale dirs from a prior (possibly crashed) run
after(sweepScratchDirs);  // don't leak this run's dirs

let counter = 0;

export function tmpDir() {
  counter += 1;
  const dir = `${SCRATCH_ROOT}/${OWN_PREFIX}${counter}`;
  rmSync(dir, { recursive: true, force: true }); // PID reuse: never inherit a prior run's contents
  return dir;
}
