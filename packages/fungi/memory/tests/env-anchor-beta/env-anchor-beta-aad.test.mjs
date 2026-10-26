// ENV-ANCHOR-BETA red tests, AEAD AAD half (EA-R10, mutants M8/M8b at the host). RED FIRST (gcw-k3u110, 2026-10-26):
// red on 065bebc0c because the host shim does not yet export sealBound / openBound / boundAad.
// EA-R10: a wrap sealed for one purpose+root must refuse 183 (aad_mismatch) when opened for any other purpose or
// root, and when tag, nonce or ciphertext are touched. AAD = "galerina.env-anchor-beta.aad.v1" 0x00
// u32be(len purpose) purpose u32be(len root) root, so ("ab","c") and ("a","bc") can never collide.
// Zero-trust choices (rejected options in ENVANCHOR-redtest-plan-469e6f49-20261025.md, k3u110 addendum):
// length-prefixed AAD (rejected: plain purpose||root concat, ambiguous); fresh random 12-byte nonce per seal
// (rejected: caller-supplied nonce); key, nonce and tag sizes pinned (32/12/16) else 111; empty or
// out-of-alphabet purpose/root refuse 111 (rejected: seal with an empty binding). The mismatch verdict comes
// from the native flow envAadAdmit. Synthetic random keys only; no .env is read. NON_AUTHORIZING.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, createDecipheriv } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = join(HERE, "..", "..", "host", "env-anchor-beta-host.mjs");

async function host() {
  assert.equal(existsSync(HOST), true, "host shim missing: " + HOST);
  const mod = await import(pathToFileURL(HOST).href);
  for (const f of ["sealBound", "openBound", "boundAad"]) assert.equal(typeof mod[f], "function", f + " exported");
  return mod;
}

function refusedWith(mod, fn, code, secrets) {
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof mod.EnvAnchorRefused, "expected EnvAnchorRefused, got " + String(err));
  assert.equal(err.code, code);
  const own = {};
  for (const k of Object.getOwnPropertyNames(err)) own[k] = err[k];
  const r = [String(err), err.message || "", err.stack || "", JSON.stringify(own)].join("\n");
  for (const s of secrets || []) assert.equal(r.includes(s), false, "secret material in error rendering");
}

const P = "session.wrap";
const R = "root:synthetic-01";

test("EA-R10a round trip with the same purpose and root", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const pt = new Uint8Array(randomBytes(48));
  const s = m.sealBound(k, P, R, pt);
  assert.ok(Object.isFrozen(s));
  assert.equal(s.iv.length, 12);
  assert.equal(s.tag.length, 16);
  assert.deepEqual(Buffer.from(m.openBound(k, P, R, s)), Buffer.from(pt));
});

test("EA-R10b other purpose or other root refuses 183 and never returns plaintext", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const pt = randomBytes(48);
  const hex = pt.toString("hex");
  const s = m.sealBound(k, P, R, new Uint8Array(pt));
  refusedWith(m, () => m.openBound(k, "session.other", R, s), 183, [hex, Buffer.from(k).toString("hex")]);
  refusedWith(m, () => m.openBound(k, P, "root:synthetic-02", s), 183, [hex]);
});

test("EA-R10c length-prefixed AAD: (ab,c) never opens as (a,bc)", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const s = m.sealBound(k, "ab", "c", new Uint8Array(randomBytes(16)));
  refusedWith(m, () => m.openBound(k, "a", "bc", s), 183);
  assert.notDeepEqual(Buffer.from(m.boundAad("ab", "c")), Buffer.from(m.boundAad("a", "bc")));
});

test("EA-R10d the AAD is really bound (independent decrypt needs it) and has the pinned layout", async () => {
  const m = await host();
  const k = randomBytes(32);
  const pt = randomBytes(24);
  const s = m.sealBound(new Uint8Array(k), P, R, new Uint8Array(pt));
  const aad = Buffer.from(m.boundAad(P, R));
  const tag = Buffer.from("galerina.env-anchor-beta.aad.v1", "utf8");
  const want = Buffer.concat([tag, Buffer.from([0]), Buffer.from([0, 0, 0, P.length]), Buffer.from(P), Buffer.from([0, 0, 0, R.length]), Buffer.from(R)]);
  assert.deepEqual(aad, want);
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(s.iv), { authTagLength: 16 });
  d.setAAD(aad);
  d.setAuthTag(Buffer.from(s.tag));
  assert.deepEqual(Buffer.concat([d.update(Buffer.from(s.ct)), d.final()]), pt);
  const d2 = createDecipheriv("aes-256-gcm", k, Buffer.from(s.iv), { authTagLength: 16 });
  d2.setAuthTag(Buffer.from(s.tag));
  d2.update(Buffer.from(s.ct));
  assert.throws(() => d2.final(), "no-AAD decrypt must fail (M8 drop AAD)");
});

test("EA-R10e tampered tag, nonce or ciphertext refuses 183", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const s = m.sealBound(k, P, R, new Uint8Array(randomBytes(32)));
  const flip = (a, i) => { const c = Uint8Array.from(a); c[i] = c[i] ^ 1; return c; };
  refusedWith(m, () => m.openBound(k, P, R, { iv: s.iv, ct: s.ct, tag: flip(s.tag, 0) }), 183);
  refusedWith(m, () => m.openBound(k, P, R, { iv: flip(s.iv, 3), ct: s.ct, tag: s.tag }), 183);
  refusedWith(m, () => m.openBound(k, P, R, { iv: s.iv, ct: flip(s.ct, 5), tag: s.tag }), 183);
});

test("EA-R10f sizes pinned and bindings typed: wrong key/nonce/tag size or empty/odd purpose or root refuses 111", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const pt = new Uint8Array(randomBytes(8));
  const s = m.sealBound(k, P, R, pt);
  refusedWith(m, () => m.sealBound(new Uint8Array(16), P, R, pt), 111);
  refusedWith(m, () => m.sealBound(k, "", R, pt), 111);
  refusedWith(m, () => m.sealBound(k, P, "", pt), 111);
  refusedWith(m, () => m.sealBound(k, "Bad Purpose", R, pt), 111);
  refusedWith(m, () => m.sealBound(k, P, R, "not-bytes"), 111);
  refusedWith(m, () => m.openBound(k, P, R, { iv: s.iv, ct: s.ct, tag: s.tag.slice(0, 12) }), 111);
  refusedWith(m, () => m.openBound(k, P, R, { iv: s.iv.slice(0, 8), ct: s.ct, tag: s.tag }), 111);
  refusedWith(m, () => m.openBound(k, P, R, { iv: s.iv, ct: s.ct, tag: s.tag, extra: 1 }), 111);
});

test("EA-R10g every seal uses a fresh nonce", async () => {
  const m = await host();
  const k = new Uint8Array(randomBytes(32));
  const pt = new Uint8Array(16);
  const a = m.sealBound(k, P, R, pt);
  const b = m.sealBound(k, P, R, pt);
  assert.notDeepEqual(Buffer.from(a.iv), Buffer.from(b.iv));
  assert.notDeepEqual(Buffer.from(a.ct), Buffer.from(b.ct));
});