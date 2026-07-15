// rd0361-audit-egress-execution.test.mjs — RD-0361 (sentinel-egress): the audit-egress `.fungi` twin
// EXECUTES; its chain-verification verdicts are proven EQUAL to AuditEgress's spec (verifyChain /
// verifyChainEpochAware / adoptEpoch / constructor preconditions).
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (label-safe: trit verdicts).
// Moves audit-egress shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "audit-egress.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

const refChain = (ph, seq, cnt, mac) => (!ph || !seq || !cnt || !mac ? -1 : 1);
const refEpochLink = (ev, nd, ku, base) => (!ev ? -1 : !nd ? -1 : !ku ? -1 : base < 1 ? base : 1);
const refAdopt = (gt, real) => (!gt ? -1 : !real ? -1 : 1);
const refConfig = (bs, sk, ep) => (!bs ? -1 : !sk ? -1 : !ep ? -1 : 1);

test("RD-0361 sentinel-egress · audit-egress: R0 build → R1 #105-admit → R3 WASM ≡ chain-verification spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "audit-egress.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "audit-egress", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["chainLinkVerdict", "epochLinkVerdict", "epochAdoptVerdict", "configVerdict"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const ph of B) for (const sq of B) for (const cn of B) for (const mc of B) {
    const w = X.chainLinkVerdict(bit(ph), bit(sq), bit(cn), bit(mc));
    assert.equal(w, refChain(ph, sq, cn, mc), `chainLinkVerdict(${ph},${sq},${cn},${mc})`);
    assert.ok(w === 1 || w === -1, "verdict is a trit ALLOW/DENY");
  }
  for (const ev of B) for (const nd of B) for (const ku of B) for (const base of [-1, 0, 1]) {
    assert.equal(X.epochLinkVerdict(bit(ev), bit(nd), bit(ku), base), refEpochLink(ev, nd, ku, base), `epochLinkVerdict(${ev},${nd},${ku},${base})`);
  }
  for (const gt of B) for (const real of B) {
    assert.equal(X.epochAdoptVerdict(bit(gt), bit(real)), refAdopt(gt, real), `epochAdoptVerdict(${gt},${real})`);
  }
  for (const bs of B) for (const sk of B) for (const ep of B) {
    assert.equal(X.configVerdict(bit(bs), bit(sk), bit(ep)), refConfig(bs, sk, ep), `configVerdict(${bs},${sk},${ep})`);
  }
});
