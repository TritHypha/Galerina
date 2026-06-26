/**
 * P9 #145 — the self-hosted `tokenize` EXECUTES in real WASM through the #105 gate.
 *
 * MILESTONE (2026-06-06): the lexer module links (#145a), and `tokenize` now runs
 * end-to-end — admitted via the attestation-first #105 gate, with a closed host-import
 * runtime, reading its `Ok(List<Token>)` back out of linear memory. This proves the
 * full path: .spore → WAT → real-wabt WASM → #105 admission → execute → reconstruct output.
 *
 * ITERATION MILESTONE (#160, 2026-06-06): the Option<Char> match now dispatches on the
 * i32 sentinel (None ⇒ subject < 0, Some(c) ⇒ subject >= 0, c bound to the value), char
 * literals lower to code points, the host stdlib is complete (char_to_string / str_concat
 * / char_is_letter / …), and `+`/`.toString()` lower type-directed. The tokenize loop now
 * ITERATES and emits a real token stream — e.g. "pure flow add" → [Identifier, Identifier,
 * Identifier, Eof]. This pins that the self-hosted lexer runs end-to-end in real WASM.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const LEXER = join(__dir, "../src/self-hosted/lexer.spore");

async function runTokenize(input) {
  let src = readFileSync(LEXER, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "lexer.spore");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "lexer", prog.ast, true));
  const enums = L.buildEnumVariants(prog.ast).get("TokenKind") || [];
  const asm = await L.assembleWAT(wat);
  if (!(asm.valid && asm.diagnostics.length === 0)) throw new Error("lexer did not wabt-assemble: " + JSON.stringify(asm.diagnostics));

  const host = L.createHostRuntime();
  // Seed the emitter's literal intern table at exact handles, then the runtime source after it.
  let maxH = 0;
  for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
  const srcH = maxH + 1;
  host.seedString(srcH, input);

  // Admit through the #105 security gate (attestation-first), then execute.
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });

  const resH = instance.exports.tokenize(srcH);
  const res = host.readResult(resH);
  const ptrs = res?.tag === "ok" ? (host.readArray(res.value) || []) : [];
  const tokens = ptrs.map((p) => ({ kind: enums[host.readRecordField(p, 0)] ?? "?", value: host.readString(host.readRecordField(p, 1)) }));
  return { res, tokens };
}

describe("P9 #145: tokenize.wasm executes through the #105 gate", () => {
  it("admits + runs tokenize, returns Ok(List<Token>), reconstructs tokens from linear memory", async () => {
    const { res, tokens } = await runTokenize("pure flow x");
    assert.equal(res?.tag, "ok", "tokenize returns Ok (no trap, valid Result)");
    assert.ok(tokens.length >= 1, "produces at least one token");
    assert.equal(tokens[tokens.length - 1].kind, "Eof", "the token stream ends with Eof (structural invariant)");
  });

  it("ITERATES + classifies keywords vs identifiers (#160)", async () => {
    const { tokens } = await runTokenize("pure flow add");
    assert.deepEqual(tokens, [
      { kind: "Keyword", value: "pure" },     // keyword-table lookup via __array_contains_str
      { kind: "Keyword", value: "flow" },
      { kind: "Identifier", value: "add" },   // not in the keyword table
      { kind: "Eof", value: "" },
    ], "the Option<Char> loop iterates; keywords classify by string VALUE, not handle");
  });

  it("classifies a keyword then identifier and ends with Eof", async () => {
    const { tokens } = await runTokenize("let x");
    assert.ok(tokens.length >= 3, "at least 'let', 'x', Eof");
    assert.equal(tokens[0]?.kind, "Keyword");
    assert.equal(tokens[0]?.value, "let");
    assert.equal(tokens[1]?.kind, "Identifier");
    assert.equal(tokens[tokens.length - 1]?.kind, "Eof");
  });
});
