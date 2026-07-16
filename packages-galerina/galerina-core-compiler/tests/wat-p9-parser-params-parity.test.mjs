// wat-p9-parser-params-parity.test.mjs — P9 R3 increment #1 for the PARSER stage (task #56, U1 frontier):
// `parseParams` produces an IDENTICAL FlowParam list through the Stage-A interpreter AND compiled to real
// WASM through the #105 admission gate. Same ladder as wat-p9-tokenize-parity, one stage up.
//
// Harness design (grounded 2026-07-16): parser.fungi consumes lexer.fungi's `Token` record (declared there
// only), so the twins are compiled CONCATENATED — and that makes the parity harness marshalling-free: the
// module runs its OWN `tokenize` and hands the token-array handle straight to `parseParams`. A tiny test
// DRIVER flow (appended source, twins untouched) does the tokenize→parse chaining on both backends. The
// startPos convention comes from the Contract Registry: "Caller must advance past '('".
//
// Readback: FlowParam is a flat record {name: String, typeName: String, isReadonly: Bool} — readArray →
// readRecordField slots 0/1/2 → readString for the two String handles (the RD-0389 READ direction).
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
const DRIVER = `
/// test driver — tokenize the source, find the first '(' and parse the parenthesised param list after it.
pure flow parseParamsFromSource(src: String) -> Array<FlowParam>
contract { intent { "P9 parity driver: tokenize then parseParams past the first open paren." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      mut i: Int = 0
      while i < toks.count() {
        if tokVal(toks, i) == "(" {
          return parseParams(toks, i + 1)
        }
        i = i + 1
      }
      return Array.empty()
    }
    Err(e) => {
      return Array.empty()
    }
  }
}
`;
const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "lexer-parser-combined.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer-parser", prog.ast, /*exportAllPure*/ true));

// ── Stage-A: the interpreter runs the SAME combined source ──
async function runInterp(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow("parseParamsFromSource", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const items = res?.value?.value?.items ?? res?.value?.items ?? [];
  return items.map((rec) => {
    const f = rec.fields;
    return {
      name: f.get("name")?.value ?? "",
      typeName: f.get("typeName")?.value ?? "",
      isReadonly: f.get("isReadonly")?.value === true,
    };
  });
}

// ── Stage-B: real WASM through the #105 admission gate ──
let wasmCtx = null;
async function runWasm(input) {
  if (wasmCtx === null) {
    const asm = await L.assembleWAT(WAT);
    assert.ok(asm.valid && asm.diagnostics.length === 0, "combined lexer+parser WAT assembles (R0): " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    let maxH = 0;
    for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    assert.equal(typeof instance.exports.parseParamsFromSource, "function", "driver admitted + exported (R1)");
    wasmCtx = { host, instance, nextH: maxH + 1 };
  }
  const { host, instance } = wasmCtx;
  const srcH = wasmCtx.nextH++;
  host.seedString(srcH, input);
  const arrH = instance.exports.parseParamsFromSource(srcH);
  const ptrs = host.readArray(arrH) ?? [];
  return ptrs.map((p) => ({
    name: host.readString(host.readRecordField(p, 0)) ?? "",
    typeName: host.readString(host.readRecordField(p, 1)) ?? "",
    isReadonly: host.readRecordField(p, 2) !== 0,
  }));
}

// Corpus: parameter-list shapes the milestone parser recognises (positive demonstrations).
const CORPUS = [
  "pure flow f(a: Int) -> Int",
  "pure flow g(a: Int, b: String) -> Bool",
  "pure flow h() -> Int",
  "secure flow k(readonly req: Request) -> Int",
  "flow m(readonly a: Bool, b: Int, c: String) -> Int",
];

describe("P9 R3 · parser stage: parseParams byte-parity (Stage-A interpreter == Stage-B WASM)", () => {
  it("combined lexer+parser+driver source parses clean (R0 precondition)", () => {
    assert.equal(parseErrs.length, 0, `combined source must parse clean: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });
  for (const input of CORPUS) {
    it(`identical FlowParam list for ${JSON.stringify(input)}`, async () => {
      const [i, w] = await Promise.all([runInterp(input), runWasm(input)]);
      assert.deepEqual(w, i, `WASM FlowParam list must equal interpreter list for ${JSON.stringify(input)}`);
    });
  }
  it("non-vacuity: a multi-param header yields the declared params through BOTH backends", async () => {
    const i = await runInterp("flow m(readonly a: Bool, b: Int, c: String) -> Int");
    assert.equal(i.length, 3, "interpreter sees 3 params");
    assert.deepEqual(i[0], { name: "a", typeName: "Bool", isReadonly: true }, "readonly flag survives");
  });
});
