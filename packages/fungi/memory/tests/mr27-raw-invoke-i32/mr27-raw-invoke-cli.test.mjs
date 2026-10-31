// MEM-R27 (gap 4.6/H13): end-to-end pins for `galerina run <file> --invoke <flow> [args]`.
// The raw WASM path now marshals each argument by the flow's declared parameter type:
// Int = canonical decimal inside i32, Bool = true/false, Float = plain finite decimal, any
// other type refused (use --governed). Every refusal exits 2, names the argument by position
// and never echoes its text. Six mutants of galerina.mjs must each turn a pin RED.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const GALERINA = join(REPO, "galerina.mjs");
const DIR = mkdtempSync(join(tmpdir(), "mr27-raw-"));
const FIXTURE = uniqueFungiFile(DIR);
copyFileSync(join(HERE, "mr27-scalars.fungi"), FIXTURE);
const BUILD_NAME = basename(FIXTURE, ".fungi");
const CANARY = "SYNTHMR27CANARY7f3a";

process.on("exit", () => {
  rmSync(DIR, { recursive: true, force: true });
  const build = join(REPO, "build");
  if (existsSync(build)) {
    for (const f of readdirSync(build)) {
      if (f.startsWith(BUILD_NAME + ".")) rmSync(join(build, f), { force: true });
    }
  }
});

function invoke(flow, args, bin = GALERINA) {
  const r = spawnSync(process.execPath, [bin, "run", FIXTURE, "--invoke", flow, ...args],
    { cwd: REPO, encoding: "utf8", timeout: 120000 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = (r.stdout ?? "").match(/(-?\d+(?:\.\d+)?)\s*$/);
  return { status: r.status, text, last: m ? m[1] : null };
}

function admitted(flow, args, expected) {
  const r = invoke(flow, args);
  assert.equal(r.status, 0, `${flow} ${JSON.stringify(args)}: ${r.text}`);
  assert.equal(r.last, expected, `${flow} ${JSON.stringify(args)}: ${r.text}`);
}

function refusedCli(flow, args, pattern, position) {
  const r = invoke(flow, args);
  assert.equal(r.status, 2, `${flow} ${JSON.stringify(args)} must exit 2: ${r.text}`);
  assert.match(r.text, pattern);
  assert.match(r.text, new RegExp(`invoke argument #${position} `));
  assert.equal(r.last, null, `no WASM result may print: ${r.text}`);
  return r;
}

test("Int boundaries are admitted exactly", () => {
  admitted("echoInt", ["2147483647"], "2147483647");
  admitted("echoInt", ["-2147483648"], "-2147483648");
  admitted("echoInt", ["0"], "0");
  admitted("addInts", ["2147483640", "7"], "2147483647");
});

test("Int beyond i32 is refused, never wrapped", () => {
  for (const text of ["2147483648", "-2147483649", "4294967296", "4294967300", "9007199254740993"]) {
    const r = refusedCli("echoInt", [text], /not a valid Int or Bool: Int is a 32-bit integer from -2147483648 to 2147483647/, 1);
    // The message prints the bounds, so skip the echo check for inputs that are part of them.
    if (!"-2147483648 to 2147483647".includes(text)) {
      assert.equal(r.text.includes(text), false, "out-of-range text must not be echoed");
    }
  }
  refusedCli("addInts", ["1", "2147483648"], /32-bit integer/, 2);
});

test("non-canonical Int spellings are refused", () => {
  for (const text of ["", "1.5", "1e3", "0x10", "-0", "+1", "01", " 1", "true"]) {
    refusedCli("echoInt", [text], /not a valid Int or Bool \(the value is not echoed\)/, 1);
  }
});

test("Bool takes only true/false", () => {
  admitted("pickBool", ["true"], "777");
  admitted("pickBool", ["false"], "333");
  for (const text of ["1", "0", "2", "TRUE"]) {
    refusedCli("pickBool", [text], /not a valid Int or Bool/, 1);
  }
});

test("Float takes a plain finite decimal", () => {
  admitted("echoFloat", ["2.5"], "2.5");
  admitted("echoFloat", ["-3"], "-3");
  for (const text of ["1e3", "NaN", "Infinity", "0x10", ".5"]) {
    refusedCli("echoFloat", [text], /not a valid Float/, 1);
  }
});

test("a String parameter is refused on the raw path", () => {
  refusedCli("textLen", ["1"], /raw WASM path cannot marshal.*use --governed/s, 1);
  refusedCli("textLen", [CANARY], /use --governed/, 1);
});

test("no refusal echoes the synthetic canary", () => {
  for (const [flow, args] of [["echoInt", [CANARY]], ["pickBool", [CANARY]], ["echoFloat", [CANARY]],
    ["addInts", ["1", CANARY]], ["textLen", [CANARY]], ["echoInt", ["9" + CANARY]]]) {
    const r = invoke(flow, args);
    assert.equal(r.status, 2, r.text);
    assert.equal(r.text.includes(CANARY), false, `${flow} echoed the canary`);
  }
});

test("exact arity still applies before marshalling", () => {
  const r = invoke("addInts", ["1"]);
  assert.equal(r.status, 2, r.text);
});

const MUTANTS = [
  { id: "M1-no-i32-range", flow: "echoInt", args: ["4294967300"],
    edits: [["if (n < RAW_INVOKE_I32_MIN || n > RAW_INVOKE_I32_MAX)", "if (false)"],
      ['if (text.length > 11) return { ok: false, reason: "RAW_ARG_I32_RANGE" };', ""]] },
  { id: "M2-bool-admits-digits", flow: "pickBool", args: ["1"],
    edits: [['if (type === "Bool") {', 'if (type === "Bool" && false) {'],
      ['if (type === "Int" || type === "") {', 'if (type === "Int" || type === "" || type === "Bool") {']] },
  { id: "M3-negative-zero", flow: "echoInt", args: ["-0"],
    edits: [['|| text === "-0")', ")"]] },
  { id: "M4-unsupported-falls-through", flow: "textLen", args: ["1"],
    edits: [['return { ok: false, reason: "RAW_ARG_TYPE_UNSUPPORTED" };', "return { ok: true, value: Number(text) };"]] },
  { id: "M5-refusal-echoes", flow: "echoInt", args: [CANARY], echo: true,
    edits: [["for (const line of rawInvokeRefusalLines(r.reason, i, declared)) console.error(line);", "console.error(String(a));"]] },
  { id: "M6-untyped-lookup", flow: "pickBool", args: ["5"],
    edits: [["const rawParamTypes = rawFlowMeta ?", "const rawParamTypes = false ?"]] },
];

for (const mutant of MUTANTS) {
  test(`mutant ${mutant.id} turns its pin RED`, () => {
    const orig = readFileSync(GALERINA, "utf8");
    let src = orig;
    for (const [needle, replacement] of mutant.edits) {
      assert.equal(src.split(needle).length, 2, `${mutant.id}: needle must be unique: ${needle}`);
      src = src.replace(needle, replacement);
    }
    assert.notEqual(src, orig);
    const path = join(REPO, `__mr27_${mutant.id}_galerina.mjs`);
    writeFileSync(path, src);
    try {
      const live = invoke(mutant.flow, mutant.args);
      assert.equal(live.status, 2, `${mutant.id} live must refuse: ${live.text}`);
      const red = invoke(mutant.flow, mutant.args, path);
      if (mutant.echo === true) {
        assert.equal(live.text.includes(CANARY), false);
        assert.equal(red.text.includes(CANARY), true, `${mutant.id} must echo under the mutant`);
      } else {
        assert.equal(red.status, 0, `${mutant.id} must admit under the mutant: ${red.text}`);
        assert.notEqual(red.last, null, `${mutant.id} must reach WASM under the mutant`);
      }
    } finally {
      rmSync(path, { force: true });
    }
  });
}
