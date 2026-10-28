// rd0364-inference-governance-execution.test.mjs — RD-0364: the inference-governance twin EXECUTES.
//
// The per-call governed-inference decision (RD-0364 §1–§4) is authored in `.fungi` (no `.ts` decision logic). This
// keep-green gate proves it end-to-end: R0 build → R1 sign + #105-admit → execute → the WASM verdicts EQUAL the
// RD-0364 spec folds — the composite call admission, the honest identity tiers, and the load-bearing output-taint
// rule (a model's answer is UNKNOWN until discharged). New governed surface, so the reference is the spec itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "inference-governance.fungi");

// RD-0364 spec folds.
const specIdentity = (localAttested, weightsHashMatch, providerAsserted) =>
  localAttested ? (weightsHashMatch ? 1 : -1) : (providerAsserted ? 0 : -1);
const specCall = (bridgeAdmitted, identityClass, requireCertified, costOk, egressOk) => {
  if (!bridgeAdmitted) return -1;
  if (identityClass < 0) return -1;
  if (requireCertified && identityClass < 1) return -1;
  if (!costOk) return -1;
  if (!egressOk) return -1;
  return 1;
};

test("RD-0364 · inference-governance: R0 build → R1 #105-admit → verdicts ≡ spec (identity · call · taint)", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "inference-governance.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin checks clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const asm = await L.assembleWAT(L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "infer-gov", prog.ast, true)));
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const identity = instance.exports.identityClassVerdict;
  const call = instance.exports.inferenceCallVerdict;
  const taint = instance.exports.outputTrustTrit;
  assert.equal(typeof identity, "function", "identityClassVerdict admitted (R1)");
  assert.equal(typeof call, "function", "inferenceCallVerdict admitted (R1)");
  assert.equal(typeof taint, "function", "outputTrustTrit admitted (R1)");
  const B = (b) => (b ? 1 : 0);

  // §1 honest tiers: local-attested+hash → +1, local+mismatch → -1, cloud → 0, unattested → -1.
  for (const [la, whm, pa] of [[true, true, false], [true, false, false], [false, false, true], [false, false, false]]) {
    assert.equal(identity(B(la), B(whm), B(pa)), specIdentity(la, whm, pa), `identityClassVerdict(${la},${whm},${pa})`);
  }

  // §2 output taint (load-bearing): undischarged model output is UNKNOWN (0); only a verifier discharge lifts to +1.
  assert.equal(taint(B(false)), 0, "undischarged inference output is UNKNOWN (0) — cannot cross requireTrusted");
  assert.equal(taint(B(true)), 1, "discharged by a verifier flow → trusted (+1)");

  // Composite per-call admission over identity ∈ {-1,0,1} × the boolean gates; certified profile refuses non-attested.
  let agree = 0;
  for (const ba of [true, false])
    for (const ic of [-1, 0, 1])
      for (const rc of [true, false])
        for (const co of [true, false])
          for (const eg of [true, false]) {
            const w = call(B(ba), ic, B(rc), B(co), B(eg));
            assert.equal(w, specCall(ba, ic, rc, co, eg), `inferenceCallVerdict(${ba},${ic},${rc},${co},${eg})`);
            agree++;
          }
  assert.equal(agree, 2 * 3 * 2 * 2 * 2, "full admission truth-table checked");

  // The two rules RD-0364 exists to enforce, called out:
  assert.equal(call(1, 0, 1, 1, 1), -1, "certified profile REFUSES a provider-asserted (non-attested) model (§1)");
  assert.equal(call(1, 1, 0, 0, 1), -1, "cost cap exceeded → DENY/halt (§4)");
});
