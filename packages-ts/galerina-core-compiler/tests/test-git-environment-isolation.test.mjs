import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ISOLATION_MODULE = new URL(
  "../scripts/isolate-test-git-environment.mjs",
  import.meta.url,
).href;

test("test workers do not inherit Git repository-routing overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-test-git-env-"));
  const childTest = join(root, "environment.test.mjs");
  const keys = ["GIT_COMMON_DIR", "GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"];
  writeFileSync(childTest, [
    'import assert from "node:assert/strict";',
    'import test from "node:test";',
    `test("Git repository overrides are absent", () => {`,
    `  for (const name of ${JSON.stringify(keys)}) {`,
    '    assert.equal(Object.keys(process.env).some((key) => key.toUpperCase() === name), false, name);',
    "  }",
    "});",
  ].join("\n") + "\n");

  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    for (const key of keys) env[key] = join(root, `poison-${key.toLowerCase()}`);
    const result = spawnSync(
      process.execPath,
      ["--test", "--import", ISOLATION_MODULE, childTest],
      { cwd: root, encoding: "utf8", env, timeout: 15_000, windowsHide: true },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Git repository overrides are absent/u, JSON.stringify({
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message,
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
