import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRELOAD = new URL("../scripts/isolate-test-git-environment.mjs", import.meta.url);
const GIT_AUTHORITY_KEYS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_KEY_0",
  "GIT_CONFIG_VALUE_0",
];
const SENTINELS = Object.fromEntries(GIT_AUTHORITY_KEYS.map((key) => [key, `sentinel-${key}`]));
const PROBE = `import { spawnSync } from "node:child_process"; const config = spawnSync("git", ["config", "--get", process.env.PROBE_CONFIG_KEY], { encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024 }); console.log(JSON.stringify({ ...Object.fromEntries([...${JSON.stringify(GIT_AUTHORITY_KEYS)}, "KEEP_ME"].map((key) => [key, process.env[key] ?? null])), configStatus: config.status, configValue: config.stdout.trim() }))`;

test("canonical package test preload clears inherited Git command config without changing unrelated environment", () => {
  const configKey = "codex.reviewprobe";
  const temporary = mkdtempSync(join(tmpdir(), "galerina-package-git-preload-"));
  const env = {
    ...process.env,
    ...SENTINELS,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: configKey,
    GIT_CONFIG_VALUE_0: "inherited-command-config",
    PROBE_CONFIG_KEY: configKey,
    KEEP_ME: "preserved",
  };
  try {
    const positiveEnvironment = { ...env };
    // The shared runner injects the canonical preload through NODE_OPTIONS.
    // Remove it here so this child remains the actual unsanitized positive control.
    delete positiveEnvironment.NODE_OPTIONS;
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) {
      delete positiveEnvironment[key];
    }
    const positiveControl = spawnSync(process.execPath, ["--input-type=module", "-e", PROBE], {
      cwd: temporary,
      encoding: "utf8",
      env: positiveEnvironment,
      timeout: 10_000,
      maxBuffer: 128 * 1024,
    });
    assert.equal(positiveControl.status, 0, positiveControl.stderr);
    assert.deepEqual(JSON.parse(positiveControl.stdout), {
      GIT_DIR: null,
      GIT_WORK_TREE: null,
      GIT_INDEX_FILE: null,
      GIT_COMMON_DIR: null,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: configKey,
      GIT_CONFIG_VALUE_0: "inherited-command-config",
      KEEP_ME: "preserved",
      configStatus: 0,
      configValue: "inherited-command-config",
    });

    const isolatedEnvironment = { ...env };
    // Exercise the preload by its explicit CLI URL, not a second runner-injected copy.
    delete isolatedEnvironment.NODE_OPTIONS;
    const isolated = spawnSync(process.execPath, ["--import", PRELOAD.href, "--input-type=module", "-e", PROBE], {
      cwd: temporary,
      encoding: "utf8",
      env: isolatedEnvironment,
      timeout: 10_000,
      maxBuffer: 128 * 1024,
    });
    assert.equal(isolated.status, 0, isolated.stderr);
    assert.deepEqual(JSON.parse(isolated.stdout), {
      GIT_DIR: null,
      GIT_WORK_TREE: null,
      GIT_INDEX_FILE: null,
      GIT_COMMON_DIR: null,
      GIT_CONFIG_COUNT: null,
      GIT_CONFIG_KEY_0: null,
      GIT_CONFIG_VALUE_0: null,
      KEEP_ME: "preserved",
      configStatus: 1,
      configValue: "",
    });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
