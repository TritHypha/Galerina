// anchor.ts — key custody / secret-zero anchoring (design doc Part 3).
//
// open() takes recipientSec as a CALLER-supplied Uint8Array (kemdem.ts:190) — the engine has
// ZERO custody logic. KEM-DEM RELOCATES the bootstrap secret to this recipient KEM secret key.
//
// HONEST POSTURE (also stated in the README + done-report): env.tmf moves secret-zero from
// N app secrets -> 1 anchored key and reduces blast radius; it does NOT eliminate the external
// root of trust. If the recipient secret key co-locates on the same disk as the ciphertext the
// at-rest win EVAPORATES (the same LFI/traversal reads both). The anchor MUST be external.
//
// Two anchor kinds:
//   - local-dev: operator passphrase -> Argon2id KDF -> unwrap the recipient secret key held
//     ONLY in an arena buffer. Same posture as today's plaintext .env.galerina-signing, but
//     encrypted-at-rest.
//   - prod: anchor through the EXISTING core-config SecretConfigSource kinds
//     ({kind:"kms"} / {kind:"vault"}) — we do NOT invent a new custody mechanism. A fetcher
//     callback (injected by the host) resolves the source to raw key bytes.
import { argon2id } from "@noble/hashes/argon2.js";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { withWiped } from "./arena.js";

/** Mirror of core-config SecretConfigSource (index.ts:1142-1146) — we consume, not redefine. */
export type SecretConfigSource =
  | { readonly kind: "env"; readonly variableName: string }
  | { readonly kind: "vault"; readonly storeId: string; readonly keyPath: string }
  | { readonly kind: "kms"; readonly keyId: string; readonly provider?: string }
  | { readonly kind: "runtime" };

/** Argon2id parameters (interactive-ish; the hub may raise for production wrap files). */
export const ARGON2ID_PARAMS = { t: 3, m: 64 * 1024, p: 1 } as const; // 64 MiB, 3 passes

/**
 * Derive a 32-byte wrap key from a passphrase via Argon2id. The passphrase Buffer is the
 * caller's; we never persist it. Returns the derived key (caller wipes).
 */
export function deriveWrapKey(passphrase: Uint8Array, salt: Uint8Array): Uint8Array {
  return argon2id(passphrase, salt, { t: ARGON2ID_PARAMS.t, m: ARGON2ID_PARAMS.m, p: ARGON2ID_PARAMS.p, dkLen: 32 });
}

/**
 * A wrapped recipient secret key: salt ‖ iv ‖ ciphertext+tag. Stored on disk (e.g. a
 * key.tmf-wrap file). The plaintext recipient secret NEVER touches disk; only this AES-256-GCM
 * wrap does. Anchoring this wrap file ELSEWHERE than the env.tmf disk is the operator's job.
 */
export interface WrappedKey {
  readonly salt: Uint8Array;   // 16 B
  readonly iv: Uint8Array;     // 12 B
  readonly ct: Uint8Array;     // ciphertext ‖ 16B GCM tag
}

/** Wrap a recipient secret key under a passphrase (local-dev anchor). */
export function wrapRecipientSecret(recipientSec: Uint8Array, passphrase: Uint8Array): WrappedKey {
  const salt = new Uint8Array(randomBytes(16));
  const iv = new Uint8Array(randomBytes(12));
  const wrapKey = deriveWrapKey(passphrase, salt);
  try {
    const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(recipientSec)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { salt, iv, ct: new Uint8Array(Buffer.concat([enc, tag])) };
  } finally {
    wrapKey.fill(0);
  }
}

/**
 * Unwrap a recipient secret key into an arena buffer and hand it to `fn` (guaranteed wiped
 * after). Fail-closed: a bad passphrase throws (GCM tag failure) — never returns a stale key.
 */
export function unwrapRecipientSecret<T>(wrapped: WrappedKey, passphrase: Uint8Array, fn: (sec: Buffer) => T): T {
  const wrapKey = deriveWrapKey(passphrase, wrapped.salt);
  try {
    const ct = wrapped.ct;
    const tag = ct.subarray(ct.length - 16);
    const body = ct.subarray(0, ct.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", wrapKey, wrapped.iv);
    decipher.setAuthTag(Buffer.from(tag));
    // createDecipheriv's update()/final() each allocate an internal output Buffer holding the
    // most-sensitive material (the anchor secret key). We capture both, wipe each explicitly,
    // and hand the SINGLE assembled Buffer straight to withWiped — no extra new Uint8Array()
    // copy (leak-hunter #4 minimises un-tracked plaintext copies).
    const upd = decipher.update(Buffer.from(body)) as Buffer;
    const fin = decipher.final() as Buffer; // throws on bad key BEFORE any plaintext is served
    const plain = Buffer.concat([upd, fin]);
    try {
      return withWiped(plain, (b) => fn(b)); // withWiped copies into an mlock'd buffer + wipes it
    } finally {
      upd.fill(0);   // wipe the update() intermediate
      fin.fill(0);   // wipe the final() intermediate
      plain.fill(0); // wipe the concatenated copy
    }
  } finally {
    wrapKey.fill(0);
  }
}

/**
 * Production anchor: resolve a SecretConfigSource (kms/vault) to the recipient secret key bytes
 * via a HOST-INJECTED fetcher, then hand them to `fn` (guaranteed wiped after). We do NOT
 * implement KMS/Vault transport here — that is the host's existing governed-fetch (same path as
 * the vault provider). `env`/`runtime` kinds are dev-only and rejected for the prod anchor.
 *
 * The fetcher is async because real KMS/Vault unseal is a network call; the result is wiped
 * immediately after `fn` resolves.
 */
export async function anchorProdSecret<T>(
  source: SecretConfigSource,
  fetcher: (src: SecretConfigSource) => Promise<Uint8Array>,
  fn: (sec: Buffer) => T | Promise<T>,
): Promise<T> {
  if (source.kind !== "kms" && source.kind !== "vault") {
    throw new Error(`anchorProdSecret: prod anchor must be kms|vault, got "${source.kind}" (fail-closed)`);
  }
  const raw = await fetcher(source);
  const buf = Buffer.alloc(raw.length);
  buf.set(raw);
  raw.fill?.(0);
  try {
    return await fn(buf);
  } finally {
    buf.fill(0);
  }
}
