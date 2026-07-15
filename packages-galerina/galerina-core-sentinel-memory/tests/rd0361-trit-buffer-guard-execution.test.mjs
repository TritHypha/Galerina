// rd0361-trit-buffer-guard-execution.test.mjs — RD-0361 (Memory): the trit-buffer-guard `.fungi` twin
// EXECUTES; its fail-closed trit-buffer verdicts are proven EQUAL to the TPLStateBuffer spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 LABEL-VERIFIED differential (handles decoded to labels).
// String-verdict flows ("ok"/"LSM-TRIT-*") return an interned handle; each handle is decoded through the
// emitter's own literal table and the decoded label must EQUAL the spec verdict on every corpus point.
// Moves trit-buffer-guard shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "trit-buffer-guard.fungi");

// LABEL-VERIFIED differential (task #64): decode each returned handle through the emitter's own
// literal table (L.getInternedStrings() — the table the module's i32.const handles were minted
// from) and require the decoded label to EQUAL the spec verdict on every corpus point. A branch-
// swap relabelling now FAILS. Distinctness is still asserted (no verdict-class collapse).
function diffStringFlow(X, fn, ref, corpus, decode) {
  const seen = new Map();
  for (const a of corpus) {
    const h = X[fn](...a);
    const want = ref(...a);
    assert.equal(decode(h), want, `${fn}(${a.join(",")}) → "${want}" (label-verified)`);
    if (!seen.has(want)) seen.set(want, h);
    assert.equal(h, seen.get(want), `${fn}: one handle per verdict class`);
  }
  assert.equal(new Set(seen.values()).size, seen.size, `${fn}: distinct verdicts → distinct handles`);
}

const refCount = (tc) => (tc < 0 ? "LSM-TRIT-INDEX" : "ok");
const refValue = (v) => (v < -1 || v > 1 ? "LSM-TRIT-RANGE" : "ok");
const refIndex = (i, tc) => (i < 0 || i >= tc ? "LSM-TRIT-INDEX" : "ok");
const refEnc = (e) => (e < 0 || e > 2 ? "LSM-TRIT-CORRUPT" : "ok");
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

test("RD-0361 Memory · trit-buffer-guard: R0 build → R1 #105-admit → R3 label-verified differential ≡ spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "trit-buffer-guard.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "trit-buffer-guard", prog.ast, true));
  // #64: the decode table MUST be read after the build (the emitter's intern table is per-module).
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const decode = (h) => internTable.get(h);
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["checkTritCount", "checkTritValue", "checkTritIndex", "checkTritEnc"]) assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  diffStringFlow(X, "checkTritCount", refCount, range(-3, 5).map((tc) => [tc]), decode);
  diffStringFlow(X, "checkTritValue", refValue, range(-3, 3).map((v) => [v]), decode);
  diffStringFlow(X, "checkTritIndex", refIndex, range(-2, 6).flatMap((i) => [0, 3, 5].map((tc) => [i, tc])), decode);
  diffStringFlow(X, "checkTritEnc", refEnc, range(-2, 5).map((e) => [e]), decode);
});
