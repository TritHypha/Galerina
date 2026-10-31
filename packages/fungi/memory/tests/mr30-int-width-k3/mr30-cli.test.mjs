// MEM-R30 (gap 4.6/H13): end-to-end pins for 32-bit and 64-bit integer arguments on BOTH CLI
// surfaces, `galerina run <file> --invoke <flow> [args]` (raw WASM) and `... --governed`.
// Int is an alias of Int32 (checked i32); Int64 / UInt64 are exact 64-bit bigints. Every argument
// gets a K3 verdict, verdicts fold with strong Kleene AND, DENY and UNKNOWN both refuse (exit 2)
// with distinct reason codes, and no refusal echoes the argument. Nine mutants must turn RED.
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
const UNIT = join(HERE, "mr30-admission-unit.test.mjs");
const CANARY = "SYNTHMR30CANARY4c1e";
const DIRS = [];
const BUILD_NAMES = [];

function fixture(name, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  DIRS.push(dir);
  const file = uniqueFungiFile(dir);
  copyFileSync(join(HERE, name), file);
  BUILD_NAMES.push(basename(file, ".fungi"));
  return file;
}
const WIDTHS = fixture("mr30-widths.fungi", "mr30-w-");
const U64 = fixture("mr30-u64.fungi", "mr30-u-");
const NARROW = fixture("mr30-narrow.fungi", "mr30-n-");

process.on("exit", () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
  const build = join(REPO, "build");
  if (existsSync(build)) {
    for (const f of readdirSync(build)) {
      if (BUILD_NAMES.some((n) => f.startsWith(n + "."))) rmSync(join(build, f), { force: true });
    }
  }
});

function run(file, flow, args, { governed = false, bin = GALERINA } = {}) {
  const argv = [bin, "run", file, "--invoke", flow, ...args];
  if (governed) argv.push("--governed");
  const r = spawnSync(process.execPath, argv, { cwd: REPO, encoding: "utf8", timeout: 120000 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const line = (r.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => /^-?\d+$/.test(l));
  return { status: r.status, text, value: line ?? null };
}
const both = (fn) => { fn(false); fn(true); };

function ok(file, flow, args, governed, expected) {
  const r = run(file, flow, args, { governed });
  assert.equal(r.status, 0, `${governed ? "governed" : "raw"} ${flow} ${args}: ${r.text}`);
  assert.equal(r.value, expected, `${governed ? "governed" : "raw"} ${flow} ${args} exact: ${r.text}`);
}

function refused(file, flow, args, governed, pattern) {
  const r = run(file, flow, args, { governed });
  assert.equal(r.status, 2, `${governed ? "governed" : "raw"} ${flow} ${args} must exit 2: ${r.text}`);
  assert.match(r.text, pattern);
  assert.equal(r.value, null, `no result may print: ${r.text}`);
  for (const a of args) {
    if (a.length > 3 && !/range is|from -?\d+ to/.test(r.text)) assert.equal(r.text.includes(a), false, `echoed ${a}`);
  }
  return r;
}

test("Int and Int32 (alias): i32 edges admitted on both surfaces, 2^31 refused", () => {
  both((g) => {
    for (const flow of ["echoInt", "echoInt32"]) {
      ok(WIDTHS, flow, ["2147483647"], g, "2147483647");
      ok(WIDTHS, flow, ["-2147483648"], g, "-2147483648");
      for (const text of ["2147483648", "-2147483649", "9007199254740991", "9007199254740993"]) {
        refused(WIDTHS, flow, [text], g, g ? /K3 DENY \(GOV_ARG_RANGE\)/ : /32-bit integer/);
      }
    }
  });
});

test("Int and Int32 mix freely as the same type", () => {
  both((g) => ok(WIDTHS, "mixInt", ["2147483640", "7"], g, "2147483647"));
});

test("Int64: 2^53 and 2^63 edges exact as bigint, beyond refused", () => {
  both((g) => {
    for (const text of ["9007199254740991", "9007199254740992", "9007199254740993",
      "9223372036854775807", "-9223372036854775808", "2147483648", "-2147483649"]) {
      ok(WIDTHS, "echoI64", [text], g, text);
    }
    for (const text of ["9223372036854775808", "-9223372036854775809", "18446744073709551616"]) {
      refused(WIDTHS, "echoI64", [text], g, g ? /K3 DENY \(GOV_ARG_RANGE\)/ : /K3 DENY/);
    }
  });
});

test("Int64 output prints the exact decimal (no 'n', no rounding, no crash)", () => {
  both((g) => {
    const r = run(WIDTHS, "i64Max", [], { governed: g });
    assert.equal(r.status, 0, r.text);
    assert.equal(r.value, "9223372036854775807");
    assert.doesNotMatch(r.text, /\d+n\b|serialize a BigInt/);
  });
});

test("UInt64 (governed): 2^64 edge exact, '-' and 2^64 refused", () => {
  ok(U64, "echoU64", ["18446744073709551615"], true, "18446744073709551615");
  ok(U64, "echoU64", ["9223372036854775808"], true, "9223372036854775808");
  ok(U64, "echoU64", ["0"], true, "0");
  for (const text of ["-1", "18446744073709551616", "-0"]) {
    refused(U64, "echoU64", [text], true, /K3 DENY/);
  }
  const r = run(U64, "u64Max", [], { governed: true });
  assert.equal(r.value, "18446744073709551615", r.text);
});

test("non-canonical integer text is DENY on both surfaces", () => {
  both((g) => {
    for (const text of ["-0", "01", "+1", "1e3", "0x10", " 1", "1.0"]) {
      refused(WIDTHS, "echoI64", [text], g, g ? /K3 DENY \(GOV_ARG_MALFORMED\)/ : /not a valid/);
    }
  });
});

test("K3 fold: one DENY anywhere refuses the call and names that argument", () => {
  both((g) => {
    const r = refused(WIDTHS, "mixInt", ["1", "2147483648"], g, g ? /argument #2 .*K3 DENY/ : /argument #2 /);
    assert.doesNotMatch(r.text, /argument #1 /);
  });
});

test("a surplus raw argument is refused by exact arity before any per-argument verdict (S2 X-N1)", () => {
  const r = refused(WIDTHS, "echoInt", ["1", "2"], false, /exact arity is required/);
  assert.doesNotMatch(r.text, /K3 (DENY|UNKNOWN)/);
});

test("no refusal echoes the synthetic canary", () => {
  both((g) => {
    for (const [flow, args] of [["echoInt", [CANARY]], ["echoI64", ["9" + CANARY]], ["mixInt", ["1", CANARY]], ["pickBool", [CANARY]]]) {
      const r = run(WIDTHS, flow, args, { governed: g });
      assert.equal(r.status, 2, r.text);
      assert.equal(r.text.includes(CANARY), false, `${flow} echoed the canary`);
    }
  });
});

test("Int64 -> Int narrowing is refused statically, never truncated", () => {
  both((g) => {
    const r = run(NARROW, "narrow", ["4294967297"], { governed: g });
    assert.notEqual(r.status, 0, r.text);
    // Governed: the TS runner (FUNGI-TYPE-008). Raw: MEM-R30b refuses before WASM generation
    // (FUNGI-INT-NARROW-001); the late wabt "type mismatch" failure must no longer be the only guard.
    assert.match(r.text, g ? /FUNGI-TYPE-008/ : /FUNGI-INT-NARROW-001: K3 DENY INT_NARROWING/);
    if (!g) assert.doesNotMatch(r.text, /type mismatch/);
    assert.equal(r.value, null, `no truncated value may print: ${r.text}`);
  });
});

// kind "admit": live refuses, the mutant runs to a value. "wrong": both run, mutant prints a different
// value. "echo": the mutant echoes the canary. "unit": the unit file goes RED against the mutant copy.
const MUTANTS = [
  { id: "M1-int-alias-widened-to-2p53", kind: "admit", file: WIDTHS, flow: "echoInt", args: ["9007199254740991"], governed: true,
    edits: [["Int: Object.freeze([-(2n ** 31n), 2n ** 31n - 1n]),", "Int: Object.freeze([-(2n ** 53n), 2n ** 53n - 1n]),"]] },
  // M2/M3 are unit-kind: the interpreter re-checks Int64/UInt64 arguments (FUNGI-RUNTIME-003), a second
  // fail-closed layer, so an end-to-end run cannot show the CLI admission mutant on its own.
  { id: "M2-int64-range-unbounded", kind: "unit",
    edits: [["Int64: Object.freeze([-(2n ** 63n), 2n ** 63n - 1n]),", "Int64: Object.freeze([-(2n ** 64n), 2n ** 64n]),"]] },
  { id: "M3-uint64-accepts-minus", kind: "unit",
    edits: [["UInt64: Object.freeze([0n, 2n ** 64n - 1n]),", "UInt64: Object.freeze([-(2n ** 63n), 2n ** 64n - 1n]),"]] },
  { id: "M4-int64-output-via-number", kind: "wrong", file: WIDTHS, flow: "echoI64", args: ["9007199254740993"], governed: false,
    edits: [['return (bt === "UInt64" ? BigInt.asUintN(64, raw) : raw).toString();', "return String(Number(raw));"]] },
  { id: "M5-governed-refusal-echoes", kind: "echo", file: WIDTHS, flow: "echoInt", args: [CANARY], governed: true,
    edits: [['console.error(governedRefusalLine(gfold.verdict, gfold.reason, at, parameter?.name ?? "", parameter?.type ?? ""));',
      "console.error(String(gposArgs[at]));"]] },
  { id: "M6-fold-is-max-not-min", kind: "unit",
    edits: [["if (K3_ARG_ORDER[eff] < K3_ARG_ORDER[verdict]) {", "if (K3_ARG_ORDER[eff] > K3_ARG_ORDER[verdict]) {"]] },
  { id: "M7-unknown-folds-as-allow", kind: "unit",
    edits: [['const ok = v === "ALLOW" && r.ok === true;', 'const ok = v !== "DENY";']] },
  { id: "M8-narrowing-guard-off", kind: "unit",
    edits: [['return big < lo || big > hi ? "RESULT_RANGE" : null;', "return null;"]] },
  { id: "M9-unknown-wire-sentinel-zero", kind: "unit",
    edits: [["export const K3_ARG_WIRE = Object.freeze({ ALLOW: 0x01, DENY: 0xff, UNKNOWN: 0x80 });",
      "export const K3_ARG_WIRE = Object.freeze({ ALLOW: 0x01, DENY: 0xff, UNKNOWN: 0x00 });"]] },
];

for (const m of MUTANTS) {
  test(`mutant ${m.id} turns its pin RED`, () => {
    const orig = readFileSync(GALERINA, "utf8");
    let src = orig;
    for (const [needle, replacement] of m.edits) {
      assert.equal(src.split(needle).length, 2, `${m.id}: needle must be unique: ${needle}`);
      src = src.replace(needle, replacement);
    }
    assert.notEqual(src, orig);
    const path = join(REPO, `__mr30_${m.id}_galerina.mjs`);
    writeFileSync(path, src);
    try {
      if (m.kind === "unit") {
        // Drop NODE_TEST_CONTEXT so the nested run reports its own exit code instead of acting as a child.
        const base = { ...process.env };
        delete base.NODE_TEST_CONTEXT;
        const env = { ...base, MR30_GALERINA: path };
        const green = spawnSync(process.execPath, ["--test", UNIT], { cwd: REPO, encoding: "utf8", timeout: 120000, env: base });
        assert.equal(green.status, 0, `unit file must be green live: ${green.stdout}`);
        const red = spawnSync(process.execPath, ["--test", UNIT], { cwd: REPO, encoding: "utf8", timeout: 120000, env });
        assert.notEqual(red.status, 0, `${m.id} must turn the unit file RED`);
        return;
      }
      const live = run(m.file, m.flow, m.args, { governed: m.governed });
      const red = run(m.file, m.flow, m.args, { governed: m.governed, bin: path });
      if (m.kind === "echo") {
        assert.equal(live.text.includes(CANARY), false);
        assert.equal(red.text.includes(CANARY), true, `${m.id} must echo under the mutant`);
      } else if (m.kind === "wrong") {
        assert.equal(live.value, m.args[0], live.text);
        assert.notEqual(red.value, m.args[0], `${m.id} must print a lossy value: ${red.text}`);
      } else {
        assert.equal(live.status, 2, `${m.id} live must refuse: ${live.text}`);
        assert.equal(red.status, 0, `${m.id} must admit under the mutant: ${red.text}`);
        assert.notEqual(red.value, null, `${m.id} must reach execution under the mutant`);
      }
    } finally {
      rmSync(path, { force: true });
    }
  });
}