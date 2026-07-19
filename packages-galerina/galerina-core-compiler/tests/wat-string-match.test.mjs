/**
 * #160 — a `match` whose SUBJECT is a String must compare each arm pattern by VALUE
 * (host___str_eq), never by i32.eq on interned string HANDLES. Equal-valued strings can
 * have different handles (a runtime-produced string vs a compile-time literal), so an
 * i32.eq handle compare silently falls to the wildcard `_` arm and returns the wrong
 * answer in real WASM — while the interpreter (content compare) returns the right one.
 *
 * Regression guard. The `==`/`!=` operators were already type-directed to str_eq (#160),
 * but the match-arm lowering was not: string-literal arms emitted `(i32.eq subject <id>)`.
 * The self-hosted compiler's `opcodeOf` (`match operator { "+" => "add" … }`) hit exactly
 * this: every arm fell to `_` ⇒ "unknown" ⇒ the runtime's applyBinop returned 0, so a
 * compiled `3 + 4` evaluated to 0. This is the statement/expression form of the same
 * silent fail-OPEN the wildcard-fallback guard bans — caught here at the value level.
 *
 * The trap: the wildcard returns a THIRD value (9 / 0) distinct from every literal arm, so
 * the pre-fix silent fall-through is DISTINGUISHABLE from a correct route (an init===wildcard
 * test would pass while broken). Args are seeded as RUNTIME strings at handles above the
 * interned-literal range, so their handles differ from the arm literals — the exact
 * condition an i32.eq handle compare gets wrong.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
// opcodeOf shape: the self-hosted gir-emitter maps a source operator to a GIR opcode.
pure flow opcodeOf(op: String) -> Int
contract { intent { "map an operator string to a small integer code (opcodeOf shape)" } }
{
  match op {
    "add" => { return 1 }
    "sub" => { return 2 }
    "mul" => { return 3 }
    _ => { return 9 }
  }
}

// A numeric-LOOKING string pattern must still match by value — parseInt must not hijack it
// into an i32.eq against the parsed integer (that compares a string handle to a small int).
pure flow numericPattern(s: String) -> Int
contract { intent { "numeric-looking string patterns still compare by string value" } }
{
  match s {
    "1" => { return 100 }
    "2" => { return 200 }
    _ => { return 0 }
  }
}
`;

/** Build + sign + admit the module once; return {instance, host, nextHandle} with interned literals seeded. */
async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "wat-string-match.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "program compiles clean: " + JSON.stringify(errs.slice(0, 3)));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wat-string-match", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, "module assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  let maxHandle = 0;
  for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxHandle) maxHandle = e.handle; }
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  return { instance, host, nextHandle: maxHandle + 1, prog };
}

/** Call an export with a RUNTIME string seeded at a fresh handle (above the interned range). */
function callWasm(ctx, fn, s) {
  const h = ctx.nextHandle++;
  ctx.host.seedString(h, s);
  return Number(ctx.instance.exports[fn](h));
}

async function callInterp(prog, fn, s) {
  const args = new Map([[fn === "opcodeOf" ? "op" : "s", { __tag: "string", value: s }]]);
  const r = await L.executeFlow(fn, args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(r?.value?.value ?? r?.value ?? r);
}

describe("#160 String-subject match compares by VALUE, not by interned handle (WASM)", () => {
  it("each literal arm fires for a runtime string — NOT the wildcard", async () => {
    const ctx = await instantiate();
    assert.equal(callWasm(ctx, "opcodeOf", "add"), 1, '"add" → arm 1 (pre-fix: handle-eq fell to `_` ⇒ 9)');
    assert.equal(callWasm(ctx, "opcodeOf", "sub"), 2, '"sub" → arm 2');
    assert.equal(callWasm(ctx, "opcodeOf", "mul"), 3, '"mul" → arm 3');
  });

  it("an unmatched string routes to the wildcard", async () => {
    const ctx = await instantiate();
    assert.equal(callWasm(ctx, "opcodeOf", "xor"), 9, '"xor" → `_` ⇒ 9');
  });

  it("numeric-looking string patterns compare by value (parseInt must not hijack)", async () => {
    const ctx = await instantiate();
    assert.equal(callWasm(ctx, "numericPattern", "1"), 100, '"1" → arm 100 (pre-fix: parseInt→i32.eq handle ⇒ 0)');
    assert.equal(callWasm(ctx, "numericPattern", "2"), 200, '"2" → arm 200');
    assert.equal(callWasm(ctx, "numericPattern", "3"), 0, '"3" → `_` ⇒ 0');
  });

  it("WASM matches the interpreter (Stage-A ≡ Stage-B) across the corpus", async () => {
    const ctx = await instantiate();
    for (const [fn, s] of [["opcodeOf", "add"], ["opcodeOf", "sub"], ["opcodeOf", "mul"], ["opcodeOf", "zzz"],
                           ["numericPattern", "1"], ["numericPattern", "2"], ["numericPattern", "9"]]) {
      const i = await callInterp(ctx.prog, fn, s);
      const w = callWasm(ctx, fn, s);
      assert.equal(w, i, `${fn}(${JSON.stringify(s)}): interp=${i} wasm=${w}`);
    }
  });
});
