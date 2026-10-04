// generator-help-non-mutating.test.mjs — `--help` on a registered generator owner must never
// regenerate tracked outputs, and an unknown argument must refuse before any write.
// Zero-trust default, owner may revisit: before this, `code-index.mjs --help` and
// `dev-tool-index.mjs --help` ignored the flag and rewrote build/ outputs (docs/TODO.md
// "Dev-tool ergonomics: give registered owners a consistent non-mutating --help contract").
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const OWNERS = [
  { name: "code-index", script: resolve("scripts/code-index.mjs"), viaRoot: false },
  { name: "dev-tool-index", script: resolve("scripts/dev-tool-index.mjs"), viaRoot: true },
];

function run(owner, root, args) {
  const argv = owner.viaRoot ? [owner.script, "--root", root, ...args] : [owner.script, ...args];
  return spawnSync(process.execPath, argv, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SOURCE_DATE_EPOCH: "1700000000" },
  });
}

for (const owner of OWNERS) {
  for (const flag of ["--help", "-h"]) {
    test(`${owner.name} ${flag} prints usage, exits 0 and writes nothing`, () => {
      const root = mkdtempSync(join(tmpdir(), `${owner.name}-help-`));
      try {
        const r = run(owner, root, [flag]);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /usage:/i);
        assert.deepEqual(readdirSync(root), [], "help must not create build/ outputs");
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }

  for (const args of [["--bogus"], ["--check", "--check"], ["extra"]]) {
    test(`${owner.name} refuses ${args.join(" ")} before any write`, () => {
      const root = mkdtempSync(join(tmpdir(), `${owner.name}-arg-`));
      try {
        const r = run(owner, root, args);
        assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
        assert.match(r.stderr, /REFUSED/);
        assert.deepEqual(readdirSync(root), [], "a refused invocation must not write");
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}

test("dev-tool-index refuses --root without a directory value", () => {
  const owner = OWNERS[1];
  const root = mkdtempSync(join(tmpdir(), "dev-tool-index-root-"));
  try {
    const r = spawnSync(process.execPath, [owner.script, "--root"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 2, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /REFUSED/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
