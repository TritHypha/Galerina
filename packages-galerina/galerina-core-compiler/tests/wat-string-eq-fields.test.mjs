/**
 * #160 str_eq — `==` / `!=` between two String record FIELDS must compare by VALUE
 * (host___str_eq), never by i32.eq on interned string HANDLES. Equal-valued strings from
 * different sources have different handles, so a handle compare returns the WRONG answer in
 * real WASM while the interpreter (content compare) returns the right one.
 *
 * Sibling of the match str_eq bug, in the `==` operator. `==` keys str_eq off EITHER operand
 * being inferred as String OR a string-LITERAL operand. `a.s == b.s` has neither: both are
 * memberExprs and `inferExprType` returned undefined for a memberExpr, so it fell through to
 * i32.eq on handles. The fix teaches inferExprType to resolve a memberExpr `a.s` to its field's
 * declared type via a recordType→field→type registry (built like recordLayouts). `field == param`
 * already worked (the param resolves to String); this pins the field == field case.
 *
 * The corpus seeds x and y as RUNTIME strings at distinct handles, so equal CONTENT with different
 * HANDLES is exactly the condition an i32.eq handle compare gets wrong.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
record R { s: String; n: Int }

// a.s == b.s : both operands are memberExprs (no literal, no identifier) — inferExprType must
// resolve the field type to String or this lowers to i32.eq on handles.
pure flow eqFields(x: String, y: String) -> Int
contract { intent { "compare two String record fields with ==" } }
{
  let a = R { s: x, n: 0 }
  let b = R { s: y, n: 0 }
  if a.s == b.s { return 1 }
  return 0
}

pure flow neFields(x: String, y: String) -> Int
contract { intent { "compare two String record fields with !=" } }
{
  let a = R { s: x, n: 0 }
  let b = R { s: y, n: 0 }
  if a.s != b.s { return 1 }
  return 0
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "wat-string-eq-fields.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "program compiles clean: " + JSON.stringify(errs.slice(0, 3)));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wat-string-eq-fields", prog.ast, true));
  // Structural pin: the field == field compare must be host___str_eq, never a raw i32.eq on handles.
  const eqBody = wat.split(/\(func \$/).find((s) => s.startsWith("eqFields")) ?? "";
  assert.ok(/host___str_eq/.test(eqBody), "eqFields must lower `a.s == b.s` to host___str_eq (content), not i32.eq (handle)");
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

function callWasm(ctx, fn, x, y) {
  const hx = ctx.nextHandle++; ctx.host.seedString(hx, x);
  const hy = ctx.nextHandle++; ctx.host.seedString(hy, y);
  return Number(ctx.instance.exports[fn](hx, hy));
}
async function callInterp(prog, fn, x, y) {
  const args = new Map([["x", { __tag: "string", value: x }], ["y", { __tag: "string", value: y }]]);
  const r = await L.executeFlow(fn, args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(r?.value?.value ?? r?.value ?? r);
}

describe("#160 `==`/`!=` between two String FIELDS compares by value, not by interned handle (WASM)", () => {
  it("a.s == b.s is TRUE for equal content at different handles (pre-fix: i32.eq handle ⇒ 0)", async () => {
    const ctx = await instantiate();
    assert.equal(callWasm(ctx, "eqFields", "hello", "hello"), 1, "equal content ⇒ 1");
    assert.equal(callWasm(ctx, "eqFields", "abc", "xyz"), 0, "different content ⇒ 0");
  });
  it("a.s != b.s is the complement", async () => {
    const ctx = await instantiate();
    assert.equal(callWasm(ctx, "neFields", "hello", "hello"), 0, "equal content ⇒ != is 0");
    assert.equal(callWasm(ctx, "neFields", "abc", "xyz"), 1, "different content ⇒ != is 1");
  });
  it("WASM matches the interpreter (Stage-A ≡ Stage-B)", async () => {
    const ctx = await instantiate();
    for (const [fn, x, y] of [["eqFields", "same", "same"], ["eqFields", "p", "q"], ["neFields", "same", "same"], ["neFields", "p", "q"]]) {
      const i = await callInterp(ctx.prog, fn, x, y);
      const w = callWasm(ctx, fn, x, y);
      assert.equal(w, i, `${fn}(${x},${y}): interp=${i} wasm=${w}`);
    }
  });
});
