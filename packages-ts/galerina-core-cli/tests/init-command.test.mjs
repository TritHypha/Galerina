import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runCli } from "../dist/cli.js";
import {
  FUNGI_CLI_INIT_001,
  FUNGI_CLI_INIT_002,
  FUNGI_CLI_INIT_003,
  FUNGI_CLI_INIT_005,
  initChildEnvironment,
  parseInitArgs,
  resolveNewAppScaffolder,
} from "../dist/init-command.js";

async function withTempDir(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-init-"));
  try {
    return await fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

describe("galerina init (thin alias of galerina new app)", () => {
  it("resolves the repo scaffolder from this package", async () => {
    const path = await resolveNewAppScaffolder();
    assert.ok(path.endsWith("galerina-new.mjs"));
    assert.ok(existsSync(path));
  });

  it("parses init <dir> and init app <dir> [--name]", () => {
    assert.deepEqual(parseInitArgs(["my-app"]), { ok: true, targetDir: "my-app" });
    assert.deepEqual(parseInitArgs(["app", "my-app", "--name", "orders"]), { ok: true, targetDir: "my-app", name: "orders" });
    assert.equal(parseInitArgs([]).ok, false);
    const empty = parseInitArgs([]);
    assert.equal(empty.ok, false);
    assert.equal(empty.result.error.code, FUNGI_CLI_INIT_001);
    const pkg = parseInitArgs(["package", "x"]);
    assert.equal(pkg.ok, false);
    assert.equal(pkg.result.error.code, FUNGI_CLI_INIT_001);
    const noname = parseInitArgs(["x", "--name"]);
    assert.equal(noname.ok, false);
    assert.equal(noname.result.error.code, FUNGI_CLI_INIT_002);
    const force = parseInitArgs(["x", "--force"]);
    assert.equal(force.ok, false);
    assert.equal(force.result.error.code, FUNGI_CLI_INIT_003);
  });

  it("scaffolds a deny-by-default app through the CLI", async () => {
    await withTempDir(async (base) => {
      const target = join(base, "alias-app");
      const result = await runCli(["init", target], base);
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, 0);
      assert.ok(existsSync(join(target, "src/App.fungi")));
      assert.ok(existsSync(join(target, "App.manifest")));
      const manifest = JSON.parse(readFileSync(join(target, "App.manifest"), "utf8"));
      assert.equal(manifest.name, "alias-app");
      assert.deepEqual(manifest.capabilities, []);
    });
  });

  it("refuses to overwrite an existing file (delegated to galerina-new)", async () => {
    await withTempDir(async (base) => {
      const target = join(base, "taken");
      mkdirSync(target);
      writeFileSync(join(target, "App.manifest"), "keep");
      const result = await runCli(["init", target], base);
      assert.equal(result.ok, false);
      assert.notEqual(result.code, 0);
      assert.equal(readFileSync(join(target, "App.manifest"), "utf8"), "keep");
      assert.equal(result.error.code, FUNGI_CLI_INIT_005);
      assert.equal(result.error.safeMessage.includes(base), false);
      assert.equal(result.message.includes(base), false);
    });
  });

  it("passes only allow-listed environment keys to the scaffolder", () => {
    const fakeToken = "example-token-not-real"; // gitleaks:allow
    const env = initChildEnvironment({ PATH: "p", SOURCE_DATE_EPOCH: "1700000000", GITHUB_TOKEN: fakeToken, NODE_OPTIONS: "--require x" });
    assert.deepEqual(env, { PATH: "p", SOURCE_DATE_EPOCH: "1700000000" });
  });
});
