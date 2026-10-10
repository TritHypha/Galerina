import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const dispatcherRel = "examples/auth-service/routeDispatcherService.fungi";
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.toUpperCase().startsWith("GIT_") &&
  !["NODE_OPTIONS", "NODE_PATH"].includes(key.toUpperCase())));

// Compatibility coverage only: the legacy CLI ignores the strict flags below.
// Root CLI strict enforcement is covered separately; no protected route executes here.
test("selected auth route dispatcher remains accepted by the legacy core checker", () => {
  const result = spawnSync(
    process.execPath,
    [
      "packages-ts/galerina-core/compiler/galerina.js",
      "check",
      dispatcherRel,
      "--strict-types",
      "--strict-governance",
    ],
    { cwd: repoRoot, env, encoding: "utf8", timeout: 15000, maxBuffer: 65536, windowsHide: true },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  const summary = output.match(/Galerina check:\s*(\d+)\s*errors,\s*(\d+)\s*warnings/i);
  assert.ok(summary, `missing Galerina check summary\n${output}`);
  assert.equal(Number(summary[1]), 0, output);
  assert.equal(Number(summary[2]), 0, output);
});
