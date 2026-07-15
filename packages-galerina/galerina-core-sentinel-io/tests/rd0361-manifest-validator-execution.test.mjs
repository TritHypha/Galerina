// rd0361-manifest-validator-execution.test.mjs — RD-0361 (I/O): the manifest-validator `.fungi` twin
// EXECUTES; the strict structural gate (LSIO-MANIFEST-001) is proven EQUAL to ManifestLoader.fromObject's
// spec — header, per-block shape, per-block layout, and both compositions.
//   R0 build → WASM · R1 sign + #105-admit · R3 LABEL-VERIFIED differential: String verdicts decode
//   through the emitter's literal table (task #64); composition String ARGS marshal at literal handles
//   (task #68). Moves manifest-validator shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "manifest-validator.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);
const BAD = "LSIO-MANIFEST-001";

const refHeader = (v, s, t, b) => (!v || !s || !t || !b ? BAD : "ok");
const refShape = (id, off, len, sha) => (!id || !off || !len || !sha ? BAD : "ok");
const refLayout = (off, end, total, prevEnd) => (end < off ? BAD : end > total ? BAD : off < prevEnd ? BAD : "ok");
const refBlock = (shape, layout) => (shape !== "ok" ? shape : layout !== "ok" ? layout : "ok");
const refManifest = (header, allOk) => (header !== "ok" ? header : !allOk ? BAD : "valid");

test("RD-0361 I/O · manifest-validator: R0 build → R1 #105-admit → R3 label-verified differential ≡ spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "manifest-validator.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "manifest-validator", prog.ast, true));
  // #64: the decode table MUST be read after the build (the emitter's intern table is per-module).
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const decode = (h) => internTable.get(h) ?? host.readString(h);
  const marshal = (s) => { for (const [h, v] of internTable) { if (v === s) return h; } return host.internString(s); };
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["headerVerdict", "blockShapeVerdict", "blockLayoutVerdict", "blockVerdict", "manifestVerdict"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const v of B) for (const s of B) for (const t of B) for (const b of B) {
    assert.equal(decode(X.headerVerdict(bit(v), bit(s), bit(t), bit(b))), refHeader(v, s, t, b), `headerVerdict(${v},${s},${t},${b}) (label-verified)`);
  }
  for (const id of B) for (const off of B) for (const len of B) for (const sha of B) {
    assert.equal(decode(X.blockShapeVerdict(bit(id), bit(off), bit(len), bit(sha))), refShape(id, off, len, sha), `blockShapeVerdict(${id},${off},${len},${sha}) (label-verified)`);
  }
  const PTS = [-1, 0, 1, 31, 32, 64];
  for (const off of PTS) for (const end of PTS) for (const total of [0, 32, 64]) for (const prevEnd of [0, 1, 32]) {
    assert.equal(decode(X.blockLayoutVerdict(off, end, total, prevEnd)), refLayout(off, end, total, prevEnd), `blockLayoutVerdict(${off},${end},${total},${prevEnd}) (label-verified)`);
  }
  for (const shape of ["ok", BAD]) for (const layout of ["ok", BAD]) {
    assert.equal(decode(X.blockVerdict(marshal(shape), marshal(layout))), refBlock(shape, layout), `blockVerdict(${shape},${layout}) (label-verified)`);
  }
  for (const header of ["ok", BAD]) for (const allOk of B) {
    assert.equal(decode(X.manifestVerdict(marshal(header), bit(allOk))), refManifest(header, allOk), `manifestVerdict(${header},${allOk}) (label-verified)`);
  }
});
