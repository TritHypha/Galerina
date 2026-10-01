/**
 * J-R8 — wat-wasm / Binaryen dead-weight removal.
 *
 * Compile proof: a few ordinary .fungi flows → WAT → wabt assemble → run.
 * Fixture tests/fixtures/wat-jr8-before-hashes.json was captured BEFORE
 * removing wat-wasm. This test re-emits after removal and requires
 * byte-identical WAT + .wasm plus interpreter match.
 *
 * Replay:
 *   node --test tests/wat-jr8-wat-wasm-deadweight.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseProgram, checkEffects, emitGIR,
  buildWATModuleFromGIR, renderWAT, assembleWAT,
  executeWASMFlow, executeFlow,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dir, "fixtures", "wat-jr8-before-hashes.json");
const PKG = join(__dir, "..", "package.json");

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(text) {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

function finiteNumber(x, label) {
  let cur = x;
  if (typeof cur === "object" && cur && Object.prototype.hasOwnProperty.call(cur, "value")) {
    cur = cur.value;
  }
  if (typeof cur === "object" && cur && Object.prototype.hasOwnProperty.call(cur, "value")) {
    cur = cur.value;
  }
  if (typeof cur !== "number" || !Number.isFinite(cur)) {
    throw new Error(`${label}: not a finite number: ${JSON.stringify(x)}`);
  }
  return cur;
}

const CASES = [
  {
    name: "add",
    src: "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }",
    args: [2, 3],
    want: 5,
  },
  {
    name: "max",
    src: "pure flow max(a: Int, b: Int) -> Int contract { effects {} } { if a > b { return a } else { return b } }",
    args: [5, 3],
    want: 5,
  },
  {
    name: "sumTo",
    src: [
      "pure flow sumTo(n: Int) -> Int",
      "contract { effects {} }",
      "{ let result = 0",
      "  let i = 1",
      "  while i <= n {",
      "    let result = result + i",
      "    let i = i + 1",
      "  }",
      "  return result }",
    ].join("\n"),
    args: [10],
    want: 55,
  },
];

export async function compileCase(c) {
  const prog = parseProgram(c.src, `${c.name}.fungi`);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length > 0) throw new Error(`${c.name} parse: ${errs.map((d) => d.message).join("; ")}`);
  const fx = checkEffects(prog.flows, prog.ast);
  const { gir } = emitGIR(prog.ast, prog.flows, fx);
  const wat = renderWAT(buildWATModuleFromGIR(gir, undefined, "wasm-standalone", prog.ast, true));
  const assembled = await assembleWAT(wat);
  if (!assembled.valid || (assembled.diagnostics ?? []).length > 0) {
    throw new Error(`${c.name} assemble: ${JSON.stringify(assembled.diagnostics)}`);
  }
  const wasmRun = await executeWASMFlow(wat, c.name, c.args);
  if (wasmRun.error) throw new Error(`${c.name} wasm: ${wasmRun.error}`);
  const argMap = new Map();
  const names = c.name === "sumTo" ? ["n"] : ["a", "b"].slice(0, c.args.length);
  for (let i = 0; i < c.args.length; i++) {
    argMap.set(names[i], { __tag: "int", value: c.args[i] });
  }
  const interpRes = await executeFlow(c.name, argMap, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const interp = finiteNumber(interpRes, `${c.name} interp`);
  return {
    name: c.name,
    watSha256: sha256Text(wat),
    watBytes: Buffer.byteLength(wat, "utf8"),
    wasmSha256: sha256Bytes(assembled.wasm),
    wasmBytes: assembled.wasm.byteLength,
    wasmResult: wasmRun.result,
    interpResult: interp,
    want: c.want,
  };
}

export async function compileAll() {
  const rows = [];
  for (const c of CASES) rows.push(await compileCase(c));
  return rows;
}

describe("J-R8 wat-wasm dead-weight compile proof", () => {
  it("package.json dropped wat-wasm and kept wabt", () => {
    const pkg = JSON.parse(readFileSync(PKG, "utf8"));
    assert.equal(pkg.dependencies.wabt, "^1.0.39");
    assert.equal(Object.prototype.hasOwnProperty.call(pkg.dependencies, "wat-wasm"), false);
  });

  it("WAT/.wasm byte-identical to pre-removal fixture; run matches interpreter", async () => {
    assert.ok(existsSync(FIXTURE), "before-hash fixture must exist");
    const before = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const after = await compileAll();
    assert.equal(after.length, before.length);
    for (let i = 0; i < after.length; i++) {
      const a = after[i];
      const b = before[i];
      assert.equal(a.name, b.name);
      assert.equal(a.watSha256, b.watSha256, `${a.name} WAT sha256`);
      assert.equal(a.wasmSha256, b.wasmSha256, `${a.name} wasm sha256`);
      assert.equal(a.watBytes, b.watBytes);
      assert.equal(a.wasmBytes, b.wasmBytes);
      assert.equal(a.wasmResult, a.want, `${a.name} wasm result`);
      assert.equal(a.interpResult, a.want, `${a.name} interp result`);
      assert.equal(a.wasmResult, a.interpResult, `${a.name} wasm≡interp`);
      assert.equal(a.wasmResult, b.wasmResult, `${a.name} wasm result vs before`);
      assert.equal(a.interpResult, b.interpResult, `${a.name} interp result vs before`);
    }
  });
});
