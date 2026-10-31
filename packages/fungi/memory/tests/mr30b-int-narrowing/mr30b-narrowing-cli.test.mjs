// MEM-R30b (gap 4.6/H13): end-to-end pins. Integer-width narrowing fails closed with FUNGI-INT-NARROW-001
// (K3 DENY) on `check` (every mode), `build` and raw `run --invoke` BEFORE any WASM is generated; before
// this, plain check passed it and the raw run only failed late inside wabt. Int/Int32 is one type.
// Widening still runs exactly on both surfaces. Five mutants must turn their pins RED.
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
const UNIT = join(HERE, "mr30b-narrowing-unit.test.mjs");
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
const SITES = fixture("mr30b-narrow-sites.fungi", "mr30b-s-");
const ALIAS = fixture("mr30b-alias.fungi", "mr30b-a-");
const WIDEN = fixture("mr30b-widen.fungi", "mr30b-w-");

process.on("exit", () => {
  for (const d of DIRS) rmSync(d, { recursive: true, force: true });
  const build = join(REPO, "build");
  if (existsSync(build)) {
    for (const f of readdirSync(build)) {
      if (BUILD_NAMES.some((n) => f.startsWith(n + "."))) rmSync(join(build, f), { force: true });
    }
  }
});

function cli(argv, bin = GALERINA) {
  const r = spawnSync(process.execPath, [bin, ...argv], { cwd: REPO, encoding: "utf8", timeout: 120000 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const line = (r.stdout ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => /^-?\d+$/.test(l));
  return { status: r.status, text, value: line ?? null };
}
const run = (file, flow, args, governed, bin) =>
  cli(["run", file, "--invoke", flow, ...args, ...(governed ? ["--governed"] : [])], bin);
const narrowCount = (text) => (text.match(/FUNGI-INT-NARROW-001: K3 DENY INT_NARROWING/g) ?? []).length;

test("check refuses every narrowing site, in plain and strict mode", () => {
  for (const extra of [[], ["--strict-types"]]) {
    const r = cli(["check", SITES, ...extra]);
    assert.equal(r.status, 1, r.text);
    assert.equal(narrowCount(r.text), 5, r.text);
    for (const site of ["return, FUNGI-TYPE-008", "assignment, FUNGI-TYPE-002", "argument, FUNGI-TYPE-005"]) {
      assert.ok(r.text.includes(site), `${site}: ${r.text}`);
    }
    assert.ok(r.text.includes("a UInt64 value used as Int64"), r.text);
    assert.ok(r.text.includes("a Int64 value used as UInt64"), r.text);
    assert.doesNotMatch(r.text, /FUNGI-TYPE-00[258]: /, "the advisory form is replaced, not duplicated");
  }
});

test("Int and Int32 are one type: check is clean and raw run is exact", () => {
  for (const extra of [[], ["--strict-types"]]) {
    const r = cli(["check", ALIAS, ...extra]);
    assert.equal(r.status, 0, r.text);
    assert.match(r.text, / 0 errors, 0 governance warnings/);
    assert.doesNotMatch(r.text, /FUNGI-TYPE-008|FUNGI-INT-NARROW/);
  }
  assert.equal(run(ALIAS, "int32AsInt", ["2147483647"], false).value, "2147483647");
  assert.equal(run(ALIAS, "intAsInt32", ["-2147483648"], false).value, "-2147483648");
  // Governed alias is a frozen-TS follow-up (findings F1): it must stay fail closed, never lossy.
  const g = run(ALIAS, "int32AsInt", ["5"], true);
  assert.notEqual(g.status, 0, g.text);
  assert.equal(g.value, null, g.text);
});

test("raw run refuses narrowing before WASM generation, with no truncated value", () => {
  for (const flow of ["retNarrow", "letNarrow", "argNarrow"]) {
    const r = run(SITES, flow, ["4294967297"], false);
    assert.notEqual(r.status, 0, r.text);
    assert.equal(narrowCount(r.text), 5, r.text);
    assert.doesNotMatch(r.text, /type mismatch|wabt|expected \[i32\]/, "refused before the validator ever runs");
    assert.equal(r.value, null, r.text);
    assert.equal(r.text.includes("4294967297"), false, "no refusal echoes the argument");
  }
});

test("build refuses narrowing, fail closed", () => {
  const r = cli(["build", SITES]);
  assert.notEqual(r.status, 0, r.text);
  assert.equal(narrowCount(r.text), 5, r.text);
  assert.match(r.text, /FAILED \(fail-closed\)/);
});

test("widening still runs exactly on both surfaces", () => {
  for (const g of [false, true]) {
    for (const [flow, args, want] of [["widen", ["7"], "7"], ["widen", ["-7"], "-7"], ["widen", ["2147483647"], "2147483647"],
      ["mixAdd", ["9007199254740993", "-2147483648"], "9007197107257345"]]) {
      const r = run(WIDEN, flow, args, g);
      assert.equal(r.status, 0, `${g ? "governed" : "raw"} ${flow} ${args}: ${r.text}`);
      assert.equal(r.value, want, `${g ? "governed" : "raw"} ${flow} ${args}: ${r.text}`);
    }
  }
  assert.equal(cli(["check", WIDEN]).status, 0);
});

// kind "unit": the unit file goes RED against the mutant. "check": check of SITES exits 0 under the mutant.
// "late": raw run reaches the wabt validator under the mutant. "alias": check of ALIAS fails under the mutant.
const MUTANTS = [
  { id: "M1-containment-inverted", kind: "unit",
    edits: [['return fromLo >= toLo && fromHi <= toHi ? "WIDENING" : "NARROWING";', 'return fromLo >= toLo && fromHi <= toHi ? "NARROWING" : "WIDENING";']] },
  { id: "M2-alias-map-empty", kind: "alias",
    edits: [['export const INT_WIDTH_ALIAS = Object.freeze({ Int: "Int32" });', "export const INT_WIDTH_ALIAS = Object.freeze({});"]] },
  { id: "M3-compile-hook-off", kind: "late",
    edits: [["  for (const d of integerNarrowingDiagnostics(m.checkTypes(parsed.ast).diagnostics ?? [])) govErrors.push(d);", ""]] },
  { id: "M4-check-exit-ignores-narrowing", kind: "check",
    edits: [["|| securityTypeErrors.length > 0 || narrowingTypeErrors.length > 0", "|| securityTypeErrors.length > 0"],
      ["...securityTypeErrors, ...narrowingTypeErrors, ...(strictTypes", "...securityTypeErrors, ...(strictTypes"]] },
  { id: "M5-severity-filter-off", kind: "unit",
    edits: [['if (d === null || typeof d !== "object" || d.severity !== "error") continue;', 'if (d === null || typeof d !== "object") continue;']] },
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
    const path = join(REPO, `__mr30b_${m.id}_galerina.mjs`);
    writeFileSync(path, src);
    try {
      if (m.kind === "unit") {
        const base = { ...process.env };
        delete base.NODE_TEST_CONTEXT;
        const green = spawnSync(process.execPath, ["--test", UNIT], { cwd: REPO, encoding: "utf8", timeout: 120000, env: base });
        assert.equal(green.status, 0, `unit file must be green live: ${green.stdout}`);
        const red = spawnSync(process.execPath, ["--test", UNIT], { cwd: REPO, encoding: "utf8", timeout: 120000, env: { ...base, MR30B_GALERINA: path } });
        assert.notEqual(red.status, 0, `${m.id} must turn the unit file RED`);
      } else if (m.kind === "check") {
        assert.equal(cli(["check", SITES]).status, 1);
        assert.equal(cli(["check", SITES], path).status, 0, `${m.id} must let check pass`);
      } else if (m.kind === "alias") {
        assert.equal(cli(["check", ALIAS, "--strict-types"]).status, 0);
        const red = cli(["check", ALIAS, "--strict-types"], path);
        assert.notEqual(red.status, 0, `${m.id} must flag the alias as narrowing: ${red.text}`);
      } else {
        const live = run(SITES, "retNarrow", ["1"], false);
        assert.doesNotMatch(live.text, /type mismatch/);
        const red = run(SITES, "retNarrow", ["1"], false, path);
        assert.match(red.text, /type mismatch/, `${m.id} must fall through to the late wabt failure: ${red.text}`);
      }
    } finally {
      rmSync(path, { force: true });
    }
  });
}