/**
 * Task #128 — Stage-B WAT emitter fail-CLOSED guard for unsupported statements.
 *
 * Regression for the fail-OPEN bug confirmed in reopen-triage: the statement-lowering
 * switch in emitBlockStatements() handled only assign/return/if/while; its `default`
 * branch emitted `(i32.const 0) ;; unhandled stmt: ${kind}` and continued silently.
 * Any unhandled statement kind — notably `forEachStmt` (for-in loops), which parse and
 * execute correctly in the Stage-A interpreter — compiled to a silent no-op under
 * Stage-B WASM: the loop body simply never ran, with no error. That violates the
 * project's fail-closed charter (audit-phase1-2026-06-16) now that WASM is the measured
 * production tier.
 *
 * The safety fix (part a): the `default` branch now emits an atomic `(unreachable)` trap
 * with a diagnostic, mirroring the ensure/trapDecl gates and the flow-body stub
 * discipline. A flow containing an unsupported statement must therefore EITHER lower
 * correctly OR fail closed (trap / refuse) — it must NEVER produce a silent no-op.
 *
 * Part (b) — real `forEachStmt` lowering — is a follow-up. When it lands, the for-in
 * cases below should lower to a real loop (no `unreachable`); update them then.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT,
} from "../dist/index.js";
import { assembleWAT } from "../dist/wat-assembler.js";

function compileToWAT(src) {
  const prog = parseProgram(src, "test.lln");
  const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse error: " + errs.map(d => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  return renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast));
}

const FOR_IN_FLOW = [
  "pure flow sumList(items: List<Int>) -> Int",
  "contract { effects {} }",
  "{ let total = 0",
  "  for x in items {",
  "    let total = total + x",
  "  }",
  "  return total }",
].join("\n");

// ---------------------------------------------------------------------------
// The core regression: unsupported statement must fail closed, never silently.
// ---------------------------------------------------------------------------

describe("Task #128: Stage-B WAT emitter fails closed on unsupported statements", () => {
  it("for-in (forEachStmt) does NOT lower to the old silent no-op fallthrough", () => {
    const wat = compileToWAT(FOR_IN_FLOW);
    // The fail-OPEN marker must be gone entirely.
    assert.ok(
      !wat.includes("unhandled stmt"),
      `fail-OPEN: emitter still emits the silent "unhandled stmt" fallthrough:\n${wat}`,
    );
    // And specifically no `(i32.const 0)` masquerading as the lowered loop.
    assert.ok(
      !/\(i32\.const 0\)\s*;;\s*unhandled/.test(wat),
      `fail-OPEN: unsupported stmt lowered to a silent (i32.const 0) no-op:\n${wat}`,
    );
  });

  it("for-in (forEachStmt) lowers to a fail-CLOSED (unreachable) trap with a diagnostic", () => {
    const wat = compileToWAT(FOR_IN_FLOW);
    assert.ok(
      wat.includes("unreachable"),
      `expected a fail-closed (unreachable) trap for the unsupported statement:\n${wat}`,
    );
    assert.ok(
      wat.includes("unsupported-in-WASM: forEachStmt"),
      `expected an "unsupported-in-WASM" diagnostic naming the unhandled kind:\n${wat}`,
    );
  });

  it("the fail-closed module is still well-formed WAT (trap, not garbage)", async () => {
    const wat = compileToWAT(FOR_IN_FLOW);
    assert.ok(wat.startsWith("(module"), `must start with (module:\n${wat}`);
    // Parens must balance — an (unreachable) terminator must not leave dangling forms.
    const opens  = (wat.match(/\(/g) ?? []).length;
    const closes = (wat.match(/\)/g) ?? []).length;
    assert.equal(opens, closes, `parentheses must balance:\n${wat}`);

    // If a real assembler is available, the module must assemble: a fail-closed trap is
    // a VALID module that aborts at runtime, distinct from the old fail-open no-op (which
    // also assembled, but silently returned a wrong result). Either way: no silent no-op.
    const res = await assembleWAT(wat);
    if (res.valid && (res.diagnostics ?? []).length === 0) {
      // Faithful wabt assembly succeeded — the trap is genuine, not a stub.
      assert.ok(res.wasm instanceof Uint8Array || res.wasm?.length > 0,
        `expected non-empty wasm bytes for the fail-closed module`);
    }
    // When wabt is unavailable the assembler returns a stub with diagnostics; we do not
    // assert on that path — the string-level guards above already pin the safety contract.
  });
});

// ---------------------------------------------------------------------------
// Guard must be surgical: supported statements must NOT regress to a trap.
// ---------------------------------------------------------------------------

describe("Task #128: supported statements are unaffected by the guard", () => {
  it("a plain while-loop flow lowers without any unreachable/unsupported trap", () => {
    const wat = compileToWAT([
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"));
    assert.ok(!wat.includes("unreachable"), `supported while-loop must not trap:\n${wat}`);
    assert.ok(!wat.includes("unsupported-in-WASM"), `supported while-loop must not be flagged:\n${wat}`);
    assert.ok(wat.includes("(loop $while_loop_0"), `while-loop must still lower:\n${wat}`);
  });
});
