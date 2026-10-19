import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const RUNTIME_JS = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist", "wasm-runtime.js");
const COMPILER_JS = join(REPO, "packages-ts", "galerina-core-compiler", "dist", "index.js");

async function loadHostFactory(url) {
  const mod = await import(url);
  assert.equal(typeof mod.createHostRuntime, "function");
  return mod.createHostRuntime;
}

test("Q3 host import table is frozen host-only and has no fd_write", async () => {
  const createHostRuntime = await loadHostFactory(pathToFileURL(COMPILER_JS).href);
  const host = createHostRuntime();
  assert.equal(Object.isFrozen(host.imports), true);
  assert.equal(Object.isFrozen(host.imports.host), true);
  assert.deepEqual(Object.keys(host.imports), ["host"]);
  assert.equal(Object.prototype.hasOwnProperty.call(host.imports.host, "fd_write"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(host.imports, "wasi_snapshot_preview1"), false);
  let assignKind = "NO_THROW";
  try {
    host.imports.host.__print = () => 0;
  } catch (e) {
    assignKind = e && e.name ? String(e.name) : "THROW";
  }
  assert.equal(assignKind, "TypeError");
});

test("Q3 Math.floor is live at __range after instantiate; captured mutant goes RED", async () => {
  const createHostRuntime = await loadHostFactory(pathToFileURL(RUNTIME_JS).href);
  const origFloor = Math.floor;
  const host = createHostRuntime();
  host.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const before = host.imports.host.__range(0, 4);
  assert.deepEqual(host.readArray(before), [0, 1, 2, 3]);
  Math.floor = () => 0;
  let liveMsg = "NO_THROW";
  try {
    host.imports.host.__range(0, 4);
  } catch (e) {
    liveMsg = String(e && e.message ? e.message : e);
  } finally {
    Math.floor = origFloor;
  }
  assert.match(liveMsg, /cardinality exceeds guest memory/);

  const origJs = readFileSync(RUNTIME_JS, "utf8");
  const needle = "Math.floor(memory.buffer.byteLength / 4)";
  assert.equal(origJs.includes(needle), true, "dist __range uses live Math.floor");
  const captured = origJs.replace(
    needle,
    "(function(x){return x;})(memory.buffer.byteLength / 4)",
  );
  assert.notEqual(captured, origJs);
  const dir = mkdtempSync(join(tmpdir(), "q45-floor-"));
  const distSrc = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist");
  const names = readdirSync(distSrc);
  let ni = 0;
  while (ni < names.length) {
    const n = names[ni];
    copyFileSync(join(distSrc, n), join(dir, n));
    ni = ni + 1;
  }
  const copy = join(dir, "wasm-runtime.js");
  writeFileSync(copy, captured);
  try {
    const createCaptured = await loadHostFactory(pathToFileURL(copy).href);
    const host2 = createCaptured();
    host2.bindMemory(new WebAssembly.Memory({ initial: 1 }));
    Math.floor = () => 0;
    let capturedMsg = "NO_THROW";
    try {
      host2.imports.host.__range(0, 4);
    } catch (e) {
      capturedMsg = String(e && e.message ? e.message : e);
    } finally {
      Math.floor = origFloor;
    }
    assert.equal(capturedMsg, "NO_THROW", "captured floor must ignore live patch");
    assert.notEqual(capturedMsg, liveMsg, "mutant diverges from live Math.floor");
  } finally {
    Math.floor = origFloor;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Q3 String is live at __int_to_str; console.log is live at __print", async () => {
  const createHostRuntime = await loadHostFactory(pathToFileURL(RUNTIME_JS).href);
  const host = createHostRuntime();
  const origString = globalThis.String;
  const origLog = console.log;
  try {
    const before = host.imports.host.__int_to_str(42);
    assert.equal(host.readString(before), "42");
    globalThis.String = function patchedString() { return "MUTATED"; };
    const after = host.imports.host.__int_to_str(42);
    assert.equal(host.readString(after), "MUTATED");
    globalThis.String = origString;

    const h = host.internString("hello-q45");
    const seen = [];
    console.log = (...a) => { seen.push(a.map(String).join(" ")); };
    host.imports.host.__print(h);
    host.imports.host.__println(h);
    assert.deepEqual(seen, ["hello-q45", "hello-q45\n"]);
  } finally {
    globalThis.String = origString;
    console.log = origLog;
  }
});

test("Q3 Date.now is not read on galerina run host helpers; TextEncoder is live at grant compile", async () => {
  const createHostRuntime = await loadHostFactory(pathToFileURL(RUNTIME_JS).href);
  const origNow = Date.now;
  const OrigEnc = globalThis.TextEncoder;
  let dateHits = 0;
  Date.now = () => { dateHits += 1; return 1; };
  try {
    const host = createHostRuntime();
    const id = host.imports.host.__int_to_str(7);
    host.readString(id);
    host.imports.host.__range(0, 0);
    assert.equal(dateHits, 0);
  } finally {
    Date.now = origNow;
  }

  let encHits = 0;
  globalThis.TextEncoder = class {
    encode(v) {
      encHits += 1;
      return OrigEnc.prototype.encode.call(new OrigEnc(), v);
    }
  };
  try {
    const host2 = createHostRuntime();
    host2.imports.host.__int_to_str(1);
    assert.equal(encHits, 0, "echo-path helpers do not compile grant names");
    const host3 = createHostRuntime(undefined, {
      effectHandlers: {
        "audit.write": (a, b) => a + b,
      },
    });
    assert.equal(typeof host3.imports.host["audit.write"], "function");
    assert.equal(encHits > 0, true, "grant compile reads TextEncoder live");
    const afterCreate = encHits;
    host3.imports.host["audit.write"](1, 2);
    assert.equal(encHits, afterCreate, "audit.write call does not re-read TextEncoder");
  } finally {
    globalThis.TextEncoder = OrigEnc;
  }
});

test("Q3 .fungi cannot name a JS prototype: type form check-refuses; member form traps", () => {
  const dir = mkdtempSync(join(tmpdir(), "q45-proto-"));
  const typeFile = join(dir, "proto-type.fungi");
  const memberFile = join(dir, "proto-member.fungi");
  writeFileSync(
    typeFile,
    "@version 1\npure flow bad(x: Array.prototype) -> Int\ncontract {\n  intent { \"Type name Array.prototype.\" }\n}\n{\n  return 0\n}\n",
  );
  writeFileSync(
    memberFile,
    "@version 1\npure flow bad() -> Int\ncontract {\n  intent { \"Member Array.prototype as Int.\" }\n}\n{\n  let x: Int = Array.prototype\n  return x\n}\n",
  );
  try {
    const typeCheck = spawnSync(
      process.execPath,
      [GALERINA, "check", typeFile, "--strict-types", "--strict-governance"],
      { encoding: "utf8", cwd: REPO, timeout: 120000 },
    );
    const typeText = (typeCheck.stdout || "") + (typeCheck.stderr || "");
    assert.equal(typeCheck.status, 1, typeText);
    assert.match(typeText, /FUNGI-PARSE-001: Expected parameter name, got "\."/);

    const memberCheck = spawnSync(
      process.execPath,
      [GALERINA, "check", memberFile, "--strict-types", "--strict-governance"],
      { encoding: "utf8", cwd: REPO, timeout: 120000 },
    );
    const memberCheckText = (memberCheck.stdout || "") + (memberCheck.stderr || "");
    assert.equal(memberCheck.status, 0, memberCheckText);

    const memberBuild = spawnSync(
      process.execPath,
      [GALERINA, "build", memberFile],
      { encoding: "utf8", cwd: REPO, timeout: 120000 },
    );
    const memberBuildText = (memberBuild.stdout || "") + (memberBuild.stderr || "");
    assert.equal(memberBuild.status, 0, memberBuildText);
    const wat = readFileSync(join(REPO, "build", "proto-member.wat"), "utf8");
    assert.match(wat, /unresolved member: prototype/);
    assert.match(wat, /unreachable/);

    const memberRun = spawnSync(
      process.execPath,
      [GALERINA, "run", memberFile, "--invoke", "bad"],
      { encoding: "utf8", cwd: REPO, timeout: 120000 },
    );
    const memberRunText = (memberRun.stdout || "") + (memberRun.stderr || "");
    assert.equal(memberRun.status, 1, memberRunText);
    assert.match(memberRunText, /unreachable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
