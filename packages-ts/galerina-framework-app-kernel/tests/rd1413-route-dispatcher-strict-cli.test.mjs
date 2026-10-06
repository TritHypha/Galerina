import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const CLI = join(REPO, "packages-ts", "galerina-core", "compiler", "galerina.js");
const SOURCE = join(REPO, "examples", "auth-service", "routeDispatcherService.fungi");

test("the selected auth route dispatcher passes the real strict Fungi CLI", () => {
  const result = spawnSync(
    process.execPath,
    [CLI, "check", SOURCE, "--strict-types", "--strict-governance"],
    { cwd: REPO, encoding: "utf8", timeout: 30_000 },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.equal(result.error, undefined, `the strict Fungi CLI must start: ${output}`);
  assert.equal(result.signal, null, `the strict Fungi CLI must not be terminated: ${output}`);
  assert.equal(result.status, 0, `the selected route must compile without errors: ${output}`);
  assert.match(output, /Galerina check: 0 errors,/, "the CLI must report zero compiler errors");
  assert.doesNotMatch(output, /WARN-TYPE-004/, "the denial decision must use an explicit Bool check");
});
