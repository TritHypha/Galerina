// rd0361-cert-gate-execution.test.mjs — RD-0361 (TLSTP/S1): the cert-gate `.fungi` twin EXECUTES, and its
// pure K3 folds are proven EQUAL to the real three-valued-governance.ts + the fail-closed sub-gate spec.
//
// cert-gate = the S1 K3 cert/channel-validation gate (KB galerina-b8-governed-transport §S1): a channel opens
// IFF the K3 vAnd-reduce (min) over {pin, chain, expiry, revocation} is ALLOW; a revocation-UNKNOWN (0)
// collapses the channel to DENY by the ALGEBRA, closing the public-web soft-fail hole.
//   R0  cert-gate.fungi `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: vAnd/certVerdict/withSideSignal ≡ the REAL shipped K3 (tower-citizen), and
//       the four cert sub-verdicts (pin/chain/expiry/revocation) ≡ their exact fail-closed spec, exhaustively.
//
// Moves cert-gate shadow → differential (RD-0361). Nothing authoritative: the `.ts` still decides; R4 = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const K3MOD = join(HERE, "..", "..", "galerina-tower-citizen", "dist", "three-valued-governance.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "cert-gate.fungi");
const TRITS = [-1, 0, 1]; // DENY · INDETERMINATE · ALLOW
const BOOLS = [false, true];

// Fail-closed reference for the four cert sub-verdicts — the EXACT spec written in cert-gate.fungi's intents.
const refPin = (cfg, present, match) => (!cfg ? 0 : !present ? 0 : match ? 1 : -1);
const refChain = (valid, invalid) => (valid ? 1 : invalid ? -1 : 0);
const refExpiry = (known, within) => (!known ? 0 : within ? 1 : -1);
const refRevocation = (revoked, good, fresh) => (revoked ? -1 : !good ? 0 : !fresh ? 0 : 1);
const bit = (b) => (b ? 1 : 0);

test("RD-0361 S1 · cert-gate: R0 build → R1 #105-admit → R3 WASM ≡ real K3 + fail-closed sub-gate spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  assert.ok(existsSync(K3MOD), "tower-citizen dist (three-valued-governance) not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  const K = await import(pathToFileURL(K3MOD).href);
  assert.equal(typeof K.allOf, "function", "real allOf must be exported for the differential");

  // ── R0 · build ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "cert-gate.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "cert-gate", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + #105 admit ──
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["vAnd", "pinMatchVerdict", "chainValidVerdict", "notExpiredVerdict", "revocationVerdict", "certVerdict", "withSideSignal"])
    assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);

  // ── R3 · differential vs the REAL three-valued-governance.ts + the fail-closed sub-gate spec ──
  // vAnd ≡ shipped vAnd (all 9 trit pairs)
  for (const a of TRITS) for (const b of TRITS) assert.equal(X.vAnd(a, b), K.vAnd(a, b), `vAnd(${a},${b})`);
  // withSideSignal ≡ vAnd (degrade-only min — No-Coercion: can only lower, never lift)
  for (const a of TRITS) for (const b of TRITS) assert.equal(X.withSideSignal(a, b), K.vAnd(a, b), `withSideSignal(${a},${b})`);
  // certVerdict ≡ allOf of the 4 cert sub-trits (exhaustive, 81 combos)
  for (const p of TRITS) for (const c of TRITS) for (const n of TRITS) for (const r of TRITS)
    assert.equal(X.certVerdict(p, c, n, r), K.allOf([p, c, n, r]), `certVerdict(${p},${c},${n},${r})`);
  // the four fail-closed sub-gates ≡ their exact spec (exhaustive over the boolean inputs)
  for (const cfg of BOOLS) for (const pr of BOOLS) for (const m of BOOLS)
    assert.equal(X.pinMatchVerdict(bit(cfg), bit(pr), bit(m)), refPin(cfg, pr, m), `pinMatchVerdict(${cfg},${pr},${m})`);
  for (const v of BOOLS) for (const iv of BOOLS)
    assert.equal(X.chainValidVerdict(bit(v), bit(iv)), refChain(v, iv), `chainValidVerdict(${v},${iv})`);
  for (const k of BOOLS) for (const w of BOOLS)
    assert.equal(X.notExpiredVerdict(bit(k), bit(w)), refExpiry(k, w), `notExpiredVerdict(${k},${w})`);
  for (const rv of BOOLS) for (const g of BOOLS) for (const fr of BOOLS)
    assert.equal(X.revocationVerdict(bit(rv), bit(g), bit(fr)), refRevocation(rv, g, fr), `revocationVerdict(${rv},${g},${fr})`);

  // ── Headline closure: revocation-UNKNOWN (stale 'good') collapses the channel to DENY by the algebra ──
  const staleGood = X.revocationVerdict(bit(false), bit(true), bit(false)); // good but not fresh → 0
  assert.equal(staleGood, 0, "revocation stale-'good' → INDETERMINATE, never ALLOW");
  assert.equal(X.certVerdict(1, 1, 1, staleGood), 0, "a lone +1 cannot lift the 0 — channel folds to DENY (soft-fail closed)");
});
