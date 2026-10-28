// OPEN-S2-3 (governed-path arity test gap, recorded at merge checks s2mc2 ea77e9ce and s2r e8edc306).
// The raw WASM --invoke surface got an exact-arity refusal in S2 (X-N1) with tests in s2-harness.test.mjs.
// The GOVERNED surface (`galerina run <file> --invoke <flow> --governed [args...]`) has had its own
// exact-arity and exact-scalar refusals since before S2, but no memory-suite test pinned them.
// Zero-trust rule pinned here: the governed CLI refuses (exit 2) any argument list whose length is not
// exactly the flow's declared parameter count, any Bool other than true/false, any Int that is not a
// canonical signed decimal safe integer, and any declared type it cannot marshal. A refusal must happen
// before execution: no governed banner, no value. Synthetic fixture only.
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const BANNER = /governed · flow=/u;
const ARITY = /REFUSED: governed invoke of '([A-Za-z0-9_]+)' expected (\d+) positional argument\(s\) but received (\d+); exact arity is required\./u;
const EXTS = [".wasm", ".wat", ".lmanifest", ".lmanifest.json", ".dot", ".svg"];

const FIXTURE = [
  "@version 1",
  "/// Synthetic OPEN-S2-3 governed arity fixture. Not a product flow.",
  "",
  "pure flow pick(a: Int, flag: Bool, label: String) -> Int",
  "contract {",
  "  intent { \"Return the admitted Int; the other parameters only widen the arity.\" }",
  "}",
  "{",
  "  return a",
  "}",
  "",
  "pure flow zero() -> Int",
  "contract {",
  "  intent { \"Zero-arity flow for surplus-argument refusal.\" }",
  "}",
  "{",
  "  return 41",
  "}",
  "",
  "pure flow one(n: Int) -> Int",
  "contract {",
  "  intent { \"Single Int parameter for canonical-Int refusal.\" }",
  "}",
  "{",
  "  return n",
  "}",
  "",
].join("\n");

let fixtureDir = "";
let fixtureFile = "";

function fixture() {
  if (fixtureFile !== "") return fixtureFile;
  fixtureDir = mkdtempSync(join(tmpdir(), "s2-garity-"));
  fixtureFile = uniqueFungiFile(fixtureDir);
  writeFileSync(fixtureFile, FIXTURE);
  return fixtureFile;
}

process.on("exit", () => {
  if (fixtureDir !== "") rmSync(fixtureDir, { recursive: true, force: true });
});

function governed(flow, args, bin) {
  const argv = [bin || GALERINA, "run", fixture(), "--invoke", flow, ...args, "--governed"];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
    text: (r.stdout || "") + (r.stderr || ""),
  };
}

function assertRefused(r, pattern, label) {
  assert.equal(r.status, 2, label + " must exit 2: " + r.text);
  assert.match(r.stderr, pattern, label + " refusal message: " + r.text);
  assert.doesNotMatch(r.text, BANNER, label + " must refuse before execution: " + r.text);
  assert.equal(r.stdout.trim(), "", label + " must print no value: " + r.text);
}

function firstLine(text) {
  return text.split("\n").map((l) => l.trim()).filter((l) => l !== "")[0] ?? "";
}

test("S2-GA-01 exact arity with exact scalars is admitted and runs governed", () => {
  const r = governed("pick", ["7", "true", "hello"]);
  assert.equal(r.status, 0, r.text);
  assert.equal(firstLine(r.stdout), "7", r.text);
  assert.match(r.stdout, /governed · flow=pick/u, r.text);
});

test("S2-GA-02 too few positional arguments are refused with the exact counts", () => {
  for (const args of [[], ["7"], ["7", "true"]]) {
    const r = governed("pick", args);
    assertRefused(r, ARITY, "pick with " + args.length + " args");
    const m = r.stderr.match(ARITY);
    assert.deepEqual([m[1], m[2], m[3]], ["pick", "3", String(args.length)]);
  }
});

test("S2-GA-03 surplus positional arguments are refused, never silently dropped", () => {
  for (const args of [["7", "true", "hello", "8"], ["7", "true", "hello", "8", "false"]]) {
    const r = governed("pick", args);
    assertRefused(r, ARITY, "pick with " + args.length + " args");
    const m = r.stderr.match(ARITY);
    assert.deepEqual([m[1], m[2], m[3]], ["pick", "3", String(args.length)]);
  }
});

test("S2-GA-04 a zero-arity flow admits no arguments and refuses any surplus", () => {
  const ok = governed("zero", []);
  assert.equal(ok.status, 0, ok.text);
  assert.equal(firstLine(ok.stdout), "41", ok.text);
  for (const args of [["0"], ["true"], [""]]) {
    const r = governed("zero", args);
    assertRefused(r, ARITY, "zero with " + JSON.stringify(args));
  }
});

test("S2-GA-05 an empty-string argument still counts toward arity", () => {
  const r = governed("pick", ["7", "true", ""]);
  assert.equal(r.status, 0, "empty String is one exact argument: " + r.text);
  assert.equal(firstLine(r.stdout), "7", r.text);
});

test("S2-GA-06 a Bool parameter admits only true or false", () => {
  for (const bad of ["TRUE", "False", "1", "0", "yes", ""]) {
    const r = governed("pick", ["7", bad, "x"]);
    assertRefused(r, /REFUSED: governed argument #2 for parameter 'flag' declared Bool is invalid/u, "Bool " + JSON.stringify(bad));
  }
  const f = governed("pick", ["9", "false", "x"]);
  assert.equal(f.status, 0, f.text);
  assert.equal(firstLine(f.stdout), "9", f.text);
});

test("S2-GA-07 an Int parameter admits only a canonical signed decimal safe integer", () => {
  for (const bad of ["01", "+1", "1.5", "1e3", "0x10", " 1", "1 ", "", "abc", "9007199254740992", "-9007199254740992"]) {
    const r = governed("one", [bad]);
    assertRefused(r, /REFUSED: governed argument #1 for parameter 'n' declared Int is invalid/u, "Int " + JSON.stringify(bad));
  }
  for (const [good, want] of [["0", "0"], ["-1", "-1"], ["9007199254740991", "9007199254740991"], ["-9007199254740991", "-9007199254740991"]]) {
    const r = governed("one", [good]);
    assert.equal(r.status, 0, good + " " + r.text);
    assert.equal(firstLine(r.stdout), want, good + " " + r.text);
  }
});

test("S2-GA-08 the arity refusal is checked before scalar marshalling", () => {
  const r = governed("one", ["abc", "def"]);
  assertRefused(r, ARITY, "one with two bad args");
  assert.doesNotMatch(r.stderr, /declared Int is invalid/u, "arity must be decided first: " + r.text);
});

test("S2-GA-09 galerina.mjs carries exactly one governed exact-arity guard", () => {
  const src = readFileSync(GALERINA, "utf8");
  const guards = src.match(/if \(gposArgs\.length !== gparams\.length\) \{/gu) ?? [];
  assert.equal(guards.length, 1, "one governed arity guard");
  const at = src.indexOf("if (gposArgs.length !== gparams.length) {");
  const run = src.indexOf("await m.run(source, fungiFile, gflow, gargs");
  assert.equal(run > at, true, "the arity guard precedes the governed m.run call");
});

test("S2-GA-10 mutant: removing the governed arity guard turns surplus arguments GREEN (so S2-GA-03 is live)", () => {
  const orig = readFileSync(GALERINA, "utf8");
  const needle = "if (gposArgs.length !== gparams.length) {";
  assert.equal(orig.split(needle).length, 2, "guard must be unique");
  const mutant = orig.replace(needle, "if (false) {");
  const mutantPath = join(REPO, "__s2ga_mutant_" + process.pid + "_galerina.mjs");
  writeFileSync(mutantPath, mutant);
  try {
    const live = governed("pick", ["7", "true", "hello", "8"]);
    assert.equal(live.status, 2, live.text);
    const red = governed("pick", ["7", "true", "hello", "8"], mutantPath);
    assert.equal(red.status, 0, "mutant admits the surplus argument: " + red.text);
    assert.match(red.stdout, BANNER, red.text);
    const short = governed("pick", ["7"], mutantPath);
    assert.equal(short.status, 2, "binding guard still refuses missing arguments: " + short.text);
    assert.match(short.stderr, /has no exact parameter binding/u, short.text);
  } finally {
    rmSync(mutantPath, { force: true });
  }
});

test("S2-GA-11 governed runs and refusals leave no build outputs for the fixture name", () => {
  const name = basename(fixture(), ".fungi");
  governed("pick", ["1", "true", "x"]);
  governed("pick", ["1"]);
  for (const ext of EXTS) {
    assert.equal(existsSync(join(REPO, "build", name + ext)), false, "governed path wrote build/" + name + ext);
  }
});
