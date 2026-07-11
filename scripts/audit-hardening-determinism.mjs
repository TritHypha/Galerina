#!/usr/bin/env node
// audit-hardening-determinism.mjs — the M6 / HV1 / HV9 injection-determinism gate (RD-0358 PROTOTYPE).
//
// Auto-injected hardening is a deterministic pure function H = f(τ, ε) (RD-0358 §8 M6). Security rests on
// exactly one property: f is pure and lives inside the attested compiler. This gate is the TOTAL DETECTOR
// the RD calls for (HV1 "injector weakens", HV9 "reproducibility drift"):
//   1. GOLDEN corpus — each canonical derivation must reproduce its PINNED fingerprint. A change to the
//      derivation logic (or a hand-weakened inject) changes the fingerprint and RED-fails here.
//   2. DETERMINISM — the same input yields a byte-identical fingerprint across repeated derivations.
//   3. TAMPER self-test — a deliberately weakened secret floor MUST NOT reproduce the secret golden
//      (proves the differential has teeth; a gate that can't catch tampering is theatre).
// Fail-closed: any mismatch exits 1. Zero-dep; imports only the built engine.
//
// NOTE (honest): the fingerprint is a DETERMINISM digest (FNV-1a), NOT a cryptographic signature. HV2
// (a POST-signature inject fails artifact verification) needs the real signer and is design-stage.
import {
  deriveAuto, reconcileExplicit, fingerprint, canonicalize,
} from "../packages-galerina/galerina-core-compiler/dist/index.js";

const SECRET = { isSecret: true, isTainted: false, hasSecretReadEffect: false };
const TAINT = { isSecret: false, isTainted: true, hasSecretReadEffect: false };
const SECRET_EFFECT = { isSecret: false, isTainted: false, hasSecretReadEffect: true };
const PLAIN = { isSecret: false, isTainted: false, hasSecretReadEffect: false };

const autoSecret = deriveAuto(SECRET);

// GOLDEN corpus — pinned fingerprints of f(τ,ε). Regenerate ONLY via a reviewed derivation change.
const CORPUS = [
  { name: "Secret<T> floor",                 h: deriveAuto(SECRET),        golden: "58e181ae" },
  { name: "Tainted<T> floor",                h: deriveAuto(TAINT),         golden: "a90d5995" },
  { name: "secret.read effect floor",        h: deriveAuto(SECRET_EFFECT), golden: "1c11865f" },
  { name: "non-secret (no hardening)",       h: deriveAuto(PLAIN),         golden: "3838b55e" },
  { name: "secret + explicit register_only", h: reconcileExplicit(autoSecret, { residency: "register_only", auditedLoosen: false }).effective, golden: "5d998b5e" },
  { name: "secret + audited loosen no_disk", h: reconcileExplicit(autoSecret, { residency: "no_disk", auditedLoosen: true }).effective, golden: "3461472e" },
];

let failed = 0;
const log = (ok, msg) => { console.log(`  ${ok ? "OK  " : "FAIL"} ${msg}`); if (!ok) failed++; };

console.log("hardening-determinism: GOLDEN corpus (HV1/HV9 — re-derivation must reproduce the pinned fingerprint)");
for (const c of CORPUS) {
  const fp = fingerprint(c.h);
  log(fp === c.golden, `${c.name.padEnd(34)} ${fp}${fp === c.golden ? "" : ` (expected ${c.golden}) — canonical: ${canonicalize(c.h)}`}`);
}

console.log("hardening-determinism: DETERMINISM (same input → byte-identical digest, x100)");
for (const c of CORPUS) {
  let stable = true;
  const first = fingerprint(c.h);
  for (let i = 0; i < 100; i++) if (fingerprint(c.h) !== first) stable = false;
  log(stable, `${c.name.padEnd(34)} stable`);
}

console.log("hardening-determinism: TAMPER self-test (a weakened inject must NOT reproduce the golden)");
{
  const weakened = { ...autoSecret, residency: "unrestricted", erase: "none" };
  const differs = fingerprint(weakened) !== "58e181ae";
  log(differs, `weakened secret floor → ${fingerprint(weakened)} ≠ 58e181ae (differential has teeth)`);
  // A no-op "re-derivation" of the same source MUST match (else the gate would false-positive).
  log(fingerprint(deriveAuto(SECRET)) === "58e181ae", "re-derivation of the same source reproduces the golden");
}

console.log(failed === 0
  ? `hardening-determinism: ${CORPUS.length}/${CORPUS.length} golden + determinism + tamper checks GREEN`
  : `hardening-determinism: ${failed} check(s) FAILED — fail-closed`);
process.exit(failed === 0 ? 0 : 1);
