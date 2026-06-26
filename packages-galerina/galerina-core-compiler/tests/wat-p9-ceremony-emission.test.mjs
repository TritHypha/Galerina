/**
 * P9 bootstrap ceremony — EMISSION gate.
 *
 * The single gate to P9 is self-hosting: the self-hosted lexer (src/self-hosted/
 * lexer.spore), whose `tokenize` flow RETURNS a record (a token list), must emit real
 * WASM instead of `unreachable`. Before P9.4b record lowering, `tokenize` fell back
 * to `unreachable`; with P9.4b (record construction + field access) and P9.4c (guarded
 * export gating), the whole lexer now lowers to a real, wabt-assembling WASM module.
 *
 * This test pins the EMISSION milestone: every self-hosted lexer flow has a real body,
 * `tokenize` included, and the module assembles to a valid WASM binary.
 *
 * NOT covered here (the remaining Post-P9 step, overlaps #105): EXECUTING tokenize.wasm
 * and byte-comparing its output to the interpreter requires the full host-import runtime
 * (string table, array bridge, char classification) wired into WebAssembly.instantiate.
 * Interpreter-level Stage-A == Stage-B parity is already locked by lexer-parity.test.mjs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT, assembleWAT,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const LEXER_PATH = join(__dir, "../src/self-hosted/lexer.spore");

function isStub(body) {
  const b = (body ?? "").trim();
  return b === "unreachable" || b === "" || /^\(i32\.const 0\)/.test(b);
}

function compileLexer() {
  let src = readFileSync(LEXER_PATH, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = parseProgram(src, "lexer.spore");
  const perr = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(perr.length, 0, "lexer.spore parses cleanly");
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  const mod = buildWATModuleFromGIR(gir, undefined, "lexer", prog.ast, true);
  return { mod, wat: renderWAT(mod) };
}

describe("P9 ceremony — self-hosted lexer emits real WASM", () => {
  it("every self-hosted lexer flow lowers to a real body (no unreachable stubs)", () => {
    const { mod } = compileLexer();
    const stubs = mod.functions.filter((f) => isStub(f.body)).map((f) => f.name);
    assert.equal(stubs.length, 0, `flows still stubbed: ${stubs.join(", ")}`);
  });

  it("the record-returning `tokenize` flow has a real body using the record heap", () => {
    const { mod, wat } = compileLexer();
    const tok = mod.functions.find((f) => f.name === "tokenize");
    assert.ok(tok, "tokenize flow present");
    assert.equal(isStub(tok.body), false, "tokenize emits a real body, not unreachable");
    assert.match(wat, /global \$__lln_heap/, "record bump-allocator heap is emitted");
  });

  // Honest assembly check. `assembleWAT` falls back to a 240-byte minimal-encoder
  // STUB (and a misleading "wabt not available" diagnostic) when real wabt THROWS —
  // e.g. on undefined function references. So `valid === true` alone does NOT prove a
  // faithful compile. `usedRealWabt` distinguishes the two: real wabt → no fallback
  // diagnostic; fallback → the "minimal encoder" message.
  // Robust signal: real wabt assembly returns EMPTY diagnostics; any fallback path
  // (wabt-not-installed OR wabt-rejected-this-WAT) attaches a diagnostic message.
  const usedRealWabt = (asm) => asm.valid && asm.diagnostics.length === 0;

  it("the wabt pipeline genuinely compiles a CLEAN module (control)", async () => {
    // Proves real wabt is wired and assembleWAT compiles faithfully when the module links.
    const prog = parseProgram("pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "c.spore");
    const fx = checkEffects(prog.flows, prog.ast);
    const { gir } = emitGIR(prog.ast, prog.flows, fx);
    const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "c", prog.ast, true));
    const asm = await assembleWAT(wat);
    assert.equal(asm.valid, true);
    assert.equal(usedRealWabt(asm), true, "clean module must compile via REAL wabt, not the fallback");
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.add(2, 3), 5);
  });

  it("MILESTONE: the self-hosted lexer module now wabt-assembles to a REAL WASM binary (#145a)", async () => {
    // 2026-06-06: charCount/Ok/Err wired to host imports (zero undefined calls) AND
    // __array_append returns the array handle (#145a) — the last linking blocker. The
    // lexer module now LINKS and assembles via real wabt (not the minimal-encoder stub).
    const { wat } = compileLexer();
    assert.match(wat, /\$host___str_count/, "charCount → host import");
    assert.match(wat, /\$host___result_ok/, "Ok → host import");
    // owner Fork A=TRAP: integer +/-/* now lower to checked-arith helper calls
    // ($spore_checked_add_i32 / _sub_ / _mul_), which the module also defines — these are
    // DEFINED calls, not undefined ones, so they belong in the allowed set.
    const noUndefinedCalls = [...wat.matchAll(/\(call \$([A-Za-z0-9_]+)/g)]
      .map((m) => m[1])
      .every((c) => c.startsWith("host_") || /^spore_checked_(add|sub|mul)_i32$/.test(c) || /^(makeKeywordTable|scanWord|scanOperator|scanDigits|scanString|scanCharLit|scanLineComment|scanBlockComment|tokenize)$/.test(c));
    assert.equal(noUndefinedCalls, true, "no undefined function calls remain in the lexer");
    const asm = await assembleWAT(wat);
    assert.equal(usedRealWabt(asm), true, "lexer module LINKS + assembles via REAL wabt (no stub fallback)");
    assert.equal(asm.wasm[0], 0x00); assert.equal(asm.wasm[1], 0x61); // \0asm magic header
    // REMAINING (#145b): the module links + can be instantiated, but token VALUE byte-parity
    // still needs type-aware string lowering (String `+` → __str_concat; Char.toString →
    // __char_to_string) + the host output reader. Linking is DONE; string SEMANTICS are next.
  });
});
