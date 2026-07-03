// =============================================================================
// anchor-gcm-taglen.test.mjs — pentest 2026-07-02 (LOW): GCM auth-tag length is fail-closed.
// =============================================================================
// The finding (verified live at anchor.ts:74/:76): unwrapRecipientSecret took
// `tag = ct.subarray(ct.length - 16)` with NO lower-bound guard and called createDecipheriv
// WITHOUT authTagLength. A truncated/corrupt wrap (ct < 16 B) yields a SHORT GCM tag, which Node's
// setAuthTag accepts (DEP0182) — silently downgrading auth from 128-bit to as low as 32-bit.
//
// The fix rejects a structurally-invalid ct BEFORE decrypt (fail-closed) and pins authTagLength:16.
// These tests exercise the REAL wrap/unwrap (not a model). Argon2id is memory-hard, so a single wrap
// is shared across the cases to keep the KDF cost down.
// =============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapRecipientSecret, unwrapRecipientSecret } from "../dist/index.js";

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 0xff);
const PASS = new TextEncoder().encode("correct horse battery staple");
// One real Argon2id-backed wrap, reused by every case below.
const wrapped = wrapRecipientSecret(SECRET, PASS);

test("round-trip: a well-formed wrap unwraps to the original secret (no over-block, 16 B tag)", () => {
  const got = unwrapRecipientSecret(wrapped, PASS, (sec) => Uint8Array.from(sec));
  assert.deepEqual(got, SECRET);
});

test("FAIL-CLOSED: a truncated ct (< tag + body) is REFUSED before decrypt (short-tag downgrade blocked)", () => {
  // Correct passphrase, but a structurally-invalid ct — the length guard must fire (a GCM error here
  // would mean the guard was bypassed, i.e. the fail-open regressed).
  const truncated = { salt: wrapped.salt, iv: wrapped.iv, ct: wrapped.ct.subarray(0, 10) };
  assert.throws(
    () => unwrapRecipientSecret(truncated, PASS, () => "unreachable"),
    /malformed|fail-closed/i,
    "a ct shorter than the 16 B GCM tag + body must be refused before setAuthTag/decrypt",
  );
});

test("GCM auth preserved: a wrong passphrase still fails closed (no stale key returned)", () => {
  const wrongPass = new TextEncoder().encode("not the passphrase");
  assert.throws(() => unwrapRecipientSecret(wrapped, wrongPass, () => "unreachable"));
});
