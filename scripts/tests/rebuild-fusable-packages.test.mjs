import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "rebuild-fusable-packages.mjs");
const MARKER = "REVIEW_MARKER";

test("Windows rebuild helper keeps discovered package directories as process arguments", () => {
  const source = readFileSync(SCRIPT, "utf8");
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /shell:\s*isWin/);
  assert.doesNotMatch(source, /shell:\s*true/);
});

test("a package directory containing shell metacharacters is not interpreted by cmd.exe", () => {
  const root = mkdtempSync(join(tmpdir(), "fuse-rebuild-shell-"));
  try {
    const pkgDir = join(root, `pkg&echo ${MARKER}&rem`);
    mkdirSync(join(pkgDir, "src"), { recursive: true });
    writeFileSync(join(pkgDir, "package.fungi.json"), JSON.stringify({ name: "safe-pkg" }));
    writeFileSync(join(pkgDir, "src", "main.fungi"), "flow main() { return 1; }\n");
    const result = spawnSync(process.execPath, [SCRIPT, "--root", root], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GALERINA_SKIP_FUSE_REBUILD: "" },
      shell: false,
      timeout: 60_000,
      windowsHide: true,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const echoed = output.split(/\r?\n/).some((line) => line.trim() === MARKER);
    assert.equal(echoed, false, `directory names must not become shell commands:\n${output}`);
    assert.notEqual(result.status, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
