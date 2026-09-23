import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exitCodeFromViolationCount } from "../audit-private-doc-leak.mjs";

const SCRIPT = fileURLToPath(new URL("../audit-private-doc-leak.mjs", import.meta.url));

function git(root, args) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 15_000, shell: false, windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r;
}

function makeRepo(violationCount) {
  const root = mkdtempSync(join(tmpdir(), "private-doc-leak-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "leak-test@example.invalid"]);
  git(root, ["config", "user.name", "leak-test"]);
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "clean.md"), "public note\n");
  const privateRef = ["fixture-internal-example-note", "PRIVATE.md"].join("-");
  for (let i = 0; i < violationCount; i += 1) {
    writeFileSync(join(root, "docs", `hit-${i}.md`), `see ${privateRef}\n`);
  }
  git(root, ["add", "--", "docs"]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture", "--quiet", "--no-gpg-sign"]);
  return root;
}

function run(root, extra = []) {
  return spawnSync(process.execPath, [SCRIPT, "--root", root, ...extra], {
    encoding: "utf8",
    timeout: 30_000,
    shell: false,
    windowsHide: true,
  });
}

test("exitCodeFromViolationCount is 0 only for a clean count", () => {
  assert.equal(exitCodeFromViolationCount(0), 0);
  for (const n of [1, 255, 256, 257, 512]) {
    assert.equal(exitCodeFromViolationCount(n), 1, `count ${n}`);
  }
});

test("CLI text and JSON modes fail closed for 0/1/255/256/257/512 without wrapping success", () => {
  const counts = [0, 1, 255, 256, 257, 512];
  for (const n of counts) {
    const root = makeRepo(n);
    try {
      const text = run(root);
      const json = run(root, ["--json"]);
      const expected = n > 0 ? 1 : 0;
      assert.equal(text.status, expected, `text n=${n} status=${text.status} stderr=${text.stderr}`);
      assert.equal(json.status, expected, `json n=${n} status=${json.status}`);
      const payload = JSON.parse(json.stdout);
      assert.equal(payload.violations.length, n);
      assert.equal(payload.exitCode, expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
