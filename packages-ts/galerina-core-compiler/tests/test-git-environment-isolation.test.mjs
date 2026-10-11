import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { cleanGitEnvironment, createWslInteropGitEnvironment, isWslEnvironment } = require("../../../scripts/lib/test-git-environment.cjs");
const ISOLATION_MODULE = new URL(
  "../scripts/isolate-test-git-environment.mjs",
  import.meta.url,
).href;
const IS_WSL = process.platform === "linux"
  && /microsoft/iu.test(readFileSync("/proc/version", "utf8"));

test("WSL Git environment replaces config bridge entries without dropping unrelated mappings", () => {
  const configPath = join(tmpdir(), "isolated.gitconfig");
  const env = createWslInteropGitEnvironment({
    PATH: "preserved-path",
    WSLENV: "PATH/l:git_config_global/w:OTHER/p:GIT_CONFIG_NOSYSTEM/l:git_config_count/u:GIT_CONFIG_PARAMETERS/l:GIT_DIR/p:GIT_INDEX_FILE/w:GIT_WORK_TREE/u:Git_Config_Count/p",
    GIT_DIR: "poison-gitdir",
    GIT_INDEX_FILE: "poison-index",
    GIT_WORK_TREE: "poison-worktree",
    GIT_COMMON_DIR: "poison-common-dir",
    GIT_OBJECT_DIRECTORY: "poison-object-directory",
    GIT_TEMPLATE_DIR: "poison-template-dir",
    GIT_CONFIG_GLOBAL: "poison-config",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "codex.inherited",
    GIT_CONFIG_VALUE_0: "must-not-cross-the-interop-boundary",
    GIT_CONFIG_PARAMETERS: "must-not-cross-the-interop-boundary",
  }, configPath);

  assert.equal(env.PATH, "preserved-path");
  assert.equal(env.GIT_DIR, "");
  assert.equal(env.GIT_INDEX_FILE, "");
  assert.equal(env.GIT_WORK_TREE, "");
  assert.equal(env.GIT_COMMON_DIR, "");
  assert.equal(env.GIT_OBJECT_DIRECTORY, "");
  assert.equal(env.GIT_TEMPLATE_DIR, "");
  assert.equal(env.GIT_CONFIG_GLOBAL, configPath);
  assert.equal(env.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(env.GIT_CONFIG_COUNT, "0");
  assert.equal(env.GIT_CONFIG_KEY_0, "");
  assert.equal(env.GIT_CONFIG_VALUE_0, "");
  assert.equal(env.GIT_CONFIG_PARAMETERS, "");
  const wslEnvEntries = env.WSLENV.split(":");
  assert.deepEqual(wslEnvEntries.slice(0, 2), ["PATH/l", "OTHER/p"]);
  for (const key of [
    "GIT_CONFIG_GLOBAL/p",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_DIR",
    "GIT_INDEX_FILE",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_TEMPLATE_DIR",
  ]) {
    assert.equal(wslEnvEntries.filter((entry) => entry.toUpperCase() === key.toUpperCase()).length, 1, key);
  }
});

test("WSL detection does not depend on WSL_DISTRO_NAME", { skip: !IS_WSL }, () => {
  const original = process.env.WSL_DISTRO_NAME;
  try {
    delete process.env.WSL_DISTRO_NAME;
    assert.equal(isWslEnvironment(), true);
  } finally {
    if (original === undefined) delete process.env.WSL_DISTRO_NAME;
    else process.env.WSL_DISTRO_NAME = original;
  }
});

test("native Git receives the empty isolated global config across WSL interop", { skip: !IS_WSL }, () => {
  const configPath = fileURLToPath(new URL("../../../scripts/test-isolated.gitconfig", import.meta.url));
  const env = createWslInteropGitEnvironment(process.env, configPath);

  assert.equal(env.GIT_CONFIG_GLOBAL, configPath, "WSLENV path translation starts from the Linux path");
  assert.ok(env.WSLENV.split(":").some((entry) => entry.toUpperCase() === "GIT_CONFIG_GLOBAL/P"));
  assert.ok(env.WSLENV.split(":").some((entry) => entry.toUpperCase() === "GIT_CONFIG_NOSYSTEM"));
  const result = spawnSync("git.exe", ["config", "--global", "--list"], {
    encoding: "utf8",
    timeout: 15_000,
    env,
  });

  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "", "native Git must not see the Windows user's global configuration");
  assert.equal(result.stderr, "", "the translated config path must exist for native Git");
});

test("native Git does not inherit command config or repository routing from its Windows parent", { skip: !IS_WSL }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "galerina-windows-parent-git-config-"));
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  let routingWorktree;
  try {
  const helper = join(temporary, "probe.mjs");
  const wrapperDirectory = join(temporary, "native-git-wrapper");
  const wrapperPath = join(wrapperDirectory, "git.exe");
  const wrapperLog = join(temporary, "native-git-argv.log");
  mkdirSync(wrapperDirectory);
  routingWorktree = mkdtempSync(join(repoRoot, ".git-routing-decoy-"));
  const routingSentinel = "routing-decoy-only.txt";
  writeFileSync(join(routingWorktree, routingSentinel), "must never replace the real checkout input list");
  const routingRepo = spawnSync("git", ["init", "--quiet", routingWorktree], {
    encoding: "utf8",
    timeout: 15_000,
    env: cleanGitEnvironment(process.env),
  });
  assert.equal(routingRepo.error, undefined, routingRepo.error?.message);
  assert.equal(routingRepo.status, 0, routingRepo.stderr || routingRepo.stdout);
  const routingIndex = join(routingWorktree, ".git", "index");
  const routingAdd = spawnSync("git", ["-C", routingWorktree, "add", "--", routingSentinel], {
    encoding: "utf8",
    timeout: 15_000,
    env: cleanGitEnvironment(process.env),
  });
  assert.equal(routingAdd.error, undefined, routingAdd.error?.message);
  assert.equal(routingAdd.status, 0, routingAdd.stderr || routingAdd.stdout);
  const routingPaths = [routingWorktree, join(routingWorktree, ".git"), routingIndex].map((target) => {
    const result = spawnSync("wslpath", ["-w", target], { encoding: "utf8", timeout: 5_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return { linux: target, windows: result.stdout.trim() };
  });
  const configPath = fileURLToPath(new URL("../../../scripts/test-isolated.gitconfig", import.meta.url));
  const helperModule = fileURLToPath(new URL("../../../scripts/lib/test-git-environment.cjs", import.meta.url));
  const buildEvidenceModule = new URL("../scripts/write-build-evidence.mjs", import.meta.url).href;
  const worktreeGitFile = join(repoRoot, ".git");
  const worktreeGitMetadata = lstatSync(worktreeGitFile);
  assert.equal(worktreeGitMetadata.isFile(), true, "this integration control must run in a linked checkout with a .git pointer file");
  assert.match(readFileSync(worktreeGitFile, "utf8"), /^gitdir:\s*[A-Z]:[\\/]/imu);
  const windowsRepoRootResult = spawnSync("wslpath", ["-w", repoRoot], {
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(windowsRepoRootResult.error, undefined, windowsRepoRootResult.error?.message);
  assert.equal(windowsRepoRootResult.status, 0, windowsRepoRootResult.stderr || windowsRepoRootResult.stdout);
  const windowsRepoRoot = windowsRepoRootResult.stdout.trim();
  const templateControlRoot = join(routingWorktree, "template-control");
  mkdirSync(templateControlRoot);
  const windowsTemplateControlRootResult = spawnSync("wslpath", ["-w", templateControlRoot], { encoding: "utf8", timeout: 5_000 });
  assert.equal(windowsTemplateControlRootResult.error, undefined, windowsTemplateControlRootResult.error?.message);
  assert.equal(windowsTemplateControlRootResult.status, 0,
    windowsTemplateControlRootResult.stderr || windowsTemplateControlRootResult.stdout);
  const windowsTemplateControlRoot = windowsTemplateControlRootResult.stdout.trim().replaceAll("\\", "/");
  const wslDistroName = process.env.WSL_DISTRO_NAME;
  assert.equal(typeof wslDistroName, "string");
  assert.notEqual(wslDistroName.length, 0, "nested WSL interop must target the same distribution as the running test");
  const nativeGitPathResult = spawnSync("which", ["git.exe"], { encoding: "utf8", timeout: 5_000 });
  assert.equal(nativeGitPathResult.error, undefined, nativeGitPathResult.error?.message);
  assert.equal(nativeGitPathResult.status, 0, nativeGitPathResult.stderr || nativeGitPathResult.stdout);
  const nativeGitPath = nativeGitPathResult.stdout.trim();
  const windowsRoutingProbeCommand = "$keys=@('GIT_WORK_TREE','GIT_DIR','GIT_INDEX_FILE','GIT_COMMON_DIR','GIT_OBJECT_DIRECTORY','GIT_TEMPLATE_DIR');$result=@{};foreach($key in $keys){$result[$key]=[Environment]::GetEnvironmentVariable($key)};[Console]::Out.Write((ConvertTo-Json -InputObject $result -Compress))";
  const independentBaselineEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^GIT_/iu.test(name)),
  );
  const independentWindowsEnvironment = spawnSync("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsRoutingProbeCommand,
  ], {
    encoding: "utf8",
    timeout: 15_000,
    env: independentBaselineEnvironment,
  });
  assert.equal(independentWindowsEnvironment.error, undefined, independentWindowsEnvironment.error?.message);
  assert.equal(independentWindowsEnvironment.status, 0,
    independentWindowsEnvironment.stderr || independentWindowsEnvironment.stdout);
  assert.deepEqual(JSON.parse(independentWindowsEnvironment.stdout), {
    GIT_WORK_TREE: null,
    GIT_DIR: null,
    GIT_INDEX_FILE: null,
    GIT_COMMON_DIR: null,
    GIT_OBJECT_DIRECTORY: null,
    GIT_TEMPLATE_DIR: null,
  }, "the independent baseline must expose no effective Git override values inside a native Windows child");
  const independentBaseline = spawnSync(nativeGitPath, [
    "-C", windowsRepoRoot, "ls-files", "-z", "--",
    "packages-ts/galerina-core-compiler/src",
    "packages-ts/galerina-core-compiler/tests",
  ], {
    encoding: "utf8",
    timeout: 15_000,
    env: independentBaselineEnvironment,
  });
  assert.equal(independentBaseline.error, undefined, independentBaseline.error?.message);
  assert.equal(independentBaseline.status, 0, independentBaseline.stderr || independentBaseline.stdout);
  const independentExpectedPaths = independentBaseline.stdout.split("\0").filter(Boolean).sort();
  const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    wrapperPath,
    `#!/bin/sh\nprintf '__CALL_BEGIN__\\0' >> ${shellQuote(wrapperLog)}\nprintf '%s\\0' "$@" >> ${shellQuote(wrapperLog)}\nprintf '__CALL_END__\\0' >> ${shellQuote(wrapperLog)}\nexec ${shellQuote(nativeGitPath)} "$@"\n`,
  );
  chmodSync(wrapperPath, 0o755);
  const expectedInput = "packages-ts/galerina-core-compiler/src/index.ts";
  const helperSource = [
    'import { createRequire } from "node:module";',
    'import { spawnSync } from "node:child_process";',
    'import { existsSync, readFileSync, rmSync } from "node:fs";',
    'import { join } from "node:path";',
    `import { gitPaths } from ${JSON.stringify(buildEvidenceModule)};`,
    `const require = createRequire(${JSON.stringify(helper)});`,
    `const { createWslInteropGitEnvironment } = require(${JSON.stringify(helperModule)});`,
    'const inherited = spawnSync("git.exe", ["config", "--get", "codex.reviewprobe"], { encoding: "utf8", timeout: 15000 });',
    'const inheritedRouting = Object.fromEntries(["GIT_WORK_TREE", "GIT_DIR", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_TEMPLATE_DIR"].map((key) => [key, process.env[key] ?? null]));',
    `const windowsRoutingProbeCommand = ${JSON.stringify(windowsRoutingProbeCommand)};`,
    'const inspectWindowsRouting = (env) => spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsRoutingProbeCommand], { encoding: "utf8", timeout: 15000, env });',
    'const inheritedWindowsRouting = inspectWindowsRouting(process.env);',
    `const rawWindowsRoot = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsRepoRoot)}, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 15000 });`,
    `const rawWindowsGitDir = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsRepoRoot)}, "rev-parse", "--absolute-git-dir"], { encoding: "utf8", timeout: 15000 });`,
    `const rawWindowsIndexPaths = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsRepoRoot)}, "ls-files", "-z", "--", ${JSON.stringify(routingSentinel)}], { encoding: "utf8", timeout: 15000 });`,
    `const rawPaths = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsRepoRoot)}, "ls-files", "-z", "--", "packages-ts/galerina-core-compiler/src", "packages-ts/galerina-core-compiler/tests"], { encoding: "utf8", timeout: 15000 });`,
    `const env = createWslInteropGitEnvironment(process.env, ${JSON.stringify(configPath)});`,
    'const sanitizedRouting = Object.fromEntries(["GIT_WORK_TREE", "GIT_DIR", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_TEMPLATE_DIR"].map((key) => [key, env[key] ?? null]));',
    'const sanitizedWindowsRouting = inspectWindowsRouting(env);',
    `const windowsTemplateControlRoot = ${JSON.stringify(windowsTemplateControlRoot)};`,
    'let extraGitEffects = null;',
    'if (process.env.CONTROL_GIT_ENV_NAME === "GIT_COMMON_DIR") {',
    '  const raw = spawnSync("git.exe", ["-C", ' + JSON.stringify(windowsRepoRoot) + ', "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", timeout: 15000 });',
    '  const sanitized = spawnSync("git.exe", ["-C", ' + JSON.stringify(windowsRepoRoot) + ', "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", timeout: 15000, env });',
    '  extraGitEffects = { raw: { status: raw.status, signal: raw.signal, error: raw.error?.message, stdout: raw.stdout, stderr: raw.stderr }, sanitized: { status: sanitized.status, signal: sanitized.signal, error: sanitized.error?.message, stdout: sanitized.stdout, stderr: sanitized.stderr } };',
    '} else if (process.env.CONTROL_GIT_ENV_NAME === "GIT_OBJECT_DIRECTORY") {',
    '  const raw = spawnSync("git.exe", ["-C", ' + JSON.stringify(windowsRepoRoot) + ', "cat-file", "-t", "HEAD"], { encoding: "utf8", timeout: 15000 });',
    '  const sanitized = spawnSync("git.exe", ["-C", ' + JSON.stringify(windowsRepoRoot) + ', "cat-file", "-t", "HEAD"], { encoding: "utf8", timeout: 15000, env });',
    '  extraGitEffects = { raw: { status: raw.status, signal: raw.signal, error: raw.error?.message, stdout: raw.stdout, stderr: raw.stderr }, sanitized: { status: sanitized.status, signal: sanitized.signal, error: sanitized.error?.message, stdout: sanitized.stdout, stderr: sanitized.stderr } };',
    '} else if (process.env.CONTROL_GIT_ENV_NAME === "GIT_TEMPLATE_DIR") {',
    '  const controlRoot = `${windowsTemplateControlRoot}/native-git-template-${process.env.CONTROL_GIT_ENV_CASE}`;',
    '  const rawRepo = `${controlRoot}/raw`;',
    '  const sanitizedRepo = `${controlRoot}/sanitized`;',
    '  const raw = spawnSync("git.exe", ["init", "--quiet", rawRepo], { encoding: "utf8", timeout: 15000 });',
    '  const sanitized = spawnSync("git.exe", ["init", "--quiet", sanitizedRepo], { encoding: "utf8", timeout: 15000, env });',
    '  const rawLinux = spawnSync("wslpath", ["-u", rawRepo], { encoding: "utf8", timeout: 5000 });',
    '  const sanitizedLinux = spawnSync("wslpath", ["-u", sanitizedRepo], { encoding: "utf8", timeout: 5000 });',
    '  const rawLinuxPath = rawLinux.stdout?.trim() ?? "";',
    '  const sanitizedLinuxPath = sanitizedLinux.stdout?.trim() ?? "";',
    '  extraGitEffects = { raw: { status: raw.status, signal: raw.signal, error: raw.error?.message, stderr: raw.stderr, pathStatus: rawLinux.status, pathSignal: rawLinux.signal, pathError: rawLinux.error?.message, linuxPath: rawLinuxPath, gitdirExists: rawLinuxPath.length > 0 && existsSync(join(rawLinuxPath, ".git")), sentinel: rawLinuxPath.length > 0 && existsSync(join(rawLinuxPath, ".git", "template-sentinel")) }, sanitized: { status: sanitized.status, signal: sanitized.signal, error: sanitized.error?.message, stderr: sanitized.stderr, pathStatus: sanitizedLinux.status, pathSignal: sanitizedLinux.signal, pathError: sanitizedLinux.error?.message, linuxPath: sanitizedLinuxPath, gitdirExists: sanitizedLinuxPath.length > 0 && existsSync(join(sanitizedLinuxPath, ".git")), sentinel: sanitizedLinuxPath.length > 0 && existsSync(join(sanitizedLinuxPath, ".git", "template-sentinel")) } };',
    '}',
    'const isolated = spawnSync("git.exe", ["config", "--get", "codex.reviewprobe"], { encoding: "utf8", timeout: 15000, env });',
    `const cleanPaths = spawnSync("git.exe", ["-C", ${JSON.stringify(windowsRepoRoot)}, "ls-files", "-z", "--", "packages-ts/galerina-core-compiler/src", "packages-ts/galerina-core-compiler/tests"], { encoding: "utf8", timeout: 15000, env });`,
    `rmSync(${JSON.stringify(wrapperLog)}, { force: true });`,
    `const originalPath = process.env.PATH; process.env.PATH = ${JSON.stringify(wrapperDirectory)} + ":" + originalPath;`,
    `const productionPaths = gitPaths(${JSON.stringify(repoRoot)}, "packages-ts/galerina-core-compiler", ["ls-files"]);`,
    'const nativeGitCalls = []; let nativeGitCall = null; for (const argument of readFileSync(' + JSON.stringify(wrapperLog) + ', "utf8").split("\\0").filter(Boolean)) { if (argument === "__CALL_BEGIN__") nativeGitCall = []; else if (argument === "__CALL_END__") { if (nativeGitCall !== null) nativeGitCalls.push(nativeGitCall); nativeGitCall = null; } else if (nativeGitCall !== null) nativeGitCall.push(argument); }',
    'process.stdout.write(JSON.stringify({ parentConfig: Object.fromEntries(["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0", "GIT_CONFIG_PARAMETERS"].map((key) => [key, process.env[key] ?? null])), inheritedRouting, inheritedWindowsRouting: { status: inheritedWindowsRouting.status, stdout: inheritedWindowsRouting.stdout, stderr: inheritedWindowsRouting.stderr, error: inheritedWindowsRouting.error?.message }, sanitizedRouting, sanitizedWindowsRouting: { status: sanitizedWindowsRouting.status, stdout: sanitizedWindowsRouting.stdout, stderr: sanitizedWindowsRouting.stderr, error: sanitizedWindowsRouting.error?.message }, extraGitEffects, inherited: { status: inherited.status, stdout: inherited.stdout, stderr: inherited.stderr, error: inherited.error?.message }, rawWindowsRoot: { status: rawWindowsRoot.status, stdout: rawWindowsRoot.stdout, stderr: rawWindowsRoot.stderr, error: rawWindowsRoot.error?.message }, rawWindowsGitDir: { status: rawWindowsGitDir.status, stdout: rawWindowsGitDir.stdout, stderr: rawWindowsGitDir.stderr, error: rawWindowsGitDir.error?.message }, rawWindowsIndexPaths: { status: rawWindowsIndexPaths.status, stdout: rawWindowsIndexPaths.stdout, stderr: rawWindowsIndexPaths.stderr, error: rawWindowsIndexPaths.error?.message }, rawPaths: { status: rawPaths.status, stdout: rawPaths.stdout, stderr: rawPaths.stderr, error: rawPaths.error?.message }, isolated: { status: isolated.status, stdout: isolated.stdout, stderr: isolated.stderr, error: isolated.error?.message }, cleanPaths: { status: cleanPaths.status, stdout: cleanPaths.stdout, stderr: cleanPaths.stderr, error: cleanPaths.error?.message }, productionPaths, nativeGitCalls }));',
  ].join("\n") + "\n";
  writeFileSync(helper, helperSource);

  const quotePowerShell = (value) => `'${value.replaceAll("'", "''")}'`;
  const extendedGitPaths = [
    ["GIT_COMMON_DIR", routingPaths[1].linux],
    ["GIT_OBJECT_DIRECTORY", join(routingWorktree, "interop-object-directory")],
    ["GIT_TEMPLATE_DIR", join(routingWorktree, "interop-template-directory")],
  ].map(([key, linux]) => {
    if (key !== "GIT_COMMON_DIR") mkdirSync(linux);
    const result = spawnSync("wslpath", ["-w", linux], { encoding: "utf8", timeout: 5_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return { key, linux, windows: result.stdout.trim() };
  });
  const templateDirectory = extendedGitPaths.find(({ key }) => key === "GIT_TEMPLATE_DIR").linux;
  writeFileSync(join(templateDirectory, "template-sentinel"), "present only when the selected template is copied");

    for (const injection of [
      {
        setup: [
          "$env:GIT_CONFIG_COUNT = '1'",
          "$env:GIT_CONFIG_KEY_0 = 'codex.reviewprobe'",
          "$env:GIT_CONFIG_VALUE_0 = 'synthetic-count-sentinel'",
          "$env:GIT_CONFIG_PARAMETERS = ''",
        ],
        expected: "synthetic-count-sentinel",
      },
      {
        setup: [
          "$env:GIT_CONFIG_COUNT = '1'",
          "$env:GIT_CONFIG_KEY_0 = 'codex.reviewprobe'",
          "$env:GIT_CONFIG_VALUE_0 = 'synthetic-forwarded-count-sentinel'",
          "$env:GIT_CONFIG_PARAMETERS = ''",
          "$env:WSLENV = 'GIT_CONFIG_COUNT:GIT_CONFIG_KEY_0:GIT_CONFIG_VALUE_0:GIT_CONFIG_PARAMETERS'",
        ],
        expected: "synthetic-forwarded-count-sentinel",
        linuxConfig: {
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "codex.reviewprobe",
          GIT_CONFIG_VALUE_0: "synthetic-forwarded-count-sentinel",
          GIT_CONFIG_PARAMETERS: "",
        },
      },
      {
        setup: [
          `$env:GIT_WORK_TREE = ${quotePowerShell(routingPaths[0].windows)}`,
          "$env:WSLENV = 'GIT_WORK_TREE/p'",
        ],
        expectedRouting: { GIT_WORK_TREE: routingPaths[0].linux },
        expectedWindowsRouting: { GIT_WORK_TREE: routingPaths[0].windows },
        routingControl: { key: "GIT_WORK_TREE", expected: routingPaths[0].windows },
      },
      {
        setup: [
          `$env:GIT_DIR = ${quotePowerShell(routingPaths[1].windows)}`,
          "$env:WSLENV = 'GIT_DIR/p'",
        ],
        expectedRouting: { GIT_DIR: routingPaths[1].linux },
        expectedWindowsRouting: { GIT_DIR: routingPaths[1].windows },
        routingControl: { key: "GIT_DIR", expected: routingPaths[1].windows },
      },
      {
        setup: [
          `$env:GIT_INDEX_FILE = ${quotePowerShell(routingPaths[2].windows)}`,
          "$env:WSLENV = 'GIT_INDEX_FILE/p'",
        ],
        expectedRouting: { GIT_INDEX_FILE: routingPaths[2].linux },
        expectedWindowsRouting: { GIT_INDEX_FILE: routingPaths[2].windows },
        routingControl: { key: "GIT_INDEX_FILE", expected: routingSentinel },
        routingSentinel,
      },
      {
        setup: [
          `$env:GIT_WORK_TREE = ${quotePowerShell(routingPaths[0].windows)}`,
        ],
        noConfig: true,
        expectedWindowsRouting: { GIT_WORK_TREE: routingPaths[0].windows },
        windowsOnlyControl: { key: "GIT_WORK_TREE", expected: routingPaths[0].windows },
      },
      {
        setup: [
          `$env:GIT_DIR = ${quotePowerShell(routingPaths[1].windows)}`,
        ],
        noConfig: true,
        expectedWindowsRouting: { GIT_DIR: routingPaths[1].windows },
        windowsOnlyControl: { key: "GIT_DIR", expected: routingPaths[1].windows },
      },
      {
        setup: [
          `$env:GIT_INDEX_FILE = ${quotePowerShell(routingPaths[2].windows)}`,
        ],
        noConfig: true,
        expectedWindowsRouting: { GIT_INDEX_FILE: routingPaths[2].windows },
        windowsOnlyControl: { key: "GIT_INDEX_FILE", expected: routingSentinel },
        routingSentinel,
      },
      {
        setup: [
          `$env:GIT_INDEX_FILE = ${quotePowerShell(routingPaths[2].windows)}`,
          "$env:WSLENV = 'GIT_INDEX_FILE/pw'",
        ],
        noConfig: true,
        expectedWindowsRouting: {},
        windowsOnlyControl: { key: "GIT_INDEX_FILE", expected: null },
      },
      ...extendedGitPaths.map(({ key, linux, windows }) => ({
        setup: [
          `$env:${key} = ${quotePowerShell(windows)}`,
          `$env:WSLENV = '${key}/p'`,
        ],
        noConfig: true,
        expectedRouting: { [key]: linux },
        expectedWindowsRouting: { [key]: windows },
        interopEnvironmentOnly: true,
        effectControl: key,
        effectCase: `${key.toLowerCase()}-mapped`,
      })),
      ...extendedGitPaths.map(({ key, windows }) => ({
        setup: [`$env:${key} = ${quotePowerShell(windows)}`],
        noConfig: true,
        expectedWindowsRouting: { [key]: windows },
        effectControl: key,
        effectCase: `${key.toLowerCase()}-unmapped`,
      })),
      {
        setup: [
          "$env:GIT_CONFIG_COUNT = '0'",
          "$env:GIT_CONFIG_PARAMETERS = \"'codex.reviewprobe=synthetic-parameters-sentinel'\"",
        ],
        expected: "synthetic-parameters-sentinel",
      },
      {
        setup: [
          "$env:GIT_CONFIG_COUNT = '1'",
          "$env:GIT_CONFIG_KEY_0 = 'invalid key'",
          "$env:GIT_CONFIG_VALUE_0 = 'synthetic-invalid-config'",
          "$env:GIT_CONFIG_PARAMETERS = ''",
        ],
        expected: undefined,
      },
    ]) {
      const command = [
        "$ErrorActionPreference = 'Stop'",
        "$env:WSLENV = ''",
        ...injection.setup,
        ...(injection.effectControl ? [
          `$env:CONTROL_GIT_ENV_NAME = ${quotePowerShell(injection.effectControl)}`,
          `$env:CONTROL_GIT_ENV_CASE = ${quotePowerShell(injection.effectCase)}`,
          "$env:WSLENV = $env:WSLENV + ':CONTROL_GIT_ENV_NAME:CONTROL_GIT_ENV_CASE'",
        ] : []),
        `& wsl.exe --distribution ${quotePowerShell(wslDistroName)} --exec ${quotePowerShell(process.execPath)} ${quotePowerShell(helper)}`,
        "exit $LASTEXITCODE",
      ].join("; ");
      const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
        encoding: "utf8",
        timeout: 120_000,
        windowsHide: true,
      });

      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${result.stderr || result.stdout}\ncase=${JSON.stringify(injection)}`);
      const probe = JSON.parse(result.stdout.trim());
      assert.deepEqual(probe.parentConfig, injection.linuxConfig ?? {
        GIT_CONFIG_COUNT: null,
        GIT_CONFIG_KEY_0: null,
        GIT_CONFIG_VALUE_0: null,
        GIT_CONFIG_PARAMETERS: null,
      }, "the test must establish exactly which parent command-config variables reached WSL");
      if (injection.expectedRouting) {
        assert.deepEqual(probe.inheritedRouting, {
          GIT_WORK_TREE: injection.expectedRouting.GIT_WORK_TREE ?? null,
          GIT_DIR: injection.expectedRouting.GIT_DIR ?? null,
          GIT_INDEX_FILE: injection.expectedRouting.GIT_INDEX_FILE ?? null,
          GIT_COMMON_DIR: injection.expectedRouting.GIT_COMMON_DIR ?? null,
          GIT_OBJECT_DIRECTORY: injection.expectedRouting.GIT_OBJECT_DIRECTORY ?? null,
          GIT_TEMPLATE_DIR: injection.expectedRouting.GIT_TEMPLATE_DIR ?? null,
        },
          `the positive control must prove the selected Git override reached the Linux child: ${JSON.stringify(probe.inheritedRouting)}`);
        assert.deepEqual(probe.sanitizedRouting, {
          GIT_WORK_TREE: "",
          GIT_DIR: "",
          GIT_INDEX_FILE: "",
          GIT_COMMON_DIR: "",
          GIT_OBJECT_DIRECTORY: "",
          GIT_TEMPLATE_DIR: "",
        }, "the production WSL-to-native-Git environment must neutralize inherited Git overrides");
        if (injection.routingControl?.key === "GIT_WORK_TREE") {
          assert.equal(probe.rawWindowsRoot.status, 0, probe.rawWindowsRoot.stderr || probe.rawWindowsRoot.stdout);
          assert.equal(probe.rawWindowsRoot.stdout.trim().replaceAll("\\", "/").toLowerCase(),
            injection.routingControl.expected.replaceAll("\\", "/").toLowerCase(),
            "the unsafe native Windows Git control must prove GIT_WORK_TREE alone redirects the selected worktree");
        } else if (injection.routingControl?.key === "GIT_DIR") {
          assert.equal(probe.rawWindowsGitDir.status, 0, probe.rawWindowsGitDir.stderr || probe.rawWindowsGitDir.stdout);
          assert.equal(probe.rawWindowsGitDir.stdout.trim().replaceAll("\\", "/").toLowerCase(),
            injection.routingControl.expected.replaceAll("\\", "/").toLowerCase(),
            "the unsafe native Windows Git control must prove GIT_DIR alone selects the decoy repository");
        } else if (injection.routingControl?.key === "GIT_INDEX_FILE") {
          assert.equal(probe.rawWindowsIndexPaths.status, 0,
            probe.rawWindowsIndexPaths.stderr || probe.rawWindowsIndexPaths.stdout);
          assert.deepEqual(probe.rawWindowsIndexPaths.stdout.split("\0").filter(Boolean), [injection.routingSentinel],
            "the unsafe native-Git control must prove GIT_INDEX_FILE alone selects the decoy index");
        }
        if (injection.routingControl && injection.routingControl.key !== "GIT_WORK_TREE") {
          assert.equal(probe.rawPaths.status, 0, probe.rawPaths.stderr || probe.rawPaths.stdout);
        }
      } else {
        assert.deepEqual(probe.inheritedRouting, {
          GIT_WORK_TREE: null,
          GIT_DIR: null,
          GIT_INDEX_FILE: null,
          GIT_COMMON_DIR: null,
          GIT_OBJECT_DIRECTORY: null,
          GIT_TEMPLATE_DIR: null,
        }, "unrelated parent-config cases must not inject repository-routing variables");
      }
      assert.equal(probe.inheritedWindowsRouting.status, 0,
        probe.inheritedWindowsRouting.stderr || probe.inheritedWindowsRouting.stdout);
      assert.equal(probe.sanitizedWindowsRouting.status, 0,
        probe.sanitizedWindowsRouting.stderr || probe.sanitizedWindowsRouting.stdout);
      assert.deepEqual(JSON.parse(probe.inheritedWindowsRouting.stdout), {
        GIT_WORK_TREE: injection.expectedWindowsRouting?.GIT_WORK_TREE ?? null,
        GIT_DIR: injection.expectedWindowsRouting?.GIT_DIR ?? null,
        GIT_INDEX_FILE: injection.expectedWindowsRouting?.GIT_INDEX_FILE ?? null,
        GIT_COMMON_DIR: injection.expectedWindowsRouting?.GIT_COMMON_DIR ?? null,
        GIT_OBJECT_DIRECTORY: injection.expectedWindowsRouting?.GIT_OBJECT_DIRECTORY ?? null,
        GIT_TEMPLATE_DIR: injection.expectedWindowsRouting?.GIT_TEMPLATE_DIR ?? null,
      }, "the native Windows child must observe only the expected nonempty inherited Git override values");
      assert.deepEqual(JSON.parse(probe.sanitizedWindowsRouting.stdout), {
        GIT_WORK_TREE: null,
        GIT_DIR: null,
        GIT_INDEX_FILE: null,
        GIT_COMMON_DIR: null,
        GIT_OBJECT_DIRECTORY: null,
        GIT_TEMPLATE_DIR: null,
      }, "the native Windows child must expose no effective Git override values after sanitization");
      if (injection.effectControl === "GIT_COMMON_DIR") {
        const normalizePath = (value) => value.trim().replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
        assert.equal(probe.extraGitEffects.raw.status, 0, probe.extraGitEffects.raw.stderr || probe.extraGitEffects.raw.stdout);
        assert.equal(normalizePath(probe.extraGitEffects.raw.stdout),
          normalizePath(injection.expectedWindowsRouting.GIT_COMMON_DIR),
          "the unsanitized native Git control must use the injected common directory");
        assert.equal(probe.extraGitEffects.sanitized.status, 0,
          probe.extraGitEffects.sanitized.stderr || probe.extraGitEffects.sanitized.stdout);
        assert.notEqual(normalizePath(probe.extraGitEffects.sanitized.stdout),
          normalizePath(injection.expectedWindowsRouting.GIT_COMMON_DIR),
          "sanitized native Git must not use the injected common directory");
      } else if (injection.effectControl === "GIT_OBJECT_DIRECTORY") {
        assert.equal(probe.extraGitEffects.raw.error, undefined,
          probe.extraGitEffects.raw.error || "the unsanitized Git positive control must start");
        assert.equal(probe.extraGitEffects.raw.signal, null,
          "the unsanitized Git positive control must exit normally");
        assert.ok(Number.isInteger(probe.extraGitEffects.raw.status) && probe.extraGitEffects.raw.status > 0,
          "the empty injected object directory must produce an actual nonzero Git exit status");
        assert.match(probe.extraGitEffects.raw.stderr, /(?:not a valid object name|bad object|unable to read|missing|could not get object info)/iu,
          "the positive-control failure must be attributable to the missing HEAD object");
        assert.equal(probe.extraGitEffects.sanitized.error, undefined,
          probe.extraGitEffects.sanitized.error || "the sanitized Git control must start");
        assert.equal(probe.extraGitEffects.sanitized.signal, null,
          "the sanitized Git control must exit normally");
        assert.notEqual(probe.extraGitEffects.raw.status, 0,
          "the empty injected object directory must make the unsanitized HEAD lookup fail");
        assert.equal(probe.extraGitEffects.sanitized.status, 0,
          probe.extraGitEffects.sanitized.stderr || probe.extraGitEffects.sanitized.stdout);
        assert.equal(probe.extraGitEffects.sanitized.stdout.trim(), "commit",
          "the sanitized control must resolve the real HEAD object type");
      } else if (injection.effectControl === "GIT_TEMPLATE_DIR") {
        for (const [label, result] of Object.entries(probe.extraGitEffects)) {
          assert.equal(result.error, undefined, `${label} native Git init must start: ${result.error ?? ""}`);
          assert.equal(result.signal, null, `${label} native Git init must exit normally`);
          assert.equal(result.status, 0, `${label} native Git init must succeed: ${result.stderr ?? ""}`);
          assert.equal(result.pathError, undefined, `${label} wslpath conversion must start: ${result.pathError ?? ""}`);
          assert.equal(result.pathSignal, null, `${label} wslpath conversion must exit normally`);
          assert.equal(result.pathStatus, 0, `${label} wslpath conversion must succeed: ${result.linuxPath ?? ""}`);
          assert.notEqual(result.linuxPath, "", `${label} wslpath conversion must return a path`);
          assert.equal(result.gitdirExists, true, `${label} converted path must identify the initialized repository`);
        }
        assert.equal(probe.extraGitEffects.raw.status, 0, probe.extraGitEffects.raw.stderr);
        assert.equal(probe.extraGitEffects.raw.sentinel, true,
          "unsanitized native Git must copy the injected template sentinel");
        assert.equal(probe.extraGitEffects.sanitized.status, 0, probe.extraGitEffects.sanitized.stderr);
        assert.equal(probe.extraGitEffects.sanitized.sentinel, false,
          "sanitized native Git must not copy the injected template sentinel");
      }
      assert.equal(probe.inherited.error, undefined, probe.inherited.error);
      assert.equal(probe.rawPaths.error, undefined, probe.rawPaths.error);
      assert.equal(probe.isolated.error, undefined, probe.isolated.error);
      assert.equal(probe.cleanPaths.error, undefined, probe.cleanPaths.error);
      assert.equal(probe.cleanPaths.status, 0, probe.cleanPaths.stderr || probe.cleanPaths.stdout);
      const helperPaths = probe.cleanPaths.stdout.split("\0").filter(Boolean).sort();
      assert.deepEqual(helperPaths, independentExpectedPaths,
        "the helper's sanitized control must agree with a separately invoked clean native Windows Git baseline");
      const expectedPaths = independentExpectedPaths;
      assert.deepEqual(
        [...probe.productionPaths].sort(),
        expectedPaths,
        "build evidence must enumerate the complete tracked compiler input set under Windows-parent Git config",
      );
      assert.ok(expectedPaths.includes(expectedInput), "the independent clean baseline must include the known tracked compiler input");
      if (injection.expectedRouting) {
        if (injection.routingControl?.key === "GIT_INDEX_FILE") {
          assert.notDeepEqual(probe.rawPaths.stdout.split("\0").filter(Boolean).sort(), expectedPaths,
            "the unsanitized native-Git control must not be mistaken for the real checkout's compiler inputs");
        }
        if (!injection.interopEnvironmentOnly) {
          assert.equal(probe.inherited.status, 1, probe.inherited.stderr || probe.inherited.stdout);
          assert.equal(probe.inherited.stdout, "");
        }
      } else if (injection.expected === undefined && !injection.noConfig) {
        assert.equal(probe.inherited.status, 128, probe.inherited.stderr || probe.inherited.stdout);
        assert.equal(probe.rawPaths.status, 128, "the malformed parent config must break unisolated native Git path enumeration");
        assert.match(probe.inherited.stderr, /key does not contain a section: invalid key/iu);
        assert.match(probe.rawPaths.stderr, /key does not contain a section: invalid key/iu);
      } else {
        if (injection.noConfig) {
          assert.equal(probe.inherited.status, 1, probe.inherited.stderr || probe.inherited.stdout);
          assert.equal(probe.inherited.stdout, "");
        } else {
          assert.equal(probe.inherited.status, 0, probe.inherited.stderr || probe.inherited.stdout);
          assert.equal(probe.inherited.stdout.trim(), injection.expected, "positive control proves native interop inherited the Windows-parent config");
        }
        if (injection.windowsOnlyControl?.key === "GIT_WORK_TREE") {
          assert.equal(probe.rawWindowsRoot.status, 0,
            `${probe.rawWindowsRoot.stderr || probe.rawWindowsRoot.stdout}\ncase=${JSON.stringify(injection)}`);
          assert.equal(probe.rawWindowsRoot.stdout.trim().replaceAll("\\", "/").toLowerCase(),
            injection.windowsOnlyControl.expected.replaceAll("\\", "/").toLowerCase(),
            "a Windows-only parent override must be shown to affect an unsanitized native child");
        } else if (injection.windowsOnlyControl?.key === "GIT_DIR") {
          assert.equal(probe.rawPaths.status, 0,
            `${probe.rawPaths.stderr || probe.rawPaths.stdout}\ncase=${JSON.stringify(injection)}`);
          assert.equal(probe.rawWindowsGitDir.status, 0,
            `${probe.rawWindowsGitDir.stderr || probe.rawWindowsGitDir.stdout}\ncase=${JSON.stringify(injection)}`);
          assert.equal(probe.rawWindowsGitDir.stdout.trim().replaceAll("\\", "/").toLowerCase(),
            injection.windowsOnlyControl.expected.replaceAll("\\", "/").toLowerCase(),
            "an unmapped Windows-parent GIT_DIR must be shown to affect an unsanitized native child");
          assert.notEqual(probe.rawPaths.stdout, independentBaseline.stdout,
            "the unsanitized native-Git control must not enumerate the real checkout under an unmapped GIT_DIR");
        } else if (injection.windowsOnlyControl?.key === "GIT_INDEX_FILE") {
          assert.equal(probe.rawPaths.status, 0,
            `${probe.rawPaths.stderr || probe.rawPaths.stdout}\ncase=${JSON.stringify(injection)}`);
          assert.equal(probe.rawWindowsIndexPaths.status, 0,
            `${probe.rawWindowsIndexPaths.stderr || probe.rawWindowsIndexPaths.stdout}\ncase=${JSON.stringify(injection)}`);
          const paths = probe.rawWindowsIndexPaths.stdout.split("\0").filter(Boolean);
          if (injection.windowsOnlyControl.expected === null) {
            assert.deepEqual(paths, [],
              "a /pw-only Windows-parent override must have no effective routing effect in WSL or native Git");
          } else {
            assert.deepEqual(paths, [injection.windowsOnlyControl.expected],
              "an unmapped Windows-parent index override must be shown to affect an unsanitized native child");
            assert.notDeepEqual(probe.rawPaths.stdout.split("\0").filter(Boolean).sort(), expectedPaths,
              "the unsanitized native-Git control must not be mistaken for the real checkout's compiler inputs");
          }
        } else {
          if (!injection.noConfig) {
            assert.equal(probe.rawPaths.status, 0, probe.rawPaths.stderr || probe.rawPaths.stdout);
            assert.deepEqual(
              probe.rawPaths.stdout.split("\0").filter(Boolean).sort(),
              expectedPaths,
              "valid parent command config must not silently change the enumerated compiler inputs",
            );
          }
        }
      }
      assert.equal(probe.isolated.error, undefined, probe.isolated.error);
      assert.equal(probe.isolated.status, 1, probe.isolated.stderr || probe.isolated.stdout);
      assert.equal(probe.isolated.stdout, "", "the isolated invocation must reject command-scope config from the Windows parent");
      const productionEnumerations = probe.nativeGitCalls.filter((args) => args[2] === "ls-files");
      assert.deepEqual(productionEnumerations, [[
        "-C",
        windowsRepoRoot,
        "ls-files",
        "-z",
        "--",
        "packages-ts/galerina-core-compiler/src",
        "packages-ts/galerina-core-compiler/tests",
      ]], "each production gitPaths call must issue the exact native Git enumeration for this linked checkout");
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    if (routingWorktree) rmSync(routingWorktree, { recursive: true, force: true });
  }
});

test("every compiler test script installs the Git isolation preload", () => {
  const packageJson = JSON.parse(readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)),
    "utf8",
  ));
  const testScripts = Object.entries(packageJson.scripts)
    .filter(([name]) => name === "test" || name.startsWith("test:"));

  assert.ok(testScripts.length > 0, "compiler package declares test scripts");
  for (const [name, command] of testScripts) {
    assert.match(command, /node --test --import \.\/scripts\/isolate-test-git-environment\.mjs/u, name);
  }
});

test("test workers do not inherit Git repository-routing overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-test-git-env-"));
  const childTest = join(root, "environment.test.mjs");
  const keys = [
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_CONFIG",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_IMPLICIT_WORK_TREE",
    "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE",
    "GIT_NO_REPLACE_OBJECTS",
    "GIT_REPLACE_REF_BASE",
    "GIT_PREFIX",
    "GIT_SHALLOW_FILE",
    "GIT_COMMON_DIR",
    "GIT_NAMESPACE",
    "GIT_CEILING_DIRECTORIES",
    "GIT_DISCOVERY_ACROSS_FILESYSTEM",
  ];
  writeFileSync(childTest, [
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'import { existsSync, readFileSync } from "node:fs";',
    'import { join, resolve } from "node:path";',
    'import test from "node:test";',
    `test("local Git environment variables are absent", () => {`,
    `  for (const name of ${JSON.stringify(keys)}) {`,
    '    assert.equal(Object.keys(process.env).some((key) => key.toUpperCase() === name), false, name);',
    "  }",
    '  assert.equal(Object.keys(process.env).some((key) => /^GIT_CONFIG_(?:KEY|VALUE)_[0-9]+$/iu.test(key)), false);',
    '  assert.notEqual(process.env.GIT_CONFIG_GLOBAL, process.env.POISON_GLOBAL_CONFIG);',
    '  assert.notEqual(process.env.GIT_TEMPLATE_DIR, process.env.POISON_TEMPLATE_DIR);',
    '  assert.equal(existsSync(process.env.GIT_TEMPLATE_DIR), true);',
    '  assert.equal(readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8"), "");',
    '  assert.equal(process.env.GIT_CONFIG_SYSTEM, undefined);',
    '  assert.equal(process.env.GIT_CONFIG_NOSYSTEM, "1");',
    '  const initialized = spawnSync("git", ["init", "-q", process.env.FIXTURE_REPO], { encoding: "utf8" });',
    '  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);',
    '  assert.equal(existsSync(join(process.env.FIXTURE_REPO, ".git", "hooks", "pre-commit")), false, "hostile template hook must not be copied into fixture repository");',
    '  const inheritedTemplateSetting = spawnSync("git", ["config", "--local", "--get", "codex.template-sentinel"], { cwd: process.env.FIXTURE_REPO, encoding: "utf8" });',
    '  assert.equal(inheritedTemplateSetting.status, 1, "hostile template config must not be copied into fixture repository");',
    '  const discovered = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.env.FIXTURE_REPO, encoding: "utf8" });',
    '  assert.equal(discovered.status, 0, discovered.stderr || discovered.stdout);',
    '  assert.equal(resolve(discovered.stdout.trim()), resolve(process.env.FIXTURE_REPO), "Git must discover the intended fixture root");',
    "});",
  ].join("\n") + "\n");

  try {
    const hostileTemplate = join(root, "hostile-template");
    const hostileHooks = join(hostileTemplate, "hooks");
    const fixtureRepo = join(root, "fixture-repo");
    mkdirSync(hostileHooks, { recursive: true });
    mkdirSync(fixtureRepo, { recursive: true });
    writeFileSync(join(hostileHooks, "pre-commit"), "#!/bin/sh\necho hostile-template-hook\n");
    writeFileSync(join(hostileTemplate, "config"), "[codex]\n  template-sentinel = hostile\n");
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    for (const key of keys) env[key] = join(root, `poison-${key.toLowerCase()}`);
    env.GIT_CONFIG_GLOBAL = join(root, "poison-global-config");
    env.GIT_CONFIG_SYSTEM = join(root, "poison-system-config");
    env.GIT_CONFIG_NOSYSTEM = "0";
    env.GIT_CONFIG_KEY_0 = "codex.worker.poison";
    env.GIT_CONFIG_VALUE_0 = "ambient-config-entry";
    env.POISON_GLOBAL_CONFIG = env.GIT_CONFIG_GLOBAL;
    env.GIT_TEMPLATE_DIR = hostileTemplate;
    env.POISON_TEMPLATE_DIR = hostileTemplate;
    env.FIXTURE_REPO = fixtureRepo;
    const result = spawnSync(
      process.execPath,
      ["--test", "--import", ISOLATION_MODULE, childTest],
      { cwd: root, encoding: "utf8", env, timeout: 15_000, windowsHide: true },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /local Git environment variables are absent/u, JSON.stringify({
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error?.message,
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compiler build evidence ignores inherited Git redirection during direct package builds", () => {
  const temporary = mkdtempSync(join(tmpdir(), "galerina-build-git-redirection-"));
  const root = join(temporary, "target-repo");
  const decoyGitDir = join(temporary, "decoy.git");
  const expectedInput = "packages-ts/galerina-core-compiler/src/index.ts";
  mkdirSync(join(root, "packages-ts/galerina-core-compiler/src"), { recursive: true });
  mkdirSync(join(root, "packages-ts/galerina-core-compiler/tests"), { recursive: true });
  writeFileSync(join(root, expectedInput), "export {};\n");

  const targetInitialized = spawnSync("git", ["init", "-q", root], {
    cwd: temporary,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  assert.equal(targetInitialized.status, 0, targetInitialized.stderr || targetInitialized.stdout);
  const staged = spawnSync("git", ["-C", root, "add", "--", expectedInput], {
    cwd: temporary,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  assert.equal(staged.status, 0, staged.stderr || staged.stdout);
  const decoyInitialized = spawnSync("git", ["init", "--bare", "-q", decoyGitDir], {
    cwd: temporary,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  assert.equal(decoyInitialized.status, 0, decoyInitialized.stderr || decoyInitialized.stdout);

  const redirection = spawnSync("git", ["-C", root, "rev-parse", "--git-dir"], {
    cwd: temporary,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_DIR: decoyGitDir,
      GIT_WORK_TREE: temporary,
    },
  });
  assert.equal(redirection.status, 0, redirection.stderr || redirection.stdout);
  assert.match(redirection.stdout.trim(), /decoy\.git/iu,
    "the unisolated positive control must prove inherited GIT_DIR redirects Git");

  const moduleUrl = new URL("../scripts/write-build-evidence.mjs", import.meta.url).href;
  const source = [
    `import { gitPaths } from ${JSON.stringify(moduleUrl)};`,
    `const paths = gitPaths(${JSON.stringify(root)}, "packages-ts/galerina-core-compiler", ["ls-files"]);`,
    `process.stdout.write(JSON.stringify(paths));`,
  ].join("\n");

  try {
    const env = {
      ...process.env,
      GIT_DIR: decoyGitDir,
      GIT_WORK_TREE: temporary,
    };
    delete env.NODE_OPTIONS;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      cwd: root,
      encoding: "utf8",
      timeout: 15_000,
      windowsHide: true,
      env,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const paths = JSON.parse(result.stdout);
    assert.ok(
      paths.includes(expectedInput),
      "build evidence must enumerate the checkout's tracked compiler inputs, not the redirected decoy gitdir",
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("compiler build evidence resolves the current linked checkout through verified native Git metadata", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const expectedInput = "packages-ts/galerina-core-compiler/src/index.ts";
  const decoyGitDir = join(tmpdir(), `galerina-build-evidence-decoy-${process.pid}`);
  const moduleUrl = new URL("../scripts/write-build-evidence.mjs", import.meta.url).href;
  const source = [
    `import { gitPaths } from ${JSON.stringify(moduleUrl)};`,
    `const paths = gitPaths(${JSON.stringify(root)}, "packages-ts/galerina-core-compiler", ["ls-files"]);`,
    `process.stdout.write(JSON.stringify(paths));`,
  ].join("\n");
  const env = { ...process.env, GIT_DIR: decoyGitDir, GIT_WORK_TREE: tmpdir() };
  delete env.NODE_OPTIONS;
  const wslEnvEntries = (env.WSLENV ?? "")
    .split(":")
    .filter(Boolean)
    .filter((entry) => !["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"].includes(entry.split("/")[0].toUpperCase()));
  env.WSLENV = [...wslEnvEntries, "GIT_CONFIG_GLOBAL/p", "GIT_CONFIG_NOSYSTEM"].join(":");

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
    env,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const paths = JSON.parse(result.stdout);
  assert.ok(paths.includes(expectedInput),
    "the exact checkout's tracked compiler inputs must be enumerated despite inherited Git redirection");
});

test("separate compiler test processes use immutable disposable Git configs and scoped overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "galerina-test-git-workers-"));
  const worker = join(root, "worker.mjs");
  const firstResult = join(root, "first.json");
  const secondResult = join(root, "second.json");
  writeFileSync(worker, [
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'import { readFileSync, writeFileSync } from "node:fs";',
    'const mode = process.env.WORKER_MODE;',
    'const current = spawnSync("git", ["config", "--global", "--get", "codex.worker"], { encoding: "utf8" });',
    'assert.equal(current.status, 1, current.stderr || current.stdout);',
    'const configBefore = readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8");',
    'assert.equal(configBefore, "", "the worker global config starts empty and remains immutable");',
    'const value = mode === "first" ? "first-worker-value" : "second-worker-value";',
    'const scopedEnv = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "codex.worker", GIT_CONFIG_VALUE_0: value };',
    'const observed = spawnSync("git", ["config", "--get", "codex.worker"], { encoding: "utf8", env: scopedEnv });',
    'assert.equal(observed.status, 0, observed.stderr || observed.stdout);',
    'assert.equal(observed.stdout.trim(), value, "the override applies only to this Git process");',
    'const leakedEnv = { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "codex.worker", GIT_CONFIG_VALUE_0: "leaked-worker-value" };',
    'const leakPositiveControl = spawnSync("git", ["config", "--get", "codex.worker"], { encoding: "utf8", env: leakedEnv });',
    'assert.equal(leakPositiveControl.status, 0, leakPositiveControl.stderr || leakPositiveControl.stdout);',
    'assert.equal(leakPositiveControl.stdout.trim(), "leaked-worker-value", "the effective-config control must detect a command-scope environment leak");',
    'const globalOnlyLeakControl = spawnSync("git", ["config", "--global", "--get", "codex.worker"], { encoding: "utf8", env: leakedEnv });',
    'assert.equal(globalOnlyLeakControl.status, 1, "a --global lookup misses command-scope config and is not a valid leak check");',
    'const unscoped = spawnSync("git", ["config", "--get", "codex.worker"], { encoding: "utf8" });',
    'assert.equal(unscoped.status, 1, unscoped.stderr || unscoped.stdout, "the scoped override must not leak to the next Git process");',
    'const configAfter = readFileSync(process.env.GIT_CONFIG_GLOBAL, "utf8");',
    'assert.equal(configAfter, configBefore, "worker-specific config must not rewrite the owned global file");',
    'writeFileSync(process.env.RESULT_FILE, JSON.stringify({ config: process.env.GIT_CONFIG_GLOBAL, template: process.env.GIT_TEMPLATE_DIR, configBefore, configAfter }));',
    "",
  ].join("\n"));

  try {
    const results = [];
    for (const [mode, resultFile] of [["first", firstResult], ["second", secondResult]]) {
      const env = { ...process.env, WORKER_MODE: mode, RESULT_FILE: resultFile };
      delete env.NODE_TEST_CONTEXT;
      env.GIT_TEMPLATE_DIR = join(root, "poison-template");
      const result = spawnSync(
        process.execPath,
        ["--import", ISOLATION_MODULE, worker],
        { cwd: root, encoding: "utf8", env, timeout: 15_000, windowsHide: true },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      results.push(JSON.parse(readFileSync(resultFile, "utf8")));
    }

    assert.notEqual(results[0].config, results[1].config);
    assert.notEqual(results[0].template, results[1].template);
    for (const result of results) {
      assert.equal(existsSync(result.config), false, "worker global config is removed on process exit");
      assert.equal(existsSync(result.template), false, "worker template directory is removed on process exit");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
