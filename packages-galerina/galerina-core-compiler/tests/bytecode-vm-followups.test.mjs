/**
 * Regression lock (2026-06-19) — the two documented follow-ups from the 0032 sync-path fix (commit 264723a):
 *
 *   1. LIVENESS: the pure-flow bytecode VM (runBytecode) had NO iteration cap. Unlike the async
 *      tree-walker and the sync fast-path (both bounded + fail-closed), a bytecode-eligible flow with a
 *      genuinely non-terminating loop (`while true {}`) would hang the host uncatchably — the Goal-C
 *      "no system crash" / 0032 hazard. It must now TRAP at maxIterations, byte-identically to the walker.
 *
 *   2. CACHE CORRECTNESS: the bytecode cache keyed on flow NAME ALONE in a single module-level Map. Two
 *      distinct flows both named `main` (different ASTs in one process — every benchmark's entry flow) had
 *      the FIRST's bytecode silently served for the SECOND. The benchmark runner hit this (it clears the
 *      pure-flow cache between files but not the bytecode cache). The key is now scoped per program AST.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProgram, runBytecode, compileToBytecode, tryRunBytecode,
  clearBytecodeCache, clearPureFlowCache, executeFlow,
} from "../dist/index.js";

function parse(src, file) {
  const p = parseProgram(src, file);
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((e) => e.message).join("; ")}`);
  return p;
}

// ── Follow-up 1: liveness cap ──────────────────────────────────────────────────────────────────────
const LOOP_FOREVER = `pure flow loopForever() -> Int
contract { effects {} }
{
  mut i: Int = 0
  while true { i = i + 1 }
  return i
}`;

test("runBytecode: a non-terminating loop TRAPS at maxIterations (no uncatchable hang)", () => {
  clearBytecodeCache();
  const p = parse(LOOP_FOREVER, "loop.fungi");
  const prog = compileToBytecode(p.ast, "loopForever");
  assert.notEqual(prog, null, "while-true flow must be bytecode-eligible (pure, integer-only)");
  // Pre-fix this spun forever. With a low cap it must throw the 'Loop exceeded' trap promptly.
  assert.throws(() => runBytecode(prog, [], 5), /Loop exceeded maximum iteration count \(5\)/);
});

test("runBytecode: a bounded loop under the cap still computes the correct value", () => {
  clearBytecodeCache();
  const p = parse(
    "pure flow sumTo(n: Int) -> Int contract { effects {} } { mut t: Int = 0  mut i: Int = 1  while i <= n { t = t + i  i = i + 1 } return t }",
    "sum.fungi",
  );
  const prog = compileToBytecode(p.ast, "sumTo");
  // 100 iterations, cap 100_000 → runs; cap 50 → traps (proves the cap is honored, not ignored).
  assert.equal(runBytecode(prog, [100]), 5050);
  assert.throws(() => runBytecode(prog, [100], 50), /Loop exceeded maximum iteration count \(50\)/);
});

test("end-to-end: a runaway pure flow FAILS CLOSED via the bytecode tier (byte-identical to the walker)", async () => {
  clearBytecodeCache();
  clearPureFlowCache?.();
  const p = parse(LOOP_FOREVER, "loop-e2e.fungi");

  // Fast tier (bytecode VM) with a low cap → runtimeError, NOT a hang or a silent partial-success.
  const fast = await executeFlow(
    "loopForever", new Map(), p.ast, p.flows, undefined, undefined,
    { pureFastPath: true, maxIterations: 7 }, undefined, undefined,
  );
  assert.equal(fast.executionTier, "bytecode", "this flow must actually run on the bytecode tier");
  assert.equal(fast.value.__tag, "runtimeError", "runaway bytecode loop must fail closed");
  assert.match(fast.value.message ?? "", /Loop exceeded maximum iteration count \(7\)/);

  // Reference tier (async tree-walker, no fast path) must produce the SAME runtimeError message.
  const ref = await executeFlow(
    "loopForever", new Map(), p.ast, p.flows, undefined, undefined,
    { maxIterations: 7 }, undefined, undefined,
  );
  assert.equal(ref.value.__tag, "runtimeError");
  assert.equal(fast.value.message, ref.value.message, "bytecode + tree-walker traps must be byte-identical");
});

// ── Fail-closed on an unknown opcode (external audit 2026-07-17, RD-0455) ────────────────────────────
// The `default` arm returned 0 — a plausible program value, and Unknown/HOLD in the tri-logic — for a corrupt,
// truncated, or future opcode: a fail-OPEN in a fail-CLOSED VM (everything else traps: overflow, div0, the loop
// cap). It must TRAP. Feed a stream with an opcode the VM doesn't know and assert a throw, not a value.
test("runBytecode: an unknown opcode TRAPS fail-closed (never returns a plausible value like 0)", () => {
  clearBytecodeCache();
  // 4242 is not a member of the Op enum → the switch default must throw, not fall through to `return 0`.
  assert.throws(() => runBytecode({ code: [4242], localCount: 0 }, []), /Unknown bytecode opcode 4242/);
});

test("runBytecode: a corrupt opcode inside an otherwise-valid stream also traps (not a silent wrong value)", () => {
  clearBytecodeCache();
  const p = parse("pure flow c() -> Int contract { effects {} } { return 7 }", "c.fungi");
  const prog = compileToBytecode(p.ast, "c");
  assert.notEqual(prog, null, "a trivial pure flow must be bytecode-eligible");
  // Prepend an unknown opcode — models a truncated/tampered stream. Pre-fix this returned 0 (wrong-but-runnable);
  // it must now trap before it can produce any value.
  assert.throws(() => runBytecode({ ...prog, code: [9998, ...Array.from(prog.code)] }, []), /Unknown bytecode opcode 9998/);
});

// ── Follow-up 2: cache keyed per program AST, not by flow name alone ─────────────────────────────────
test("two distinct flows both named `main` compiled in sequence return their OWN results (direct)", () => {
  const a = parse("pure flow main() -> Int contract { effects {} } { return 11 }", "a.fungi");
  const b = parse("pure flow main() -> Int contract { effects {} } { return 22 }", "b.fungi");
  clearBytecodeCache();
  const ra = tryRunBytecode(a.ast, a.flows, "main", []);
  const rb = tryRunBytecode(b.ast, b.flows, "main", []); // NB: no clear between — exercises the cache
  assert.equal(ra, 11);
  assert.equal(rb, 22, "pre-fix the name-keyed cache served flow a's bytecode (returned 11) for flow b");
});

test("benchmark-runner repro: per-file `main` is isolated even when only the pure-flow cache is cleared", async () => {
  // Mirrors galerina-runner.mjs: it calls clearPureFlowCache() between benchmark files but NOT the bytecode
  // cache; every benchmark's entry flow is named `main`. Pre-fix, file B's `main` got file A's bytecode.
  const a = parse("pure flow main() -> Int contract { effects {} } { return 100 }", "benchA.fungi");
  const b = parse("pure flow main() -> Int contract { effects {} } { return 200 }", "benchB.fungi");
  clearBytecodeCache();
  clearPureFlowCache?.();

  const ra = await executeFlow("main", new Map(), a.ast, a.flows, undefined, undefined,
    { pureFastPath: true, sourceTag: "benchA.fungi" }, undefined, undefined);
  assert.equal(ra.executionTier, "bytecode");
  assert.equal(ra.value.value, 100);

  clearPureFlowCache?.(); // ← exactly what the runner clears between files (bytecode cache untouched)

  const rb = await executeFlow("main", new Map(), b.ast, b.flows, undefined, undefined,
    { pureFastPath: true, sourceTag: "benchB.fungi" }, undefined, undefined);
  assert.equal(rb.executionTier, "bytecode");
  assert.equal(rb.value.value, 200, "pre-fix this returned 100 — file A's cached bytecode poisoned file B");
});
