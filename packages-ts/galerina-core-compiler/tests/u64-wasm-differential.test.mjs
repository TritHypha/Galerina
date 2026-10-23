// UInt64 WASM differential (#52, follow-up to the walker unlock 3022fe1) — the wat-emitter now lowers
// uint64×uint64 FAITHFULLY (checked u64 helpers for +/-/*, native i64.div_u/rem_u, UNSIGNED compares), so
// the WASM tier is byte-exact with the tree-walker's u64-arith. A WASM i64 result crosses to JS as a SIGNED
// BigInt, so a UInt64 value is re-interpreted unsigned via BigInt.asUintN(64, …) (the boundary's job; the
// bits are identical). Overflow / unsigned underflow / ÷0 TRAP on BOTH tiers (no silent 2^64 wrap).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const C = `contract { effects {} }`;
const flowU64 = (body) => `pure flow f() -> UInt64\n${C}\n{ ${body} }`;

async function walker(src) {
  const p = L.parseProgram(src, "p.fungi");
  try { L.resolveSymbols(p.ast); L.checkTypes(p.ast); } catch {}
  const r = await L.executeFlow("f", new Map(), p.ast);
  return r.value;
}
function compileWAT(src) {
  const p = L.parseProgram(src, "p.fungi");
  assert.equal(p.diagnostics.filter((d) => d.severity === "error").length, 0, "parse");
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "p", p.ast, true));
}
async function wasmThunk(src) {
  const asm = await L.assembleWAT(compileWAT(src));
  assert.ok(asm.valid, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime(),
  });
  return instance.exports.f;
}

describe("UInt64 WASM ≡ walker (#52 unsigned-64 lowering)", () => {
  const FINITE = [
    ["add < 2^53→2^53+", `let a: UInt64 = 3000000000  let b: UInt64 = 3000000000  return a + b`],
    ["mul into 1.6e19 (> 2^63, exposes unsignedness)", `let a: UInt64 = 4000000000  return a * a`],
    ["div_u of U64_MAX/2", `let a: UInt64 = 18446744073709551615  let b: UInt64 = 2  return a / b`],
    ["rem_u", `let a: UInt64 = 10  let b: UInt64 = 3  return a % b`],
    ["sub", `let a: UInt64 = 5000000000  let b: UInt64 = 1000000000  return a - b`],
  ];
  for (const [label, body] of FINITE) {
    it(`${label} — walker bigint === asUintN(64, wasm i64)`, async () => {
      const src = flowU64(body);
      const w = await walker(src);
      assert.equal(w.__tag, "uint64", `walker tag: ${w.__tag} (value ${String(w.value)})`);
      const x = (await wasmThunk(src))();
      assert.equal(BigInt.asUintN(64, x), w.value, `${label}: WASM (unsigned) must equal the walker u64`);
    });
  }

  const TRAPS = [
    ["overflow (U64_MAX + 1)", `let a: UInt64 = 18446744073709551615  let b: UInt64 = 1  return a + b`],
    ["unsigned underflow (0 - 1)", `let a: UInt64 = 0  let b: UInt64 = 1  return a - b`],
    ["divide by zero", `let a: UInt64 = 5  let b: UInt64 = 0  return a / b`],
  ];
  for (const [label, body] of TRAPS) {
    it(`${label} — BOTH tiers fail closed (no silent 2^64 wrap)`, async () => {
      const src = flowU64(body);
      const w = await walker(src);
      assert.equal(w.__tag, "runtimeError", `walker must trap: ${label}`);
      const thunk = await wasmThunk(src);
      assert.throws(() => thunk(), `WASM must trap (unreachable): ${label}`);
    });
  }

  it("the WAT uses UNSIGNED ops (div_u / lt_u / checked u64 helpers), never signed i64 for a UInt64 flow", () => {
    const wat = compileWAT(flowU64(`let a: UInt64 = 10  let b: UInt64 = 3  let q: UInt64 = a / b  let r: UInt64 = a + b  return r`));
    assert.match(wat, /i64\.div_u/, "division must be unsigned");
    assert.match(wat, /fungi_checked_add_u64/, "addition must use the checked u64 helper");
    assert.doesNotMatch(wat, /i64\.div_s|fungi_checked_add_i64/, "must NOT use signed i64 ops for a UInt64 flow");
  });

  it("mixed UInt64×Int calls preserve positive promotion and refuse negative operands and WASM lowering", async () => {
    const src = `pure flow f(k: Int) -> UInt64\n${C}\n{ let n: UInt64 = 100  return n + k }`;
    assert.throws(() => compileWAT(src), /FUNGI-WAT-INT64-001/,
      "unsupported mixed-width WASM must refuse with its named diagnostic, not emit an unreachable stub");
    const parsed = L.parseProgram(src, "mixed-u64-int-parameter.fungi");
    assert.deepEqual(parsed.diagnostics, [], "the call-parameter case must parse without unrelated errors");
    const positive = await L.executeFlow("f", new Map([["k", { __tag: "int", value: 5 }]]), parsed.ast);
    assert.deepEqual(positive.value, { __tag: "uint64", value: 105n },
      "a non-negative Int call argument must widen exactly in the reference walker");
    const negative = await L.executeFlow("f", new Map([["k", { __tag: "int", value: -1 }]]), parsed.ast);
    assert.equal(negative.value.__tag, "runtimeError",
      "a negative Int call argument cannot enter unsigned arithmetic and must fail closed");
    assert.match(negative.value.message, /IntegerOverflow/,
      "negative-to-unsigned refusal must retain the checked overflow reason");
  });

  it("preserves exact UInt64 precision when a large value is combined with an Int parameter", async () => {
    const src = `pure flow f(k: Int) -> UInt64\n${C}\n{ let n: UInt64 = 9007199254740992  return n + k }`;
    const parsed = L.parseProgram(src, "mixed-u64-int-precision.fungi");
    assert.deepEqual(parsed.diagnostics, [], "the precision case must parse without unrelated errors");
    const result = await L.executeFlow("f", new Map([["k", { __tag: "int", value: 1 }]]), parsed.ast);
    assert.deepEqual(result.value, { __tag: "uint64", value: 9007199254740993n },
      "UInt64 arithmetic must not round through JavaScript Number at an Int parameter boundary");
  });

  it("rejects an out-of-i32 host Int before widening it to UInt64", async () => {
    const src = `pure flow f(k: Int) -> UInt64\n${C}\n{ return k }`;
    const parsed = L.parseProgram(src, "mixed-u64-int-host-boundary.fungi");
    assert.deepEqual(parsed.diagnostics, [], "the host-boundary case must parse without unrelated errors");
    const max = await L.executeFlow("f", new Map([["k", { __tag: "int", value: 2147483647 }]]), parsed.ast);
    assert.deepEqual(max.value, { __tag: "uint64", value: 2147483647n },
      "the maximum signed i32 remains exactly widenable");
    const overflow = await L.executeFlow("f", new Map([["k", { __tag: "int", value: 2147483648 }]]), parsed.ast);
    assert.equal(overflow.value.__tag, "runtimeError",
      "a host number outside the declared Int/i32 domain must be refused before widening");
    assert.match(overflow.value.message, /expected a signed i32 value/);
  });
});
