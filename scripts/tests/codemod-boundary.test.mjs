// Cadence test for scripts/lib/codemod-boundary.mjs (RD-0452 — the write-time boundary assert).
//
// WHY THIS FILE EXISTS: the meta-gate (audit-gate-selftests) scans `audit-*` / `lint-*` only, so a LIB's
// --self-test is outside its surface — it would never run and never be proven non-vacuous. That is the
// exact surface/capability class RD-0451 names, so it would be absurd to reintroduce it while landing
// RD-0452. Living in scripts/tests/, this runs in the build-free lane every close.
//
// It also asserts the two REAL defects the helper exists to have prevented, reconstructed from the
// actual rewrites — so if someone loosens the predicate, the historical cases fail here by name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyRewrite, escapesRoot, packageOf } from "../lib/codemod-boundary.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "codemod-boundary.mjs");
const R = "/repo", P = "packages-galerina";
const c = (fromFile, oldTarget, newTarget) =>
  classifyRewrite({ fromFile, oldTarget, newTarget, repoRoot: R, packagesDirName: P });

test("codemod-boundary: its own --self-test passes (the helper is non-vacuous)", () => {
  const r = spawnSync(process.execPath, [TOOL, "--self-test"], { encoding: "utf8" });
  assert.equal(r.status, 0, `self-test failed:\n${r.stdout}\n${r.stderr}`);
});

test("REGRESSION #34: repointing docs into the sibling KB is REFUSED (123 links, 85 in the public index)", () => {
  const r = c("docs/README.md", "./Knowledge-Bases/architecture-charter.md", "../../ZTF-Knowledge-Bases/architecture-charter.md");
  assert.equal(r.verdict, "refuse");
  assert.equal(r.claim, "escapes-repo-root");
});

test("REGRESSION app-kernel: a NEW cross-package reach into a sibling's dist is REFUSED", () => {
  const r = c("packages-galerina/galerina-framework-app-kernel/src/kernel.ts", "./posture.js", "../../galerina-core-config/dist/posture.js");
  assert.equal(r.verdict, "refuse");
  assert.equal(r.claim, "crosses-package");
  assert.match(r.reason, /galerina-core-config/);
});

// The direction that decides whether this helper survives contact with real work. A helper that refuses
// legitimate rebrands gets switched off inside a day — and then nothing asks the boundary question at all.
test("SILENT: a rebrand in place is not a boundary claim (the case that must never fire)", () => {
  assert.equal(c("packages-galerina/pkg-a/src/x.ts", "./logicn-foo.js", "./galerina-foo.js").verdict, "silent");
  assert.equal(c("packages-galerina/pkg-a/src/x.ts", "./a.js", "../lib/a.js").verdict, "silent");
  assert.equal(c("docs/README.md", "./old.md", "./sub/new.md").verdict, "silent");
});

test("SILENT: a rewrite that PRESERVES an existing crossing — the rename didn't create it (that's the audit half's job)", () => {
  assert.equal(c("packages-galerina/pkg-a/src/x.ts", "../../pkg-b/dist/old.js", "../../pkg-b/dist/new.js").verdict, "silent");
});

test("the predicates are arithmetic, never the filesystem (the disk answers for the AUTHOR, not the reader)", () => {
  assert.ok(escapesRoot("/repo/../x", "/repo"));
  assert.ok(!escapesRoot("/repo/a/b", "/repo"));
  assert.ok(escapesRoot("/repo-evil/x", "/repo"), "segments, not string prefixes");
  assert.equal(packageOf("/repo/packages-galerina/pkg-a/src/x.ts", R, P), "pkg-a");
  assert.equal(packageOf("/repo/docs/x.md", R, P), null);
});
