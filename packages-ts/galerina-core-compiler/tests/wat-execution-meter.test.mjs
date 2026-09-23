// Hostile: executeWASMFlow must bound guest work. Same-thread Promise.race
// around instantiate cannot stop a guest loop. Dummy numeric args only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { executeWASMFlow, injectLoopFuel } from "../dist/index.js";

const SPIN = `(module
  (func $spin (result i32)
    (loop $go (br $go))
    (i32.const 0))
  (export "spin" (func $spin)))
`;

const ADD = `(module
  (func $add (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b)))
  (export "add" (func $add)))
`;

test("hostile control: unmetered loop text still contains a bare (loop", () => {
  assert.match(SPIN, /\(loop \$go \(br \$go\)/);
});

test("injectLoopFuel ticks every loop back-edge", () => {
  const out = injectLoopFuel(SPIN, 3);
  assert.match(out, /global \$__fungi_fuel \(mut i32\) \(i32\.const 3\)/);
  assert.match(out, /i32\.le_s \(global\.get \$__fungi_fuel\) \(i32\.const 0\)/);
  assert.equal(out.includes("(br $go)"), true);
});

test("executeWASMFlow refuses a non-positive deadline without running the guest", async () => {
  const r = await executeWASMFlow(SPIN, "spin", [], { deadlineMs: 0 });
  assert.equal(r.result, null);
  assert.match(String(r.error), /deadline/);
  assert.equal(r.execMs, 0);
});

test("executeWASMFlow refuses a non-positive fuel budget without running the guest", async () => {
  const r = await executeWASMFlow(SPIN, "spin", [], { maxLoopBackedges: 0 });
  assert.equal(r.result, null);
  assert.match(String(r.error), /fuel/);
});

test("executeWASMFlow traps an infinite loop under loop fuel instead of hanging", async () => {
  const t0 = Date.now();
  const r = await executeWASMFlow(SPIN, "spin", [], { deadlineMs: 2000, maxLoopBackedges: 8 });
  const ms = Date.now() - t0;
  assert.equal(r.result, null);
  assert.ok(r.error, "infinite loop must be refused");
  assert.match(String(r.error), /unreachable|deadline/i);
  assert.ok(ms < 1500, `fuel trap must finish promptly, took ${ms}ms`);
});

test("executeWASMFlow still computes add(2,3)=5", async () => {
  const r = await executeWASMFlow(ADD, "add", [2, 3]);
  assert.equal(r.error, undefined);
  assert.equal(r.result, 5);
});
