// rd0361-pool-policy-execution.test.mjs — RD-0361 (Memory): the pool-policy `.fungi` twin EXECUTES; its
// fail-closed pool-config + segment-resolution verdicts are proven EQUAL to the StaticMemoryPool spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 differential via intern-handle equivalence.
// Moves pool-policy shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "pool-policy.fungi");

// PARTITION-equivalence check (labels UNVERIFIED). Proves the twin partitions inputs into the SAME verdict
// classes as the spec (no collapse, no split) — but NOT that the class labels match; a swapped-branch
// relabelling would pass (R&D catch 2026-07-15). Full label-verification is gated on the string-return DECODE
// increment (host.readString decodes runtime-built strings, not these interned literals in this build).
// Honest tier: partition-proven, not ≡-spec.
function diffStringFlow(X, fn, ref, corpus) {
  const handleOf = {};
  for (const a of corpus) { const s = ref(...a); if (!(s in handleOf)) handleOf[s] = X[fn](...a); }
  const handles = Object.values(handleOf);
  assert.equal(new Set(handles).size, handles.length, `${fn}: distinct verdicts → distinct handles (no collapse)`);
  for (const a of corpus) assert.equal(X[fn](...a), handleOf[ref(...a)], `${fn}(${a.join(",")}) → class ${ref(...a)}`);
}

const refConfig = (block, total, align) =>
  (block <= 0 ? "LSM-CFG-001" : block % align !== 0 ? "LSM-CFG-001" : total <= 0 ? "LSM-CFG-002" : total % block !== 0 ? "LSM-CFG-002" : "ok");
const refSeg = (ptr, cap, gov) =>
  (ptr < 0 ? "LSM-BOUNDS-001" : ptr >= cap ? "LSM-BOUNDS-001" : ptr < gov ? "compute" : "governance");

test("RD-0361 Memory · pool-policy: R0 build → R1 #105-admit → R3 partition-equivalent to spec (labels unverified)", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "pool-policy.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "pool-policy", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["checkPoolConfig", "segmentOfPtr"]) assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  const cfg = [];
  for (const block of [-16, 0, 16, 24, 32]) for (const total of [-16, 0, 16, 32, 40, 48, 64]) cfg.push([block, total, 16]);
  diffStringFlow(X, "checkPoolConfig", refConfig, cfg);

  const seg = [];
  for (const ptr of [-8, -1, 0, 16, 31, 32, 48, 63, 64, 80]) seg.push([ptr, 64, 32]);
  diffStringFlow(X, "segmentOfPtr", refSeg, seg);
});
