/**
 * Record field-order divergence (#32, HIGH) — the WASM tier stored record-literal fields at the LITERAL
 * child index while reads used the DECLARED-layout offset, so an out-of-declared-order literal silently
 * read the WRONG field (the walker is by-name, WASM was by-position). Now WASM stores at the declared
 * offset (one source of truth). This 0014-style differential asserts walker === WASM for an out-of-order
 * literal — it would have FAILED before the fix (walker 11, WASM 20).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compileWAT(src) {
  const p = L.parseProgram(src, "ro.spore");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return { wat: L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "ro", p.ast, true)), prog: p };
}

async function walker(src, flow) {
  const p = L.parseProgram(src, "ro.spore");
  try { L.resolveSymbols(p.ast); L.checkTypes(p.ast); } catch { /* best-effort */ }
  const r = await L.executeFlow(flow, new Map(), p.ast);
  return r.value;
}

async function wasm(src, flow) {
  const { wat } = compileWAT(src);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime(),
  });
  return instance.exports[flow]();
}

const SRC = `record Pair { a: Int, b: Int }
pure flow getA() -> Int
contract { effects {} }
{ let p: Pair = Pair { b: 20, a: 11 }  return p.a }
pure flow getB() -> Int
contract { effects {} }
{ let p: Pair = Pair { b: 20, a: 11 }  return p.b }`;

// The ANONYMOUS, annotation-typed literal (`let p: Pair = { b: 20, a: 11 }` — no named constructor).
// The parser sets node.typeName ONLY for the named-ctor form, so this form had NO declared layout on the
// store side and fell back to the literal child index (by-position) while the read side reads by declared
// offset — re-opening the exact #32 silent-wrong-field divergence (walker getA=11, WASM getA=20). The fix
// resolves the layout from the binding's expectedType (threaded by the letDecl site) when typeName is absent.
const ANON_SRC = `record Pair { a: Int, b: Int }
pure flow getA() -> Int
contract { effects {} }
{ let p: Pair = { b: 20, a: 11 }  return p.a }
pure flow getB() -> Int
contract { effects {} }
{ let p: Pair = { b: 20, a: 11 }  return p.b }`;

describe("Record field-order: WASM ≡ walker (#32)", () => {
  it("an OUT-OF-ORDER literal reads the right field on BOTH tiers (a=11, not 20)", async () => {
    const wA = await walker(SRC, "getA");
    const xA = await wasm(SRC, "getA");
    assert.equal(Number(wA?.value ?? wA), 11, `walker getA`);
    assert.equal(Number(xA), 11, `WASM getA must be 11 (declared field a), not 20 (literal slot 0)`);
  });

  it("the other field too (b=20 on both tiers)", async () => {
    const wB = await walker(SRC, "getB");
    const xB = await wasm(SRC, "getB");
    assert.equal(Number(wB?.value ?? wB), 20, `walker getB`);
    assert.equal(Number(xB), 20, `WASM getB`);
  });

  it("ANONYMOUS annotation-typed out-of-order literal also reads by NAME on both tiers (a=11)", async () => {
    const wA = await walker(ANON_SRC, "getA");
    const xA = await wasm(ANON_SRC, "getA");
    assert.equal(Number(wA?.value ?? wA), 11, `walker getA (anon)`);
    assert.equal(Number(xA), 11, `WASM getA (anon) must be 11 (declared field a), not 20 — would fail pre-fix`);
  });

  it("ANONYMOUS form — the other field too (b=20 on both tiers)", async () => {
    const wB = await walker(ANON_SRC, "getB");
    const xB = await wasm(ANON_SRC, "getB");
    assert.equal(Number(wB?.value ?? wB), 20, `walker getB (anon)`);
    assert.equal(Number(xB), 20, `WASM getB (anon)`);
  });
});
