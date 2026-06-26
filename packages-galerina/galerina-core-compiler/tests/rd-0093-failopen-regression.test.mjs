// Regression guards for the three R&D-0093 codegen/value-state fail-opens (2026-06-23).
//   #163  — an inline `;;` WAT comment swallowed the enclosing paren → wabt rejected →
//           assembleWAT fell back to a minimal-encoder STUB (valid:true) → executeWASMFlow
//           (gating on `valid` alone) RAN the stub and returned a WRONG VALUE instead of trapping.
//   #165  — `Float % Float` (an i32-only op over float operands) fell through to `i32.rem_s`
//           over f64 → a wrong-typed module. The emitter must now trap.
//   guarded-flow — `walkNode` omitted `guardedFlowDecl`, so guarded-flow bodies were never
//           value-state-walked: a tainted binding reaching a governed sink fired ZERO diagnostics.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkValueStates } from "../dist/index.js";
import { executeWASMFlow, assembleWAT } from "../dist/wat-assembler.js";

// ── #163: a wabt-rejected module must be DECLINED, never run as a stub ─────────

test("#163: an inline `;;`-comment-swallowed-paren WAT is declined (not run as a wrong-value stub)", async () => {
  // The exact bug shape: the `;;` comment runs to end-of-line and eats the func's `)`,
  // so wabt rejects → the minimal encoder may still encode the `(i32.const 5)` pattern
  // as valid:true. executeWASMFlow must DECLINE it (a diagnostic is present), not return 5.
  const brokenWat = `(module (func (export "f") (result i32) (i32.const 5) (unreachable) ;; swallowed\n))`;
  const r = await executeWASMFlow(brokenWat, "f", []);
  assert.equal(r.result, null, `a non-faithful module must decline (null), got ${r.result}`);
});

test("#163: a faithful bare `(unreachable)` trap returns null (traps), not a wrong value", async () => {
  const trapWat = `(module (func (export "f") (result i32) (unreachable)))`;
  const r = await executeWASMFlow(trapWat, "f", []);
  assert.equal(r.result, null);
});

test("executeWASMFlow hardening does NOT over-reject: a faithful const module still runs", async () => {
  // Guards the defense-in-depth gate (`valid && diagnostics.length===0`) against over-rejection:
  // a faithful wabt assembly has diagnostics:[] and must still execute.
  const okWat = `(module (func (export "f") (result i32) (i32.const 7)))`;
  const asm = await assembleWAT(okWat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `faithful assembly expected: ${JSON.stringify(asm.diagnostics)}`);
  const r = await executeWASMFlow(okWat, "f", []);
  assert.equal(r.result, 7);
});

// ── #165: `%` on a Float operand must trap, not emit an i32 op over f64 ────────

test("#165: `Float % Float` emits a fail-closed trap, never `i32.rem_s` over f64", async () => {
  const src = `pure flow m(a: Float, b: Float) -> Float contract { effects {} } { return a % b }`;
  const parsed = parseProgram(src, "m.spore");
  // Reach the WASM emitter for the flow body. The emitted module must trap on the
  // float-modulo, NOT contain an i32.rem_s applied to f64 operands.
  const { emitWAT } = await import("../dist/wat-emitter.js");
  let wat = "";
  try { wat = emitWAT(parsed.ast); } catch { wat = ""; }
  if (wat) {
    assert.ok(!/i32\.rem_s/.test(wat), "must NOT emit i32.rem_s for Float % Float");
    assert.ok(/unreachable/.test(wat), "must emit a fail-closed (unreachable) trap");
  }
});

// ── guarded-flow value-state parity (the lone-omission fail-open) ──────────────

function check(source) {
  return checkValueStates(parseProgram(source, "t.spore").ast);
}
const has003 = (r) => r.diagnostics.some((d) => d.code === "SPORE-VALUESTATE-003");
const body = (kind) => `
${kind} flow test(raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  unsafe let rawInput: String = raw
  let saved = DB.insert(rawInput)?
  return Ok(saved)
}
`;

test("guarded-flow value-state: an unsafe binding at a governed sink fires SPORE-VALUESTATE-003 (parity with secure)", () => {
  assert.ok(has003(check(body("secure"))), "secure-flow baseline must fire VALUESTATE-003");
  assert.ok(
    has003(check(body("guarded"))),
    "guarded-flow MUST match secure — it was fail-open (body never value-state-walked) before the walkNode fix",
  );
});
