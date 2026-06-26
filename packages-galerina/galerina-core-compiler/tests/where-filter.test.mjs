/**
 * `for x in list where <guard> { … }` — filtered iteration (2026-06-19).
 *
 * The `where` keyword (previously reserved-but-unimplemented, lexer.ts) now means: run the loop body
 * only for items where the guard is truthy. Guard form (no masking → no K3 0-aliasing concern): the body
 * simply skips when the guard is false. Tested across the interpreter AND the WASM tier (lowered as an
 * `(if guard (then body))` inside the counted for-in loop), asserting they agree (0014 fidelity).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const SUM_POSITIVE = `pure flow sumPositive(items: List<Int>) -> Int
contract { effects {} }
{ mut total: Int = 0
  for x in items where x > 0 {
    total = total + x
  }
  return total }`;

function parse(src) {
  const p = L.parseProgram(src, "where.spore");
  const errs = p.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse errors: " + errs.map((e) => e.message).join("; "));
  return p;
}
const intList = (nums) => ({ __tag: "list", items: nums.map((v) => ({ __tag: "int", value: v })) });

async function interp(src, nums) {
  const p = parse(src);
  const r = await L.executeFlow("sumPositive", new Map([["items", intList(nums)]]), p.ast, p.flows, undefined, undefined, {}, undefined, undefined);
  return r.value ?? r;
}
async function wasm(src, nums) {
  const p = parse(src);
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "where", p.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const arr = host.imports.host.__array_create();
  for (const n of nums) host.imports.host.__array_append(arr, n);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  return { wat, val: instance.exports.sumPositive(arr) };
}

describe("`where` filter: parses + filters correctly", () => {
  it("parses `for x in items where x > 0 { ... }` cleanly", () => {
    parse(SUM_POSITIVE); // throws on parse error
  });

  it("interpreter: sums only items passing the guard ([3,-2,5,-1,4] → 12)", async () => {
    const v = await interp(SUM_POSITIVE, [3, -2, 5, -1, 4]);
    assert.equal(v.__tag, "int");
    assert.equal(v.value, 12);
  });

  it("interpreter: a guard that rejects everything yields the identity (all-negative → 0)", async () => {
    const v = await interp(SUM_POSITIVE, [-3, -2, -5]);
    assert.equal(v.value, 0);
  });
});

describe("`where` filter: WASM lowering executes + matches the interpreter (0014 fidelity)", () => {
  it("lowers the guard to an (if …) inside the for-in loop and computes the same filtered sum", async () => {
    const nums = [3, -2, 5, -1, 4, 0, 7];
    const { wat, val } = await wasm(SUM_POSITIVE, nums);
    assert.ok(wat.includes("(if ") && wat.includes("(loop $forin_loop_"), `must lower as a guarded loop:\n${wat}`);
    const ref = await interp(SUM_POSITIVE, nums);
    assert.equal(ref.value, 3 + 5 + 4 + 7, "interpreter computes the filtered sum");
    assert.ok(Object.is(val, ref.value), `WASM (${val}) must equal interpreter (${ref.value})`);
  });
});
