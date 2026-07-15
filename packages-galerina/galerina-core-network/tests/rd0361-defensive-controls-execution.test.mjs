// rd0361-defensive-controls-execution.test.mjs — RD-0361 (TLSTP): the defensive-controls `.fungi` twin
// EXECUTES; the RD-0325 (attacker-past-proxy) + RD-0326 (enumeration-resistance) decision surfaces are
// proven EQUAL to defensive-controls.ts's spec.
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (label-safe: trits).
// Covers: proxyTrustVerdict (identity-proof only — IP/header presence never confer trust),
// useForwardedAddress (XFF authoritative only under a trusted proxy), the two enumeration collapses
// (uniform resource / auth denial), opaqueIdVerdict, pageLimitBranch.
// Moves defensive-controls shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "defensive-controls.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

const refProxy = (isMtls, mv, mp, isTok, tv) => {
  if (isMtls) return (mv && mp) ? 1 : -1;
  if (isTok) return tv ? 1 : -1;
  return -1;
};
const refFwd = (trusted, nonBlank) => (trusted && nonBlank ? 1 : 0);
const refUniform = (isOk) => (isOk ? 1 : -1);
const refOpaque = (le, nn, us) => (!le ? -1 : !nn ? -1 : !us ? -1 : 1);
const refPage = (valid, exceeds) => (!valid ? -1 : exceeds ? 1 : 0);

test("RD-0361 TLSTP · defensive-controls: R0 build → R1 #105-admit → R3 WASM ≡ RD-0325/0326 spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "defensive-controls.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "defensive-controls", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["proxyTrustVerdict", "useForwardedAddress", "uniformResourceAuthorized", "uniformAuthAuthenticated", "opaqueIdVerdict", "pageLimitBranch"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const im of B) for (const mv of B) for (const mp of B) for (const it of B) for (const tv of B) {
    const w = X.proxyTrustVerdict(bit(im), bit(mv), bit(mp), bit(it), bit(tv));
    assert.equal(w, refProxy(im, mv, mp, it, tv), `proxyTrustVerdict(${im},${mv},${mp},${it},${tv})`);
    assert.ok(w === 1 || w === -1, "verdict is a trit ALLOW/DENY");
  }
  for (const tr of B) for (const nb of B) {
    assert.equal(X.useForwardedAddress(bit(tr), bit(nb)), refFwd(tr, nb), `useForwardedAddress(${tr},${nb})`);
  }
  for (const ok of B) {
    assert.equal(X.uniformResourceAuthorized(bit(ok)), refUniform(ok), `uniformResourceAuthorized(${ok})`);
    assert.equal(X.uniformAuthAuthenticated(bit(ok)), refUniform(ok), `uniformAuthAuthenticated(${ok})`);
  }
  for (const le of B) for (const nn of B) for (const us of B) {
    assert.equal(X.opaqueIdVerdict(bit(le), bit(nn), bit(us)), refOpaque(le, nn, us), `opaqueIdVerdict(${le},${nn},${us})`);
  }
  for (const v of B) for (const ex of B) {
    assert.equal(X.pageLimitBranch(bit(v), bit(ex)), refPage(v, ex), `pageLimitBranch(${v},${ex})`);
  }
});
