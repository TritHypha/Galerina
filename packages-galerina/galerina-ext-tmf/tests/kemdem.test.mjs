// .spore KEM-DEM confidentiality (slice 3). DETERMINISTIC parts verified byte-for-byte against the frozen
// golden vectors (Galerina-R-AND-D/tmf/spec/_vectors/gen_tmf_encryption.py + gen_cmt_ctx.py); the REAL
// hybrid-KEM + AES-256-GCM seal/open verified by round-trip + every fail-closed tamper case (spec §7.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext, deriveKaead, keyCommit, committedAad, streamNonce12, streamNonce24, ctxCommitTag,
  commitModeOf, keygen, seal, open, streamSeal, streamOpen,
  KEM_PROFILE, AEAD_SUITE, DEM_MODE, COMMIT_MODE, TmfCryptoError,
} from "../dist/index.js";

const hex = (u) => Buffer.from(u).toString("hex");
const range = (a, b) => Uint8Array.from({ length: b - a }, (_, i) => a + i);
const le32 = (x) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, x >>> 0, true); return b; };
const cat = (...ps) => { const t = ps.reduce((n, p) => n + p.length, 0); const o = new Uint8Array(t); let k = 0; for (const p of ps) { o.set(p, k); k += p.length; } return o; };
const coordGolden = cat(le32(3), le32(5), le32(7), le32(0)); // i32le 3,5,7,0
const isCryptoCode = (code) => (e) => e instanceof TmfCryptoError && e.code === code;

// flags 0x01 = encrypted, commit_mode 00 ; flags 0x03 = encrypted + commit_mode 01 (CTX)
const CTX_GOLDEN = buildContext({ sectionId: 7, coord: coordGolden, modality: 0, kemProfile: 0x02, aeadSuite: 0x01, demMode: 0x01, confFlags: 0x01, epoch: 1 });

// ── deterministic golden vectors ────────────────────────────────────────────
test("aead_context (36 B) reproduces the golden", () => {
  assert.equal(hex(CTX_GOLDEN), "070000000000000003000000050000000700000000000000000002010101010000000000");
});

test("DEM key schedule K_aead + key_commit reproduce the golden (SHAKE256)", () => {
  const ss = range(0, 32); // 000102…1f
  const kaead = deriveKaead(ss, CTX_GOLDEN);
  assert.equal(hex(kaead), "9b4fdce2fa64e0bd431f7d5d075cf18c423ef756101080d5fc15618d63dac4c5");
  assert.equal(hex(keyCommit(kaead)), "bc8eee3b4561d7de4396b25921929816e5c536468568c4e481c51018ecc4a488");
  assert.equal(committedAad(CTX_GOLDEN, kaead).length, 68);
});

test("K_aead is bound to shared_secret and to epoch (changing either changes the key)", () => {
  const ss = range(0, 32);
  const base = hex(deriveKaead(ss, CTX_GOLDEN));
  assert.notEqual(hex(deriveKaead(new Uint8Array(32), CTX_GOLDEN)), base); // secret-bound
  const otherEpoch = buildContext({ sectionId: 7, coord: coordGolden, modality: 0, kemProfile: 0x02, aeadSuite: 0x01, demMode: 0x01, confFlags: 0x01, epoch: 2 });
  assert.notEqual(hex(deriveKaead(ss, otherEpoch)), base); // epoch-bound
});

test("12-byte STREAM nonces reproduce the golden (prefix8 ‖ BE-u32((idx<<1)|last))", () => {
  const p = Uint8Array.from([0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8]);
  assert.equal(hex(streamNonce12(p, 0, false)), "a1a2a3a4a5a6a7a800000000");
  assert.equal(hex(streamNonce12(p, 1, false)), "a1a2a3a4a5a6a7a800000002");
  assert.equal(hex(streamNonce12(p, 2, true)), "a1a2a3a4a5a6a7a800000005");
});

test("24-byte STREAM nonces reproduce the golden (prefix16 ‖ BE-u64); reject index ≥ 2^63", () => {
  const p = range(0xa0, 0xb0); // a0a1…af
  assert.equal(hex(streamNonce24(p, 2, true)), "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf0000000000000005");
  assert.equal(hex(streamNonce24(p, 0, false)), "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf0000000000000000");
  assert.throws(() => streamNonce24(p, 2n ** 63n, false), isCryptoCode("MalformedCrypto"));
});

test("CTX commit_tag reproduces the golden (CMT-4: bound to K/nonce/AAD/T)", () => {
  const K = range(0, 32), nonce = range(0x40, 0x4c), aad = range(0, 68), T = range(0x90, 0xa0);
  assert.equal(hex(ctxCommitTag(K, nonce, aad, T)), "ca22f4f5a0e3679e6b86540d6b72542e09997b0109e9401dbf0ca1b7dbd42979");
  // each input is bound (changing any changes the tag)
  assert.notEqual(hex(ctxCommitTag(new Uint8Array(32), nonce, aad, T)), hex(ctxCommitTag(K, nonce, aad, T)));
  assert.notEqual(hex(ctxCommitTag(K, nonce, aad, new Uint8Array(16))), hex(ctxCommitTag(K, nonce, aad, T)));
});

test("commitModeOf reads conf_flags bits 1-2", () => {
  assert.equal(commitModeOf(CTX_GOLDEN), COMMIT_MODE.NONE);
  const ctxCtx = buildContext({ sectionId: 7, coord: coordGolden, modality: 0, kemProfile: 0x02, aeadSuite: 0x01, demMode: 0x01, confFlags: 0x03, epoch: 1 });
  assert.equal(commitModeOf(ctxCtx), COMMIT_MODE.CTX);
});

// ── real hybrid-KEM + AES-256-GCM (round-trip + fail-closed) ─────────────────
const ctx = (confFlags) => buildContext({ sectionId: 7, coord: coordGolden, modality: 0, kemProfile: 0x02, aeadSuite: 0x01, demMode: 0x01, confFlags, epoch: 1 });
const PLAINTEXT = new TextEncoder().encode("hello .spore confidentiality");

test("hybrid KEM ct_kem is the spec size (1120 B) and single-shot round-trips (commit_mode 00)", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a = ctx(0x01);
  const s = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a);
  assert.equal(s.ctKem.length, 1120);
  assert.equal(s.nonce.length, 12);
  const out = open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.nonce, s.body, a);
  assert.equal(Buffer.from(out).toString(), "hello .spore confidentiality");
});

test("tampered ciphertext → CryptoError (fail-closed)", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a = ctx(0x01);
  const s = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a);
  const t = s.body.slice(); t[0] ^= 0x01;
  assert.throws(() => open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.nonce, t, a), isCryptoCode("CryptoError"));
});

test("wrong AAD context (different epoch) → CryptoError (no lift/replant)", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const s = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, ctx(0x01));
  const wrong = buildContext({ sectionId: 7, coord: coordGolden, modality: 0, kemProfile: 0x02, aeadSuite: 0x01, demMode: 0x01, confFlags: 0x01, epoch: 999 });
  assert.throws(() => open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.nonce, s.body, wrong), isCryptoCode("CryptoError"));
});

test("wrong recipient key → CryptoError", () => {
  const { publicKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const other = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a = ctx(0x01);
  const s = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a);
  assert.throws(() => open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, other.secretKey, s.ctKem, s.nonce, s.body, a), isCryptoCode("CryptoError"));
});

test("CTX (commit_mode 01) round-trips and adds 32 B; commit tamper → CryptoError", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a00 = ctx(0x01), a01 = ctx(0x03);
  const s00 = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a00);
  const s01 = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a01);
  assert.equal(s01.body.length - s00.body.length, 32); // CTX adds a 32-B commit_tag
  const out = open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s01.ctKem, s01.nonce, s01.body, a01);
  assert.equal(Buffer.from(out).toString(), "hello .spore confidentiality");
  const t = s01.body.slice(); t[t.length - 1] ^= 0x01; // tamper the commit_tag
  assert.throws(() => open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s01.ctKem, s01.nonce, t, a01), isCryptoCode("CryptoError"));
});

test("no silent CTX downgrade: a CTX body opened as commit_mode 00 fails", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a01 = ctx(0x03), a00 = ctx(0x01);
  const s01 = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, PLAINTEXT, a01);
  // opening with the 00-mode context (different conf_flags → different AAD/key) must fail
  assert.throws(() => open(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s01.ctKem, s01.nonce, s01.body, a00), isCryptoCode("CryptoError"));
});

test("STREAM round-trips; truncation / reorder / tamper all fail-closed", () => {
  const { publicKey, secretKey } = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
  const a = ctx(0x01);
  const segs = [new TextEncoder().encode("AAAA"), new TextEncoder().encode("BBBB"), new TextEncoder().encode("CCCC")];
  const s = streamSeal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, publicKey, segs, a);
  assert.equal(s.frames.length, 3);
  const out = streamOpen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.prefix8, s.frames, a);
  assert.equal(Buffer.from(out).toString(), "AAAABBBBCCCC");
  // truncation: drop the final frame → the new last frame's nonce no longer matches (last_flag) → fail
  assert.throws(() => streamOpen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.prefix8, s.frames.slice(0, 2), a), isCryptoCode("CryptoError"));
  // reorder: swap frames 0 and 1 → nonce/index mismatch → fail
  const reordered = [s.frames[1], s.frames[0], s.frames[2]];
  assert.throws(() => streamOpen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.prefix8, reordered, a), isCryptoCode("CryptoError"));
  // tamper: flip a byte in a frame → tag fail
  const tampered = s.frames.map((f) => f.slice()); tampered[1][0] ^= 0x01;
  assert.throws(() => streamOpen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, secretKey, s.ctKem, s.prefix8, tampered, a), isCryptoCode("CryptoError"));
});
