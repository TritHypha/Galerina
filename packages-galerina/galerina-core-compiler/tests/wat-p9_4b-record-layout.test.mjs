/**
 * P9.4b — record struct layout in WASM.
 *
 * A pure flow that RETURNS a record literal must no longer emit `(i32.const 0)` /
 * `unreachable`: it bump-allocates fieldCount*4 bytes in linear memory, stores each
 * field at its slot offset, and returns the base pointer. This test drives the FULL
 * pipeline (parse → GIR → WAT → wabt → WebAssembly.instantiate) and reads the
 * instance's exported memory to prove the fields were actually written.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT, assembleWAT,
} from "../dist/index.js";

const WAT_HEAP_BASE = 1024;

async function compileToWAT(src) {
  const prog = parseProgram(src, "test.spore");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse: " + errs.map((d) => d.message).join("; "));
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  const watModule = buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true);
  return renderWAT(watModule);
}

async function instantiate(wat) {
  const asm = await assembleWAT(wat);
  assert.equal(asm.valid, true, "wabt must assemble record-layout WAT: " + JSON.stringify(asm.diagnostics));
  const { instance } = await WebAssembly.instantiate(asm.wasm, {});
  return instance;
}

const POINT_SRC =
  "record Point { x: Int, y: Int }\n" +
  "pure flow makePoint(x: Int, y: Int) -> Point contract { effects {} } { return Point { x: x, y: y } }";

describe("P9.4b: record construction lowers to a linear-memory struct", () => {
  it("emits the bump-allocator pattern (not a placeholder)", async () => {
    const wat = await compileToWAT(POINT_SRC);
    assert.match(wat, /global \$__lln_heap \(mut i32\) \(i32\.const 1024\)/, "heap global emitted");
    assert.match(wat, /\(block \(result i32\)/, "record block emitted");
    assert.match(wat, /i32\.store/, "field stores emitted");
    assert.doesNotMatch(wat, /return.*\(i32\.const 0\) ;; .*record/, "no placeholder for the record");
  });

  it("returns the record base pointer and stores fields in memory", async () => {
    const wat = await compileToWAT(POINT_SRC);
    const inst = await instantiate(wat);
    const base = inst.exports.makePoint(7, 9);
    assert.equal(base, WAT_HEAP_BASE, "first record allocates at the heap base");
    const mem = new Int32Array(inst.exports.memory.buffer);
    assert.equal(mem[base / 4 + 0], 7, "field .x stored at offset 0");
    assert.equal(mem[base / 4 + 1], 9, "field .y stored at offset 4");
  });

  it("round-trips a field: build a record, read a field back via r.field", async () => {
    // makePoint builds the record; getX reads its .x field back through an i32.load.
    const src =
      "record Point { x: Int, y: Int }\n" +
      "pure flow sumXY(a: Int, b: Int) -> Int contract { effects {} } {\n" +
      "  let p = Point { x: a, y: b }\n" +
      "  return p.x + p.y\n}";
    const wat = await compileToWAT(src);
    assert.match(wat, /i32\.load \(i32\.add \(local\.get \$p\) \(i32\.const 0\)\)/, "field .x lowered to an i32.load at offset 0");
    const inst = await instantiate(wat);
    assert.equal(inst.exports.sumXY(11, 31), 42, "p.x + p.y == 11 + 31");
  });

  it("a record-typed parameter resolves field access (r.field on a param)", async () => {
    const src =
      "record Box { w: Int, h: Int }\n" +
      "pure flow makeBox(w: Int, h: Int) -> Box contract { effects {} } { return Box { w: w, h: h } }\n" +
      "pure flow area(b: Box) -> Int contract { effects {} } { return b.w * b.h }";
    const wat = await compileToWAT(src);
    const inst = await instantiate(wat);
    const box = inst.exports.makeBox(6, 7);   // base pointer
    assert.equal(inst.exports.area(box), 42, "area reads b.w and b.h from the passed pointer");
  });

  it("two records get distinct, non-overlapping bases (bump allocation)", async () => {
    // A flow that builds two records and returns the SECOND base proves the heap
    // pointer advanced past the first record's slots.
    const src =
      "record Pair { a: Int, b: Int }\n" +
      "pure flow two() -> Int contract { effects {} } {\n" +
      "  let p = Pair { a: 1, b: 2 }\n" +
      "  let q = Pair { a: 3, b: 4 }\n" +
      "  return q\n}";
    const wat = await compileToWAT(src);
    const inst = await instantiate(wat);
    const second = inst.exports.two();
    assert.equal(second, WAT_HEAP_BASE + 8, "second record sits one 2-field record above the first");
    const mem = new Int32Array(inst.exports.memory.buffer);
    assert.equal(mem[second / 4 + 0], 3);
    assert.equal(mem[second / 4 + 1], 4);
    // the first record's slots are still intact below
    assert.equal(mem[WAT_HEAP_BASE / 4 + 0], 1);
    assert.equal(mem[WAT_HEAP_BASE / 4 + 1], 2);
  });
});
