/**
 * U2/#204 — SPORE-PRIVACY-002: no cleartext semantic embedding may cross a trust boundary.
 *
 * A semantic embedding vector is invertible (embedding-inversion / vec2text reconstructs
 * the source text from a cleartext vector), so transmitting one to a network/egress sink
 * leaks the source content. This rule is the confidentiality dual of SPORE-SECRET-002:
 * an Embedding/EmbeddingResult value, or anything DERIVED from EmbeddingModel.run/.embed,
 * is denied at a network sink unless it has been sealed/encrypted (seal()/encrypt() is the
 * sole declassifier — a sliced/normalized/concatenated/record-wrapped vector is STILL
 * inversion-bearing, which is exactly what the propagation must hold the line against).
 *
 * The chosen mechanism (SealTaint) propagates an embeddingDerived flag through the live
 * checkValueStates pass, mirroring the proven secret-taint propagation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkValueStates } from "../dist/index.js";

const mk = (body) => `secure flow f(req: Request) -> Int
contract { effects { ai.inference  network.outbound } }
{
${body}
  return 0
}`;

const parseAndCheck = (source) => checkValueStates(parseProgram(source, "test.spore").ast);
const hasDiag = (r, code) => r.diagnostics.some((d) => d.code === code);
const codes = (r) => r.diagnostics.map((d) => d.code).join(", ");

describe("Value-state checker — embedding to network egress (SPORE-PRIVACY-002)", () => {
  it("a fresh embedding sent to http.post → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let x = http.post("u", e)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002, got: ${codes(r)}`);
  });

  it("an EmbeddingResult-typed binding sent to http.post → SPORE-PRIVACY-002 (type backstop)", () => {
    const r = parseAndCheck(mk('  let e: EmbeddingResult = compute(req)\n  let x = http.post("u", e)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for EmbeddingResult, got: ${codes(r)}`);
  });

  it("an inline EmbeddingModel.run(...) passed straight to http.post → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let x = http.post("u", EmbeddingModel.run(req))'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for inline source, got: ${codes(r)}`);
  });

  // ── Laundering paths — the vec2text evasions must all stay caught ──
  it("a SLICED embedding → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let p = e.slice(0,256)\n  let x = http.post("u", p)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for sliced vector, got: ${codes(r)}`);
  });
  it("a CONCATENATED embedding → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let p = e + extra\n  let x = http.post("u", p)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for concatenated vector, got: ${codes(r)}`);
  });
  it("an embedding wrapped in a RECORD field → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let rec = { v: e }\n  let x = http.post("u", rec)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for record-wrapped vector, got: ${codes(r)}`);
  });
  it("a DOUBLY-derived embedding (slice then concat) → SPORE-PRIVACY-002", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let a = e.slice(0,256)\n  let b = a + tail\n  let x = http.post("u", b)'));
    assert.ok(hasDiag(r, "SPORE-PRIVACY-002"), `expected PRIVACY-002 for doubly-derived vector, got: ${codes(r)}`);
  });

  // ── Discharge + no-false-positive ──
  it("seal()-ed embedding via an intermediate binding → clean (seal is the sole declassifier)", () => {
    const r = parseAndCheck(mk('  let e = EmbeddingModel.run(req)\n  let s = seal(e)\n  let x = http.post("u", s)'));
    assert.ok(!hasDiag(r, "SPORE-PRIVACY-002"), `seal() must clear the embedding, got: ${codes(r)}`);
  });
  it("inline seal(EmbeddingModel.run(...)) at the sink → clean", () => {
    const r = parseAndCheck(mk('  let x = http.post("u", seal(EmbeddingModel.run(req)))'));
    assert.ok(!hasDiag(r, "SPORE-PRIVACY-002"), `inline seal() must clear, got: ${codes(r)}`);
  });
  it("a derived NON-embedding value → clean (no false positive)", () => {
    const r = parseAndCheck(mk('  let x = build(1)\n  let p = x.slice(0,2)\n  let y = http.post("u", p)'));
    assert.ok(!hasDiag(r, "SPORE-PRIVACY-002"));
  });
});
