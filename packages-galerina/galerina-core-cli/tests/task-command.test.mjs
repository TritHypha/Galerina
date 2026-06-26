import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/index.js";

describe("Galerina task command", () => {
  it("lists and dry-runs tasks from tasks.spore", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "galerina-core-cli-task-"));

    await writeFile(
      join(cwd, "tasks.spore"),
      `task prepare {
  description "Prepare build inputs"
  effects [filesystem]
  permissions {
    read "./src"
  }
}

task build {
  depends [prepare]
  effects [compiler, reports]
  permissions {
    read "./src"
    write "./build"
  }
}
`,
      "utf8",
    );

    const list = await runCli(["task"], cwd);
    const dryRun = await runCli(["task", "build", "--dry-run"], cwd);

    assert.equal(list.ok, true);
    assert.match(list.details?.join("\n") ?? "", /prepare/);
    assert.equal(dryRun.ok, true);
    assert.match(dryRun.details?.join("\n") ?? "", /prepare -> build/);
    assert.match(dryRun.details?.join("\n") ?? "", /build: dry-run/);
    assert.match(dryRun.details?.join("\n") ?? "", /build[/\\]reports[/\\]task-report\.json/);

    const report = JSON.parse(
      await readFile(join(cwd, "build", "reports", "task-report.json"), "utf8"),
    );
    assert.equal(report.status, "dry-run");
    assert.deepEqual(report.dependencyOrder, ["prepare", "build"]);
  });

  it("reports missing task files safely", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "galerina-core-cli-task-missing-"));
    const result = await runCli(["task", "build"], cwd);

    assert.equal(result.ok, false);
    assert.match(result.message, /Task file not found/);
  });
});
