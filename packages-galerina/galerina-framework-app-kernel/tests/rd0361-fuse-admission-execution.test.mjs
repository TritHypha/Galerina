// rd0361-fuse-admission-execution.test.mjs — RD-0361 (Packages): the fuse-admission `.fungi` twin EXECUTES;
// its 7 fail-closed fusion gates + the composition fold are proven EQUAL to the fuse-loader spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 LABEL-VERIFIED differential (gates + admitVerdict composition):
//   returned handles decode through the emitter's literal table; String ARGS are host-interned (content-
//   compared by $host___str_eq), so the composition fold is exercised end-to-end with real string inputs.
// Completes the Packages surface twin set (registry-index + package-admission + fuse-admission). R4 = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "fuse-admission.fungi");
const bit = (b) => (b ? 1 : 0);
const B = [false, true];

// LABEL-VERIFIED differential (task #64): decode each returned handle through the emitter's own
// literal table and require the decoded label to EQUAL the spec verdict on every corpus point.
// A branch-swap relabelling (the R&D 2026-07-15 catch, sharpest on signaturePolicyVerdict at the
// #105 border) now FAILS. Distinctness is still asserted (no verdict-class collapse).
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
const grid = (n) => { const out = []; for (let m = 0; m < (1 << n); m++) out.push(Array.from({ length: n }, (_, i) => bit(((m >> i) & 1) === 1))); return out; };

const refDesc = (fb, ns, wf, sr) => (!fb ? "FUNGI-FUSE-NO-DESCRIPTOR" : !ns ? "FUNGI-FUSE-BAD-DESCRIPTOR" : !wf ? "FUNGI-FUSE-BAD-DESCRIPTOR" : !sr ? "FUNGI-FUSE-VERSION" : "ok");
const refHash = (wp, hm) => (!wp ? "FUNGI-FUSE-NO-WASM" : !hm ? "FUNGI-FUSE-HASH-MISMATCH" : "ok");
const refSidecar = (sp, sa) => (!sp ? "ok" : !sa ? "FUNGI-FUSE-SIDECAR-DRIFT" : "ok");
const refRevoc = (ka, ca, ct, rv) => (!ka ? "ok" : !ca ? "ok" : ct ? "FUNGI-FUSE-REVOCATION-UNVERIFIABLE" : rv ? "FUNGI-FUSE-KEY-REVOKED" : "ok");
const refSig = (sv, rs, au) => (sv ? "admit" : rs ? "unsigned-refused" : au ? "admit" : "unsigned-refused");
const refReg = (ra, ro) => (!ra ? "ok" : !ro ? "registry-refused" : "ok");
const refCap = (hf) => (!hf ? "FUNGI-FUSE-UNKNOWN-CAP" : "grant");
const bg = (n, f) => grid(n).map((a) => [...a]).map((a) => a); // helper alias
const asBools = (arr) => arr.map((x) => x === 1);

test("RD-0361 Packages · fuse-admission: R0 build → R1 #105-admit → R3 label-verified gates + admitVerdict composition ≡ spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "fuse-admission.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fuse-admission", prog.ast, true));
  // #64: the decode table MUST be read after the build (the emitter's intern table is per-module).
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  // #68: seed the module's literal table into the host so $host___str_eq compares CONTENT for
  // literal-vs-arg equality; string ARGS are then interned at fresh handles past the literals.
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  // Two-layer decode: a returned literal decodes via the emitter table; a passed-through ARG
  // handle (admitVerdict returns the failing gate's own verdict string) via the host table.
  const decode = (h) => internTable.get(h) ?? host.readString(h);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["descriptorVerdict", "hashGateVerdict", "sidecarVerdict", "revocationGateVerdict", "signaturePolicyVerdict", "registryGateVerdict", "capabilityGrantVerdict", "admitVerdict"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  // the 7 individual gates, label-verified (Bool args → String verdict, handle decoded to label)
  diffStringFlow(X, "descriptorVerdict", (...a) => refDesc(...asBools(a)), grid(4), decode);
  diffStringFlow(X, "hashGateVerdict", (...a) => refHash(...asBools(a)), grid(2), decode);
  diffStringFlow(X, "sidecarVerdict", (...a) => refSidecar(...asBools(a)), grid(2), decode);
  diffStringFlow(X, "revocationGateVerdict", (...a) => refRevoc(...asBools(a)), grid(4), decode);
  diffStringFlow(X, "signaturePolicyVerdict", (...a) => refSig(...asBools(a)), grid(3), decode);
  diffStringFlow(X, "registryGateVerdict", (...a) => refReg(...asBools(a)), grid(2), decode);
  diffStringFlow(X, "capabilityGrantVerdict", (...a) => refCap(...asBools(a)), grid(1), decode);

  // admitVerdict composition (String args, task #68): exhaustive 2^7 pass/fail grid. Each arg is
  // host-interned (content-compared against the twin's literals via $host___str_eq); the fold's
  // return is decoded (literal "fused" or the failing gate's passed-through arg handle) and must
  // EQUAL the spec fold — first failing verdict denies, all-pass → "fused".
  const GATE_ARGS = [
    { pass: "ok",    fail: "FUNGI-FUSE-NO-DESCRIPTOR" },
    { pass: "ok",    fail: "FUNGI-FUSE-HASH-MISMATCH" },
    { pass: "ok",    fail: "FUNGI-FUSE-SIDECAR-DRIFT" },
    { pass: "ok",    fail: "FUNGI-FUSE-KEY-REVOKED" },
    { pass: "admit", fail: "unsigned-refused" },
    { pass: "ok",    fail: "registry-refused" },
    { pass: "grant", fail: "FUNGI-FUSE-UNKNOWN-CAP" },
  ];
  const refAdmit = (args) => { for (let i = 0; i < 7; i++) { if (args[i] !== GATE_ARGS[i].pass) return args[i]; } return "fused"; };
  for (const mask of grid(7)) {
    const argStrs = mask.map((pass, i) => (pass ? GATE_ARGS[i].pass : GATE_ARGS[i].fail));
    const handles = argStrs.map((s) => host.internString(s));
    const got = decode(X.admitVerdict(...handles));
    assert.equal(got, refAdmit(argStrs), `admitVerdict(${argStrs.join(",")}) (label-verified)`);
  }
});
