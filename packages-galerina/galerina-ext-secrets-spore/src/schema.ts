// schema.ts — env.spore v0 schema (Part 1 of the R&D design doc §3).
//
// env.spore = the shipped v0 .spore container (writeTmf/readTmf as-is), flags.signed=0
// (UNSIGNED-but-ENCRYPTED — the ML-DSA signed root is GATED on ext-spore slice 4 / #7;
// we NEVER fake a signature). Confidentiality is KEM-DEM single-shot under hybrid
// X25519+ML-KEM-768 (KEM_PROFILE 0x02) with commit_mode=CTX (CMT-4, key-committing).
//
// Layout (one secret = one TmfSection):
//   - modality = 9 (Structured)
//   - coord    = HKDF/SHAKE(name) truncated to 16 B  -> the cleartext NAME is NOT in the
//                section table (only an opaque, non-semantic 128-bit id).
//   - payload  = serialise( seal(0x02, recipientPub, valueBytes, ctx) )  commit_mode=CTX
//   - aeadContext binds sectionId+coord+modality+codec+epoch (anti lift/replant/relabel).
//
// One reserved MANIFEST section (fixed-sentinel coord) carries the sealed directory
// { name -> coordHex } + per-secret metadata. Names live ONLY inside ciphertext.
import { createHash } from "node:crypto";
import { buildContext, KEM_PROFILE, AEAD_SUITE, DEM_MODE, COMMIT_MODE } from "./tmf.js";
import type { TmfSection, SealResult } from "./tmf.js";

/** Structured modality (spec/tmf-modalities-v0.md:47). */
export const MODALITY_STRUCTURED = 9;
/** kind discriminators: 0 = secret value section, 1 = the reserved manifest section. */
export const SECTION_KIND_SECRET = 0;
export const SECTION_KIND_MANIFEST = 1;
/** codec 0x0601 = JSON (Structured leaf). */
export const CODEC_JSON = 0x0601;
/** env.spore schema version (independent of container version). */
export const ENV_TMF_SCHEMA_VERSION = 0;

/** Domain-separated SHAKE for the coord derivation. Keeps the cleartext name off the table. */
const COORD_DOMAIN = new TextEncoder().encode("env-tmf-coord-v0");

/**
 * coord(name) = SHAKE256(domain ‖ utf8(name))[:16]. Opaque, non-semantic, collision-resistant
 * to 128 bits for the table id. The mapping name->coord is recorded ONLY inside the sealed
 * manifest, never in the cleartext section table.
 */
export function coordForName(name: string): Uint8Array {
  const h = createHash("shake256", { outputLength: 16 });
  h.update(COORD_DOMAIN);
  h.update(new TextEncoder().encode(name));
  return new Uint8Array(h.digest());
}

/** Fixed-sentinel coord for the reserved manifest section (16 B). */
export const MANIFEST_COORD: Uint8Array = (() => {
  const h = createHash("shake256", { outputLength: 16 });
  h.update(new TextEncoder().encode("env-tmf-manifest-sentinel-v0"));
  return new Uint8Array(h.digest());
})();

/** Per-secret metadata stored in the (sealed) manifest. Never contains the value. */
export interface SecretMeta {
  readonly coordHex: string;       // hex of coordForName(name) — links manifest -> section
  readonly category?: string;      // e.g. "api-key" | "password" (SecretCategory tag)
  readonly created: number;        // epoch seconds
  readonly rotated: number;        // epoch seconds of last value write
  readonly kemProfile: number;     // 0x02
  readonly environment?: string;   // intended env e.g. "production"
}

/** The decrypted manifest: name -> metadata. Lives ONLY inside the sealed manifest section. */
export interface Manifest {
  readonly schema: number;                 // ENV_TMF_SCHEMA_VERSION
  readonly recipientPubHex: string;        // current recipient KEM public key (NOT secret)
  readonly entries: Record<string, SecretMeta>;
}

export function emptyManifest(recipientPub: Uint8Array): Manifest {
  return { schema: ENV_TMF_SCHEMA_VERSION, recipientPubHex: toHex(recipientPub), entries: {} };
}

// ── serialisation of a SealResult into a single opaque section payload ──────────
// payload = u8 SEAL_MAGIC ‖ u8 schemaVer ‖ u8 kemProfile ‖ u8 demMode ‖ u8 commitMode
//           ‖ u16le ctKemLen ‖ ctKem ‖ u8 nonceLen ‖ nonce ‖ u32le bodyLen ‖ body
// This is a packaging convention OWNED by this package — it carries the engine's
// SealResult fields verbatim; it adds NO new crypto and NO new container bytes (it lives
// INSIDE a normal TmfSection.payload that readTmf already integrity-checks via the TMX leaf).
const SEAL_MAGIC = 0xe7; // "env-tmf seal" marker

export function packSeal(s: SealResult): Uint8Array {
  const head = Uint8Array.from([
    SEAL_MAGIC, ENV_TMF_SCHEMA_VERSION, s.kemProfile & 0xff, DEM_MODE.SINGLE_SHOT & 0xff, COMMIT_MODE.CTX & 0xff,
  ]);
  return concat([
    head,
    u16le(s.ctKem.length), s.ctKem,
    Uint8Array.from([s.nonce.length & 0xff]), s.nonce,
    u32le(s.body.length), s.body,
  ]);
}

export interface UnpackedSeal {
  readonly kemProfile: number;
  readonly ctKem: Uint8Array;
  readonly nonce: Uint8Array;
  readonly body: Uint8Array;
}

export function unpackSeal(payload: Uint8Array): UnpackedSeal {
  if (payload.length < 5 || payload[0] !== SEAL_MAGIC) throw new Error("env.spore: bad seal payload magic");
  let o = 1;
  o += 1; // schemaVer
  const kemProfile = payload[o++]!;
  o += 1; // demMode
  o += 1; // commitMode
  const ctKemLen = rdU16(payload, o); o += 2;
  const ctKem = payload.subarray(o, o + ctKemLen); o += ctKemLen;
  const nonceLen = payload[o++]!;
  const nonce = payload.subarray(o, o + nonceLen); o += nonceLen;
  const bodyLen = rdU32(payload, o); o += 4;
  const body = payload.subarray(o, o + bodyLen); o += bodyLen;
  if (o !== payload.length) throw new Error("env.spore: trailing bytes in seal payload");
  return { kemProfile, ctKem, nonce, body };
}

/** Build the 36-byte AEAD context for a section (binds id/coord/modality/flags/epoch). */
export function contextFor(sectionId: number, coord: Uint8Array, epoch: number): Uint8Array {
  return buildContext({
    sectionId,
    coord,
    modality: MODALITY_STRUCTURED,
    kemProfile: KEM_PROFILE.HYBRID_X25519_ML_KEM_768,
    aeadSuite: AEAD_SUITE.AES_256_GCM,
    demMode: DEM_MODE.SINGLE_SHOT,
    // conf_flags: bit0 encrypted(=1), bits1-2 commit_mode (CTX=01) -> (CTX<<1)|1
    confFlags: ((COMMIT_MODE.CTX & 0b11) << 1) | 0b1,
    epoch,
  });
}

/** Assemble a secret TmfSection from a packed seal payload. */
export function secretSection(coord: Uint8Array, packed: Uint8Array): TmfSection {
  return { kind: SECTION_KIND_SECRET, modality: MODALITY_STRUCTURED, coord, payload: packed };
}

/** Assemble the reserved manifest TmfSection from a packed seal payload. */
export function manifestSection(packed: Uint8Array): TmfSection {
  return { kind: SECTION_KIND_MANIFEST, modality: MODALITY_STRUCTURED, coord: MANIFEST_COORD, payload: packed };
}

// ── small byte helpers ──────────────────────────────────────────────────────
function u16le(v: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); return b; }
function u32le(v: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function rdU16(b: Uint8Array, o: number): number { return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(o, true); }
function rdU32(b: Uint8Array, o: number): number { return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true); }
function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0; for (const p of parts) n += p.length;
  const o = new Uint8Array(n); let k = 0;
  for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}
export function toHex(b: Uint8Array): string { return Buffer.from(b).toString("hex"); }
export function fromHex(s: string): Uint8Array { return new Uint8Array(Buffer.from(s, "hex")); }
