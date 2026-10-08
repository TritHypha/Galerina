import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { runCli, commands, findCommand, FUNGI_CLI_001 } from "../dist/index.js";

// Owner decision 2026-10-06 17:28 BST: tools-benchmark stays an independent package;
// core-cli must not depend on it or expose `galerina benchmark`.

test("`galerina benchmark` is not a core-cli command", async () => {
  assert.equal(findCommand("benchmark"), undefined);
  assert.ok(!commands.some((c) => /benchmark/i.test(c.name) || /benchmark/i.test(c.description)));
  for (const args of [["benchmark"], ["benchmark", "--light"], ["benchmark", "--env", "production"]]) {
    const result = await runCli(args, process.cwd());
    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.error.code, FUNGI_CLI_001);
    assert.ok(!JSON.stringify(result).includes("benchmark"), "the unknown name is not echoed");
  }
});

test("help text does not list benchmark", async () => {
  for (const args of [[], ["help"], ["--help"]]) {
    const result = await runCli(args, process.cwd());
    assert.equal(result.ok, true);
    assert.ok(!/benchmark/i.test(result.message), result.message);
  }
});

test("core-cli does not depend on or import galerina-tools-benchmark", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
  assert.ok(!Object.keys(deps).some((name) => /benchmark/i.test(name)));
  assert.ok(!Object.values(deps).some((spec) => /benchmark/i.test(String(spec))));
  assert.ok(!/benchmark/i.test(JSON.stringify(pkg.scripts ?? {})));
  const srcDir = new URL("../src/", import.meta.url);
  const files = readdirSync(srcDir, { recursive: true }).filter((f) => String(f).endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(new URL(String(file).replaceAll("\\", "/"), srcDir), "utf8");
    assert.ok(!/galerina-tools-benchmark|@galerina\/tools-benchmark/.test(text), String(file));
  }
});