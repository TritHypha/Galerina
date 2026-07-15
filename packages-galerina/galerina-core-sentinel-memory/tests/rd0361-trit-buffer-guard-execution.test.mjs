// rd0361-trit-buffer-guard-execution.test.mjs — RD-0361 (Memory): the trit-buffer-guard `.fungi` twin
// EXECUTES; its fail-closed trit-buffer verdicts are proven EQUAL to the TPLStateBuffer spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 differential via intern-handle equivalence.
// String-verdict flows ("ok"/"LSM-TRIT-*") return an interned handle; the differential proves the WASM
// verdict PARTITION ≡ spec: same-verdict inputs → same handle, distinct verdicts → distinct handles.
// Moves trit-buffer-guard shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "trit-buffer-guard.fungi");

// Prove a String-verdict flow ≡ spec without decoding strings: build {verdict→handle} from the corpus,
// require distinct verdicts to have DISTINCT handles (no collapse), then check every input's handle.
function diffStringFlow(X, fn, ref, corpus) {
  const handleOf = {};
  for (const a of corpus) { const s = ref(...a); if (!(s in handleOf)) handleOf[s] = X[fn](...a); }
  const handles = Object.values(handleOf);
  assert.equal(new Set(handles).size, handles.length, `${fn}: distinct verdicts must map to distinct handles (no collapse)`);
  for (const a of corpus) assert.equal(X[fn](...a), handleOf[ref(...a)], `${fn}(${a.join(",")}) → verdict ${ref(...a)}`);
}

const refCount = (tc) => (tc < 0 ? "LSM-TRIT-INDEX" : "ok");
const refValue = (v) => (v < -1 || v > 1 ? "LSM-TRIT-RANGE" : "ok");
const refIndex = (i, tc) => (i < 0 || i >= tc ? "LSM-TRIT-INDEX" : "ok");
const refEnc = (e) => (e < 0 || e > 2 ? "LSM-TRIT-CORRUPT" : "ok");
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

test("RD-0361 Memory · trit-buffer-guard: R0 build → R1 #105-admit → R3 partition-equivalent to spec (labels unverified)", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "trit-buffer-guard.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "trit-buffer-guard", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["checkTritCount", "checkTritValue", "checkTritIndex", "checkTritEnc"]) assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  diffStringFlow(X, "checkTritCount", refCount, range(-3, 5).map((tc) => [tc]));
  diffStringFlow(X, "checkTritValue", refValue, range(-3, 3).map((v) => [v]));
  diffStringFlow(X, "checkTritIndex", refIndex, range(-2, 6).flatMap((i) => [0, 3, 5].map((tc) => [i, tc])));
  diffStringFlow(X, "checkTritEnc", refEnc, range(-2, 5).map((e) => [e]));
});
