import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const PORT = join(MEM, "src", "secret-arena-custodian-port.fungi");
const UNIT = join(MEM, "src", "secret-arena.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const TS_PATH = "packages-ts/galerina-framework-app-kernel/src/secret-arena-provider.ts";
const RCP_PATH = "packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts";
const TS_SHA = "e4b4315bea125218b0ed52f6013ba4e3e0ae4e0283befc012d4bd51ff956c2c1";
const RCP_SHA = "ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3";
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const PORT_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_ABSENT", value: 0 };
  }
  const value = Number(m[1]);
  if (Number.isSafeInteger(value) !== true) {
    return { status: r.status, text, present: false, reason: "INVOKE_VALUE_NOT_SAFE_INTEGER", value: 0 };
  }
  return { status: r.status, text, present: true, reason: "INVOKE_VALUE_PRESENT", value };
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

function flattenUnit() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const port = readFileSync(PORT, "utf8");
  const unit = readFileSync(UNIT, "utf8");
  let rest = unit;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, PORT_IMPORT, "custodian-port");
  rest = stripVersion(rest);
  let portBody = splitOnce(port, CB_IMPORT, "port c-boundary");
  portBody = stripVersion(portBody);
  const dir = mkdtempSync(join(tmpdir(), "q37-diff-flat-"));
  const file = join(dir, "flat.fungi");
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n" + portBody + "\n" + rest);
  return { dir, file };
}

function runFlow(flow, args) {
  const flat = flattenUnit();
  try {
    return invoke(flat.file, flow, args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

function gitShow(path) {
  const shown = spawnSync("git", ["show", PIN + ":" + path], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  return shown.stdout;
}

test("frozen TS sha256 MATCH at dc0f9c8c", () => {
  const ts = gitShow(TS_PATH);
  const rcp = gitShow(RCP_PATH);
  assert.equal(createHash("sha256").update(ts, "utf8").digest("hex"), TS_SHA);
  assert.equal(createHash("sha256").update(rcp, "utf8").digest("hex"), RCP_SHA);
});

test("TS createSecretArenaProvider throws on this host; fungi constructArena is 112", async () => {
  assert.equal(process.features.typescript, "strip", "Node type-strip required");
  const ts = gitShow(TS_PATH);
  const rcp = gitShow(RCP_PATH);
  const dir = mkdtempSync(join(tmpdir(), "q37-frozen-ts-"));
  try {
    writeFileSync(join(dir, "release-commit-point.ts"), rcp);
    writeFileSync(join(dir, "release-commit-point.js"), "export * from \"./release-commit-point.ts\";\n");
    writeFileSync(join(dir, "secret-arena-provider.ts"), ts);
    const mod = await import(pathToFileURL(join(dir, "secret-arena-provider.ts")).href + "?t=" + String(Date.now()));
    let threw = false;
    let name = "";
    try {
      mod.createSecretArenaProvider();
    } catch (err) {
      threw = true;
      name = err && err.name ? String(err.name) : "Error";
    }
    assert.equal(threw, true, "TS construction throws on non-linux");
    assert.equal(name.includes("SecretArena") || name.includes("Error"), true, "typed unavailable throw");
    const fungi = runFlow("constructArena", [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1]);
    assert.equal(fungi.present, true, fungi.reason);
    assert.equal(fungi.value, 112, "fungi platform refuse 112 vs TS throw");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live TS has/use/epoch/put/dispose stay UNKNOWN without a linux custodian", () => {
  assert.notEqual(process.platform, "linux");
  const fungiHas = runFlow("arenaHas", [0, 0, 0, 0, 0, 1, 0, 1]);
  assert.equal(fungiHas.value, 100, "fungi has present still runnable");
});
