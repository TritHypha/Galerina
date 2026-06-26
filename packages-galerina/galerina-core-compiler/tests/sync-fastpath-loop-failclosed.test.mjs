/**
 * Regression lock (2026-06-19): the pure-flow SYNC fast-path (tryPureFlowSync) used to
 *   (a) have NO loop-iteration cap, and
 *   (b) swallow every non-SyncReturn throw inside while/if/block bodies.
 * After the Fork-A=TRAP overflow change (2026-06-18), an int-overflow surfaces as a runtimeError
 * that throws SyncNotSupported the moment it flows into the next op. The swallow aborted the loop
 * body BEFORE the counter advanced → the loop spun forever (the compute-mix LCG benchmark hung
 * ~31 min instead of trapping). Fix: stop swallowing (so it BAILS to null → the caller falls back
 * to the bounded, trapping async tree-walker) and bound the loop.
 *
 * These tests drive tryPureFlowSync directly (it is the exact unit that was broken), so they don't
 * depend on the bytecode-vs-sync tier-selection heuristic. If the hang regresses, they time out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, tryPureFlowSync, executeFlow, clearBytecodeCache, clearPureFlowCache } from "../dist/index.js";

function parse(src) {
  const p = parseProgram(src, "inline.spore");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((e) => e.message).join("; ")}`);
  return p;
}

const OVERFLOW_LOOP = `pure flow main() -> Int
contract { effects {} }
{
  mut seed: Int = 123456789
  mut i: Int = 0
  while i < 50000 {
    seed = seed * 1664525 + 1013904223
    i = i + 1
  }
  return seed
}`;

const SUM_LOOP = `pure flow main() -> Int
contract { effects {} }
{
  mut sum: Int = 0
  mut i: Int = 0
  while i < 1000 {
    sum = sum + i
    i = i + 1
  }
  return sum
}`;

test("tryPureFlowSync: an overflowing loop BAILS (returns null → tree-walker fallback) — it does NOT hang or return a value", () => {
  // Pre-fix this spun forever (the swallow ate the trap and the counter never advanced).
  const p = parse(OVERFLOW_LOOP);
  const r = tryPureFlowSync(p.ast, p.flows, "main", new Map());
  assert.equal(r, null, "must bail so the caller falls back to the trapping tree-walker, not hang or silently 'succeed'");
});

test("tryPureFlowSync: a bounded non-overflowing loop still computes the correct value", () => {
  const p = parse(SUM_LOOP); // sum 0..999 = 499500
  const r = tryPureFlowSync(p.ast, p.flows, "main", new Map());
  assert.notEqual(r, null, "a supported, in-range pure loop must run on the sync path");
  assert.equal(r.__tag, "int");
  assert.equal(r.value, 499500);
});

test("tryPureFlowSync: a loop past a low maxIterations cap BAILS (cap honored — no unbounded run, no silent truncation)", () => {
  const p = parse(SUM_LOOP); // 1000 iters, cap 5
  const r = tryPureFlowSync(p.ast, p.flows, "main", new Map(), 5);
  assert.equal(r, null, "exceeding the sync cap must bail → tree-walker enforces fail-closed");
});

test("end-to-end: the overflowing pure flow FAILS CLOSED via executeFlow (sync bails → tree-walker traps IntegerOverflow)", async () => {
  clearBytecodeCache?.();
  clearPureFlowCache?.();
  const p = parse(OVERFLOW_LOOP);
  const res = await executeFlow("main", new Map(), p.ast, p.flows, undefined, undefined, { pureFastPath: true, sourceTag: "e2e" }, undefined, undefined);
  const v = res.value ?? res;
  assert.equal(v.__tag, "runtimeError", "must fail closed (no hang, no silent truncate-and-succeed)");
  assert.match(v.message ?? "", /Overflow/i);
});
