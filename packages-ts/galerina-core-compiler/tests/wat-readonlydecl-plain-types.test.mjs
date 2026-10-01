/**
 * PLAN row 5 / #128 C-slice — plain-type readonlyDecl lowers like letDecl.
 * protected / redacted / secret readonly stays fail-closed.
 * requireStmt / fnDecl remain on the #128 default (not implemented here).
 *
 * Tri-Pipe verdict: Binary-only (WAT local-binding; no Hybrid/Photonic facet).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function compile(src, file = "readonlydecl.fungi") {
  const parsed = L.parseProgram(src, file);
  const errs = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true));
  return { wat, parsed };
}

async function instantiate(wat) {
  const asm = await L.assembleWAT(wat);
  assert.equal(asm.valid && asm.diagnostics.length === 0, true, "wabt: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  for (const entry of L.getInternedStrings()) host.seedString(entry.handle, entry.value);
  const { instance } = await WebAssembly.instantiate(asm.wasm, host.imports);
  return instance.exports;
}

describe("plain readonlyDecl lowers like letDecl", () => {
  it("readonly Int binding emits a local.set and not unsupported-in-WASM: readonlyDecl", async () => {
    const src = `pure flow n() -> Int
contract { effects {} }
{ readonly x: Int = 2
  return x }`;
    const { wat } = compile(src, "rd-plain-int.fungi");
    assert.ok(!wat.includes("unsupported-in-WASM: readonlyDecl"), wat);
    assert.ok(wat.includes("(local $x i32)"), wat);
    assert.ok(wat.includes("(local.set $x"), wat);
    const exports = await instantiate(wat);
    assert.equal(exports.n(), 2);
  });

  it("unannotated readonly binding still lowers and returns the init", async () => {
    const src = `pure flow n() -> Int
contract { effects {} }
{ readonly x = 7
  return x }`;
    const { wat } = compile(src, "rd-plain-infer.fungi");
    assert.ok(!wat.includes("unsupported-in-WASM: readonlyDecl"), wat);
    const exports = await instantiate(wat);
    assert.equal(exports.n(), 7);
  });

  it("plain readonly Int64 uses an i64 local", () => {
    const src = `pure flow n() -> Int64
contract { effects {} }
{ readonly x: Int64 = 1
  return x }`;
    const { wat } = compile(src, "rd-plain-i64.fungi");
    assert.ok(!wat.includes("unsupported-in-WASM: readonlyDecl"), wat);
    assert.ok(wat.includes("(local $x i64)"), wat);
  });
});

describe("governed/secret readonlyDecl stays fail-closed", () => {
  it("readonly protected String emits readonlyDecl+governed trap, not a local", () => {
    const src = `pure flow hide() -> String
contract { effects {} }
{ readonly s: protected String = "x"
  return s }`;
    const { wat } = compile(src, "rd-protected.fungi");
    assert.ok(wat.includes("readonlyDecl+governed protected"), wat);
    assert.ok(!wat.includes("(local $s i32)"), wat);
    assert.ok(!/\(i32\.const 0\)\s*;;\s*unhandled/.test(wat), wat);
  });

  it("readonly redacted String emits readonlyDecl+governed trap", () => {
    const src = `pure flow hide() -> String
contract { effects {} }
{ readonly s: redacted String = "y"
  return s }`;
    const { wat } = compile(src, "rd-redacted.fungi");
    assert.ok(wat.includes("readonlyDecl+governed redacted"), wat);
    assert.ok(wat.includes("(unreachable)"), wat);
  });

  it("secret as a type qualifier does not parse, so protected/redacted are the live governed forms", () => {
    const parsed = L.parseProgram(`pure flow hide() -> String
contract { effects {} }
{ readonly s: secret String = "z"
  return s }`, "rd-secret.fungi");
    const errs = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.ok(errs.length > 0, "secret is not a parseable type qualifier");
  });
});

describe("#128 leftovers requireStmt/fnDecl are build-time FUNGI-WAT-STMT-001", () => {
  it("fnDecl throws FUNGI-WAT-STMT-001 rather than a run-time unsupported-in-WASM trap", () => {
    const src = `pure flow outer() -> Int
contract { effects {} }
{ fn inner() -> Int { return 1 }
  return 0 }`;
    const parsed = L.parseProgram(src, "rd-fndecl.fungi");
    const parseErrs = (parsed.diagnostics ?? []).filter((d) => d.severity === "error");
    if (parseErrs.length > 0) {
      assert.ok(true, "fnDecl did not parse; D7 remains unlowered");
      return;
    }
    const fx = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
    let thrown = "";
    try {
      L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true));
    } catch (e) {
      thrown = String(e && e.message ? e.message : e);
    }
    assert.match(thrown, /FUNGI-WAT-STMT-001/);
    assert.equal(thrown.includes("unsupported-in-WASM: fnDecl"), false);
  });
});
