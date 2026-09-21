// numeric-capability-refusal.test.mjs — ratified order 4 (KTA 35).
//
// Sir's amendment, verbatim: "retain the existing NaN runtime closure and add a
// separate unsupported numeric-capability refusal instrument." The split is the
// point. NaN is a VALUE-DOMAIN question — can a non-finite value enter and pass
// a guard — and `float-nonfinite-failopen.test.mjs` closes it at 17/17. This is
// a CAPABILITY question: can an unsupported numeric representation reach a
// target that cannot faithfully represent it. Fusing them would have put a
// capability check inside a value-domain instrument, measuring the wrong thing.
//
// ★ WHAT THIS INSTRUMENT MEASURES THAT THE EXISTING ONE DOES NOT: not "does the
// guard refuse" — `wat-float-record-refusal.test.mjs` proves that thoroughly —
// but WHERE IN THE PIPELINE, and what the user is told on the production path.
// Measured before writing: the guard is emitter-only, `check` PASSES, and the
// interpreter EXECUTES the same program. Two defects followed from that, both
// fixed in this commit and pinned below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as L from "../dist/index.js";

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");

/** A single-file project carrying one record field type. */
function project(fieldType, recordName = "Ledger") {
  const dir = mkdtempSync(join(tmpdir(), "numcap-"));
  writeFileSync(join(dir, "a.fungi"), `@version 1
record ${recordName} { amount: ${fieldType} }
pure flow f() -> Int
contract { intent { "numeric capability probe" } }
{ return 0 }
`);
  return dir;
}

const build = (dir) => spawnSync(process.execPath, [CLI, "build", "--target=wasm-standalone", dir], { encoding: "utf8" });
const check = (dir) => spawnSync(process.execPath, [CLI, "check", dir], { encoding: "utf8" });

/** The unsupported set, from the enforcement point's own reasoning: Float16/32
 *  await the scalar f32 lane. Decimal is an exact i32 host handle after C02. */
const UNSUPPORTED = ["Float32", "Float16"];
const SUPPORTED = ["Int", "Float", "Float64", "Int64", "Decimal"];

test("★ an unsupported numeric field REFUSES on the production build path, as a DIAGNOSTIC", () => {
  // Before this commit the guard threw a bare Error and the CLI let it escape
  // as a raw Node stack trace — GD-006's shape, which that defect closed for
  // `.gate`: a host exception reaching the user instead of a diagnostic.
  for (const type of UNSUPPORTED) {
    const dir = project(type);
    try {
      const r = build(dir);
      assert.notEqual(r.status, 0, `${type}: must exit non-zero`);
      assert.match(r.stderr, /FUNGI-LAYOUT-001/, `${type}: must name the code`);
      assert.match(r.stderr, /Ledger\.amount/, `${type}: must name the offending field`);
      assert.ok(!/^\s+at \w+ \(/m.test(r.stderr), `${type}: must not print a stack trace:\n${r.stderr.slice(0, 300)}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("★ a refused build EXITS NON-ZERO and prints no PASS — 'wrote the message' is not 'reported the failure'", () => {
  // It wrote the error and returned 0, so a build that refused every input and
  // produced no artifact reported success, and `main` went on to print PASS. A
  // CI pipeline gating on exit status would have shipped a green on nothing.
  const dir = project("Float32");
  try {
    const r = build(dir);
    assert.equal(r.status, 1, "a build that emitted nothing must fail");
    assert.ok(!/PASS/.test(r.stdout), `a refused build must not print PASS:\n${r.stdout.slice(0, 200)}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("★ NO ARTIFACT is left behind — the refusal precedes emission, not follows it", () => {
  // "Refuses before execution" in its most load-bearing sense: nothing runnable
  // exists to be executed. A refusal that still wrote a partial module would be
  // worse than no refusal, because the module would look admitted.
  const dir = project("Float32");
  try {
    build(dir);
    const wasmDir = join(dir, "build", "wasm");
    const emitted = existsSync(wasmDir) ? readdirSync(wasmDir) : [];
    assert.deepEqual(emitted, [], `no module may be written, found: ${emitted.join(", ")}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CONTROL: supported numeric fields still build and exit 0 — no over-refusal", () => {
  // Without this the instrument could pass by refusing everything.
  for (const type of SUPPORTED) {
    const dir = project(type);
    try {
      const r = build(dir);
      assert.equal(r.status, 0, `${type} must build: ${r.stderr.slice(0, 200)}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test("★ RECORDED, NOT ASSERTED-AWAY: the refusal is TARGET-scoped, so `check` passes and the interpreter runs it", async () => {
  // The timing finding, pinned as measured fact rather than smoothed over.
  // `check` is target-agnostic and passes; the interpreter genuinely SUPPORTS
  // exact Decimal, so executing it is correct rather than a fail-open. What the
  // author does not get is an early signal that the program cannot target WASM
  // — they learn at build.
  //
  // This is pinned so the behaviour cannot drift silently in either direction:
  // if `check` ever starts refusing, that is a deliberate change someone must
  // make here too.
  const dir = project("Float32");
  try {
    assert.equal(check(dir).status, 0, "check is target-agnostic and passes today");
  } finally { rmSync(dir, { recursive: true, force: true }); }

  const src = `record Ledger { amount: Decimal }
pure flow f() -> Int
contract { intent { "the interpreter supports exact Decimal" } }
{ return 0 }`;
  const prog = L.parseProgram(src, "cap.fungi");
  const result = await L.executeFlow("f", new Map(), prog.ast, prog.flows);
  assert.equal(Number(result?.value?.value ?? result?.value), 0,
    "the interpreter executes it — Decimal is supported there, and that is not a fail-open");
});

test("the refused set is tied to the enforcement point's own stated reasoning", () => {
  // Guards the SET against drift in either direction. The reasoning lives at
  // the guard; if a type leaves the refused list because its lane landed, the
  // comment there and this list must move together — and a list that agreed
  // with nothing but itself would be a list nobody maintains.
  const guard = readFileSync(resolve(import.meta.dirname, "..", "src", "wat-emitter.ts"), "utf8");
  assert.match(guard, /Float16\/Float32 remain\s*\n?\s*\*?\s*refused until the scalar f32 expression lane is faithful/,
    "the guard must still state WHY Float16/32 are refused");
  assert.match(guard, /Decimal record fields lower as/,
    "the guard must still state that Decimal is an i32 host handle, not an f64 slot");
  for (const type of UNSUPPORTED) {
    assert.ok(guard.includes(type), `${type} must appear in the guard's reasoning`);
  }
});
