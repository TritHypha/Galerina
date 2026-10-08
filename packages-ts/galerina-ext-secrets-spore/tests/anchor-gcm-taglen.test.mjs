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
import { createCipheriv, createDecipheriv } from "node:crypto";
import { anchorProdSecret, wrapRecipientSecret, unwrapRecipientSecret } from "../dist/index.js";
import { withWiped } from "../dist/arena.js";

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

test("recipient-key wrapping wipes its temporary plaintext cipher input", () => {
  const probe = createCipheriv("aes-256-gcm", Buffer.alloc(32), Buffer.alloc(12), { authTagLength: 16 });
  const cipherPrototype = Object.getPrototypeOf(probe);
  probe.destroy();
  const originalUpdate = cipherPrototype.update;
  const originalFill = Uint8Array.prototype.fill;
  let cipherInput;
  let inputSnapshot;
  let updatePatched = false;
  try {
    cipherPrototype.update = function (data, ...args) {
      if (Buffer.isBuffer(data) && data.length === SECRET.length) {
        cipherInput = data;
        inputSnapshot = Uint8Array.from(data);
      }
      return originalUpdate.call(this, data, ...args);
    };
    updatePatched = true;
    const result = wrapRecipientSecret(SECRET, PASS);
    assert.ok(result.ct.length > 16, "wrapping must still return ciphertext and a GCM tag");
    assert.deepEqual([...inputSnapshot], [...SECRET], "the observed cipher input is the expected plaintext key");
    assert.deepEqual([...cipherInput], new Array(SECRET.length).fill(0), "the exact temporary plaintext input must be wiped");
  } finally {
    if (updatePatched) cipherPrototype.update = originalUpdate;
    if (cipherInput !== undefined) originalFill.call(cipherInput, 0);
    if (inputSnapshot !== undefined) originalFill.call(inputSnapshot, 0);
  }
});

test("GCM authentication failure wipes plaintext emitted by update before final rejects", () => {
  const corrupted = { ...wrapped, ct: Uint8Array.from(wrapped.ct) };
  corrupted.ct[corrupted.ct.length - 1] ^= 0x01;
  const expectedIntermediate = Buffer.from(SECRET);
  const probe = createDecipheriv("aes-256-gcm", Buffer.alloc(32), Buffer.alloc(12), { authTagLength: 16 });
  const decipherPrototype = Object.getPrototypeOf(probe);
  probe.destroy();
  const originalUpdate = decipherPrototype.update;
  const originalFinal = decipherPrototype.final;
  let updateOutput;
  let updateOutputSnapshot;
  let finalFailure;
  let callbackCalled = false;
  let updatePatched = false;
  let finalPatched = false;
  try {
    decipherPrototype.update = function (...args) {
      updateOutput = originalUpdate.apply(this, args);
      updateOutputSnapshot = Buffer.from(updateOutput);
      return updateOutput;
    };
    updatePatched = true;
    decipherPrototype.final = function (...args) {
      try {
        return originalFinal.apply(this, args);
      } catch (error) {
        finalFailure = error;
        throw error;
      }
    };
    finalPatched = true;
    let authFailure;
    try {
      unwrapRecipientSecret(corrupted, PASS, () => {
        callbackCalled = true;
        return "unreachable";
      });
    } catch (error) {
      authFailure = error;
    }
    assert.ok(authFailure, "corrupt GCM authentication tag must be refused");
    assert.strictEqual(authFailure, finalFailure, "the refusal must be the exact decipher.final() authentication error");
    assert.equal(callbackCalled, false, "unauthenticated plaintext must never reach the callback");
    assert.equal(updateOutputSnapshot.equals(expectedIntermediate), true, "update() must have emitted the expected unauthenticated plaintext");
    assert.equal(updateOutput?.length, SECRET.length, "the observed update() buffer must contain the full test plaintext");
    assert.equal(updateOutput?.every((byte) => byte === 0), true, "every byte in the exact update() buffer must be zero after refusal");
  } finally {
    if (finalPatched) decipherPrototype.final = originalFinal;
    if (updatePatched) decipherPrototype.update = originalUpdate;
    expectedIntermediate.fill(0);
    updateOutputSnapshot?.fill(0);
  }
});

test("withWiped clears a partially staged secret when the copy operation fails", () => {
  const originalAlloc = Buffer.alloc;
  const originalFill = Uint8Array.prototype.fill;
  let staged;
  let caught;
  let callbackCalled = false;
  try {
    Buffer.alloc = function (size, ...args) {
      const value = originalAlloc(size, ...args);
      staged = value;
      return value;
    };
    try {
      withWiped({
        length: 4,
        0: 0xa1,
        get 1() { throw new Error("synthetic staged-copy failure"); },
        2: 0xc3,
        3: 0xd4,
      }, () => {
        callbackCalled = true;
        return "unreachable";
      });
    } catch (error) {
      caught = error;
    }
  } finally {
    Buffer.alloc = originalAlloc;
  }

  try {
    assert.match(String(caught?.message), /synthetic staged-copy failure/);
    assert.equal(callbackCalled, false, "callback must not run after incomplete staging");
    assert.deepEqual([...staged], [0, 0, 0, 0], "the partial secret copy must be wiped on the failed path");
  } finally {
    if (staged !== undefined) originalFill.call(staged, 0);
  }
});

test("GCM cleanup uses a wipe primitive that the callback cannot replace", () => {
  const probe = createDecipheriv("aes-256-gcm", Buffer.alloc(32), Buffer.alloc(12), { authTagLength: 16 });
  const decipherPrototype = Object.getPrototypeOf(probe);
  probe.destroy();
  const originalUpdate = decipherPrototype.update;
  const originalFill = Buffer.prototype.fill;
  let updateOutput;
  let callbackBuffer;
  let updatePatched = false;
  let fillPatched = false;
  try {
    decipherPrototype.update = function (...args) {
      updateOutput = originalUpdate.apply(this, args);
      return updateOutput;
    };
    updatePatched = true;
    assert.throws(() => unwrapRecipientSecret(wrapped, PASS, (secret) => {
      callbackBuffer = secret;
      Buffer.prototype.fill = function () { return this; };
      throw new Error("synthetic callback failure");
    }), /synthetic callback failure/);
    fillPatched = Buffer.prototype.fill !== originalFill;
    assert.equal(updateOutput?.length, SECRET.length);
    assert.equal(updateOutput?.every((byte) => byte === 0), true, "GCM update plaintext must be zero despite callback prototype tampering");
    assert.equal(callbackBuffer?.length, SECRET.length);
    assert.equal(callbackBuffer?.every((byte) => byte === 0), true, "the callback-visible plaintext buffer must be zero despite prototype tampering");
  } finally {
    if (Buffer.prototype.fill !== originalFill) Buffer.prototype.fill = originalFill;
    if (updatePatched) decipherPrototype.update = originalUpdate;
    // Use the original intrinsic only after restoring the mutable prototype method.
    if (updateOutput !== undefined) originalFill.call(updateOutput, 0);
    if (callbackBuffer !== undefined) originalFill.call(callbackBuffer, 0);
  }
});

test("production anchor wipes fetched bytes even when their fill method is a no-op", async () => {
  const providerBytes = Uint8Array.of(0x41, 0x42, 0x43, 0x44);
  providerBytes.fill = () => providerBytes;
  const originalAlloc = Buffer.alloc;
  const originalFill = Uint8Array.prototype.fill;
  let staged;
  let allocPatched = false;
  try {
    Buffer.alloc = function (size, ...args) {
      const value = originalAlloc(size, ...args);
      if (size === providerBytes.length) staged = value;
      return value;
    };
    allocPatched = true;
    const result = await anchorProdSecret(
      { kind: "vault", ref: "controlled-test" },
      async () => providerBytes,
      () => {
        assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider-owned bytes must be wiped before callback entry");
        return "controlled-result";
      },
    );
    assert.equal(result, "controlled-result");
    assert.deepEqual([...providerBytes], [0, 0, 0, 0], "fetched provider bytes must be wiped by the captured primitive");
    assert.deepEqual([...staged], [0, 0, 0, 0], "the anchor-owned copy must be wiped after callback completion");
  } finally {
    if (allocPatched) Buffer.alloc = originalAlloc;
    originalFill.call(providerBytes, 0);
    if (staged !== undefined) originalFill.call(staged, 0);
  }
});

test("production anchor wipes its staged copy when fetched-byte cleanup is adversarial", async () => {
  const providerBytes = Uint8Array.of(0x51, 0x52, 0x53, 0x54);
  providerBytes.fill = () => { throw new Error("provider cleanup trap"); };
  const originalAlloc = Buffer.alloc;
  const originalFill = Uint8Array.prototype.fill;
  let staged;
  let allocPatched = false;
  try {
    Buffer.alloc = function (size, ...args) {
      const value = originalAlloc(size, ...args);
      if (size === providerBytes.length) staged = value;
      return value;
    };
    allocPatched = true;
    const result = await anchorProdSecret(
        { kind: "vault", ref: "controlled-test" },
        async () => providerBytes,
        (secret) => {
          assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider-owned bytes must be wiped before callback entry");
          assert.deepEqual([...secret], [0x51, 0x52, 0x53, 0x54]);
          return "controlled-result";
        },
      );
    assert.equal(result, "controlled-result");
    assert.deepEqual([...providerBytes], [0, 0, 0, 0], "the fetched bytes must be wiped despite the throwing override");
    assert.deepEqual([...staged], [0, 0, 0, 0], "the staged copy must be wiped after callback completion");
  } finally {
    if (allocPatched) Buffer.alloc = originalAlloc;
    originalFill.call(providerBytes, 0);
    if (staged !== undefined) originalFill.call(staged, 0);
  }
});

test("production anchor wipes fetched bytes when staging allocation fails", async () => {
  const providerBytes = Uint8Array.of(0x61, 0x62, 0x63, 0x64);
  const originalAlloc = Buffer.alloc;
  let allocPatched = false;
  try {
    Buffer.alloc = function (size, ...args) {
      if (size === providerBytes.length) throw new Error("synthetic staging allocation failure");
      return originalAlloc(size, ...args);
    };
    allocPatched = true;
    await assert.rejects(
      anchorProdSecret(
        { kind: "vault", ref: "controlled-test" },
        async () => providerBytes,
        () => { assert.fail("callback must not run after staging allocation failure"); },
      ),
      /synthetic staging allocation failure/,
    );
  } finally {
    if (allocPatched) Buffer.alloc = originalAlloc;
  }
  assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider bytes must be wiped when staging allocation fails");
});

test("production anchor staging ignores a poisoned typed-array copy method", async () => {
  const providerBytes = Uint8Array.of(0x71, 0x72, 0x73, 0x74);
  const originalSet = Uint8Array.prototype.set;
  const originalFill = Uint8Array.prototype.fill;
  const stolen = [];
  let setCalled = false;
  let result;
  try {
    Uint8Array.prototype.set = function (source, ...args) {
      setCalled = true;
      stolen.push(...source);
      return originalSet.call(this, source, ...args);
    };
    result = await anchorProdSecret(
      { kind: "vault", ref: "controlled-test" },
      async () => providerBytes,
      (secret) => {
        assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider-owned bytes must be wiped before callback entry");
        assert.deepEqual([...secret], [0x71, 0x72, 0x73, 0x74]);
        return "controlled-result";
      },
    );
  } finally {
    Uint8Array.prototype.set = originalSet;
  }
  try {
    assert.equal(result, "controlled-result");
    assert.equal(setCalled, false, "anchor staging must use the captured typed-array intrinsic");
    assert.deepEqual(stolen, [], "a replaced prototype method must not observe provider secret bytes");
    assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider bytes must be wiped after callback completion");
  } finally {
    originalFill.call(providerBytes, 0);
    stolen.fill(0);
  }
});

test("production anchor wipes fetched and staged bytes when async callback rejects", async () => {
  const providerBytes = Uint8Array.of(0x21, 0x22, 0x23, 0x24);
  const originalAlloc = Buffer.alloc;
  const originalFill = Uint8Array.prototype.fill;
  let staged;
  let allocPatched = false;
  try {
    Buffer.alloc = function (size, ...args) {
      const value = originalAlloc(size, ...args);
      if (size === providerBytes.length) staged = value;
      return value;
    };
    allocPatched = true;
    await assert.rejects(
      anchorProdSecret(
        { kind: "vault", ref: "controlled-test" },
        async () => providerBytes,
        async (secret) => {
          assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider bytes must be wiped before async callback entry");
          assert.deepEqual([...secret], [0x21, 0x22, 0x23, 0x24]);
          throw new Error("synthetic async callback rejection");
        },
      ),
      /synthetic async callback rejection/,
    );
  } finally {
    if (allocPatched) Buffer.alloc = originalAlloc;
  }
  assert.deepEqual([...providerBytes], [0, 0, 0, 0], "provider bytes remain wiped after rejection");
  assert.deepEqual([...staged], [0, 0, 0, 0], "staged bytes must be wiped after async callback rejection");
  originalFill.call(providerBytes, 0);
  if (staged !== undefined) originalFill.call(staged, 0);
});
