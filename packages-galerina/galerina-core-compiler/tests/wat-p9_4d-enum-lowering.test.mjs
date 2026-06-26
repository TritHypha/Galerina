/**
 * #144 — enum-variant member lowering to WASM.
 *
 * `EnumType.Variant` previously emitted `(i32.const 0) ;; unresolved member: …`.
 * Now it lowers to the variant's declaration-order i32 tag, so record fields that
 * hold an enum (e.g. a token `kind`) carry real values. The tag is an internal
 * convention; the host (#145) maps i32 → variant name for byte-parity comparison.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  parseProgram, checkEffects, emitGIR, buildWATModuleFromGIR, renderWAT, assembleWAT,
  buildEnumVariants,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));

async function compileToWAT(src) {
  const prog = parseProgram(src, "t.spore");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) throw new Error("parse: " + errs.map((d) => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  return renderWAT(buildWATModuleFromGIR(gir, undefined, "t", prog.ast, true));
}

const ENUM_SRC =
  "enum Color { Red, Green, Blue }\n" +
  "pure flow pick() -> Int contract { effects {} } { return Color.Blue }\n" +
  "pure flow first() -> Int contract { effects {} } { return Color.Red }";

describe("#144 enum-variant lowering", () => {
  it("buildEnumVariants reads declaration order", () => {
    const prog = parseProgram(ENUM_SRC, "t.spore");
    const enums = buildEnumVariants(prog.ast);
    assert.deepEqual(enums.get("Color"), ["Red", "Green", "Blue"]);
  });

  it("EnumType.Variant lowers to its i32 tag and runs in WASM", async () => {
    const wat = await compileToWAT(ENUM_SRC);
    assert.match(wat, /i32\.const 2/, "Blue → tag 2");
    const asm = await assembleWAT(wat);
    assert.equal(asm.valid, true, JSON.stringify(asm.diagnostics));
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.pick(), 2, "Color.Blue == 2");
    assert.equal(instance.exports.first(), 0, "Color.Red == 0");
  });

  it("an enum variant stored in a record field carries the real tag (not 0)", async () => {
    const src =
      "enum Kind { A, B, C }\n" +
      "record Cell { k: Int, n: Int }\n" +
      "pure flow make() -> Int contract { effects {} } {\n" +
      "  let c = Cell { k: Kind.C, n: 7 }\n" +
      "  return c.k\n}";
    const wat = await compileToWAT(src);
    const asm = await assembleWAT(wat);
    const { instance } = await WebAssembly.instantiate(asm.wasm, {});
    assert.equal(instance.exports.make(), 2, "Kind.C == 2 read back from the record field");
  });

  it("the self-hosted lexer has ZERO unresolved-member placeholders", async () => {
    let src = readFileSync(join(__dir, "../src/self-hosted/lexer.spore"), "utf8");
    if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
    const wat = await compileToWAT(src);
    assert.doesNotMatch(wat, /unresolved member/, "no enum-variant placeholders remain in the lexer");
    // sanity: TokenKind.Eof is variant index 11 in lexer.spore
    const enums = buildEnumVariants(parseProgram(src, "lexer.spore").ast);
    assert.equal(enums.get("TokenKind").indexOf("Eof"), 11);
  });
});
