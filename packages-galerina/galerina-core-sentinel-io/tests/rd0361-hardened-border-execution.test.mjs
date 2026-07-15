// rd0361-hardened-border-execution.test.mjs — RD-0361 (I/O): the hardened-border `.fungi` twin EXECUTES;
// its integrity / mapping / bounds / release verdicts are proven EQUAL to the sentinel-io spec
// (integrity-monitor.ts + zero-copy-mapper.ts — "tampered bytes never reach the backing buffer").
//   R0 build → WASM · R1 sign + #105-admit · R3 LABEL-VERIFIED differential: String verdicts decode
//   through the emitter's literal table (task #64); the release composition's String ARGS are marshalled
//   at the module's own literal handles (task #68).
// Moves hardened-border shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "hardened-border.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

const refIntegrity = (m) => (m ? "ok" : "LSIO-INTEGRITY-001");
const refMapGuard = (len, total) => (total < 0 ? "LSIO-MAP-001" : len < total ? "LSIO-MAP-001" : "ok");
const refBounds = (off, end, total) => (off < 0 ? "LSIO-MAP-001" : end < off ? "LSIO-MAP-001" : end > total ? "LSIO-MAP-001" : "ok");
const refRelease = (bounds, integ) => (bounds !== "ok" ? bounds : integ !== "ok" ? integ : "release");

test("RD-0361 I/O · hardened-border: R0 build → R1 #105-admit → R3 label-verified differential ≡ spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "hardened-border.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "hardened-border", prog.ast, true));
  // #64: the decode table MUST be read after the build (the emitter's intern table is per-module).
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  // #68: seed literals (content equality) + marshal a string ARG at the module's own literal handle
  // when the content is interned (faithful to in-module string origin), else at a fresh host handle.
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const decode = (h) => internTable.get(h) ?? host.readString(h);
  const marshal = (s) => { for (const [h, v] of internTable) { if (v === s) return h; } return host.internString(s); };
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["integrityVerdict", "mapGuardVerdict", "blockBoundsVerdict", "releaseVerdict"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const m of B) {
    assert.equal(decode(X.integrityVerdict(bit(m))), refIntegrity(m), `integrityVerdict(${m}) (label-verified)`);
  }
  const LENS = [-1, 0, 1, 63, 64, 65, 1024];
  for (const len of LENS) for (const total of LENS) {
    assert.equal(decode(X.mapGuardVerdict(len, total)), refMapGuard(len, total), `mapGuardVerdict(${len},${total}) (label-verified)`);
  }
  const PTS = [-2, -1, 0, 1, 31, 32, 33, 64];
  for (const off of PTS) for (const end of PTS) for (const total of [0, 32, 64]) {
    assert.equal(decode(X.blockBoundsVerdict(off, end, total)), refBounds(off, end, total), `blockBoundsVerdict(${off},${end},${total}) (label-verified)`);
  }
  // release composition (String args, pass-through on failure) — exhaustive over the verdict alphabet.
  for (const bounds of ["ok", "LSIO-MAP-001"]) for (const integ of ["ok", "LSIO-INTEGRITY-001"]) {
    const got = decode(X.releaseVerdict(marshal(bounds), marshal(integ)));
    assert.equal(got, refRelease(bounds, integ), `releaseVerdict(${bounds},${integ}) (label-verified)`);
  }
});
