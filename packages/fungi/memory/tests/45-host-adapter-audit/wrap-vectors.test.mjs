import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, rmSync, existsSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const ECHO_FIXTURE = join(HERE, "echo.fungi");
// OPEN-S2-3: never build the committed fixture under its own fixed name (that left build/echo.* behind
// and two files shared it). Each file builds a private copy under a unique mkdtemp name; the S2 harness
// removes build/<name>.* at exit and the copy's folder is removed here.
const ECHO_DIR = mkdtempSync(join(tmpdir(), "q45-echo-"));
const ECHO = uniqueFungiFile(ECHO_DIR);
copyFileSync(ECHO_FIXTURE, ECHO);
process.on("exit", () => { rmSync(ECHO_DIR, { recursive: true, force: true }); });

function invokeEcho(argList, galerinaPath) {
  const bin = galerinaPath || GALERINA;
  const argv = [bin, "run", ECHO, "--invoke", "echo", ...argList];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/(-?\d+)\s*$/m);
  let present = false;
  let value = 0;
  let reason = "INVOKE_VALUE_ABSENT";
  if (m) {
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) === true) {
      present = true;
      value = n;
      reason = "INVOKE_VALUE_PRESENT";
    } else {
      reason = "INVOKE_VALUE_NOT_SAFE_INTEGER";
    }
  }
  return { status: r.status, text, present, value, reason, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// MEM-R27 (gap 4.6/H13): Q45 first characterised the raw path as Number(a) then WebAssembly
// ToInt32, so out-of-range, fractional and empty arguments wrapped silently. The raw path now
// refuses everything that is not a canonical decimal inside i32 (exit 2, nothing reaches WASM).
const VECTORS = Object.freeze([
  { input: "0", admitted: true, wasm: 0 },
  { input: "1", admitted: true, wasm: 1 },
  { input: "-1", admitted: true, wasm: -1 },
  { input: "2147483647", admitted: true, wasm: 2147483647 },
  { input: "2147483648", admitted: false, wasm: 0 },
  { input: "-2147483648", admitted: true, wasm: -2147483648 },
  { input: "-2147483649", admitted: false, wasm: 0 },
  { input: "4294967295", admitted: false, wasm: 0 },
  { input: "4294967296", admitted: false, wasm: 0 },
  { input: "4294967300", admitted: false, wasm: 0 },
  { input: "9007199254740991", admitted: false, wasm: 0 },
  { input: "9007199254740992", admitted: false, wasm: 0 },
  { input: "9223372036854775807", admitted: false, wasm: 0 },
  { input: "abc", admitted: false, wasm: 0 },
  { input: "1.5", admitted: false, wasm: 0 },
  { input: "", admitted: false, wasm: 0 },
]);

test("echo.fungi check admits the identity flow", () => {
  const r = spawnSync(
    process.execPath,
    [GALERINA, "check", ECHO, "--strict-types", "--strict-governance"],
    { encoding: "utf8", cwd: REPO, timeout: 120000 },
  );
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});

test("Q2 wrap vectors: only canonical i32 reaches fn(...args) (MEM-R27)", () => {
  let i = 0;
  while (i < VECTORS.length) {
    const row = VECTORS[i];
    const r = invokeEcho([row.input]);
    if (row.admitted === true) {
      assert.equal(r.status, 0, row.input + " status " + r.reason + " " + r.text);
      assert.equal(r.present, true, row.input + " " + r.reason + " " + r.text);
      assert.equal(r.value, row.wasm, row.input + " wasm " + r.text);
      const n = Number(row.input);
      assert.equal(Number.isFinite(n), true, row.input + " finite");
      assert.equal(n | 0, row.wasm, row.input + " ToInt32");
    } else {
      assert.equal(r.status, 2, row.input + " refuse status " + r.text);
      assert.match(r.text, /not a valid Int or Bool/);
      assert.equal(r.present, false, row.input + " must not reach WASM " + r.text);
    }
    i = i + 1;
  }
});

test("mutant restoring the old Number(a) wrap turns 4294967300 RED then restore", () => {
  const orig = readFileSync(GALERINA, "utf8");
  const needle = "const r = marshalRawInvokeArg(a, declared);";
  const parts = orig.split(needle);
  assert.equal(parts.length, 2, "raw marshal call must be unique");
  const mutant = orig.replace(needle, "const r = { ok: true, verdict: \"ALLOW\", value: Number(a) };");
  assert.notEqual(mutant, orig, "mutant must change galerina.mjs marshal");
  const mutantPath = join(REPO, "__q45_mutant_galerina.mjs");
  writeFileSync(mutantPath, mutant);
  try {
    const live = invokeEcho(["4294967300"]);
    assert.equal(live.status, 2, live.text);
    assert.equal(live.present, false, live.text);
    const red = invokeEcho(["4294967300"], mutantPath);
    assert.equal(red.status, 0, "mutant must wrap 4294967300 " + red.text);
    assert.equal(red.value, 4, "mutant wraps to 4 " + red.text);
    assert.notEqual(red.status, live.status, "mutant diverges from live refusal");
  } finally {
    if (existsSync(mutantPath)) rmSync(mutantPath, { force: true });
  }
});
