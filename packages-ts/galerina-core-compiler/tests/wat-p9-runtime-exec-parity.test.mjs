// wat-p9-runtime-exec-parity.test.mjs — P9 R3 for the RUNTIME stage (task #56/#100). runtime.fungi is a
// tree-walker over the gir-emitter's GIR: it traps at EXECUTION, not compile, so its R3 is EXEC-VALUE parity
// — run the admitted runtime on a real GIR and require Stage-A (interpreter) == Stage-B (WASM) on the value.
//
// The stage consumes gir-emitter's GIRExpr/GIRStmt/FlowEntry records, so — the in-tree Option Y pattern —
// the twins compile CONCATENATED: lexer + parser + gir-emitter + runtime + driver (0 top-level name
// collisions verified). The driver takes SOURCE, builds a flow table (buildFlowTable), and RUNS its `main`
// flow (runProgram), projecting the Int return value. This pins TWO things at once:
//   1. runtime.fungi's cross-stage #100 concretization (GIRExpr/GIRStmt/FlowEntry/RtValue/Binding). If any
//      site reverts to Array<Auto>/Auto the WASM side traps (unreachable) and these red.
//   2. the #160 String-match str_eq lowering (see wat-string-match.test.mjs). The GIR opcode dispatch runs
//      through gir-emitter's `opcodeOf` (`match operator { "+" => "add" … }`); with a handle-eq match it
//      returned "unknown" ⇒ applyBinop ⇒ 0, so `3 + 4` compiled to 0. The `3 + 4 == 7` pin below is the
//      non-vacuity guard for exactly that regression.
//
// Behaviour-equivalence is the honest R3 check; a static "no `unreachable`" scan is deliberately NOT used
// (the combined module carries the upstream stages' own dead-branch + #160-tail patterns — the coarse
// false-positive class called out in wat-p9-giremit-parity.test.mjs).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const strip = (p) => {
  let s = readFileSync(join(__dir, "../src/self-hosted", p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

// Driver: SOURCE -> tokenize -> parseFlows -> buildFlowTable -> runProgram("main") -> project the Int result.
// `let rv: RtValue = rr.retVal` is a typed intermediate: the emitter resolves a member read off a typed
// binder (local/param) but not a chained `a.b.c`, so the projection is split into two typed steps.
const DRIVER = `
pure flow runtimeProbe(src: String) -> Int
contract { intent { "P9 R3 driver: build a flow table from source and run its main flow to an Int." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let table = buildFlowTable(p.flows)
      let rr = runProgram(table, "main", Array.empty())
      let rv: RtValue = rr.retVal
      return rv.i
    }
    Err(e) => { return -1 }
  }
}

pure flow runtimeAddProbe(a: Int, b: Int) -> Int {
  let result: RtValue = applyBinop("add", rtInt(a), rtInt(b))
  return result.i
}

pure flow runtimeSubProbe(a: Int, b: Int) -> Int {
  let result: RtValue = applyBinop("sub", rtInt(a), rtInt(b))
  return result.i
}

pure flow runtimeMulProbe(a: Int, b: Int) -> Int {
  let result: RtValue = applyBinop("mul", rtInt(a), rtInt(b))
  return result.i
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n"
  + strip("gir-emitter.fungi") + "\n" + strip("runtime.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-giremit-runtime-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "runtime", prog.ast, /*exportAllPure*/ true));

async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("runtimeProbe", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(res?.value?.value ?? res?.value ?? res);
}
let wasmCtx = null;
async function runWasm(input) {
  if (wasmCtx === null) {
    const asm = await L.assembleWAT(WAT);
    assert.ok(asm.valid && asm.diagnostics.length === 0,
      "combined lexer+parser+gir-emitter+runtime WAT assembles (R0): " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(typeof instance.exports.runtimeProbe, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance };
  }
  // Module start code may intern immutable runtime strings after the compiler's
  // static table is seeded, so a guessed next handle can collide. Allocate dynamic
  // probe inputs through the host registry's canonical allocator instead.
  const srcH = wasmCtx.host.internString(input);
  return Number(wasmCtx.instance.exports.runtimeProbe(srcH));
}

async function runWasmArithmetic(exportName, left, right) {
  if (wasmCtx === null) {
    await runWasm("@version 1\npure flow main() -> Int { return 0 }");
  }
  const target = wasmCtx.instance.exports[exportName];
  assert.equal(typeof target, "function", `${exportName} admitted + exported`);
  return Number(target(left, right));
}

const H = "pure flow main() -> Int\ncontract { intent { \"x\" } }\n";
// {source, expected} — expected is what a CORRECT runtime yields; the WASM must equal the interpreter AND
// this value. Every arithmetic case flexes the opcode string-match path (gir-emitter opcodeOf).
const CORPUS = [
  { src: H + "{ return 7 }", want: 7 },                          // const
  { src: H + "{ return 3 + 4 }", want: 7 },                      // binop add — 0 pre-#160-fix
  { src: H + "{ return 10 - 6 }", want: 4 },                     // binop sub
  { src: H + "{ return 6 * 7 }", want: 42 },                     // binop mul
  { src: H + "{ let x = 5\n return x }", want: 5 },              // let + load
  { src: H + "{ let x = 3 + 4\n return x }", want: 7 },          // let of a binop
  { src: H + "{ mut n = 10\n n = n - 3\n return n }", want: 7 }, // mut + reassign + sub
];

describe("P9 R3 · runtime stage: runProgram EXEC-value parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+gir-emitter+runtime+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0,
      `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });
  for (const { src, want } of CORPUS) {
    it(`runProgram value parity for ${JSON.stringify(src.slice(H.length))}`, async () => {
      const [i, w] = await Promise.all([runInterp(src), runWasm(src)]);
      assert.equal(i, want, `interpreter reference value for ${JSON.stringify(src.slice(H.length))}`);
      assert.equal(w, i, `WASM runProgram value must equal interpreter for ${JSON.stringify(src.slice(H.length))}`);
    });
  }
  it("non-vacuity: `return 3 + 4` yields 7 (NOT 0) through BOTH backends — the #160 string-match pin", async () => {
    const src = H + "{ return 3 + 4 }";
    const [i, w] = await Promise.all([runInterp(src), runWasm(src)]);
    assert.equal(i, 7, "interpreter computes 3+4=7");
    assert.equal(w, 7, "WASM computes 3+4=7 — pre-fix opcodeOf handle-match returned 'unknown' ⇒ applyBinop ⇒ 0");
  });

  it("checked Int32 boundary guards remain executable after self-hosted Wasm lowering", async () => {
    assert.equal(await runWasmArithmetic("runtimeAddProbe", 2147483647, 0), 2147483647);
    assert.equal(await runWasmArithmetic("runtimeSubProbe", -2147483648, 0), -2147483648);
    assert.equal(await runWasmArithmetic("runtimeMulProbe", -2147483648, 1), -2147483648);
  });

  for (const [name, target, left, right] of [
    ["addition overflow", "runtimeAddProbe", 2147483647, 1],
    ["subtraction underflow", "runtimeSubProbe", -2147483648, 1],
    ["multiplication overflow", "runtimeMulProbe", -2147483648, -1],
  ]) {
    it(`${name} remains a terminal Wasm trap`, async () => {
      await assert.rejects(
        () => runWasmArithmetic(target, left, right),
        /unreachable|overflow/i,
      );
    });
  }
});
