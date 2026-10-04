/**
 * ZipPair (Codex GO 2026-10-02, relatedCommit 0d06d6c1) - WASM lowering of
 * Option.zip for i32-lane payloads (Int, Bool, Char, String), both the method
 * form `a.zip(b)` and the static form `Option.zip(a, b)`.
 *
 * Semantics (stdlib Option.zip): Some({ first, second }) when both operands are
 * Some, otherwise None. The pair is an 8-byte bump allocation in the
 * per-invocation arena (same allocator as `#record`). Every other payload type
 * keeps FUNGI-WAT-METHOD-001 with a precise detail.
 *
 * Differential: Wasm == interpreter (executeFlow) == hand truth table.
 * Replay: node --test --test-reporter=tap tests/wat-zippair-lowering.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

const C = "contract { effects {} }";

function optFlow(name, form, opA, opB, body) {
  return `pure flow ${name}(x: Int, y: Int) -> Int
${C}
{
  mut a: Option<Int> = None
  mut b: Option<Int> = None
  if x > 0 { a = Some(x) }
  if y > 0 { b = Some(y) }
  mut r: Int = -1
  match ${form === "static" ? "Option.zip(a, b)" : "a.zip(b)"} {
    Some(p) => { r = ${body} }
    None => { r = -7 }
    _ => { r = -9 }
  }
  return r
}
`;
}

const SRC = [
  optFlow("mzip", "method", "a", "b", "p.first * 1000 + p.second"),
  optFlow("szip", "static", "a", "b", "p.first * 1000 + p.second"),
  `pure flow some(x: Int, y: Int) -> Bool
${C}
{
  mut a: Option<Int> = None
  mut b: Option<Int> = None
  if x > 0 { a = Some(x) }
  if y > 0 { b = Some(y) }
  return a.zip(b).isSome()
}
`,
  `pure flow mixed(x: Int, flag: Bool) -> Int
${C}
{
  let a: Option<Int> = Some(x)
  let b: Option<Bool> = Some(flag)
  mut r: Int = 0
  match a.zip(b) {
    Some(p) => { if p.second { r = p.first } else { r = 0 - p.first } }
    None => { r = -7 }
    _ => { r = -9 }
  }
  return r
}
`,
  `pure flow strs(x: Int) -> Int
${C}
{
  let a: Option<String> = Some("ab")
  let b: Option<String> = Some("cde")
  mut r: Int = 0
  match a.zip(b) {
    Some(p) => { r = p.first.length() * 10 + p.second.length() + x }
    None => { r = -7 }
    _ => { r = -9 }
  }
  return r
}
`,
].join("\n");

function buildWat(src, label) {
  const prog = L.parseProgram(src, label);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${JSON.stringify(errs)}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, label, prog.ast, true));
  return { prog, wat };
}

function buildError(src, label) {
  try { buildWat(src, label); return "(no error)"; } catch (e) { return String(e && e.message ? e.message : e); }
}

async function instantiate(src, label) {
  const { prog, wat } = buildWat(src, label);
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, `WAT did not assemble: ${JSON.stringify(assembled.diagnostics)}`);
  const host = L.createHostRuntime();
  for (const entry of L.getInternedStrings()) host.seedString(entry.handle, entry.value);
  const keys = L.generateRunnerKeypair();
  const attestation = L.signWasm(assembled.wasm, keys.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keys.publicKeyPem },
    host,
  });
  return { prog, wat, instance };
}

async function interp(prog, fn, args) {
  const r = await L.executeFlow(fn, new Map(args), prog.ast, prog.flows);
  return r?.value;
}

const int = (n) => ({ __tag: "int", value: n });
const bool = (b) => ({ __tag: "bool", value: b });

const CASES = [[3, 4], [0, 4], [3, 0], [0, 0], [12, 345], [1, 1]];

describe("ZipPair WASM lowering", () => {
  it("T1 the emitted WAT allocates the pair and calls no zip import", () => {
    const { wat } = buildWat(SRC, "zip-t1.fungi");
    assert.match(wat, /Option\.zip -> __zip_Int_Int/);
    assert.match(wat, /global\.set \$__fungi_heap/);
    assert.equal(/zip/.test(wat.split("\n").filter((l) => /\(import /.test(l)).join("\n")), false);
  });

  it("T2 method and static forms: Wasm == interpreter == truth table", async () => {
    const ctx = await instantiate(SRC, "zip-t2.fungi");
    for (const fn of ["mzip", "szip"]) {
      for (const [x, y] of CASES) {
        const truth = x > 0 && y > 0 ? x * 1000 + y : -7;
        const w = ctx.instance.exports[fn](x, y);
        const i = await interp(ctx.prog, fn, [["x", int(x)], ["y", int(y)]]);
        assert.equal(w, truth, `${fn}(${x},${y}) wasm`);
        assert.equal(Number(i?.value), truth, `${fn}(${x},${y}) interp ${JSON.stringify(i)}`);
      }
    }
  });

  it("T3 isSome on the zipped option matches the interpreter", async () => {
    const ctx = await instantiate(SRC, "zip-t3.fungi");
    for (const [x, y] of CASES) {
      const truth = x > 0 && y > 0;
      const w = ctx.instance.exports.some(x, y);
      const i = await interp(ctx.prog, "some", [["x", int(x)], ["y", int(y)]]);
      assert.equal(w, truth ? 1 : 0, `some(${x},${y}) wasm`);
      assert.equal(i?.value, truth, `some(${x},${y}) interp ${JSON.stringify(i)}`);
    }
  });

  it("T4 mixed Int/Bool payloads keep per-field types", async () => {
    const ctx = await instantiate(SRC, "zip-t4.fungi");
    for (const [x, flag] of [[5, true], [5, false], [0, true], [-9, false]]) {
      const truth = flag ? x : 0 - x;
      const w = ctx.instance.exports.mixed(x, flag ? 1 : 0);
      const i = await interp(ctx.prog, "mixed", [["x", int(x)], ["flag", bool(flag)]]);
      assert.equal(w, truth, `mixed(${x},${flag}) wasm`);
      assert.equal(Number(i?.value), truth, `mixed(${x},${flag}) interp ${JSON.stringify(i)}`);
    }
  });

  it("T5 String payload handles survive the pair", async () => {
    const ctx = await instantiate(SRC, "zip-t5.fungi");
    for (const x of [0, 1, 100]) {
      const truth = 23 + x;
      assert.equal(ctx.instance.exports.strs(x), truth, `strs(${x}) wasm`);
      const i = await interp(ctx.prog, "strs", [["x", int(x)]]);
      assert.equal(Number(i?.value), truth, `strs(${x}) interp ${JSON.stringify(i)}`);
    }
  });

  it("T6 repeated invocations stay exact; the pre-existing host Option bound fails closed", async () => {
    const ctx = await instantiate(SRC, "zip-t6.fungi");
    // At most 3 host Option handles per call, so 1000 calls stay below MAX_WASM_HOST_RECORDS (4096).
    for (let k = 0; k < 1000; k++) assert.equal(ctx.instance.exports.mzip(k % 7, 3), k % 7 > 0 ? (k % 7) * 1000 + 3 : -7);
    // The host Option store is bounded per host runtime (not per invocation): exhausting it throws, never a wrong value.
    assert.throws(() => { for (let k = 0; k < 5000; k++) ctx.instance.exports.mzip(1, 1); }, /Option store exceeds the host bound/);
  });

  for (const [ty, lit] of [["Float", "1.5"], ["Int64", "5"], ["Decimal", "Decimal(\"1.5\")"]]) {
    it(`T7 ${ty} payload keeps METHOD-001 with a precise detail`, () => {
      const src = `pure flow f() -> Int
${C}
{
  let a: Option<${ty}> = Some(${lit})
  let b: Option<Int> = Some(2)
  let z = a.zip(b)
  return 0
}
`;
      const msg = buildError(src, `zip-t7-${ty}.fungi`);
      assert.match(msg, /FUNGI-WAT-METHOD-001/);
      assert.match(msg, /Option\.zip \(ZipPair\)/);
      assert.match(msg, new RegExp(`${ty}/Int are outside the i32 lane set`));
    });
  }

  it("T8 record payload keeps METHOD-001", () => {
    const src = `record Pt { x: Int y: Int }
pure flow f() -> Int
${C}
{
  let a: Option<Pt> = Some(Pt { x: 1, y: 2 })
  let b: Option<Int> = Some(2)
  let z = a.zip(b)
  return 0
}
`;
    const msg = buildError(src, "zip-t8.fungi");
    assert.match(msg, /FUNGI-WAT-METHOD-001/);
    assert.match(msg, /Pt\/Int are outside the i32 lane set/);
  });

  it("T9 the production gate admits the lowered program (CLI route precondition)", () => {
    const prog = L.parseProgram(SRC, "zip-t9.fungi");
    const diags = L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
    assert.equal(diags.length, 0, JSON.stringify(diags));
  });
});
