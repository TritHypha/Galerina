// MEM-R9 pin + engine parity for the VOK linear-memory trap vectors
// (gap map 5.4 / H16, with the 5.1-5.3 / H15 bounds rows).
//
// 1. The committed JSON is sha256-pinned and the rows file is exactly its
//    rendering, so the Rust test (which reads rows.txt) and this file agree.
// 2. The grid in linear-memory-trap-grid.mjs still produces the same inputs.
// 3. Every engine row is replayed against the real WebAssembly engine
//    (hand-assembled modules, no toolchain): an IN_BOUNDS/VALUE/GROWN row
//    must run, a TRAP row must trap with the matching engine message, and a
//    GROW_REFUSED row must return -1 with the size unchanged.
// 4. With SLIDE_ROOT set, the vectors are re-derived from SLIDE's model and
//    must be byte-identical (lock-step); without it the step is skipped.
//
// Run: node --test vectors/linear-memory-trap-vectors-pin.test.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildGrid, renderRowsText, VECTOR_SCHEMA } from "./linear-memory-trap-grid.mjs";
import { deriveFromSlide, JSON_NAME, ROWS_NAME } from "./linear-memory-trap-vectors.gen.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const JSON_SHA256_PIN = "e1d51f3148a46f64113a9503352ba4596be4f7abe9ce44566e3ec6775025cce7";
const jsonText = readFileSync(join(here, JSON_NAME), "utf8");
const rowsText = readFileSync(join(here, ROWS_NAME), "utf8");
const doc = JSON.parse(jsonText);

// ---- minimal module assembler -------------------------------------------
const I32 = 0x7f;
const I64 = 0x7e;
function leb(value) {
  let n = BigInt(value);
  const out = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n !== 0n) byte |= 0x80;
    out.push(byte);
  } while (n !== 0n);
  return out;
}
const vec = (items) => [...leb(items.length), ...items.flat()];
const section = (id, bytes) => [id, ...leb(bytes.length), ...bytes];
const name = (text) => vec([...Buffer.from(text)].map((b) => [b]));

function assemble({ params, results, memory, body }) {
  const type = [0x60, ...vec(params.map((p) => [p])), ...vec(results.map((r) => [r]))];
  const flags = (memory.max === undefined ? 0 : 1) | (memory.i64 ? 4 : 0);
  const mem = [flags, ...leb(memory.min), ...(memory.max === undefined ? [] : leb(memory.max))];
  const code = [0, ...body, 0x0b];
  const bytes = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec([type])),
    ...section(3, vec([[0]])),
    ...section(5, vec([mem])),
    ...section(7, vec([[...name("f"), 0x00, 0], [...name("m"), 0x02, 0]])),
    ...section(10, vec([[...leb(code.length), ...code]])),
  ];
  return new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(bytes))).exports;
}

const LOAD = { 1: [0x2d], 2: [0x2f], 4: [0x28], 8: [0x29], 16: [0xfd, ...leb(0)] };
const DIV = {
  32: { div_s: 0x6d, div_u: 0x6e, rem_s: 0x6f, rem_u: 0x70 },
  64: { div_s: 0x7f, div_u: 0x80, rem_s: 0x81, rem_u: 0x82 },
};
const cache = new Map();
function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}
const arg32 = (v) => Number(BigInt.asIntN(32, BigInt(v)));
const arg64 = (v) => BigInt.asIntN(64, BigInt(v));

function memory64Supported() {
  try {
    assemble({ params: [I64], results: [], memory: { min: 0, i64: true }, body: [0x20, 0, 0x2d, 0, 0, 0x1a] });
    return true;
  } catch {
    return false;
  }
}

// Returns { ok: true, result?, pages? } or { trap: message }.
function runOnEngine(fields) {
  const [kind] = fields;
  const pages = (bytes) => BigInt(bytes) / 65536n;
  let call;
  if (kind === "access") {
    const [, idx, address, offset, width, memoryBytes] = fields;
    const i64 = idx === "i64";
    const f = cached(fields.slice(0, 1).concat(idx, offset, width, memoryBytes).join(" "), () => assemble({
      params: [i64 ? I64 : I32],
      results: [],
      memory: { min: pages(memoryBytes), i64 },
      body: [0x20, 0, ...LOAD[width], 0, ...leb(offset), 0x1a],
    })).f;
    call = () => f(i64 ? arg64(address) : arg32(address));
  } else if (kind === "range") {
    const [, , start, length, memoryBytes] = fields;
    const f = cached(`range ${memoryBytes}`, () => assemble({
      params: [I32, I32, I32], results: [], memory: { min: pages(memoryBytes) },
      body: [0x20, 0, 0x20, 1, 0x20, 2, 0xfc, ...leb(11), 0],
    })).f;
    call = () => f(arg32(start), 0, arg32(length));
  } else if (kind === "copy") {
    const [, , dst, src, length, memoryBytes] = fields;
    const f = cached(`copy ${memoryBytes}`, () => assemble({
      params: [I32, I32, I32], results: [], memory: { min: pages(memoryBytes) },
      body: [0x20, 0, 0x20, 1, 0x20, 2, 0xfc, ...leb(10), 0, 0],
    })).f;
    call = () => f(arg32(dst), arg32(src), arg32(length));
  } else if (kind === "grow") {
    const [, , current, delta, max] = fields;
    // Fresh instance per row: grow mutates the memory.
    const ex = assemble({
      params: [I32], results: [I32],
      memory: { min: Number(current), max: max === "-" ? undefined : Number(max) },
      body: [0x20, 0, 0x40, 0],
    });
    const result = ex.f(arg32(delta));
    return { ok: true, result: BigInt(result), pages: BigInt(ex.m.buffer.byteLength / 65536) };
  } else if (kind === "div") {
    const [, op, bits, a, b] = fields;
    const wide = bits === "64";
    const f = cached(`div ${op} ${bits}`, () => assemble({
      params: wide ? [I64, I64] : [I32, I32], results: [wide ? I64 : I32], memory: { min: 0 },
      body: [0x20, 0, 0x20, 1, DIV[bits][op]],
    })).f;
    call = () => BigInt(f(wide ? arg64(a) : arg32(a), wide ? arg64(b) : arg32(b)));
  } else {
    throw new Error(`unknown row kind ${kind}`);
  }
  try {
    return { ok: true, result: call() };
  } catch (error) {
    if (!(error instanceof WebAssembly.RuntimeError)) throw error;
    return { trap: String(error.message) };
  }
}

const TRAP_MESSAGE = {
  "SLIDE-LMB-002": /out of bounds/i,
  "SLIDE-LMB-003": /by zero/i,
  "SLIDE-LMB-004": /unrepresentable|overflow/i, // V8: "divide result unrepresentable"
};

function assertEngineAgrees(row) {
  const fields = row.input.split(" ");
  const [status, failureId, ...extra] = row.expect.split(" ");
  const got = runOnEngine(fields);
  if (status === "TRAP") {
    assert.ok(got.trap, `${row.input}: engine ran, expected ${failureId}`);
    assert.match(got.trap, TRAP_MESSAGE[failureId], `${row.input}: engine trap "${got.trap}"`);
  } else if (status === "GROWN" || status === "GROW_REFUSED") {
    assert.equal(got.result, BigInt(extra[0]), `${row.input}: grow result`);
    assert.equal(got.pages, BigInt(extra[1]), `${row.input}: pages after grow`);
  } else if (status === "VALUE") {
    assert.ok(got.ok, `${row.input}: engine trapped "${got.trap}"`);
    assert.equal(got.result, BigInt(extra[0]), `${row.input}: value`);
  } else {
    assert.equal(status, "IN_BOUNDS", `${row.input}: engine row with status ${status}`);
    assert.ok(got.ok, `${row.input}: engine trapped "${got.trap}"`);
  }
}

test("MEM-R9 vectors: JSON pinned and rows file is its rendering", () => {
  const sha = createHash("sha256").update(jsonText).digest("hex");
  assert.equal(sha, JSON_SHA256_PIN);
  assert.equal(doc.schema, VECTOR_SCHEMA);
  assert.equal(doc.rowCount, doc.rows.length);
  assert.equal(rowsText, renderRowsText(doc, sha));
  assert.ok(!rowsText.includes("\r"), "rows file must stay LF");
});

test("MEM-R9 vectors: grid inputs unchanged", () => {
  const grid = buildGrid();
  assert.deepEqual(grid.map((r) => r.input), doc.rows.map((r) => r.input));
  assert.deepEqual(grid.map((r) => r.engine), doc.rows.map((r) => r.engine));
  assert.equal(new Set(grid.map((r) => r.input)).size, grid.length, "duplicate inputs");
});

test("MEM-R9 vectors: the gap rows are present", () => {
  const expect = (input) => doc.rows.find((r) => r.input === input)?.expect;
  assert.equal(expect("div div_s 32 -2147483648 -1"), "TRAP SLIDE-LMB-004");
  assert.equal(expect("div div_s 64 -9223372036854775808 -1"), "TRAP SLIDE-LMB-004");
  assert.equal(expect("div rem_s 32 -2147483648 -1"), "VALUE NONE 0");
  assert.equal(expect("div div_u 32 7 0"), "TRAP SLIDE-LMB-003");
  assert.equal(expect("access i32 4294967280 32 1 65536"), "TRAP SLIDE-LMB-002");
  assert.equal(expect("access i32 65520 0 16 65536"), "IN_BOUNDS NONE");
  assert.equal(expect("grow i32 1 2 2"), "GROW_REFUSED SLIDE-LMB-005 -1 1");
});

test("MEM-R9 vectors: real WebAssembly engine agrees on every engine row", (t) => {
  const has64 = memory64Supported();
  let ran = 0;
  let skipped64 = 0;
  for (const row of doc.rows) {
    if (!row.engine) continue;
    if (row.input.startsWith("access i64") && !has64) {
      skipped64 += 1;
      continue;
    }
    assertEngineAgrees(row);
    ran += 1;
  }
  t.diagnostic(`engine rows ran=${ran} memory64-skipped=${skipped64}`);
  assert.ok(ran > 1000, `only ${ran} engine rows ran`);
});

test("MEM-R9 vectors: re-derived from SLIDE model byte for byte", async (t) => {
  if (!process.env.SLIDE_ROOT) {
    t.skip("SLIDE_ROOT not set; lock-step re-derive needs a SLIDE checkout (main 8f62c0c or later)");
    return;
  }
  const derived = await deriveFromSlide(process.env.SLIDE_ROOT);
  assert.equal(derived.jsonText, jsonText);
  assert.equal(derived.rowsText, rowsText);
});
