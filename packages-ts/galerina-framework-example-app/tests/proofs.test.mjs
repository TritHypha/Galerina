// Contract-driven proofs drift check: the committed proofs/*.obligations.tap must equal what the
// compiler derives from each flow's contract today. A new effect or capability must regenerate them
// (node ../../galerina.mjs generate tests <flow> --tap). Fails closed if the compiler is unavailable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("..", import.meta.url));
const CLI = fileURLToPath(new URL("../../../galerina.mjs", import.meta.url));
const PAIRS = [
  ["src/App.fungi", "proofs/App.obligations.tap"],
  ["src/flows/greeting.fungi", "proofs/greeting.obligations.tap"],
];

for (const [flow, committed] of PAIRS) {
  test(`committed proofs match the contract of ${flow}`, () => {
    const r = spawnSync(process.execPath, [CLI, "generate", "tests", flow, "--tap"], { cwd: APP, encoding: "utf8", shell: false });
    assert.equal(r.status, 0, `generator must run (fail-closed): ${r.stderr}`);
    const out = r.stdout.replace(/\r\n/g, "\n");
    const at = out.indexOf("TAP version 13");
    assert.ok(at >= 0, "generator must emit a TAP plan");
    assert.equal(out.slice(at), readFileSync(new URL(`../${committed}`, import.meta.url), "utf8").replace(/\r\n/g, "\n"));
  });
}
