import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { extractCodes, extractMbAliases } from "../lib/codes.mjs";

const FLOW = resolve("scripts/gen-flow-registry.mjs");
const HIST = resolve("scripts/check-code-history.mjs");

function write(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function run(script, root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    env,
  });
}

test("MB-06 aliases FUNGI-MB-06 and does not split FUNGI-MB-06", () => {
  const rows = extractMbAliases("packed 100 (MB-06). FUNGI-MB-06 stays canonical.");
  assert.deepEqual(rows, [{ alias: "MB-06", canonical: "FUNGI-MB-06" }]);
  const codes = extractCodes("post never packed 100 (MB-06)");
  assert.equal(codes.includes("FUNGI-MB-06"), true);
  assert.equal(codes.includes("MB-06"), false);
});

test("grammar accepts FUNGI-MB-NN", () => {
  const codes = extractCodes("canonical FUNGI-MB-19 in a comment");
  assert.equal(codes.includes("FUNGI-MB-19"), true);
});

function flowTree() {
  const root = mkdtempSync(join(tmpdir(), "crr-flow-"));
  write(root, "packages/fungi/memory/src/kernel.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\n");
  write(root, "packages/fungi/memory/src/auth-verify-route.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\n");
  return root;
}

test("flow registry allows unqualified duplicates in qualified form", () => {
  const root = flowTree();
  try {
    const r = run(FLOW, root, []);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const json = JSON.parse(readFileSync(join(root, "build/flow-registry/flow-registry.json"), "utf8"));
    assert.equal(json.total, 2);
    const names = json.flows.map((f) => f.qualified).sort();
    assert.deepEqual(names, ["auth-verify-route.mintOperation", "kernel.mintOperation"]);
    const check = run(FLOW, root, ["--check"]);
    assert.equal(check.status, 0, check.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutant unregistered flow goes RED then restore", () => {
  const root = flowTree();
  try {
    assert.equal(run(FLOW, root, []).status, 0);
    const path = join(root, "build/flow-registry/flow-registry.json");
    const orig = readFileSync(path, "utf8");
    const j = JSON.parse(orig);
    j.flows = j.flows.filter((f) => f.qualified !== "kernel.mintOperation");
    j.total = j.flows.length;
    writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
    const red = run(FLOW, root, ["--check"]);
    assert.notEqual(red.status, 0, "unregistered flow must refuse");
    writeFileSync(path, orig);
    assert.equal(run(FLOW, root, ["--check"]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutant qualified collision goes RED then restore", () => {
  const root = mkdtempSync(join(tmpdir(), "crr-coll-"));
  try {
    write(root, "packages/fungi/memory/src/kernel.fungi", [
      "pure flow mintOperation(x: Int) -> Int",
      "{",
      "  return 0",
      "}",
      "pure flow mintOperation(y: Int) -> Int",
      "{",
      "  return 1",
      "}",
      "",
    ].join("\n"));
    const red = run(FLOW, root, []);
    assert.notEqual(red.status, 0, "qualified collision must refuse");
    assert.match(red.stderr + red.stdout, /collision/);
    write(root, "packages/fungi/memory/src/kernel.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\n");
    assert.equal(run(FLOW, root, []).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function historyTree(records, entries, aliases = []) {
  const root = mkdtempSync(join(tmpdir(), "crr-hist-"));
  write(root, "scripts/baselines/code-history.json", JSON.stringify({
    schema: "galerina.code-history.v1",
    records,
  }, null, 2) + "\n");
  write(root, "build/code-registry/registry.json", JSON.stringify({
    generatedFrom: "fixture",
    total: entries.length,
    aliases,
    entries,
  }, null, 2) + "\n");
  return root;
}

test("mutant changed meaning of a registered code goes RED then restore", () => {
  const rec = { code: "FUNGI-MB-06", meaning: "listed cleanup after admit-to-handoff; post never packed 100", status: "active" };
  const entry = { code: "FUNGI-MB-06", status: "ref" };
  const root = historyTree([rec], [entry]);
  try {
    const script = HIST;
    write(root, "scripts/check-code-history.mjs", readFileSync(HIST));
    write(root, "scripts/lib/code-meanings.mjs", readFileSync(resolve("scripts/lib/code-meanings.mjs")));
    write(root, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs")));
    const ok = run(script, root, ["--check"]);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);
    const histPath = join(root, "scripts/baselines/code-history.json");
    const orig = readFileSync(histPath, "utf8");
    const j = JSON.parse(orig);
    j.records[0].meaning = "changed";
    writeFileSync(histPath, JSON.stringify(j, null, 2) + "\n");
    const red = run(script, root, ["--check"]);
    assert.notEqual(red.status, 0, "meaning change must refuse");
    writeFileSync(histPath, orig);
    assert.equal(run(script, root, ["--check"]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutant reuse of a retired code goes RED then restore", () => {
  const rec = { code: "FUNGI-NATIVE-001", meaning: meaningNative(), status: "retired" };
  const entryLive = { code: "FUNGI-NATIVE-001", status: "live" };
  const entryRef = { code: "FUNGI-NATIVE-001", status: "ref" };
  const root = historyTree([rec], [entryLive]);
  try {
    const script = HIST;
    write(root, "scripts/check-code-history.mjs", readFileSync(HIST));
    write(root, "scripts/lib/code-meanings.mjs", readFileSync(resolve("scripts/lib/code-meanings.mjs")));
    write(root, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs")));
    const red = run(script, root, ["--check"]);
    assert.notEqual(red.status, 0, "retired reuse must refuse");
    write(root, "build/code-registry/registry.json", JSON.stringify({
      generatedFrom: "fixture", total: 1, aliases: [], entries: [entryRef],
    }, null, 2) + "\n");
    const recActive = { ...rec, status: "active" };
    write(root, "scripts/baselines/code-history.json", JSON.stringify({
      schema: "galerina.code-history.v1", records: [recActive],
    }, null, 2) + "\n");
    assert.equal(run(script, root, ["--check"]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function meaningNative() {
  return "proposed mapping of Galerina_NATIVE_INPUT_INVALID; source status PROPOSED_NOT_ADMITTED";
}

test("mutant MB alias resolving to two canonicals goes RED then restore", () => {
  const rec = { code: "FUNGI-MB-06", meaning: "listed cleanup after admit-to-handoff; post never packed 100", status: "active" };
  const root = historyTree([rec], [{ code: "FUNGI-MB-06", status: "ref" }], [
    { alias: "MB-06", canonical: "FUNGI-MB-06", status: "alias" },
    { alias: "MB-06", canonical: "FUNGI-MB-07", status: "alias" },
  ]);
  try {
    write(root, "scripts/check-code-history.mjs", readFileSync(HIST));
    write(root, "scripts/lib/code-meanings.mjs", readFileSync(resolve("scripts/lib/code-meanings.mjs")));
    write(root, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs")));
    const red = run(HIST, root, ["--check"]);
    assert.notEqual(red.status, 0, "two canonicals must refuse");
    write(root, "build/code-registry/registry.json", JSON.stringify({
      generatedFrom: "fixture",
      total: 1,
      aliases: [{ alias: "MB-06", canonical: "FUNGI-MB-06", status: "alias" }],
      entries: [{ code: "FUNGI-MB-06", status: "ref" }],
    }, null, 2) + "\n");
    assert.equal(run(HIST, root, ["--check"]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
