// rd0365-pq-admission-policy-execution.test.mjs — the PQ-admission policy twin EXECUTES.
//
// The CRYPTO-002 no-PQ-downgrade admission POLICY is authored in `.fungi` (the ML-DSA/Ed25519 verify itself
// stays host floor). This keep-green gate proves it end-to-end: R0 build → R1 sign + #105-admit → execute →
// the WASM verdict EQUALS the policy spec over the full 128-combo truth table, plus the two load-bearing rules
// called out (no-downgrade when hybrid required, certified profile refuses a missing PQ half).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "pq-admission-policy.fungi");

// Policy spec (mirrors verifyAttestationHybrid's policy half): deny-by-default.
const specPq = (edPresent, edValid, requireHybrid, mlKeyPresent, mlSigPresent, mlValid, requireCertified) => {
  if (!edPresent || !edValid) return -1;                                        // classical half must verify
  if (requireHybrid && (!mlKeyPresent || !mlSigPresent || !mlValid)) return -1; // CRYPTO-002 no-downgrade
  if (requireCertified && (!mlSigPresent || !mlValid)) return -1;               // certified requires PQ half
  return 1;
};

test("RD-0365/CRYPTO-002 · PQ-admission policy: R0 build → R1 #105-admit → verdict ≡ policy spec (128 combos)", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "pq-admission-policy.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin checks clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const asm = await L.assembleWAT(L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "pq-admit", prog.ast, true)));
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const f = instance.exports.pqAdmissionVerdict;
  assert.equal(typeof f, "function", "pqAdmissionVerdict admitted + exported (R1)");

  const B = (b) => (b ? 1 : 0);
  let agree = 0;
  for (let m = 0; m < 128; m++) {
    const b = [0, 1, 2, 3, 4, 5, 6].map((i) => ((m >> i) & 1) === 1);
    const [ep, ev, rh, mk, ms, mv, rc] = b;
    const w = f(B(ep), B(ev), B(rh), B(mk), B(ms), B(mv), B(rc));
    assert.equal(w, specPq(ep, ev, rh, mk, ms, mv, rc), `pqAdmissionVerdict(${b.map(Number).join(",")})`);
    agree++;
  }
  assert.equal(agree, 128, "full truth table checked");

  // The load-bearing rules, explicit:
  // ed present+valid, hybrid required, but ML-DSA absent → DENY (no PQ downgrade).
  assert.equal(f(1, 1, 1, 0, 0, 0, 0), -1, "requireHybrid + no ML-DSA → DENY (CRYPTO-002 no downgrade)");
  // full hybrid verified → ALLOW.
  assert.equal(f(1, 1, 1, 1, 1, 1, 1), 1, "classical + ML-DSA both verify + certified → ALLOW");
  // certified profile but ML-DSA signature invalid → DENY.
  assert.equal(f(1, 1, 0, 1, 1, 0, 1), -1, "certified profile with invalid ML-DSA half → DENY");
});
