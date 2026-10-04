// retirement-help-non-mutating.test.mjs — `ts-retirement-graph.mjs --help` must never regenerate
// build/ts-retirement/, and an unknown or repeated argument must refuse before any write.
// Zero-trust default, owner may revisit: before this, `--help` (and any unrecognised flag) was
// silently ignored and the tool regenerated its tracked outputs (docs/TODO.md "Dev-tool ergonomics:
// ... retirement/code-index interpret a no-mode invocation as generation").
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/ts-retirement-graph.mjs");
const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });

for (const flag of ["--help", "-h"]) {
  test(`ts-retirement ${flag} prints usage, exits 0 and writes nothing`, () => {
    const root = mkdtempSync(join(tmpdir(), "ts-retirement-help-"));
    try {
      const r = run(["--root", root, flag], root);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /usage:/i);
      assert.deepEqual(readdirSync(root), [], "help must not create build/ts-retirement");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const args of [["--bogus"], ["--check", "--check"], ["extra"], ["--help", "--check"]]) {
  test(`ts-retirement refuses ${args.join(" ")} before any write`, () => {
    const root = mkdtempSync(join(tmpdir(), "ts-retirement-arg-"));
    try {
      const r = run(["--root", root, ...args], root);
      assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /REFUSED/);
      assert.deepEqual(readdirSync(root), [], "a refused invocation must not write");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
