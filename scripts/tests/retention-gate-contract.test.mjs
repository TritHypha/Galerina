import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { checkedChildResult, parseRetentionScanJson } from "../lib/retention-process.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "galerina-retention-contract-"));
const AUDIT = join(process.cwd(), "scripts", "audit-leak-static.mjs");
const WORKFLOW = join(process.cwd(), ".github", "workflows", "retention.yml");
after(() => rmSync(ROOT, { recursive: true, force: true }));

test("child result rejects a non-zero process even when output looks like a pass", () => {
  const result = checkedChildResult({ status: 2, signal: null, stdout: "1..1\\n# pass 1\\n", stderr: "" }, {
    name: "bounded-cache regression",
  });
  assert.equal(result.ok, false);
});

test("child result rejects timeout, signal and spawn errors", () => {
  assert.equal(checkedChildResult({ status: null, signal: "SIGTERM" }, { name: "probe" }).ok, false);
  assert.equal(checkedChildResult({ status: null, signal: null }, { name: "probe" }).ok, false);
  assert.equal(checkedChildResult({ status: null, error: new Error("ENOENT") }, { name: "probe" }).ok, false);
});

test("scanner JSON preserves every finding beyond the old 60-line report cap", () => {
  const source = Array.from({ length: 61 }, (_, i) =>
    `const cache${i} = new Map();\ncache${i}.set("key", ${i});\n`).join("");
  writeFileSync(join(ROOT, "many-caches.mjs"), source);
  const result = spawnSync(process.execPath, [AUDIT, "--scan", ROOT, "--corpus", ROOT, "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr);
  const parsed = parseRetentionScanJson(result.stdout);
  assert.equal(parsed.ok, true, parsed.reason);
  assert.equal(parsed.value.complete, true);
  assert.equal(parsed.value.truncated, false);
  assert.equal(parsed.value.scanned, 1);
  assert.equal(parsed.value.findings.length, 61);
  assert.equal(parsed.value.exitCode, 1);
});

test("scanner parser refuses incomplete or identity-less payloads", () => {
  const base = {
    schema: "galerina.audit-leak-static.v1",
    complete: true,
    truncated: false,
    scanned: 1,
    tally: {
      UNBOUNDED: 0,
      "TEST-ONLY-CLEAR": 0,
      "CLEAR-NEVER-CALLED": 0,
      capped: 0,
      bounded: 0,
      weak: 0,
      inert: 0,
    },
    findings: [],
    exitCode: 0,
  };
  assert.equal(parseRetentionScanJson(JSON.stringify({ ...base, complete: false })).ok, false);
  assert.equal(parseRetentionScanJson(JSON.stringify({ ...base, findings: [{ verdict: "UNBOUNDED" }] })).ok, false);
  assert.equal(parseRetentionScanJson(JSON.stringify({ ...base, exitCode: 1 })).ok, false);
  assert.equal(parseRetentionScanJson(JSON.stringify({
    ...base,
    tally: { ...base.tally, UNBOUNDED: 1 },
    exitCode: 1,
  })).ok, false);
  assert.equal(parseRetentionScanJson(JSON.stringify({
    ...base,
    tally: { ...base.tally, UNBOUNDED: 1 },
    findings: [{ verdict: "UNKNOWN", id: "cache", file: "cache.mjs", line: 1 }],
    exitCode: 1,
  })).ok, false);
});

test("retention workflow builds the governed closure before one enforcing gate", () => {
  const workflow = readFileSync(WORKFLOW, "utf8");
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/u);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/u);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/u);
  assert.match(workflow, /timeout-minutes:\s*\d+/u);
  const build = workflow.indexOf("scripts/build-core-chain.mjs --gate-subjects");
  const gate = workflow.indexOf("npm run audit:retention");
  assert.ok(build >= 0, "workflow must derive and build the compiler dependency closure");
  assert.ok(gate > build, "retention gate must run after the closure build");
  assert.doesNotMatch(workflow, /continue-on-error|ZTF_KB_READ_TOKEN/u);
});
