import { spawnSync, spawn } from "node:child_process";
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
const ECHO = join(HERE, "echo.fungi");
const COMPILER_JS = join(REPO, "packages-ts", "galerina-core-compiler", "dist", "index.js");
const FROZEN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const AUTH = "packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts";
const API = "packages-ts/galerina-framework-api-server/src/index.ts";

function gitShow(path) {
  const r = spawnSync("git", ["show", FROZEN + ":" + path], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
  assert.equal(r.status, 0, path + " " + (r.stderr || ""));
  return r.stdout || "";
}

test("Q1 WASI fd_write is absent from galerina run host and echo wasm", async () => {
  const galerina = readFileSync(GALERINA, "utf8");
  assert.equal(galerina.includes("fd_write"), false);
  assert.equal(galerina.includes("wasi_snapshot_preview1"), false);
  const runtime = readFileSync(join(REPO, "packages-ts", "galerina-core-runtime-wasm", "src", "wasm-runtime.ts"), "utf8");
  assert.equal(runtime.includes("fd_write"), false);
  assert.equal(runtime.includes("wasi_snapshot_preview1"), false);

  const mod = await import(pathToFileURL(COMPILER_JS).href);
  const host = mod.createHostRuntime();
  assert.deepEqual(Object.keys(host.imports), ["host"]);
  assert.equal(Object.prototype.hasOwnProperty.call(host.imports.host, "fd_write"), false);

  const build = spawnSync(process.execPath, [GALERINA, "build", ECHO], {
    encoding: "utf8", cwd: REPO, timeout: 120000,
  });
  const buildText = (build.stdout || "") + (build.stderr || "");
  assert.equal(build.status, 0, buildText);
  const wat = readFileSync(join(REPO, "build", "echo.wat"), "utf8");
  assert.equal(wat.includes("fd_write"), false);
  assert.equal(wat.includes("wasi"), false);
  assert.equal(wat.includes("import"), false);
  assert.match(wat, /\(export "echo"/);
});

test("Q1 galerina run --invoke first-leave is console.log of the return", () => {
  const src = readFileSync(GALERINA, "utf8");
  assert.match(src, /const rawOutput = fn\(\.\.\.args\);/);
  assert.match(src, /console\.log\(formatRunOutput\(rawOutput, declaredReturn\)\);/);
  const r = spawnSync(process.execPath, [GALERINA, "run", ECHO, "--invoke", "echo", "1"], {
    encoding: "utf8", cwd: REPO, timeout: 120000,
  });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
  assert.equal((r.stdout || "").trim(), "1");
});

test("Q1 host.__print first-leave is outputSink console.log when no observer", async () => {
  const runtime = readFileSync(join(REPO, "packages-ts", "galerina-core-runtime-wasm", "src", "wasm-runtime.ts"), "utf8");
  assert.equal(runtime.includes("else console.log(s);"), true);
  assert.equal(runtime.includes("outputSink(strings[h] ?? \"\")"), true);
  assert.equal(runtime.includes("__print:"), true);
  const mod = await import(pathToFileURL(COMPILER_JS).href);
  const origLog = console.log;
  const seen = [];
  console.log = (...a) => { seen.push(a.map(String).join(" ")); };
  try {
    const host = mod.createHostRuntime();
    const h = host.internString("pre-begin-q45");
    host.imports.host.__print(h);
    assert.deepEqual(seen, ["pre-begin-q45"]);
  } finally {
    console.log = origLog;
  }
});

test("Q1 Node console.log with newline is visible on a pipe before process exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "q45-stdio-"));
  const childSrc = join(dir, "child.mjs");
  writeFileSync(childSrc, "console.log('PING-Q45');\nsetTimeout(() => {}, 30000);\n");
  const child = spawn(process.execPath, [childSrc], { stdio: ["ignore", "pipe", "pipe"] });
  let got = "";
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMEOUT"), 1000);
    child.stdout.on("data", (buf) => {
      got += buf.toString("utf8");
      if (got.includes("PING-Q45")) {
        clearTimeout(timer);
        resolve("GOT");
      }
    });
  });
  child.kill();
  rmSync(dir, { recursive: true, force: true });
  assert.equal(outcome, "GOT");
  assert.equal(got.includes("PING-Q45"), true);
});

test("mutant injecting fd_write into host goes RED against absence", async () => {
  const RUNTIME_JS = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist", "wasm-runtime.js");
  const origJs = readFileSync(RUNTIME_JS, "utf8");
  const needle = "const runtime = {";
  const parts = origJs.split(needle);
  assert.equal(parts.length, 2, "createHostRuntime runtime object must be unique");
  const mutantJs = origJs.replace(
    needle,
    "host.fd_write = function () { return 0; }; const runtime = {",
  );
  assert.notEqual(mutantJs, origJs);
  const dir = mkdtempSync(join(tmpdir(), "q45-fdw-"));
  const distSrc = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist");
  const names = readdirSync(distSrc);
  let i = 0;
  while (i < names.length) {
    copyFileSync(join(distSrc, names[i]), join(dir, names[i]));
    i = i + 1;
  }
  writeFileSync(join(dir, "wasm-runtime.js"), mutantJs);
  try {
    const live = await import(pathToFileURL(COMPILER_JS).href);
    const liveHost = live.createHostRuntime();
    assert.equal(Object.prototype.hasOwnProperty.call(liveHost.imports.host, "fd_write"), false);
    const mut = await import(pathToFileURL(join(dir, "wasm-runtime.js")).href);
    const mutHost = mut.createHostRuntime();
    assert.equal(Object.prototype.hasOwnProperty.call(mutHost.imports.host, "fd_write"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Q1 frozen TS POST /auth/verify buffers jsonBody then res.end", () => {
  const api = gitShow(API);
  const auth = gitShow(AUTH);
  const apiLines = api.split("\n");
  const authLines = auth.split("\n");
  assert.equal(apiLines[382].includes("function writeResponse"), true, apiLines[382]);
  assert.equal(apiLines[387].includes("res.writeHead"), true, apiLines[387]);
  assert.equal(apiLines[389].includes("res.end(Buffer.from(resp.body))"), true, apiLines[389]);
  assert.equal(apiLines[286].includes("function bufferBody"), true, apiLines[286]);
  assert.equal(apiLines[311].includes("Buffer.concat"), true, apiLines[311]);
  assert.equal(authLines[309].includes("function jsonBody"), true, authLines[309]);
  assert.equal(auth.includes("jsonBody({ outcome"), true);
  assert.equal(api.includes("fd_write"), false);
});
