import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { extractCodes, extractMbAliases } from "../lib/codes.mjs";

// crr-01 / crr-02 (Grok self-check fixes for M1 M2 M4 M6 M7 and unknown MB-NN). Synthetic fixtures only.
const FLOW = resolve("scripts/gen-flow-registry.mjs");
const HIST = resolve("scripts/check-code-history.mjs");
const CLEAN_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));

function write(root, rel, content) {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
function run(script, root, args) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 30000, env: CLEAN_ENV });
}
function git(root, args) {
  const r = spawnSync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf8", env: CLEAN_ENV });
  assert.equal(r.status, 0, r.stderr);
  return r;
}
const mb = (nn) => "MB-" + nn; // built at runtime so this file never carries an unregistered literal

test("MB-06 aliases FUNGI-MB-06 and does not split FUNGI-MB-06", () => {
  const rows = extractMbAliases("packed 100 (MB-06). FUNGI-MB-06 stays canonical.");
  assert.deepEqual(rows, [{ alias: "MB-06", canonical: "FUNGI-MB-06" }]);
  const codes = extractCodes("post never packed 100 (MB-06)");
  assert.equal(codes.includes("FUNGI-MB-06"), true);
  assert.equal(codes.includes("MB-06"), false);
});

test("grammar accepts FUNGI-MB-NN", () => {
  assert.equal(extractCodes("canonical FUNGI-MB-19 in a comment").includes("FUNGI-MB-19"), true);
});

test("MB alias table is closed: MB-03..MB-19 map, any other MB-NN is refused", () => {
  for (let n = 3; n <= 19; n += 1) {
    const nn = String(n).padStart(2, "0");
    assert.deepEqual(extractMbAliases("x " + mb(nn) + " y"), [{ alias: mb(nn), canonical: "FUNGI-" + mb(nn) }]);
  }
  for (const nn of ["00", "01", "02", "20", "99"]) {
    assert.throws(() => extractMbAliases("x " + mb(nn) + " y"), /REFUSED unregistered MB alias/);
    assert.throws(() => extractCodes("x " + mb(nn) + " y"), /REFUSED unregistered MB alias/);
  }
});

test("generator alias guard: one alias with two canonicals is refused", async () => {
  const { buildAliasRows } = await import("../lib/code-aliases.mjs");
  assert.deepEqual(buildAliasRows([{ code: "FUNGI-MB-06", aliases: ["MB-06"] }]), [{ alias: "MB-06", canonical: "FUNGI-MB-06", status: "alias" }]);
  assert.throws(() => buildAliasRows([
    { code: "FUNGI-MB-06", aliases: ["MB-06"] },
    { code: "FUNGI-" + mb("07"), aliases: ["MB-06"] },
  ]), /two canonicals/);
  const gen = readFileSync(resolve("scripts/gen-code-registry.mjs"), "utf8");
  assert.match(gen, /import \{ buildAliasRows \} from "\.\/lib\/code-aliases\.mjs";/);
  assert.match(gen, /aliasRows = buildAliasRows\(arr\);/);
});

function findById(node, id) {
  if (Array.isArray(node)) { for (const x of node) { const r = findById(x, id); if (r) return r; } return null; }
  if (node && typeof node === "object") {
    if (node.id === id && node.execution) return node;
    for (const v of Object.values(node)) { const r = findById(v, id); if (r) return r; }
  }
  return null;
}

test("phase-close gate pins code-registry, flow-registry and code-history as blocking --check", () => {
  const legacy = readFileSync(resolve("scripts/run-phase-close-legacy.mjs"), "utf8");
  for (const [id, script] of [["code-registry", "gen-code-registry"], ["flow-registry", "gen-flow-registry"], ["code-history", "check-code-history"]]) {
    assert.ok(legacy.includes(`run("${id}", "node", ["scripts/${script}.mjs", "--check"]);`), "legacy runner line for " + id);
    const cmd = findById(JSON.parse(readFileSync(resolve("governance/phase-close-commands.json"), "utf8")), id);
    assert.ok(cmd, "governance command " + id);
    assert.deepEqual(cmd.execution.command, ["node", `scripts/${script}.mjs`, "--check"]);
    assert.equal(cmd.outcomePolicy, "blocking");
    assert.equal(cmd.authorityClass, "blocking");
    assert.deepEqual(cmd.acceptedExitCodes, [0]);
    assert.ok(cmd.cadences.includes("changed") && cmd.cadences.includes("release"), "cadences " + id);
  }
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
    assert.deepEqual(json.flows.map((f) => f.qualified).sort(), ["auth-verify-route.mintOperation", "kernel.mintOperation"]);
    assert.equal(run(FLOW, root, ["--check"]).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    assert.notEqual(run(FLOW, root, ["--check"]).status, 0, "unregistered flow must refuse");
    writeFileSync(path, orig);
    assert.equal(run(FLOW, root, ["--check"]).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mutant qualified collision goes RED then restore", () => {
  const root = mkdtempSync(join(tmpdir(), "crr-coll-"));
  try {
    write(root, "packages/fungi/memory/src/kernel.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\npure flow mintOperation(y: Int) -> Int\n{\n  return 1\n}\n");
    const red = run(FLOW, root, []);
    assert.notEqual(red.status, 0, "qualified collision must refuse");
    assert.match(red.stderr + red.stdout, /collision/);
    write(root, "packages/fungi/memory/src/kernel.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\n");
    assert.equal(run(FLOW, root, []).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an unparsed flow declaration (indented, export, odd modifier) is refused, not silently unregistered", () => {
  for (const decl of ["  pure flow hidden(x: Int) -> Int", "\tflow hidden(x: Int) -> Int", "export flow hidden(x: Int) -> Int", "pure  flow hidden(x: Int) -> Int", "async flow hidden (x: Int) -> Int"]) {
    const root = flowTree();
    try {
      write(root, "packages/fungi/memory/src/kernel.fungi", "pure flow mintOperation(x: Int) -> Int\n{\n  return 0\n}\n" + decl + "\n{\n  return 0\n}\n");
      const red = run(FLOW, root, ["--check"]);
      assert.notEqual(red.status, 0, "must refuse: " + JSON.stringify(decl));
      assert.match(red.stderr, /unparsed flow declaration/);
      assert.notEqual(run(FLOW, root, []).status, 0, "regenerate must refuse too: " + JSON.stringify(decl));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test("flow registry scans subdirectories and ignores line comments", () => {
  const root = flowTree();
  try {
    write(root, "packages/fungi/memory/src/sub/deep.fungi", "// see flow mintOperation(x) in kernel\npure flow deepFlow(x: Int) -> Int\n{\n  return 0\n}\n");
    const r = run(FLOW, root, []);
    assert.equal(r.status, 0, r.stderr);
    const json = JSON.parse(readFileSync(join(root, "build/flow-registry/flow-registry.json"), "utf8"));
    assert.ok(json.flows.some((f) => f.qualified === "sub/deep.deepFlow" && f.file === "packages/fungi/memory/src/sub/deep.fungi"));
    assert.equal(json.total, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- code history (append-only against committed versions) ----
const A = "listed cleanup after admit-to-handoff; post never packed 100";
function meaningsModule(map) {
  return `const M = ${JSON.stringify(map)};\nexport function meaningOf(c) { return Object.hasOwn(M, c) ? M[c] : "UNKNOWN"; }\n`;
}
function histTree({ records, entries, meanings, aliases = [], init = true }) {
  const root = mkdtempSync(join(tmpdir(), "crr-hist-"));
  write(root, "scripts/check-code-history.mjs", readFileSync(HIST));
  write(root, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs")));
  write(root, "scripts/lib/code-meanings.mjs", meaningsModule(meanings));
  setHistory(root, records);
  setRegistry(root, entries, aliases);
  if (init) { git(root, ["init", "-q"]); git(root, ["add", "-A"]); git(root, ["commit", "-qm", "fixture base [skip ci]"]); }
  return root;
}
function setHistory(root, records) {
  write(root, "scripts/baselines/code-history.json", JSON.stringify({ schema: "galerina.code-history.v1", records }, null, 2) + "\n");
}
function setRegistry(root, entries, aliases = []) {
  write(root, "build/code-registry/registry.json", JSON.stringify({ generatedFrom: "fixture", total: entries.length, aliases, entries }, null, 2) + "\n");
}
const hist = (root) => run(join(root, "scripts/check-code-history.mjs"), root, ["--check"]);
const commitAll = (root) => { git(root, ["add", "-A"]); git(root, ["commit", "-qm", "fixture change [skip ci]"]); };
const base = () => ({
  records: [
    { code: "FUNGI-MB-06", meaning: A, status: "active" },
    { code: "FUNGI-MB-03", meaning: "UNKNOWN", status: "active" },
    { code: "FUNGI-NATIVE-001", meaning: "n1", status: "active" },
  ],
  entries: [{ code: "FUNGI-MB-06", status: "ref" }, { code: "FUNGI-MB-03", status: "ref" }, { code: "FUNGI-NATIVE-001", status: "ref" }],
  meanings: { "FUNGI-MB-06": A, "FUNGI-NATIVE-001": "n1" },
});

test("history baseline passes", () => {
  const root = histTree(base());
  try { const r = hist(root); assert.equal(r.status, 0, r.stderr + r.stdout); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("M1 coordinated meaning change (history + code-meanings together) is refused, uncommitted and committed", () => {
  const b = base();
  const root = histTree(b);
  try {
    setHistory(root, b.records.map((r) => r.code === "FUNGI-MB-06" ? { ...r, meaning: "MUTANT MEANING" } : r));
    write(root, "scripts/lib/code-meanings.mjs", meaningsModule({ ...b.meanings, "FUNGI-MB-06": "MUTANT MEANING" }));
    let red = hist(root);
    assert.equal(red.status, 1, red.stderr);
    assert.match(red.stderr, /meaning change FUNGI-MB-06 against committed/);
    commitAll(root);
    red = hist(root);
    assert.equal(red.status, 1, "committed coordinated change must still refuse");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("UNKNOWN meaning may gain its first real meaning once, then is frozen", () => {
  const b = base();
  const root = histTree(b);
  try {
    setHistory(root, b.records.map((r) => r.code === "FUNGI-MB-03" ? { ...r, meaning: "first meaning" } : r));
    write(root, "scripts/lib/code-meanings.mjs", meaningsModule({ ...b.meanings, "FUNGI-MB-03": "first meaning" }));
    let r = hist(root);
    assert.equal(r.status, 0, r.stderr);
    commitAll(root);
    setHistory(root, b.records.map((x) => x.code === "FUNGI-MB-03" ? { ...x, meaning: "second meaning" } : x));
    write(root, "scripts/lib/code-meanings.mjs", meaningsModule({ ...b.meanings, "FUNGI-MB-03": "second meaning" }));
    r = hist(root);
    assert.equal(r.status, 1, "second meaning must refuse");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("M2 retired code in use in the registry (any status but its dead tombstone) is refused", () => {
  for (const status of ["live", "inline", "ref", "referenced", "phantom", "unknown-status"]) {
    const b = base();
    b.records = b.records.map((r) => r.code === "FUNGI-NATIVE-001" ? { ...r, status: "retired" } : r);
    b.entries = b.entries.map((e) => e.code === "FUNGI-NATIVE-001" ? { ...e, status } : e);
    const root = histTree(b);
    try {
      const red = hist(root);
      assert.equal(red.status, 1, "status " + status);
      assert.match(red.stderr, /retired code in use in registry FUNGI-NATIVE-001/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  const b = base();
  b.records = b.records.map((r) => r.code === "FUNGI-NATIVE-001" ? { ...r, status: "retired" } : r);
  b.entries = b.entries.map((e) => e.code === "FUNGI-NATIVE-001" ? { ...e, status: "dead" } : e);
  const root = histTree(b);
  try { const r = hist(root); assert.equal(r.status, 0, "dead tombstone of a retired code is allowed: " + r.stderr); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("retired -> active after commit is refused", () => {
  const b = base();
  b.records = b.records.map((r) => r.code === "FUNGI-NATIVE-001" ? { ...r, status: "retired" } : r);
  b.entries = b.entries.filter((e) => e.code !== "FUNGI-NATIVE-001");
  const root = histTree(b);
  try {
    assert.equal(hist(root).status, 0);
    setHistory(root, b.records.map((r) => r.code === "FUNGI-NATIVE-001" ? { ...r, status: "active" } : r));
    const red = hist(root);
    assert.equal(red.status, 1);
    assert.match(red.stderr, /retired code revived FUNGI-NATIVE-001/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("deleting a committed history record is refused", () => {
  const b = base();
  b.entries = b.entries.filter((e) => e.code !== "FUNGI-NATIVE-001");
  const root = histTree(b);
  try {
    setHistory(root, b.records.filter((r) => r.code !== "FUNGI-NATIVE-001"));
    const red = hist(root);
    assert.equal(red.status, 1);
    assert.match(red.stderr, /deleted history record FUNGI-NATIVE-001/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("unknown status value and alias with two canonicals are refused", () => {
  let b = base();
  b.records = b.records.map((r) => r.code === "FUNGI-MB-03" ? { ...r, status: "reserved" } : r);
  let root = histTree({ ...b, init: false });
  try { assert.equal(hist(root).status, 1); } finally { rmSync(root, { recursive: true, force: true }); }
  b = base();
  root = histTree({ ...b, aliases: [{ alias: "MB-06", canonical: "FUNGI-MB-06" }, { alias: "MB-06", canonical: "FUNGI-" + mb("07") }] });
  try { const red = hist(root); assert.equal(red.status, 1); assert.match(red.stderr, /two canonicals/); } finally { rmSync(root, { recursive: true, force: true }); }
});

test("no git history means append-only is typed UNKNOWN (exit 2), never PASS", () => {
  const root = histTree({ ...base(), init: false });
  try { const r = hist(root); assert.equal(r.status, 2, r.stderr + r.stdout); assert.match(r.stderr, /UNKNOWN/); } finally { rmSync(root, { recursive: true, force: true }); }
});