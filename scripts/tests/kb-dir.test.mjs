// Cadence test for scripts/lib/kb-dir.mjs + the umbrella's CROSS-REPO declaration.
//
// WHY: Galerina is PUBLIC, the KB (ZTF-Knowledge-Bases) is PRIVATE. Any audit that reads the KB cannot
// run on a public runner, and for 8 days `conventions` was red because two of them tried anyway — behind
// a preflight that proved a SECRET WAS SET and called that "we can read the KB". Presence is not
// capability. The token had never worked; it was added 50 minutes AFTER the breakage it was meant to fix.
//
// ★ THE DURABLE TEST IS THE THIRD ONE. The lib's own self-test proves the lib; it does not stop the NEXT
// KB-reading audit being registered without a cross-repo declaration — which is the defect class, not the
// instance. So: any CHECKS member whose script reads GALERINA_KB_DIR MUST declare crossRepo. That fails
// when someone adds audit-kb-whatever.mjs and forgets, which is the only way this recurs.
//
// (A lib's `--self-test` is also outside audit-gate-selftests' surface — it scans audit-*/lint-* only —
// so without this file the self-test would never run in CI and never be proven non-vacuous. RD-0452.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKbDir, kbCorpusPresent, KB_MARKER } from "../lib/kb-dir.mjs";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(SCRIPTS, "lib", "kb-dir.mjs");

test("kb-dir: its own --self-test passes (the lib is non-vacuous)", () => {
  const r = spawnSync(process.execPath, [LIB, "--self-test"], { encoding: "utf8" });
  assert.equal(r.status, 0, `self-test failed:\n${r.stdout}\n${r.stderr}`);
});

test("a path is not a corpus, and an EMPTY dir is not a corpus (the partial-checkout fail-open)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "kbdir-test-"));
  const empty = join(tmp, "empty");
  mkdirSync(empty);
  const real = join(tmp, "real");
  mkdirSync(real);
  writeFileSync(join(real, KB_MARKER), "# codes\n");

  // resolveKbDir always answers — that is exactly why it must not be mistaken for a readiness check.
  assert.equal(typeof resolveKbDir({ env: { GALERINA_KB_DIR: join(tmp, "nope") } }), "string");

  assert.equal(kbCorpusPresent({ env: { GALERINA_KB_DIR: real } }), true);
  assert.equal(kbCorpusPresent({ env: { GALERINA_KB_DIR: join(tmp, "nope") } }), false);
  assert.equal(kbCorpusPresent({ env: { GALERINA_KB_DIR: empty } }), false,
    "an existing-but-empty dir must be ABSENT — else a failed checkout scans nothing and reports a serene zero");
});

// ── the one that catches the NEXT instance, not this one ──────────────────────
test("REGRESSION: every umbrella check that reads the KB is DECLARED crossRepo", () => {
  const umbrella = readFileSync(join(SCRIPTS, "lint-conventions.mjs"), "utf8");
  const checksBlock = umbrella.slice(umbrella.indexOf("const CHECKS = ["), umbrella.indexOf("\n];"));

  // Split into per-entry spans on the `script:` key; each entry's crossRepo (if any) follows its script.
  const marks = [...checksBlock.matchAll(/script:\s*"([^"]+)"/g)];
  assert.ok(marks.length >= 10, `expected the full check registry, found ${marks.length}`);

  const undeclared = [];
  let readsKbCount = 0;
  for (let i = 0; i < marks.length; i++) {
    const scriptPath = marks[i][1];
    const span = checksBlock.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : undefined);
    let src = "";
    try { src = readFileSync(join(SCRIPTS, "..", scriptPath), "utf8"); } catch { continue; }

    // Does the child actually reach for the KB? Its own source is the authority — not a hand-kept list,
    // which is the thing that decays. (`process.env.GALERINA_KB_DIR` is how all five resolvers spell it.)
    const readsKb = /process\.env\.GALERINA_KB_DIR/.test(src);
    if (readsKb) readsKbCount++;
    const declared = /crossRepo:\s*\{/.test(span);
    if (readsKb && !declared) undeclared.push(scriptPath);
  }

  // ★ NON-VACUITY. "no undeclared KB readers" is also what a detector that never fires prints. If a
  // refactor renames the env var or moves the resolution behind the shared lib, readsKb goes 0-for-12
  // and this test passes forever while proving nothing. Pin that the detector SEES the known readers.
  assert.ok(readsKbCount >= 2,
    `the KB-reader detector matched ${readsKbCount} checks — it should see at least doc-drift and ` +
    `diagnostic-doc-drift. Zero-for-all means this test is vacuous, not that the tree is clean.`);

  assert.deepEqual(undeclared, [],
    `these checks read the KB but are not declared crossRepo — on a public runner they will fail-closed ` +
    `and be counted as real violations, which is the 8-day-red bug: ${undeclared.join(", ")}`);
});

test("a crossRepo declaration must say WHERE the check is still enforced (a skip that names no home is a hole)", () => {
  const umbrella = readFileSync(join(SCRIPTS, "lint-conventions.mjs"), "utf8");
  // Scope to the registry: the runner below it also mentions crossRepo (spreading a declaration into a
  // row), and matching that instead of the declarations tests nothing. Caught by this test failing.
  const checksBlock = umbrella.slice(umbrella.indexOf("const CHECKS = ["), umbrella.indexOf("\n];"));
  const decls = [...checksBlock.matchAll(/crossRepo:\s*\{([^}]*)\}/g)];
  assert.ok(decls.length >= 2, `expected the two KB-reading members to be declared, found ${decls.length}`);
  for (const d of decls) {
    assert.match(d[1], /needs:/, "a declaration must name what it needs");
    assert.match(d[1], /enforcedIn:/, "a declaration must name where it IS enforced — else it is just a hole");
  }
});
