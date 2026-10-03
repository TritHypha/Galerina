// E5 (PROVISIONAL, open to Codex's revision): Float32 / Float16 run at their real binary width on BOTH tiers.
// Question-03 option B. Every value case is a three-way differential: WASM == tree-walker == an independent
// truth table built from Math.fround / Math.f16round (the Float32Array / Float16Array store rounding).
// Also pins: the plain-Float32 WAT is valid (the old module was rejected by wabt), Float32 record fields
// use a 4-byte f32 slot, Float16 record fields stay refused (FUNGI-LAYOUT-001), forms the provisional lane
// cannot lower faithfully are refused (FUNGI-WAT-FLOAT32-001), and the fast tiers bail to the walker.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import { roundToNarrowFloat, softF16Round } from "../dist/narrow-float.js";
import { flowDeclaresUnlowerable64, flowDeclaresSyncTierUnlowerable } from "../dist/numeric-lowering.js";

const f32 = Math.fround;
const f16 = (x) => (typeof Math.f16round === "function" ? Math.f16round(x) : softF16Round(x));
const C = "contract { effects {} }";

function parse(src) {
  const p = L.parseProgram(src, "e5.fungi");
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parses clean: " + JSON.stringify(errs.slice(0, 2)));
  return p;
}
function watOf(src) {
  const p = parse(src);
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "e5", p.ast, true));
}
async function wasmFn(src, flow = "f") {
  const wat = watOf(src);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `wabt accepts the module: ${JSON.stringify(asm.diagnostics).slice(0, 300)}\n${wat}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
  return instance.exports[flow];
}
async function interp(src, args, flow = "f") {
  const p = parse(src);
  const m = new Map(Object.entries(args).map(([k, v]) => [k, Number.isInteger(v) && k.startsWith("n") ? { __tag: "int", value: v } : { __tag: "float", value: v }]));
  const r = await L.executeFlow(flow, m, p.ast, p.flows);
  const v = r?.value;
  if (v?.__tag === "runtimeError") return { trap: v.message };
  if (v?.__tag === "bool") return { value: v.value ? 1 : 0 };
  return { value: v?.value, width: v?.width };
}
async function wasmRun(fn, args) {
  try { return { value: Number(fn(...Object.values(args))) }; } catch (e) { return { trap: String(e?.message ?? e) }; }
}
/** Assert WASM == walker == truth (Object.is: -0 and +0 differ); `want === "trap"` means both fail closed. */
async function threeWay(label, src, args, want) {
  const fn = await wasmFn(src);
  const w = await wasmRun(fn, args);
  const i = await interp(src, args);
  if (want === "trap") {
    assert.ok("trap" in w, `${label}: WASM must trap, got ${w.value}`);
    assert.ok("trap" in i, `${label}: walker must trap, got ${i.value}`);
    return;
  }
  assert.ok(Object.is(w.value, want), `${label}: WASM ${w.value} !== truth ${want}${w.trap ? " (trap " + w.trap + ")" : ""}`);
  assert.ok(Object.is(i.value, want), `${label}: walker ${i.value} !== truth ${want}${i.trap ? " (trap " + i.trap + ")" : ""}`);
}

const F32_VALUES = [0.1, 0.2, 1 / 3, -2.5, 1.0000001, 16777217, 123456.789, 1e-30, 1.4e-45, 3.4e38, -0];
const F16_VALUES = [0.1, 0.2, 1 / 3, -2.5, 1.001, 2049, 65504, 6.1e-5, 6e-8, 0.5, -0];
const OPS = [["+", (a, b) => a + b], ["-", (a, b) => a - b], ["*", (a, b) => a * b], ["/", (a, b) => a / b]];

describe("E5 truth table: Float32 arithmetic is binary32 (WASM == walker == Math.fround)", () => {
  for (const [op, js] of OPS) {
    it(`Float32 ${op}`, async () => {
      const src = `pure flow f(x: Float32, y: Float32) -> Float32\n${C}\n{ return x ${op} y }\n`;
      const fn = await wasmFn(src);
      for (let k = 0; k < F32_VALUES.length; k++) {
        const x = F32_VALUES[k], y = F32_VALUES[(k * 7 + 3) % F32_VALUES.length];
        const exact = js(f32(x), f32(y));
        const want = Number.isFinite(f32(exact)) ? f32(exact) : "trap";
        const w = await wasmRun(fn, { x, y });
        const i = await interp(src, { x, y });
        if (want === "trap") { assert.ok(w.trap && i.trap, `${x} ${op} ${y}: both tiers trap`); continue; }
        assert.ok(Object.is(w.value, want), `WASM ${x} ${op} ${y} = ${w.value}, truth ${want}`);
        assert.ok(Object.is(i.value, want), `walker ${x} ${op} ${y} = ${i.value}, truth ${want}`);
        assert.equal(i.width, 32, "the walker tags the Float32 result");
      }
    });
  }
  it("the conformance pin: f32(0.1)+f32(0.2) = 0.30000001192092896, not the f64 answer", async () => {
    await threeWay("pin", `pure flow f(a: Float32, b: Float32) -> Float32\n${C}\n{ return a + b }\n`, { a: 0.1, b: 0.2 }, 0.30000001192092896);
  });
  it("chained ops round after EVERY op (x*y + x), not once at the end", async () => {
    const x = 0.1, y = 3;
    const want = f32(f32(f32(x) * f32(y)) + f32(x));
    await threeWay("chain", `pure flow f(x: Float32, y: Float32) -> Float32\n${C}\n{ return x * y + x }\n`, { x, y }, want);
  });
});

describe("E5 truth table: Float16 arithmetic is binary16 (WASM == walker == Math.f16round)", () => {
  it("softF16Round (the WASM helper's algorithm) agrees with Math.f16round over a sweep", () => {
    if (typeof Math.f16round !== "function") return;
    const xs = [0, -0, 65504, 65519.99, 65520, -65520, 6.1035e-5, 5.96e-8, 2.98e-8, 2.99e-8, 1e-10, 1 / 3, 2049, 2051, 1.0009765625, 1e6];
    for (let k = 1; k < 4000; k++) xs.push((k * 0.37) ** 2 * (k % 2 ? 1 : -1) / 97, 2 ** (k % 40 - 26) * (1 + k / 4096));
    for (const x of xs) assert.ok(Object.is(softF16Round(x), Math.f16round(x)), `softF16Round(${x}) = ${softF16Round(x)}, f16round ${Math.f16round(x)}`);
    assert.ok(Object.is(roundToNarrowFloat(0.1, 32), Math.fround(0.1)));
  });
  for (const [op, js] of OPS) {
    it(`Float16 ${op}`, async () => {
      const src = `pure flow f(x: Float16, y: Float16) -> Float16\n${C}\n{ return x ${op} y }\n`;
      const fn = await wasmFn(src);
      for (let k = 0; k < F16_VALUES.length; k++) {
        const x = F16_VALUES[k], y = F16_VALUES[(k * 5 + 2) % F16_VALUES.length];
        const exact = js(f16(x), f16(y));
        const want = Number.isFinite(f16(exact)) ? f16(exact) : "trap";
        const w = await wasmRun(fn, { x, y });
        const i = await interp(src, { x, y });
        if (want === "trap") { assert.ok(w.trap && i.trap, `${x} ${op} ${y}: both tiers trap`); continue; }
        assert.ok(Object.is(w.value, want), `WASM ${x} ${op} ${y} = ${w.value}, truth ${want}`);
        assert.ok(Object.is(i.value, want), `walker ${x} ${op} ${y} = ${i.value}, truth ${want}`);
      }
    });
  }
  it("the f16 exact-halves pin and the binary16 overflow trap", async () => {
    await threeWay("halves", `pure flow f(a: Float16, b: Float16) -> Float16\n${C}\n{ return a + b }\n`, { a: 0.5, b: 0.25 }, 0.75);
    await threeWay("overflow", `pure flow f(a: Float16, b: Float16) -> Float16\n${C}\n{ return a + b }\n`, { a: 65504, b: 32 }, "trap");
  });
});

describe("E5 declared slots, literals, comparisons and mixing", () => {
  it("parameter admission rounds (identity returns the binary32 value)", async () => {
    await threeWay("id", `pure flow f(x: Float32) -> Float32\n${C}\n{ return x }\n`, { x: 0.1 }, f32(0.1));
    await threeWay("id-overflow", `pure flow f(x: Float32) -> Float32\n${C}\n{ return x }\n`, { x: 1e300 }, "trap");
  });
  it("a literal adopts the narrow context: x + 0.1 rounds 0.1 first", async () => {
    await threeWay("lit", `pure flow f(x: Float32) -> Float32\n${C}\n{ return x + 0.1 }\n`, { x: 0.2 }, f32(f32(0.2) + f32(0.1)));
    await threeWay("intlit", `pure flow f(x: Float32) -> Float32\n${C}\n{ return x * 3 }\n`, { x: 0.1 }, f32(f32(0.1) * 3));
  });
  it("comparison against a literal compares binary32 values (x == 0.1 is true for x = 0.1)", async () => {
    await threeWay("eq", `pure flow f(x: Float32) -> Bool\n${C}\n{ return x == 0.1 }\n`, { x: 0.1 }, 1);
    await threeWay("lt", `pure flow f(x: Float32) -> Bool\n${C}\n{ return x < 0.1 }\n`, { x: 0.1 }, 0);
  });
  it("negation keeps the width; let/mut and assignment round to the declared width", async () => {
    await threeWay("neg", `pure flow f(x: Float32) -> Float32\n${C}\n{ return -x }\n`, { x: 0.1 }, -f32(0.1));
    await threeWay("let", `pure flow f(z: Float) -> Float32\n${C}\n{ let y: Float32 = z\n  return y + y }\n`, { z: 0.1 }, f32(f32(0.1) * 2));
    await threeWay("letlit", `pure flow f(x: Float32) -> Float32\n${C}\n{ let y: Float32 = 0.1\n  return x * y }\n`, { x: 3 }, f32(3 * f32(0.1)));
    await threeWay("mut", `pure flow f(z: Float) -> Float32\n${C}\n{ mut y: Float32 = 0.5\n  y = z\n  return y }\n`, { z: 0.1 }, f32(0.1));
  });
  it("Float32 mixed with a Float VARIABLE promotes to f64 (no implicit narrowing)", async () => {
    await threeWay("mix", `pure flow f(x: Float32, y: Float) -> Float\n${C}\n{ return x + y }\n`, { x: 0.1, y: 0.2 }, f32(0.1) + 0.2);
  });
  it("Float16 next to Float32 widens to Float32", async () => {
    await threeWay("w", `pure flow f(x: Float16, y: Float32) -> Float32\n${C}\n{ return x + y }\n`, { x: 0.1, y: 0.2 }, f32(f16(0.1) + f32(0.2)));
  });
  it("an Int and a Float return into Float32 round at the flow exit", async () => {
    await threeWay("int", `pure flow f(n: Int) -> Float32\n${C}\n{ return n }\n`, { n: 16777217 }, 16777216);
    await threeWay("ret", `pure flow f(z: Float) -> Float32\n${C}\n{ return z }\n`, { z: 0.1 }, f32(0.1));
  });
});

describe("E5 record layout: Float32 = 4-byte f32 slot; Float16 stays refused", () => {
  it("a Float32 field stores and reloads its binary32 value; the slot is 4 bytes", async () => {
    const src = `record P { a: Float32; b: Int; c: Float }\npure flow f(x: Float32) -> Float32\n${C}\n{ let p = P { a: x, b: 7, c: 0.5 }\n  return p.a }\n`;
    await threeWay("rec", src, { x: 0.1 }, f32(0.1));
    const wat = watOf(src);
    assert.match(wat, /\(f32\.store \(i32\.add \(local\.get \$__fungi_rec_\d+\) \(i32\.const 0\)\) \(f32\.demote_f64/, "a at offset 0, stored as f32");
    assert.match(wat, /\(i32\.store \(i32\.add \(local\.get \$__fungi_rec_\d+\) \(i32\.const 4\)\)/, "b follows at offset 4 (the f32 slot is 4 bytes)");
    assert.match(wat, /\(f64\.store \(i32\.add \(local\.get \$__fungi_rec_\d+\) \(i32\.const 8\)\)/, "c is 8-aligned at offset 8");
    assert.match(wat, /\(f64\.promote_f32 \(f32\.load/, "the load promotes back into the f64 lane");
  });
  it("a literal or f64 value into a Float32 slot is refused (FUNGI-WAT-FLOAT32-001)", () => {
    for (const init of ["0.1", "z"]) {
      const src = `record P { a: Float32; b: Int }\npure flow f(z: Float) -> Int\n${C}\n{ let p = P { a: ${init}, b: 7 }\n  return p.b }\n`;
      assert.throws(() => watOf(src), /FUNGI-WAT-FLOAT32-001/, `refuses a: ${init}`);
    }
  });
  it("a Float16 record field stays refused (FUNGI-LAYOUT-001)", () => {
    const src = `record H { a: Float16 }\npure flow f() -> Int\n${C}\n{ return 0 }\n`;
    assert.throws(() => watOf(src), /FUNGI-LAYOUT-001[\s\S]*H\.a: Float16/);
  });
});

describe("E5 tier routing", () => {
  it("the bytecode VM and the sync fast path bail on Float32/Float16 flows (the walker rounds)", () => {
    for (const T of ["Float32", "Float16"]) {
      const p = parse(`pure flow f(x: ${T}) -> ${T}\n${C}\n{ return x }\n`);
      const node = p.ast.children.find((c) => c.value === "f");
      assert.equal(flowDeclaresUnlowerable64(node), true, `${T}: VM bails`);
      assert.equal(flowDeclaresSyncTierUnlowerable(node), true, `${T}: sync bails`);
      const q = parse(`pure flow g(n: Int) -> Int\n${C}\n{ let y: ${T} = 0.5\n  return n }\n`);
      assert.equal(flowDeclaresUnlowerable64(q.ast.children.find((c) => c.value === "g")), true, `${T} binding: VM bails`);
    }
  });
  it("plain Float flows are untouched (no rounding helper is emitted)", () => {
    const wat = watOf(`pure flow f(x: Float, y: Float) -> Float\n${C}\n{ return x + y }\n`);
    assert.equal(/fungi_round_f/.test(wat), false);
  });
});
