// rd0361-b8-admission-execution.test.mjs — RD-0361 (TLSTP/B8): the b8-admission `.fungi` twin EXECUTES,
// and its verdict fold is proven EQUAL to the real shipped K3 calculus (three-valued-governance.ts).
//
// B8 = the governed HTTP transport adapter's ADMISSION DECISION (KB galerina-b8-governed-transport §2): a
// request is admitted IFF the K3 conjunction (vAnd = min) over every request-path gate verdict is ALLOW.
//   R0  b8-admission.fungi `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: the WASM verdicts EQUAL the REAL allOf/authorize (tower-citizen) over the
//       full trit corpus — NOT an inlined mirror; each case calls the shipped K3 functions. Plus the guide's
//       Examples A (admit), B (revoked → deny), C (revocation-unknown → deny) — the TLS soft-fail closure.
//
// Nothing is authoritative: the `.ts` still decides at runtime; the R4 authority flip is `#143`, owner-gated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const K3MOD = join(HERE, "..", "..", "galerina-tower-citizen", "dist", "three-valued-governance.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "b8-admission.fungi");
const TRITS = [-1, 0, 1]; // DENY · INDETERMINATE · ALLOW

test("RD-0361 B8 · b8-admission: R0 build → R1 #105-admit → R3 WASM ≡ real K3 calculus", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  assert.ok(existsSync(K3MOD), "tower-citizen dist (three-valued-governance) not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  const K = await import(pathToFileURL(K3MOD).href);
  assert.equal(typeof K.allOf, "function", "real allOf must be exported for the differential");

  // ── R0 · build ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "b8-admission.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "b8-admission", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + #105 admit ──
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["vAnd", "certVerdict", "admitVerdict", "authorized"]) assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);

  // ── R3 · differential vs the REAL three-valued-governance.ts ──
  // vAnd ≡ shipped vAnd (all 9 trit pairs)
  for (const a of TRITS) for (const b of TRITS) assert.equal(X.vAnd(a, b), K.vAnd(a, b), `vAnd(${a},${b})`);
  // certVerdict ≡ allOf of the 4 cert sub-trits (exhaustive, 81 combos)
  for (const p of TRITS) for (const c of TRITS) for (const n of TRITS) for (const r of TRITS)
    assert.equal(X.certVerdict(p, c, n, r), K.allOf([p, c, n, r]), `certVerdict(${p},${c},${n},${r})`);
  // authorized ≡ shipped authorize (admit IFF ALLOW)
  for (const v of TRITS) assert.equal(!!X.authorized(v), K.authorize(v), `authorized(${v})`);

  // admitVerdict ≡ allOf over the 7 request-path gates — corpus: all-allow + each gate individually 0 / −1.
  const ALLOW7 = [1, 1, 1, 1, 1, 1, 1];
  const corpus = [ALLOW7.slice()];
  for (let i = 0; i < 7; i++) { const d = ALLOW7.slice(); d[i] = -1; corpus.push(d); const u = ALLOW7.slice(); u[i] = 0; corpus.push(u); }
  for (const g of corpus) {
    const w = X.admitVerdict(...g);
    const r = K.allOf(g);
    assert.equal(w, r, `admitVerdict(${g.join(",")}) WASM=${w} must equal real allOf=${r}`);
    assert.equal(!!X.authorized(w), K.authorize(r), `authorized of ${g.join(",")}`);
  }

  // ── The three worked examples from the B8 build guide, called out explicitly ──
  // A — fully governed → +1 → ADMIT
  const A = X.admitVerdict(1, 1, 1, 1, 1, 1, X.certVerdict(1, 1, 1, 1));
  assert.equal(A, 1, "Example A: all gates ALLOW → +1"); assert.equal(!!X.authorized(A), true, "Example A: ADMIT");
  // B — revoked key (Gate 2b = −1) → −1 → DENY (one DENY absorbs; the signature itself still verified)
  const B = X.admitVerdict(1, 1, 1, 1, -1, 1, X.certVerdict(1, 1, 1, 1));
  assert.equal(B, -1, "Example B: revoked → −1"); assert.equal(!!X.authorized(B), false, "Example B: DENY");
  // C — revocation-unknown at the cert gate (revocation_fresh = 0) → cert 0 → admit 0 → DENY (soft-fail closed)
  const certC = X.certVerdict(1, 1, 1, 0);
  assert.equal(certC, 0, "Example C: revocation-unknown → cert INDETERMINATE");
  const C = X.admitVerdict(1, 1, 1, 1, 1, 1, certC);
  assert.equal(C, 0, "Example C: fold → INDETERMINATE"); assert.equal(!!X.authorized(C), false, "Example C: DENY (TLS soft-fail closed)");
});
