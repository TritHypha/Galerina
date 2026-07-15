// rd0361-memory-validator-execution.test.mjs — RD-0361 (Memory): the memory-validator `.fungi` twin
// EXECUTES; its pure alignment/round-up arithmetic is proven EQUAL to the MemoryValidator spec.
//   R0 build → WASM (the whole module, incl. the String-verdict flows) · R1 sign + #105-admit · R3 differential.
// The Int/Bool folds (isAligned, alignUp) are differential-checked exhaustively over a grid; the String-verdict
// flows (checkAligned/checkInBounds — "ok"/"LSM-*") compile at R0 but need WASM string marshalling to
// differential, a separate increment. Moves memory-validator shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "memory-validator.fungi");

const refIsAligned = (ptr, align) => ptr >= 0 && ptr % align === 0;
const refAlignUp = (n, align) => { const r = n % align; return r === 0 ? n : n + align - r; };
const ALIGNS = [1, 2, 4, 8, 16];

test("RD-0361 Memory · memory-validator: R0 build → R1 #105-admit → R3 WASM ≡ alignment/round-up spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "memory-validator.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "memory-validator", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["isAligned", "alignUp"]) assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);

  // R3 differential — the pure Int/Bool folds, exhaustive over a grid.
  for (let ptr = -3; ptr <= 33; ptr++) for (const a of ALIGNS)
    assert.equal(!!X.isAligned(ptr, a), refIsAligned(ptr, a), `isAligned(${ptr},${a})`);
  for (let n = 0; n <= 40; n++) for (const a of ALIGNS)
    assert.equal(X.alignUp(n, a), refAlignUp(n, a), `alignUp(${n},${a})`);
});
