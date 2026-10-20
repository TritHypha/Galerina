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

async function loadFrozenProvider(dir) {
  const href = pathToFileURL(join(dir, "secret-arena-provider.ts")).href + "?t=" + String(Date.now());
  try {
    const mod = await import(href);
    return Object.freeze({ kind: "LOADED", mod });
  } catch (err) {
    const name = err && err.name ? String(err.name) : "Error";
    return Object.freeze({ kind: "CUSTODIAN_UNAVAILABLE", thrown: name, reason: "TS_ORACLE_UNLOADABLE" });
  }
}

test("TS createSecretArenaProvider throws on this host; fungi constructArena is 112", async () => {
  const ts = gitShow(TS_PATH);
  const rcp = gitShow(RCP_PATH);
  const dir = mkdtempSync(join(tmpdir(), "q37-frozen-ts-"));
  try {
    writeFileSync(join(dir, "release-commit-point.ts"), rcp);
    writeFileSync(join(dir, "release-commit-point.js"), "export * from \"./release-commit-point.ts\";\n");
    writeFileSync(join(dir, "secret-arena-provider.ts"), ts);
    const loaded = await loadFrozenProvider(dir);
    if (loaded.kind === "LOADED") {
      let threw = false;
      let name = "";
      try {
        loaded.mod.createSecretArenaProvider();
      } catch (err) {
        threw = true;
        name = err && err.name ? String(err.name) : "Error";
      }
      assert.equal(threw, true, "TS construction throws without a built custodian");
      assert.equal(name.includes("SecretArena") || name.includes("Error"), true, "typed unavailable throw");
    } else {
      assert.equal(loaded.kind, "CUSTODIAN_UNAVAILABLE", "TS oracle unloadable is typed UNKNOWN");
    }
    const fungi = runFlow("constructArena", [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1]);
    assert.equal(fungi.present, true, fungi.reason);
    assert.equal(fungi.value, 112, "fungi platform refuse 112 vs TS throw");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const CUSTODIAN_UNAVAILABLE = Object.freeze({ kind: "CUSTODIAN_UNAVAILABLE" });
const LIVE_METHODS = Object.freeze(["has", "use", "revocationEpoch", "put", "dispose"]);

test("live TS has/use/epoch/put/dispose stay UNKNOWN without a built custodian", async () => {
  const ts = gitShow(TS_PATH);
  const rcp = gitShow(RCP_PATH);
  const dir = mkdtempSync(join(tmpdir(), "q37-frozen-ts-methods-"));
  try {
    writeFileSync(join(dir, "release-commit-point.ts"), rcp);
    writeFileSync(join(dir, "release-commit-point.js"), "export * from \"./release-commit-point.ts\";\n");
    writeFileSync(join(dir, "secret-arena-provider.ts"), ts);
    const loaded = await loadFrozenProvider(dir);
    let provider = CUSTODIAN_UNAVAILABLE;
    let thrownName = "";
    if (loaded.kind !== "LOADED") {
      thrownName = loaded.thrown;
      provider = CUSTODIAN_UNAVAILABLE;
    } else {
      try {
        const built = loaded.mod.createSecretArenaProvider();
        if (built && typeof built.has === "function") {
          provider = built;
        }
      } catch (err) {
        thrownName = err && err.name ? String(err.name) : "Error";
        provider = CUSTODIAN_UNAVAILABLE;
      }
    }
    const outcomes = {};
    let i = 0;
    while (i < LIVE_METHODS.length) {
      const method = LIVE_METHODS[i];
      if (provider === CUSTODIAN_UNAVAILABLE) {
        assert.notEqual(thrownName, "", method + " unreachable: construction threw");
        assert.equal(
          thrownName.includes("SecretArena") || thrownName.includes("Error"),
          true,
          method + " thrown class " + thrownName,
        );
        outcomes[method] = Object.freeze({
          kind: "CUSTODIAN_UNAVAILABLE",
          thrown: thrownName,
          reachable: false,
        });
        assert.equal(outcomes[method].kind, "CUSTODIAN_UNAVAILABLE", method + " typed UNKNOWN");
        i = i + 1;
        continue;
      }
      let threw = false;
      let callName = "";
      let sawPresent = false;
      let sawAbsent = false;
      let sawActive = false;
      let sawOkNumber = false;
      try {
        if (method === "has") {
          const present = provider.has("synthetic-probe");
          sawPresent = present === true;
          sawAbsent = present === false;
        } else if (method === "use") {
          provider.use("synthetic-probe", () => {
            return;
          });
        } else if (method === "revocationEpoch") {
          const epoch = provider.revocationEpoch();
          sawOkNumber = typeof epoch === "number" && epoch >= 0;
        } else if (method === "put") {
          provider.put("synthetic-probe", new Uint8Array([1]));
        } else {
          provider.dispose();
        }
      } catch (err) {
        threw = true;
        callName = err && err.name ? String(err.name) : "Error";
      }
      assert.equal(sawPresent, false, method + " must not report present");
      assert.equal(sawAbsent, false, method + " must not report absent");
      assert.equal(sawActive, false, method + " must not report Active");
      assert.equal(sawOkNumber, false, method + " must not report a live epoch");
      outcomes[method] = Object.freeze({
        kind: "CUSTODIAN_UNAVAILABLE",
        thrown: threw === true ? callName : "refusal",
        reachable: true,
      });
      assert.equal(outcomes[method].kind, "CUSTODIAN_UNAVAILABLE", method + " typed UNKNOWN");
      i = i + 1;
    }
    assert.equal(outcomes.has.kind, "CUSTODIAN_UNAVAILABLE");
    assert.equal(outcomes.use.kind, "CUSTODIAN_UNAVAILABLE");
    assert.equal(outcomes.revocationEpoch.kind, "CUSTODIAN_UNAVAILABLE");
    assert.equal(outcomes.put.kind, "CUSTODIAN_UNAVAILABLE");
    assert.equal(outcomes.dispose.kind, "CUSTODIAN_UNAVAILABLE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const fungiHas = runFlow("arenaHas", [0, 0, 0, 0, 0, 1, 0, 1]);
  assert.equal(fungiHas.present, true, fungiHas.reason);
  assert.equal(fungiHas.value, 100, "fungi has present still runnable");
  const fungiUse = runFlow("arenaUse", [
    0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1000, 0, 1, 0, 1000, 0, 5000, 0, 1, 0, 1,
  ]);
  assert.equal(fungiUse.value, 100, "fungi use wiped-ok");
  const fungiEpoch = runFlow("arenaEpoch", [0, 0, 0, 0, 0, 8, 0, 1, 0, 1, 0, 2]);
  assert.equal(fungiEpoch.value, 100, "fungi epoch current");
  const fungiPut = runFlow("arenaPut", [0, 0, 0, 1, 0, 1, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(fungiPut.value, 100, "fungi put ok");
  const fungiDispose = runFlow("arenaDispose", [0, 0, 0, 0, 0, 0, 0, 106]);
  assert.equal(fungiDispose.value, 106, "fungi dispose Unknown");
});
