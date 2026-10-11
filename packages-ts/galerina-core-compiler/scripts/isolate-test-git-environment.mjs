import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createIsolatedGitEnvironment,
  createWslTestGitEnvironment,
  assertWslWindowsGitEnvironmentClean,
  isGitEnvironmentVariable,
  isWslEnvironment,
} = require("../../../scripts/lib/test-git-environment.cjs");
const isolated = createIsolatedGitEnvironment(process.env);
const isWsl = isWslEnvironment();
const isolatedEnvironment = isWsl
  ? createWslTestGitEnvironment({
    environment: isolated.env,
    configPath: isolated.configPath,
    templateDirectory: isolated.templateDirectory,
  })
  : isolated.env;

for (const key of Object.keys(process.env)) {
  if (isGitEnvironmentVariable(key)) delete process.env[key];
}
for (const key of Object.keys(isolatedEnvironment)) {
  if (isGitEnvironmentVariable(key)) process.env[key] = isolatedEnvironment[key];
}
if (typeof isolatedEnvironment.WSLENV === "string") process.env.WSLENV = isolatedEnvironment.WSLENV;

process.on("exit", () => {
  const cleanup = isolated.cleanup();
  if (!cleanup.cleaned) {
    const retainedPath = cleanup.retainedPath || "unverified";
    process.stderr.write(
      `TEST-GIT-ENVIRONMENT-CLEANUP-REFUSED: ${cleanup.reason}; retained=${retainedPath}; last-known=${isolated.root}.\n`,
    );
    process.exitCode = 1;
  }
});

if (isWsl) {
  assertWslWindowsGitEnvironmentClean([
    "GIT_CONFIG_GLOBAL",
    "GIT_CONFIG_NOSYSTEM",
    "GIT_TEMPLATE_DIR",
  ]);
}
