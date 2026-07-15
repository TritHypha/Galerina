// rd0361-pool-allocation-guard-execution.test.mjs — RD-0361 (Memory): the pool-allocation-guard `.fungi`
// twin EXECUTES; its allocate/free/use-after-free verdicts + the REJECT-fill byte are proven EQUAL to
// static-memory-pool.ts's spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 LABEL-VERIFIED differential: String verdicts decode
//   through the emitter's literal table (task #64); scrubFillByte's String ARG is host-interned (task #68).
// Moves pool-allocation-guard shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "pool-allocation-guard.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

const refAllocate = (flightLocked, bytesNegative, runAvailable) =>
  (flightLocked ? "LSM-FLIGHT-LOCKED" : bytesNegative ? "LSM-BOUNDS-001" : !runAvailable ? "LSM-POOL-EXHAUSTED" : "ok");
const refFree = (ptrIsLive) => (ptrIsLive ? "ok" : "LSM-FREE-001");
const refUaf = (ptrIsLive, generationMatches) => (!ptrIsLive ? "LSM-UAF-001" : !generationMatches ? "LSM-UAF-001" : "ok");
// Zero-trust fill: ONLY "compute" gets 0xFF; governance AND any unrecognized segment fail-safe to
// 0x00 (all-REJECT trits), never the ILLEGAL byte.
const refScrub = (segment) => (segment === "compute" ? 255 : 0);

test("RD-0361 Memory · pool-allocation-guard: R0 build → R1 #105-admit → R3 label-verified differential ≡ spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "pool-allocation-guard.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "pool-allocation-guard", prog.ast, true));
  // #64: the decode table MUST be read after the build (the emitter's intern table is per-module).
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  // #68: seed the module's literals so $host___str_eq compares CONTENT for literal-vs-arg equality.
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const decode = (h) => internTable.get(h) ?? host.readString(h);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["allocateVerdict", "freeVerdict", "useAfterFreeVerdict", "scrubFillByte"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  // allocate: exhaustive 2^3, order matters (flight-lock > bounds > exhaustion).
  for (const fl of B) for (const bn of B) for (const ra of B) {
    const got = decode(X.allocateVerdict(bit(fl), bit(bn), bit(ra)));
    assert.equal(got, refAllocate(fl, bn, ra), `allocateVerdict(${fl},${bn},${ra}) (label-verified)`);
  }
  // free: exhaustive.
  for (const live of B) {
    assert.equal(decode(X.freeVerdict(bit(live))), refFree(live), `freeVerdict(${live}) (label-verified)`);
  }
  // use-after-free / ABA: exhaustive 2^2.
  for (const live of B) for (const gen of B) {
    assert.equal(decode(X.useAfterFreeVerdict(bit(live), bit(gen))), refUaf(live, gen), `useAfterFreeVerdict(${live},${gen}) (label-verified)`);
  }
  // scrub fill byte: String ARG (host-interned) → Int. Unrecognized segments MUST fail-safe to 0x00.
  for (const seg of ["compute", "governance", "COMPUTE", "compute ", "", "rogue"]) {
    assert.equal(X.scrubFillByte(host.internString(seg)), refScrub(seg), `scrubFillByte(${JSON.stringify(seg)})`);
  }
});
