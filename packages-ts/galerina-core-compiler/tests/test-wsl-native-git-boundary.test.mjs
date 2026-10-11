import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { cleanGitEnvironment, isWslEnvironment } = require("../../../scripts/lib/test-git-environment.cjs");
const IS_WSL = isWslEnvironment();

function checked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 20_000,
    ...options,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function windowsPath(linuxPath) {
  return checked("wslpath", ["-w", linuxPath]);
}

function powershellQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function githubRootFrom(repoRoot) {
  let current = resolve(repoRoot);
  while (basename(current).toLowerCase() !== "github") {
    const parent = dirname(current);
    assert.notEqual(parent, current, "the Galerina checkout must be below the GitHub projects directory");
    current = parent;
  }
  return current;
}

test("the actual test preload refuses an unsafe Windows-parent Git route", { skip: !IS_WSL }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "galerina-wsl-native-git-boundary-"));
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const agentsRoot = join(githubRootFrom(repoRoot), "AGENTS");
  const decoyRoot = join(temporary, "decoy");
  const probePath = join(temporary, "probe.mjs");
  const preloadPath = fileURLToPath(new URL("../scripts/isolate-test-git-environment.mjs", import.meta.url));
  const wslDistroName = process.env.WSL_DISTRO_NAME;

  mkdirSync(decoyRoot);
  try {
    const windowsDecoyRoot = windowsPath(decoyRoot);
    const windowsAgentsRoot = windowsPath(agentsRoot);
    const expectedAgentsRoot = windowsAgentsRoot.replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase();
    const decoyGitInit = spawnSync("git.exe", ["init", "--quiet", windowsDecoyRoot], {
      encoding: "utf8",
      timeout: 20_000,
      env: cleanGitEnvironment(process.env),
    });
    assert.equal(decoyGitInit.error, undefined, decoyGitInit.error?.message);
    assert.equal(decoyGitInit.status, 0, decoyGitInit.stderr || decoyGitInit.stdout);
    const windowsDecoyGitDir = `${windowsDecoyRoot.replace(/[\\/]$/u, "")}\\.git`;
    writeFileSync(probePath, [
      'import { spawnSync } from "node:child_process";',
      `const result = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsAgentsRoot)}, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 15000 });`,
      'if (result.error || result.status !== 0) { process.stderr.write(result.error?.message || result.stderr || "native Git failed"); process.exit(2); }',
      'process.stdout.write(result.stdout.trim().replaceAll("\\\\", "/").toLowerCase());',
      "",
    ].join("\n"));

    const runThroughWindowsParent = (withPreload, poisonParent, withoutDistroMarker = false) => {
      const childArgs = [
        ...(withoutDistroMarker ? ["/usr/bin/env", "-u", "WSL_DISTRO_NAME"] : []),
        process.execPath,
        ...(withPreload ? ["--import", preloadPath] : []),
        probePath,
      ];
      const childCommand = childArgs.map(powershellQuote).join(" ");
      const command = [
        "$ErrorActionPreference = 'Stop'",
        ...(poisonParent ? [
          `$env:GIT_DIR = ${powershellQuote(windowsDecoyGitDir)}`,
          `$env:GIT_WORK_TREE = ${powershellQuote(windowsDecoyRoot)}`,
        ] : []),
        "$env:WSLENV = ''",
        `& wsl.exe --distribution ${powershellQuote(wslDistroName)} --exec ${childCommand}`,
        "exit $LASTEXITCODE",
      ].join("; ");
      const result = spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command,
      ], {
        encoding: "utf8",
        timeout: 30_000,
        windowsHide: true,
        env: cleanGitEnvironment(process.env),
      });
      return { status: result.status, error: result.error?.message, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    };

    assert.equal(
      runThroughWindowsParent(false, true).stdout,
      windowsPath(decoyRoot).replaceAll("\\", "/").replace(/\/$/u, "").toLowerCase(),
      "the unprotected positive control must demonstrate the Windows-parent routing override",
    );
    const poisoned = runThroughWindowsParent(true, true);
    assert.notEqual(poisoned.status, 0, "the test preload must refuse before a native Git child can inherit poisoned Windows routing");
    assert.match(poisoned.stderr, /TEST-GIT-WINDOWS-PARENT-ENVIRONMENT-REFUSED/u);

    const poisonedWithoutMarker = runThroughWindowsParent(true, true, true);
    assert.notEqual(poisonedWithoutMarker.status, 0, "WSL detection must still refuse poisoned routing without WSL_DISTRO_NAME");
    assert.match(poisonedWithoutMarker.stderr, /TEST-GIT-WINDOWS-PARENT-ENVIRONMENT-REFUSED/u);

    const clean = runThroughWindowsParent(true, false);
    assert.equal(clean.status, 0, clean.error || clean.stderr || clean.stdout);
    assert.equal(clean.stdout, expectedAgentsRoot, "a clean Windows parent must retain normal native Git discovery");

    const cleanWithoutMarker = runThroughWindowsParent(true, false, true);
    assert.equal(cleanWithoutMarker.status, 0, cleanWithoutMarker.error || cleanWithoutMarker.stderr || cleanWithoutMarker.stdout);
    assert.equal(cleanWithoutMarker.stdout, expectedAgentsRoot, "marker-independent detection must retain clean native Git discovery");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("WSL test child environment keeps Linux Git usable and bridges only isolated settings", { skip: !IS_WSL }, () => {
  const { createWslTestGitEnvironment } = require("../../../scripts/lib/test-git-environment.cjs");
  assert.equal(typeof createWslTestGitEnvironment, "function");
  const env = createWslTestGitEnvironment({
    environment: {
      GIT_CONFIG_GLOBAL: "/tmp/isolated.gitconfig",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TEMPLATE_DIR: "/tmp/isolated-templates",
      WSLENV: "PATH/l:GIT_DIR/p:GIT_INDEX_FILE/w:GIT_CONFIG_GLOBAL/w:OTHER/p",
    },
    configPath: "/tmp/isolated.gitconfig",
    templateDirectory: "/tmp/isolated-templates",
  });

  assert.equal(env.GIT_DIR, undefined);
  assert.equal(env.GIT_INDEX_FILE, undefined);
  assert.equal(env.GIT_CONFIG, undefined);
  assert.equal(env.GIT_CONFIG_GLOBAL, "/tmp/isolated.gitconfig");
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(env.GIT_TEMPLATE_DIR, "/tmp/isolated-templates");
  const entries = env.WSLENV.split(":");
  assert.ok(entries.includes("PATH/l"));
  assert.ok(entries.includes("OTHER/p"));
  assert.ok(entries.some((entry) => entry.toUpperCase() === "GIT_CONFIG_GLOBAL/P"));
  assert.ok(entries.some((entry) => entry.toUpperCase() === "GIT_TEMPLATE_DIR/P"));
  assert.equal(entries.some((entry) => /^GIT_(?:DIR|INDEX_FILE)\//iu.test(entry)), false);
});
