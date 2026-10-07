import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const dispatcherRel = "examples/auth-service/routeDispatcherService.fungi";

test("selected auth route dispatcher passes the current strict Fungi checks", () => {
  const result = spawnSync(
    process.execPath,
    [
      "packages-ts/galerina-core/compiler/galerina.js",
      "check",
      dispatcherRel,
      "--strict-types",
      "--strict-governance",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  assert.equal(result.status, 0, output);
  const summary = output.match(/Galerina check:\s*(\d+)\s*errors,\s*(\d+)\s*warnings/i);
  assert.ok(summary, `missing Galerina check summary\n${output}`);
  assert.equal(Number(summary[1]), 0, output);
  assert.equal(Number(summary[2]), 0, output);
});
