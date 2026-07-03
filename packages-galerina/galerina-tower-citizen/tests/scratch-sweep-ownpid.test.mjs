// =============================================================================================
// scratch-sweep-ownpid.test.mjs — RED-bench for the scratch-dir leak class (own-PID sweep discipline).
// ---------------------------------------------------------------------------------------------
// Proves the RUNTIME behaviour the own-PID scope fixes: a BROAD load/after sweep (prefix without the
// PID) deletes a CONCURRENT sibling process's LIVE dir mid-run (the ENOENT flake); an OWN-PID sweep
// does not, while still clearing the sweeping process's OWN stale dirs. The STRUCTURAL guard is
// scripts/audit-scratchdir-hygiene.mjs (flags a broad sweep at phase-close); this pins the behaviour
// so the own-PID discipline in sentinel-egress-time.test.mjs (+ the three siblings) cannot silently
// regress. Uses an isolated os.tmpdir() sandbox — never touches the prod build/ tree.
// =============================================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The exact readdir + startsWith + rmSync loop the sentinel tests use, parameterised by prefix.
const sweep = (root, prefix) => {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith(prefix)) {
      rmSync(join(root, e.name), { recursive: true, force: true });
    }
  }
};

test("BROAD sweep deletes a concurrent sibling's LIVE dir (the hazard own-PID scoping removes)", () => {
  const root = mkdtempSync(join(tmpdir(), "scratch-sweep-broad-"));
  try {
    mkdirSync(join(root, "egress-it-100-stale")); // process A's own leftover from a prior run
    mkdirSync(join(root, "egress-it-200-1"));      // process B's LIVE dir (concurrent node --test)
    sweep(root, "egress-it-");                      // A's BROAD load-sweep (prefix without pid)
    assert.equal(existsSync(join(root, "egress-it-200-1")), false,
      "a broad sweep deletes the concurrent sibling's live dir — this is the bug");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("OWN-PID sweep preserves a concurrent sibling's live dir AND clears own stale", () => {
  const root = mkdtempSync(join(tmpdir(), "scratch-sweep-ownpid-"));
  try {
    mkdirSync(join(root, "egress-it-100-stale")); // A's own leftover
    mkdirSync(join(root, "egress-it-200-1"));      // B's LIVE dir (concurrent)
    sweep(root, "egress-it-100-");                 // A's OWN-PID sweep (`<prefix>-<pid>-`)
    assert.equal(existsSync(join(root, "egress-it-200-1")), true,
      "own-PID sweep must PRESERVE the concurrent sibling's live dir");
    assert.equal(existsSync(join(root, "egress-it-100-stale")), false,
      "own-PID sweep must STILL clear A's own recycled-PID stale dir");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
