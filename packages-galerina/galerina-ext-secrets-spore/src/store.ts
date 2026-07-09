// store.ts — the env.spore store: open/seal sections, the encrypted-container compose-reader,
// and the in-arena edit -> re-seal flow (design doc Parts 1 + 4).
//
// This is the THIN orchestration over the engine. It owns NO crypto bytes:
//   write = writeTmf(sections)            (engine)
//   read  = readTmf(buf) + per-section open()   (engine), wrapped in the §7 fail-closed order
//   seal/open of each section value = seal()/open()  (engine, KEM 0x02, commit_mode CTX)
//
// HARD posture:
//   - verify-before-decrypt: readTmf recomputes the TMX root over the CIPHERTEXT leaves and
//     fail-closes on any tamper/bounds BEFORE we call open() on any section (§7 ordering).
//   - K3 ALLOW(+1) gate: the decrypt is GATED behind an explicit positive authorization
//     token. Absent/!==ALLOW => reject. (Ternary-K3: -1 deny / 0 unknown / +1 allow; ONLY +1
//     proceeds — unknown collapses to deny, never to allow.)
//   - NoCryptoLib reject: if the engine's crypto primitives are unavailable, FAIL CLOSED with
//     a NoCryptoLib error — never serve, never downgrade.
//   - decrypt fault / bad key => FAIL CLOSED (typed throw); the caller never serves stale.
//
// EPOCH BINDING (v0): the 36-byte AEAD context binds section_id + coord (+ modality + flags),
// which already pins each section's identity inside the file. The container table does NOT
// carry the seal epoch, so to keep the v0 schema free of a new container field we bind epoch=0
// DETERMINISTICALLY at both seal and open. The human-facing created/rotated timestamps live in
// the manifest (which is itself sealed). See README "epoch binding".
import { readFileSync } from "node:fs";
import {
  writeTmf, readTmf, seal, open, TmfCryptoError, KEM_PROFILE, COMMIT_MODE,
} from "./tmf.js";
import type { TmfSection } from "./tmf.js";
import {
  MANIFEST_COORD, SECTION_KIND_MANIFEST, coordForName, contextFor,
  packSeal, unpackSeal, secretSection, manifestSection, emptyManifest, toHex, fromHex,
  ENV_TMF_SCHEMA_VERSION,
} from "./schema.js";
import type { Manifest, SecretMeta } from "./schema.js";
import { withWiped } from "./arena.js";

/** Deterministic epoch bound into every section's AEAD context (see header note). */
const SECTION_EPOCH = 0;

/** Byte offset of kem_profile inside the 36-byte AEAD context (kemdem.ts buildContext: ctx[26]). */
const CTX_KEMPROFILE_OFFSET = 26;

/** Ternary-K3 authorization: ONLY +1/ALLOW proceeds; 0/unknown and -1/deny fail closed. */
export const K3 = { DENY: -1, UNKNOWN: 0, ALLOW: 1 } as const;
export type K3Token = (typeof K3)[keyof typeof K3];

/** Self-check that the engine's KEM/AEAD primitives loaded. NoCryptoLib reject if not. */
function assertCryptoLib(): void {
  if (typeof seal !== "function" || typeof open !== "function") {
    throw new TmfCryptoError("NoCryptoLib", "ext-spore seal/open unavailable (fail-closed, no downgrade)");
  }
}

/** Gate the decrypt path on an explicit ALLOW(+1). Anything else fails closed. */
function assertAllow(token: K3Token): void {
  if (token !== K3.ALLOW) {
    throw new TmfCryptoError("GovDeny", `K3 gate: decrypt requires ALLOW(+1), got ${token} (unknown/deny => fail-closed)`);
  }
}

function nowEpoch(): number { return Math.floor(Date.now() / 1000); }

/** Encode a manifest object to canonical JSON bytes. */
function manifestBytes(m: Manifest): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(m));
}

// ── fail-closed manifest validation (insecure-deserialization defense) ────────
// The manifest plaintext is authenticated-encrypted upstream (TMX merkle + AEAD open
// in composeRead), so a NETWORK attacker can't reach it. But a malformed-but-AUTHORIZED
// writer — one who holds the recipient key — can craft hostile manifest plaintext. We
// therefore never deserialize that plaintext STRAIGHT into the privileged typed Manifest;
// we structurally validate every field first (mirroring galerina-core-sentinel-io's
// ManifestLoader.fromObject), and fail closed with MalformedCrypto on anything off-schema.
// `entries` is rebuilt on a prototype-free object with __proto__/constructor/prototype keys
// rejected — belt-and-braces against prototype pollution (not currently exploitable via
// V8 JSON.parse, which makes such keys plain own-data properties, but defense-in-depth).

/** Lowercase-hex recogniser. */
const HEX_RE = /^[0-9a-f]+$/;
/** A 16-byte coord (coordForName / MANIFEST_COORD) encodes to exactly 32 lowercase-hex chars. */
const COORD_HEX_RE = /^[0-9a-f]{32}$/;
/** Keys that must never name a secret — guard the freshly built entries object. */
const FORBIDDEN_ENTRY_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function malformedManifest(detail: string): never {
  throw new TmfCryptoError("MalformedCrypto", `manifest validation: ${detail} (fail-closed)`);
}

/** Validate one decoded entry into a well-formed SecretMeta. Throws MalformedCrypto otherwise. */
function validateSecretMeta(name: string, raw: unknown): SecretMeta {
  const where = `entries[${JSON.stringify(name)}]`;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    malformedManifest(`${where} must be an object`);
  }
  const e = raw as Record<string, unknown>;
  if (typeof e["coordHex"] !== "string" || !COORD_HEX_RE.test(e["coordHex"])) {
    malformedManifest(`${where}.coordHex must be a 32-char lowercase-hex string`);
  }
  if (!isNonNegInt(e["created"])) {
    malformedManifest(`${where}.created must be a non-negative integer`);
  }
  if (!isNonNegInt(e["rotated"])) {
    malformedManifest(`${where}.rotated must be a non-negative integer`);
  }
  if (e["kemProfile"] !== KEM_PROFILE.HYBRID_X25519_ML_KEM_768) {
    malformedManifest(`${where}.kemProfile must be the v0 hybrid profile (0x02)`);
  }
  if (e["category"] !== undefined && typeof e["category"] !== "string") {
    malformedManifest(`${where}.category must be a string when present`);
  }
  if (e["environment"] !== undefined && typeof e["environment"] !== "string") {
    malformedManifest(`${where}.environment must be a string when present`);
  }
  return {
    coordHex: e["coordHex"] as string,
    created: e["created"] as number,
    rotated: e["rotated"] as number,
    kemProfile: e["kemProfile"] as number,
    ...(e["category"] !== undefined ? { category: e["category"] as string } : {}),
    ...(e["environment"] !== undefined ? { environment: e["environment"] as string } : {}),
  };
}

/**
 * Fail-closed structural validator for an already-decoded manifest object. Rejects anything
 * that does not match the v0 schema with TmfCryptoError("MalformedCrypto"). Rebuilds `entries`
 * on a prototype-free object and rejects __proto__/constructor/prototype keys.
 */
export function validateManifest(obj: unknown): Manifest {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    malformedManifest("manifest must be an object");
  }
  const m = obj as Record<string, unknown>;

  if (m["schema"] !== ENV_TMF_SCHEMA_VERSION) {
    malformedManifest(`schema must be the v0 schema version ${ENV_TMF_SCHEMA_VERSION}`);
  }
  if (typeof m["recipientPubHex"] !== "string" || m["recipientPubHex"].length === 0 || !HEX_RE.test(m["recipientPubHex"])) {
    malformedManifest("recipientPubHex must be a non-empty lowercase-hex string");
  }
  const rawEntries = m["entries"];
  if (rawEntries === null || typeof rawEntries !== "object" || Array.isArray(rawEntries)) {
    malformedManifest("entries must be an object");
  }

  const entries: Record<string, SecretMeta> = Object.create(null) as Record<string, SecretMeta>;
  for (const [name, raw] of Object.entries(rawEntries as Record<string, unknown>)) {
    if (FORBIDDEN_ENTRY_KEYS.has(name)) {
      malformedManifest(`entries contains a forbidden key ${JSON.stringify(name)}`);
    }
    entries[name] = validateSecretMeta(name, raw);
  }

  return { schema: ENV_TMF_SCHEMA_VERSION, recipientPubHex: m["recipientPubHex"] as string, entries };
}

/** Decode + fully validate manifest bytes into a typed Manifest (fail-closed). */
function parseManifest(b: Uint8Array): Manifest {
  let obj: unknown;
  try {
    obj = JSON.parse(new TextDecoder().decode(b));
  } catch (err) {
    malformedManifest(`not valid JSON: ${(err as Error).message}`);
  }
  return validateManifest(obj);
}

/** Seal one value (or the manifest) into a section payload under KEM 0x02 + commit_mode CTX. */
function sealSection(
  kind: "secret" | "manifest",
  coord: Uint8Array,
  sectionId: number,
  recipientPub: Uint8Array,
  valueBytes: Uint8Array,
): TmfSection {
  const ctx = contextFor(sectionId, coord, SECTION_EPOCH);
  const sr = seal(KEM_PROFILE.HYBRID_X25519_ML_KEM_768, recipientPub, valueBytes, ctx);
  // The profile we seal under, the profile bound into the AEAD context (ctx[26]), and the profile
  // the engine reports back MUST all be the single v0 profile. contextFor() hard-binds
  // HYBRID_X25519_ML_KEM_768 at ctx[26]; assert seal agrees, closing the crypto-failclosed #2
  // latent foot-gun (seal under one profile while binding another into the context).
  if (sr.kemProfile !== KEM_PROFILE.HYBRID_X25519_ML_KEM_768 || ctx[CTX_KEMPROFILE_OFFSET] !== KEM_PROFILE.HYBRID_X25519_ML_KEM_768) {
    throw new TmfCryptoError("MalformedCrypto", "kem_profile mismatch between seal, context and the v0 schema profile");
  }
  void COMMIT_MODE; // commit_mode CTX is bound in ctx (asserted by the round-trip)
  const packed = packSeal(sr);
  return kind === "manifest" ? manifestSection(packed) : secretSection(coord, packed);
}

/** Open one section payload back to plaintext bytes (fail-closed). Caller must have passed the gates. */
function openSection(sectionId: number, coord: Uint8Array, payload: Uint8Array, recipientSec: Uint8Array): Uint8Array {
  const u = unpackSeal(payload);
  const ctx = contextFor(sectionId, coord, SECTION_EPOCH);
  // crypto-failclosed #1: the seal-payload profile byte is attacker-mutable inside packSeal's
  // plaintext header. Defense-in-depth (TMX leaf hash + CTX-committing AEAD) already fail-closes a
  // flipped byte, but we independently REJECT unless the unpacked profile equals BOTH the single v0
  // schema profile AND the profile bound into ctx[26] — never feed an unvalidated profile to open().
  assertKemProfile(u.kemProfile, ctx);
  return open(u.kemProfile, recipientSec, u.ctKem, u.nonce, u.body, ctx);
}

/** Reject unless `profile` is the single v0 KEM profile AND equals the profile bound at ctx[26]. */
export function assertKemProfile(profile: number, ctx: Uint8Array): void {
  if (profile !== KEM_PROFILE.HYBRID_X25519_ML_KEM_768 || ctx[CTX_KEMPROFILE_OFFSET] !== KEM_PROFILE.HYBRID_X25519_ML_KEM_768) {
    throw new TmfCryptoError(
      "MalformedCrypto",
      `kem_profile not the v0 hybrid profile or disagrees with the bound context (got ${profile}, ctx[26]=${ctx[CTX_KEMPROFILE_OFFSET]}) — fail-closed`,
    );
  }
}

/** Create an empty env.spore bytes for a recipient pub (manifest-only). */
export function initEnvTmf(recipientPub: Uint8Array): Uint8Array {
  assertCryptoLib();
  const m = emptyManifest(recipientPub);
  const mSec = sealSection("manifest", MANIFEST_COORD, 0, recipientPub, manifestBytes(m));
  return writeTmf([mSec]);
}

export interface ComposeResult {
  manifest: Manifest;
  sectionByCoord: ReadonlyMap<string, { sectionId: number; coord: Uint8Array; payload: Uint8Array }>;
}

/**
 * The encrypted-container COMPOSE-READER (design doc Part 4 / encryption-spec §7).
 * Order: readTmf (recompute TMX over ciphertext leaves, fail-closed; signed v0 rejected) ->
 * K3 ALLOW(+1) gate -> NoCryptoLib check -> per-section open() of the manifest into a wiped
 * transient buffer. `token` MUST be K3.ALLOW. recipientSec is the caller-supplied anchor key.
 */
export function composeRead(buf: Uint8Array, recipientSec: Uint8Array, token: K3Token): ComposeResult {
  // 1. verify-before-decrypt — readTmf fail-closes on any tamper/bounds and REJECTS signed v0.
  const r = readTmf(buf);
  // (2. ML-DSA signature verify is GATED on ext-spore slice 4 / #7 — readTmf already rejects any
  //  signed file with AuthError, so a v0 env.spore is unsigned-but-encrypted; no fake sig.)
  // 3. K3 ALLOW(+1) gate.
  assertAllow(token);
  // 4. NoCryptoLib reject.
  assertCryptoLib();

  const byCoord = new Map<string, { sectionId: number; coord: Uint8Array; payload: Uint8Array }>();
  let manifestPayload: { id: number; coord: Uint8Array; payload: Uint8Array } | null = null;
  r.sections.forEach((s, idx) => {
    const coordHex = toHex(s.coord);
    if (s.kind === SECTION_KIND_MANIFEST && coordHex === toHex(MANIFEST_COORD)) {
      manifestPayload = { id: idx, coord: s.coord, payload: s.payload };
    } else {
      byCoord.set(coordHex, { sectionId: idx, coord: s.coord, payload: s.payload });
    }
  });
  if (manifestPayload === null) {
    throw new TmfCryptoError("MalformedCrypto", "env.spore has no manifest section (fail-closed)");
  }
  const mp = manifestPayload as { id: number; coord: Uint8Array; payload: Uint8Array };
  const manifestPlain = openSection(mp.id, mp.coord, mp.payload, recipientSec);
  let manifest: Manifest;
  try {
    manifest = withWiped(manifestPlain, (b) => parseManifest(new Uint8Array(b)));
  } finally {
    manifestPlain.fill(0);
  }
  return { manifest, sectionByCoord: byCoord };
}

/** Open a single named secret value into a transient wiped buffer and hand it to `fn`. */
export function openValue<T>(
  buf: Uint8Array,
  recipientSec: Uint8Array,
  token: K3Token,
  name: string,
  fn: (plain: Buffer) => T,
): T {
  const { manifest, sectionByCoord } = composeRead(buf, recipientSec, token);
  const meta = manifest.entries[name];
  if (meta === undefined) throw new TmfCryptoError("MalformedCrypto", `no such secret: ${name} (fail-closed)`);
  const sec = sectionByCoord.get(meta.coordHex);
  if (sec === undefined) throw new TmfCryptoError("MalformedCrypto", `manifest/section mismatch for ${name} (fail-closed)`);
  const plain = openSection(sec.sectionId, sec.coord, sec.payload, recipientSec);
  return withWiped(plain, (b) => fn(b));
}

/** Read an env.spore from disk (sync) — convenience for the CLI. */
export function readFile(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

// ── the in-arena edit -> re-seal flow (set / rm / rotate-recipient) ───────────
// Each mutator: composeRead (verify+decrypt manifest) -> mutate in RAM -> re-seal every
// section -> writeTmf -> caller atomic-replaces the file. Plaintext lives ONLY in transient
// wiped buffers; NO temp file is ever written.

export interface MutationResult {
  readonly bytes: Uint8Array;       // the new env.spore bytes to atomic-write
  readonly manifest: Manifest;      // the updated (in-RAM) manifest
}

/** Re-seal the whole file from a manifest + a map of coordHex->plaintext-value-bytes. */
function reseal(recipientPub: Uint8Array, manifest: Manifest, values: Map<string, Uint8Array>): Uint8Array {
  const sections: TmfSection[] = [];
  sections.push(sealSection("manifest", MANIFEST_COORD, 0, recipientPub, manifestBytes(manifest)));
  let id = 1;
  for (const [coordHex, valueBytes] of values) {
    const coord = fromHex(coordHex);
    sections.push(sealSection("secret", coord, id, recipientPub, valueBytes));
    id += 1;
  }
  return writeTmf(sections);
}

/**
 * Decrypt EVERY secret into transient wiped buffers, run `mutate` on the live manifest+values
 * map, then re-seal. The values map holds plaintext only for the duration of this call and is
 * zero-wiped in `finally`. NO temp file. NO $EDITOR. NO disk plaintext.
 */
function editInArena(
  buf: Uint8Array,
  recipientSec: Uint8Array,
  recipientPub: Uint8Array,
  token: K3Token,
  mutate: (manifest: Manifest, values: Map<string, Uint8Array>) => Manifest,
): MutationResult {
  const { manifest, sectionByCoord } = composeRead(buf, recipientSec, token);
  const values = new Map<string, Uint8Array>();
  try {
    for (const [coordHex, sec] of sectionByCoord) {
      const plain = openSection(sec.sectionId, sec.coord, sec.payload, recipientSec);
      values.set(coordHex, plain); // owned here; wiped in finally
    }
    const newManifest = mutate(manifest, values);
    const bytes = reseal(recipientPub, newManifest, values);
    return { bytes, manifest: newManifest };
  } finally {
    for (const v of values.values()) v.fill(0); // zero-wipe every plaintext on every path
  }
}

/** set NAME=value (value bytes from stdin/no-echo prompt — NEVER argv; enforced in cli.ts). */
export function setSecret(
  buf: Uint8Array, recipientSec: Uint8Array, recipientPub: Uint8Array, token: K3Token,
  name: string, valueBytes: Uint8Array, opts?: { category?: string; environment?: string },
): MutationResult {
  return editInArena(buf, recipientSec, recipientPub, token, (manifest, values) => {
    const coord = coordForName(name);
    const coordHex = toHex(coord);
    values.set(coordHex, Uint8Array.from(valueBytes)); // copy; caller wipes its own source
    const prev = manifest.entries[name];
    const meta: SecretMeta = {
      coordHex,
      created: prev?.created ?? nowEpoch(),
      rotated: nowEpoch(),
      kemProfile: KEM_PROFILE.HYBRID_X25519_ML_KEM_768,
      ...(opts?.category !== undefined ? { category: opts.category } : {}),
      ...(opts?.environment !== undefined ? { environment: opts.environment } : {}),
    };
    return { ...manifest, entries: { ...manifest.entries, [name]: meta } };
  });
}

/** rm NAME — remove section + manifest entry, re-seal. */
export function rmSecret(
  buf: Uint8Array, recipientSec: Uint8Array, recipientPub: Uint8Array, token: K3Token, name: string,
): MutationResult {
  return editInArena(buf, recipientSec, recipientPub, token, (manifest, values) => {
    const meta = manifest.entries[name];
    if (meta === undefined) throw new TmfCryptoError("MalformedCrypto", `no such secret: ${name}`);
    const v = values.get(meta.coordHex);
    if (v !== undefined) { v.fill(0); values.delete(meta.coordHex); }
    const entries = { ...manifest.entries };
    delete entries[name];
    return { ...manifest, entries };
  });
}

/**
 * rotate-recipient — re-encrypt EVERY section under a new recipient KEM pubkey (SOPS-style
 * per-file rekey). Decrypt-all with the OLD secret, re-seal-all under the NEW pub. Old plaintext
 * buffers zero-wiped in `finally`.
 */
export function rotateRecipient(
  buf: Uint8Array, oldRecipientSec: Uint8Array, token: K3Token, newRecipientPub: Uint8Array,
): MutationResult {
  const { manifest, sectionByCoord } = composeRead(buf, oldRecipientSec, token);
  const values = new Map<string, Uint8Array>();
  try {
    for (const [coordHex, sec] of sectionByCoord) {
      const plain = openSection(sec.sectionId, sec.coord, sec.payload, oldRecipientSec);
      values.set(coordHex, plain);
    }
    const newManifest: Manifest = { ...manifest, recipientPubHex: toHex(newRecipientPub) };
    const bytes = reseal(newRecipientPub, newManifest, values);
    return { bytes, manifest: newManifest };
  } finally {
    for (const v of values.values()) v.fill(0);
  }
}

/** list — return names + metadata ONLY (NEVER values). Decrypts the manifest only. */
export function listSecrets(buf: Uint8Array, recipientSec: Uint8Array, token: K3Token): Array<{ name: string } & SecretMeta> {
  const { manifest } = composeRead(buf, recipientSec, token);
  return Object.entries(manifest.entries).map(([name, meta]) => ({ name, ...meta }));
}

export type { Manifest, SecretMeta } from "./schema.js";
