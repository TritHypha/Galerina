// RD-0358 governed memory-residency hardening (PROTOTYPE) — engine-level HV acceptance suite.
// Exercises the PURE derivation core directly (fast, deterministic). The parser+verifier integration
// (an explicit `hardening {}` block → diagnostics on a real .fungi) is in hardening-integration.test.mjs.
//
// Coverage maps to RD-0358 §7 HV / handover §5b:
//   (a) H-1  — a Secret auto-derives the full floor with NO annotation
//   (b) HV1/HV9 — the M6 fingerprint is stable, and a hand-weakened inject has a DIFFERENT fingerprint
//   (d) HV3  — showDerived exposes exactly what was injected (deterministic)
//   (e) H-2/HV5 — an unhonourable ceiling is rejected fail-closed; an undeclared host fails closed (H-6)
//   H-7      — loosening a secret default without `audited_loosen` is rejected; tighten always allowed
//   STUB     — the RD-0337 type-state composition is a marked STUB, not faked as done
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const SECRET = { isSecret: true, isTainted: false, hasSecretReadEffect: false };
const TAINT = { isSecret: false, isTainted: true, hasSecretReadEffect: false };
const SECRET_EFFECT = { isSecret: false, isTainted: false, hasSecretReadEffect: true };
const PLAIN = { isSecret: false, isTainted: false, hasSecretReadEffect: false };

// ── (a) H-1: auto-derivation — the developer writes NOTHING ────────────────────────────────────────
test("H-1: a Secret auto-derives the strictest floor (no_swap + on_exit + constant + binary), zero annotation", () => {
  const h = L.deriveAuto(SECRET);
  assert.equal(h.residency, "no_swap");
  assert.equal(h.erase, "on_exit");
  assert.equal(h.timing, "constant");
  assert.equal(h.substrate, "binary");
  assert.equal(h.provenance, "auto-derived");
  assert.deepEqual([...h.triggers], ["Secret<T>"]);
});

test("H-1: Tainted<T> and the secret.read effect each trigger the same floor", () => {
  for (const sig of [TAINT, SECRET_EFFECT]) {
    const h = L.deriveAuto(sig);
    assert.equal(h.residency, "no_swap");
    assert.equal(h.provenance, "auto-derived");
  }
});

test("H-1 (common case): a non-secret gets NO hardening — invisible, zero ceremony", () => {
  const h = L.deriveAuto(PLAIN);
  assert.equal(h.residency, "unrestricted");
  assert.equal(h.erase, "none");
  assert.equal(h.timing, "unconstrained");
  assert.equal(h.provenance, "none");
  assert.equal(h.triggers.length, 0);
});

// ── (b) HV1/HV9: the M6 injection-determinism fingerprint ───────────────────────────────────────────
test("HV1/HV9: the fingerprint is deterministic (same source → byte-identical hardening → identical digest)", () => {
  const a = L.fingerprint(L.deriveAuto(SECRET));
  const b = L.fingerprint(L.deriveAuto(SECRET));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/); // FNV-1a 32-bit hex
});

test("HV1: a HAND-WEAKENED injection has a DIFFERENT fingerprint (the differential detects tampering)", () => {
  const derived = L.deriveAuto(SECRET);
  // Attacker weakens the derived floor: no_swap → unrestricted, on_exit → none.
  const weakened = { ...derived, residency: "unrestricted", erase: "none" };
  assert.notEqual(L.fingerprint(derived), L.fingerprint(weakened),
    "a weakened inject MUST NOT reproduce the committed fingerprint");
});

// ── (d) HV3: --show-derived exposes exactly what was injected ────────────────────────────────────────
test("HV3: showDerived is deterministic and names the trigger + every dimension", () => {
  const out = L.showDerived(L.deriveAuto(SECRET));
  assert.equal(out, L.showDerived(L.deriveAuto(SECRET)));
  assert.match(out, /auto-derived from Secret<T>/);
  assert.match(out, /residency: no_swap/);
  assert.match(out, /erase:\s+on_exit/);
  assert.match(out, /timing:\s+constant/);
  assert.match(out, /substrate: binary/);
});

// ── (e) H-2 / HV5 / H-6: the host-seam honour check, fail-closed ────────────────────────────────────
test("H-2/HV5: mlock_posix honours no_swap but CANNOT honour register_only (→ FUNGI-HARDEN-005)", () => {
  const host = L.resolveHost("mlock_posix");
  assert.equal(L.canHonour("no_swap", host).ok, true);
  const reg = L.canHonour("register_only", host);
  assert.equal(reg.ok, false);
  assert.equal(reg.rejection.code, "FUNGI-HARDEN-005");
});

test("H-6: an UNDECLARED host cannot honour any real ceiling — fail-closed", () => {
  assert.equal(L.canHonour("no_swap", L.UNKNOWN_HOST).ok, false);
  assert.equal(L.canHonour("no_disk", L.resolveHost("bogus_unknown_host")).ok, false);
  // register_pinned honours everything (design-stage TRESOR-class target)
  assert.equal(L.canHonour("register_only", L.resolveHost("register_pinned")).ok, true);
  // `unrestricted` needs no guarantee — always honourable
  assert.equal(L.canHonour("unrestricted", L.UNKNOWN_HOST).ok, true);
});

// ── H-7: only-tightens; loosening a secret default is audited-or-rejected ────────────────────────────
test("H-7: tightening a secret's ceiling (no_swap → register_only) is always allowed", () => {
  const { effective, rejections } = L.reconcileExplicit(L.deriveAuto(SECRET), { residency: "register_only", auditedLoosen: false });
  assert.equal(rejections.length, 0);
  assert.equal(effective.residency, "register_only");
  assert.equal(effective.provenance, "explicit-tighten");
});

test("H-7: loosening a secret default WITHOUT audited_loosen is rejected (FUNGI-HARDEN-004), floor kept", () => {
  const { effective, rejections } = L.reconcileExplicit(L.deriveAuto(SECRET), { residency: "no_disk", auditedLoosen: false });
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0].code, "FUNGI-HARDEN-004");
  assert.equal(effective.residency, "no_swap", "fail-closed: the stricter derived ceiling is kept");
});

test("H-7: loosening WITH audited_loosen is permitted and recorded as audited-loosen provenance", () => {
  const { effective, rejections } = L.reconcileExplicit(L.deriveAuto(SECRET), { residency: "no_disk", auditedLoosen: true });
  assert.equal(rejections.length, 0);
  assert.equal(effective.residency, "no_disk");
  assert.equal(effective.provenance, "audited-loosen");
});

test("H-7: loosening the erase dimension (on_exit → none) on a secret is also audited-or-rejected", () => {
  const rej = L.reconcileExplicit(L.deriveAuto(SECRET), { erase: "none", auditedLoosen: false });
  assert.equal(rej.rejections.length, 1);
  assert.equal(rej.effective.erase, "on_exit", "fail-closed: keep zeroize-on-exit");
  const ok = L.reconcileExplicit(L.deriveAuto(SECRET), { erase: "none", auditedLoosen: true });
  assert.equal(ok.rejections.length, 0);
  assert.equal(ok.effective.erase, "none");
});

test("a non-secret setting its own (looser) ceiling is NOT a loosen — no rejection", () => {
  const { rejections } = L.reconcileExplicit(L.deriveAuto(PLAIN), { residency: "no_disk", auditedLoosen: false });
  assert.equal(rejections.length, 0);
});

// ── the lattice ─────────────────────────────────────────────────────────────────────────────────────
test("residency lattice: register_only is strictest; stricterResidency / atLeastAsStrict agree", () => {
  assert.equal(L.stricterResidency("no_swap", "register_only"), "register_only");
  assert.equal(L.stricterResidency("no_disk", "no_dram_spill"), "no_dram_spill");
  assert.equal(L.atLeastAsStrict("register_only", "no_swap"), true);
  assert.equal(L.atLeastAsStrict("no_disk", "no_swap"), false);
});

// ── the RD-0337 composition is a STUB, honestly ─────────────────────────────────────────────────────
test("RD-0337 type-state composition is a marked STUB (never faked as done)", () => {
  assert.equal(L.RD0337_TYPESTATE_STUB.status, "STUB");
  assert.match(L.RD0337_TYPESTATE_STUB.requires, /RD-0337/);
  assert.match(L.RD0337_TYPESTATE_STUB.wouldRetypeTo, /Refuted/);
});

// ── the diagnostic set is well-formed (UPPER_SNAKE names, registered codes) ──────────────────────────
test("all six FUNGI-HARDEN codes exist with UPPER_SNAKE names", () => {
  assert.equal(L.HARDENING_DIAGNOSTICS.length, 6);
  for (const d of L.HARDENING_DIAGNOSTICS) {
    assert.match(d.code, /^FUNGI-HARDEN-00[1-6]$/);
    assert.match(d.name, /^[A-Z][A-Z0-9_]*$/, `${d.code} name must be UPPER_SNAKE (audit-diagnostic-codes V5)`);
  }
});
