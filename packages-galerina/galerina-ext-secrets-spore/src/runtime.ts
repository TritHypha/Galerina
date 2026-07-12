// runtime.ts — production runtime path (design doc Part 4).
//
// At boot: fetch the recipient KEM secret key from the external anchor (anchor.ts) ->
// encrypted-container compose-reader (store.composeRead: verify-before-decrypt + K3 ALLOW(+1)
// + NoCryptoLib reject) -> decrypt every value into the SealArena (zero-wiped store) ->
// serve values fail-closed. A decrypt fault / bad key => FAIL CLOSED (throw); the loader never
// populates the arena, so getActive-style reads fail closed and a stale secret is never served.
//
// This is local-only by construction: there is NO network read-back endpoint here. The only
// network surface is the custody-anchor unseal call inside anchor.ts (KMS/Vault), NEVER secret
// read-back (design doc §4). `loadAll` returns a SealArena the host queries in-process; values
// never leave the process via this module.
import { composeRead, assertKemProfile, K3 } from "./store.js";
import type { K3Token } from "./store.js";
import { SealArena } from "./arena.js";
import { unpackSeal, contextFor } from "./schema.js";
import { open, SporeCryptoError } from "./spore.js";

const SECTION_EPOCH = 0;

/**
 * Boot loader: decrypt EVERY secret in `buf` into a fresh SealArena using `recipientSec`.
 * Fail-closed: any decrypt fault throws and the partially-filled arena is disposed (wiped) so
 * NOTHING is served. On success the arena holds every value, keyed by name.
 *
 * The caller owns the returned arena and MUST call dispose() on shutdown.
 */
export function loadAll(buf: Uint8Array, recipientSec: Uint8Array, token: K3Token = K3.ALLOW): SealArena {
  const { manifest, sectionByCoord } = composeRead(buf, recipientSec, token);
  const arena = new SealArena();
  try {
    for (const [name, meta] of Object.entries(manifest.entries)) {
      const sec = sectionByCoord.get(meta.coordHex);
      if (sec === undefined) {
        throw new SporeCryptoError("MalformedCrypto", `manifest references missing section for ${name} (fail-closed)`);
      }
      const u = unpackSeal(sec.payload);
      const ctx = contextFor(sec.sectionId, sec.coord, SECTION_EPOCH);
      // crypto-failclosed #1: validate the attacker-mutable packed profile byte against the v0
      // schema profile + the profile bound at ctx[26] BEFORE feeding it to open() (mirror store).
      assertKemProfile(u.kemProfile, ctx);
      // decrypt into a transient, then copy into the arena (arena copies + wipes its source view)
      const plain = open(u.kemProfile, recipientSec, u.ctKem, u.nonce, u.body, ctx);
      try {
        arena.put(name, plain);
      } finally {
        plain.fill(0);
      }
    }
    return arena;
  } catch (e) {
    // FAIL CLOSED — wipe anything decrypted so far; serve nothing.
    arena.dispose();
    throw e;
  }
}
