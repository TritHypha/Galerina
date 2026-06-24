// history.ts — .tmf append-only history chain (`+1`), v0 (slice 5, G4). Spec (frozen):
// spec/tmf-history-chain-v0.md. Byte-precise, deterministic SHAKE256 — crypto-on-core
// (LLN-SUBSTRATE-001): no photonic crypto, bit-exact digital.
//
// SCOPE (what this file builds, exactly per the spec's separation of concerns):
//   • §1 chain header (24 B header_core: epoch u32 ‖ flags u32 ‖ reserved/chain_id 16 B) + the LINK
//     leaf (kind=7, modality=0, coord=u32le(epoch), payload=prev_root) that binds the predecessor.
//   • §3 append (+1): compute rₖ over [content leaves … , link-leaf(prev_root=rₖ₋₁)] with the chain
//     header as header_core; genesis prev_root = 0³².
//   • §3 verify (fail-closed): walk, recompute every rₖ, confirm Sₖ.link.prev_root == rₖ₋₁, genesis
//     == 0³². Any link break ⇒ IntegrityError.
//   • §5 freshness (anti-rollback): monotone-epoch floor (head.epoch ≥ highest accepted for chain_id)
//     and/or a trusted-head pointer {chain_id, latest_epoch, r_n}. A non-monotone epoch, a rollback,
//     or a head that does not extend the trusted head ⇒ RollbackError.
//   • §8 on-wire pack: 48-B pack header + 56-B segment table, bounds-checked → recompute every rₖ by
//     body → backward link walk by recomputed root → STRICT MEMBERSHIP (no orphans) → freshness.
//
// DEFERRED to other slices (kept honest, matching the spec): the per-epoch key-erasure ratchet (§2)
// and AEAD sealing are the KEM-DEM layer (slice 3, kemdem.ts) — callers seal sections there and pass
// the resulting *ciphertext* leaf digests in here; the head ML-DSA signature (§1/§8) is slice 4 (#7),
// "Blocked on a vetted FIPS-204 lib" (spec §8). This file is the INTEGRITY + ORDER + FRESHNESS layer:
// the deterministic SHAKE256 half the spec's golden generator covers (spec §7). It verifies the chain
// structure fail-closed; it does not decapsulate or verify signatures (those gates live in their slice).
import { timingSafeEqual } from "node:crypto";
import { H, leafHash, tmxRoot } from "./tmx256.js";

// ── §1 constants ────────────────────────────────────────────────────────────
/** Chain header size in bytes, fed into the TMX root as header_core (§1). */
export const CHAIN_HEADER_SIZE = 24;
/** 128-bit chain_id width (§1 reserved-16 / §8 pack header). */
export const CHAIN_ID_SIZE = 16;
/** Container kind for the synthetic predecessor-binding leaf (§1; container §4.1 reserves 7=LINK). */
export const HISTORY_LINK_KIND = 7;
/** LINK leaf modality (§1: modality = 0). */
export const HISTORY_LINK_MODALITY = 0;
/** Genesis predecessor root: 0³² (§1/§3 — genesis S₀ uses 0^32). */
export const GENESIS_PREV_ROOT: Uint8Array = new Uint8Array(H);

/** §1 chain-header flags (the whole 24-B header is header_core, so these are under the signed root). */
export const HIST_FLAG = {
  SEALED: 1 << 0, // bit0
  SIGNED: 1 << 1, // bit1
  ERASED: 1 << 2, // bit2 — key dropped (§6 crypto-erasure)
} as const;
/** Mask of defined flag bits; bits 3–31 are reserved and MUST be 0 (§1). */
const HIST_FLAG_DEFINED = HIST_FLAG.SEALED | HIST_FLAG.SIGNED | HIST_FLAG.ERASED;

// ── §8 pack constants ───────────────────────────────────────────────────────
/** History-pack magic: 0x89 'T' 'M' 'H' 0x0D 0x0A 0x1A 0x0A (distinct from the container's 'TMF'). */
export const PACK_MAGIC = Uint8Array.from([0x89, 0x54, 0x4d, 0x48, 0x0d, 0x0a, 0x1a, 0x0a]);
/** §8 pack header size (bytes). */
export const PACK_HEADER_SIZE = 48;
/** §8 segment-table entry size (same width as a container section entry). */
export const PACK_ENTRY_SIZE = 56;
/** §8 pack_flags: bit0 = head_signed; bits 1–15 reserved (MUST be 0). */
export const PACK_FLAG = { HEAD_SIGNED: 1 << 0 } as const;

// ── error taxonomy (§3 fail-closed) ─────────────────────────────────────────
export type TmfHistoryCode =
  | "MalformedChain"     // bad shape / arguments / reserved-bit violation
  | "IntegrityError"     // broken hash-link, root mismatch, orphan/fork, chain_id relabel
  | "RollbackError"      // §5 freshness: non-monotone epoch or head does not extend the trusted head
  | "BadMagic"           // §8 pack magic mismatch
  | "UnsupportedVersion" // §8 unknown version_major
  | "MalformedTable"     // §8 bounds / table failures
  | "AuthError";         // §8 head_signed but no vetted verifier wired (no silent downgrade)

/** Typed, fail-closed history-chain error (§3 taxonomy). */
export class TmfHistoryError extends Error {
  readonly code: TmfHistoryCode;
  constructor(code: TmfHistoryCode, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "TmfHistoryError";
  }
}

// ── byte helpers (match container.ts / tmx256.ts house style) ───────────────
function wU16(v: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff, true); return b; }
function wU32(v: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; }
function wU64(v: number | bigint): Uint8Array { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; }

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let n = 0; for (const p of parts) n += p.length;
  const o = new Uint8Array(n); let k = 0;
  for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}

/** Constant-time digest compare via the VETTED node:crypto primitive (mirrors container.ts / kemdem.ts).
 *  timingSafeEqual throws on unequal lengths, so the public-length pre-check gates it. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reject anything that is not a valid u32 (epoch / flags are u32 fields, §1). */
function assertU32(v: number, what: string): void {
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new TmfHistoryError("MalformedChain", `${what} out of u32 range`);
}

/** A 16-byte chain_id (default = all-zero for a standalone segment, §1). Validates length, fail-closed. */
function normalizeChainId(chainId?: Uint8Array): Uint8Array {
  if (chainId === undefined) return new Uint8Array(CHAIN_ID_SIZE);
  if (chainId.length !== CHAIN_ID_SIZE) throw new TmfHistoryError("MalformedChain", `chain_id must be ${CHAIN_ID_SIZE} bytes`);
  return chainId.slice();
}

// ── §1 chain header + link-leaf ─────────────────────────────────────────────
/**
 * §1 chain header — 24 bytes fed into the TMX root as header_core:
 *   [0:4]  epoch u32 LE   (append index k; monotone; 0 = genesis)
 *   [4:8]  flags u32 LE   (bit0 sealed · bit1 signed · bit2 erased · bits3-31 reserved=0)
 *   [8:24] reserved/chain_id (0 in a standalone segment; carries the 128-bit chain_id when packed, §8)
 * Because the whole header is header_core, epoch and flags (incl. erased) are under the signed root.
 */
export function chainHeader(epoch: number, flags: number, chainId?: Uint8Array): Uint8Array {
  assertU32(epoch, "epoch");
  assertU32(flags, "flags");
  if ((flags & ~HIST_FLAG_DEFINED) !== 0) throw new TmfHistoryError("MalformedChain", "reserved flags bits 3-31 must be 0");
  return concat([wU32(epoch), wU32(flags), normalizeChainId(chainId)]);
}

/** Parse a 24-byte chain header (fail-closed on reserved-bit violations). */
export function parseChainHeader(hdr: Uint8Array): { epoch: number; flags: number; chainId: Uint8Array } {
  if (hdr.length !== CHAIN_HEADER_SIZE) throw new TmfHistoryError("MalformedChain", `chain header must be ${CHAIN_HEADER_SIZE} bytes`);
  const dv = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
  const epoch = dv.getUint32(0, true);
  const flags = dv.getUint32(4, true);
  if ((flags & ~HIST_FLAG_DEFINED) !== 0) throw new TmfHistoryError("MalformedChain", "reserved flags bits 3-31 must be 0");
  return { epoch, flags, chainId: hdr.slice(8, 24) };
}

/**
 * §1 link-leaf — binds the predecessor: leaf(kind=LINK(7), modality=0, coord=u32le(epoch),
 * payload=prev_root). An ordinary TMX leaf, so prev_root is integrity-bound under the signed root.
 * Genesis (epoch 0) uses prev_root = 0³².
 */
export function linkLeaf(epoch: number, prevRoot: Uint8Array): Uint8Array {
  assertU32(epoch, "epoch");
  if (prevRoot.length !== H) throw new TmfHistoryError("MalformedChain", `prev_root must be ${H} bytes`);
  return leafHash(HISTORY_LINK_KIND, HISTORY_LINK_MODALITY, wU32(epoch), prevRoot);
}

// ── §1/§3 segment + root ────────────────────────────────────────────────────
/** A history segment Sₖ (the integrity/order view; ciphertext + sealing live in the KEM-DEM slice). */
export interface HistorySegment {
  readonly epoch: number;
  readonly flags: number;
  readonly chainId: Uint8Array;            // 16 B (0³² for standalone)
  /** prev_root = rₖ₋₁ (genesis = 0³²). Bound via the link-leaf. */
  readonly prevRoot: Uint8Array;           // 32 B
  /** The segment's ciphertext (or content) leaf digests, in section order (TMX §2 leaves). */
  readonly contentLeaves: readonly Uint8Array[];
}

/**
 * §3 root rₖ = TMX.root(chain_header₂₄, [content leaves … , link-leaf(prev_root)]).
 * The link-leaf is appended as the LAST leaf of the section group (its position is bound by TMX like
 * any section; see the report NOTES — the spec fixes the *binding*, not the slot index).
 */
export function segmentRoot(seg: HistorySegment): Uint8Array {
  assertU32(seg.epoch, "epoch");
  if (seg.prevRoot.length !== H) throw new TmfHistoryError("MalformedChain", `prev_root must be ${H} bytes`);
  if (seg.epoch === 0 && !bytesEqual(seg.prevRoot, GENESIS_PREV_ROOT)) {
    throw new TmfHistoryError("IntegrityError", "genesis segment (epoch 0) must have prev_root = 0^32");
  }
  for (const d of seg.contentLeaves) {
    if (d.length !== H) throw new TmfHistoryError("MalformedChain", `content leaf must be ${H} bytes`);
  }
  const hc = chainHeader(seg.epoch, seg.flags, seg.chainId);
  const leaves = [...seg.contentLeaves, linkLeaf(seg.epoch, seg.prevRoot)];
  return tmxRoot(hc, leaves);
}

// ── §3 append (+1) ──────────────────────────────────────────────────────────
/** A built segment plus its computed root rₖ (the value Sₖ₊₁ will link as prev_root). */
export interface AppendedSegment {
  readonly segment: HistorySegment;
  readonly root: Uint8Array; // rₖ
}

/**
 * §3 APPEND — extend a chain. `prev` is the previously appended segment (its root becomes this
 * segment's prev_root), or `null`/undefined to start the genesis segment (epoch 0, prev_root = 0³²).
 * Epoch is auto-derived as prev.epoch + 1, enforcing strict monotonicity at write time. Fail-closed.
 *
 * NOTE: this builds the INTEGRITY record. The per-epoch key ratchet (§2) + AEAD sealing of the
 * sections (which produce `contentLeaves`) are the KEM-DEM slice; the head signature is slice 4.
 */
export function appendSegment(
  prev: AppendedSegment | null | undefined,
  contentLeaves: readonly Uint8Array[],
  opts?: { flags?: number; chainId?: Uint8Array },
): AppendedSegment {
  const flags = opts?.flags ?? 0;
  const chainId = normalizeChainId(opts?.chainId);
  let epoch: number;
  let prevRoot: Uint8Array;
  if (prev == null) {
    epoch = 0;
    prevRoot = GENESIS_PREV_ROOT;
  } else {
    assertU32(prev.segment.epoch, "prev.epoch");
    if (prev.segment.epoch === 0xffffffff) throw new TmfHistoryError("MalformedChain", "epoch would overflow u32");
    // chain_id continuity: a child cannot silently switch chains.
    if (!bytesEqual(prev.segment.chainId, chainId)) throw new TmfHistoryError("IntegrityError", "chain_id must match the predecessor");
    epoch = prev.segment.epoch + 1;
    prevRoot = prev.root;
  }
  const segment: HistorySegment = { epoch, flags, chainId, prevRoot: prevRoot.slice(), contentLeaves: contentLeaves.map((d) => d.slice()) };
  return { segment, root: segmentRoot(segment) };
}

// ── §5 freshness inputs ─────────────────────────────────────────────────────
/** §5 trusted-head pointer: a separately-published, signed {chain_id, latest_epoch, r_n}. */
export interface TrustedHead {
  readonly chainId: Uint8Array;     // 16 B
  readonly latestEpoch: number;     // u32
  readonly root: Uint8Array;        // r_n (32 B)
}

/** §5 freshness policy for a verify call. Provide a trusted head, a monotone floor, or both. */
export interface FreshnessPolicy {
  /** §5 trusted-head pointer (stateless verifier). The presented head MUST equal this {epoch, root}. */
  readonly trustedHead?: TrustedHead;
  /** §5 monotone-epoch floor: highest epoch previously accepted for this chain_id. Reject head.epoch < this. */
  readonly minEpoch?: number;
}

// ── §3 verify (fail-closed) ─────────────────────────────────────────────────
export interface VerifyChainResult {
  readonly headEpoch: number;
  readonly headRoot: Uint8Array;
  readonly chainId: Uint8Array;
  readonly length: number; // number of segments verified (genesis..head inclusive)
}

/**
 * §3/§5 VERIFY a chain (ordered genesis..head). Fail-closed:
 *   • every segment's recomputed rₖ must match what the next segment links as prev_root (hash-link);
 *   • genesis (first segment) must have epoch 0 and prev_root 0³²;
 *   • epochs MUST be strictly monotone (0, 1, …) — no gap, no rollback;
 *   • all segments share one chain_id;
 *   • §5 FRESHNESS: if a policy is given, the head must satisfy the monotone floor and/or equal the
 *     trusted-head pointer. A non-monotone epoch, a broken link, or a head that does not extend the
 *     trusted head ⇒ reject.
 *
 * `segments` is the in-order list [S₀ … Sₙ]; each carries its own prev_root (Sₖ.prev_root claims rₖ₋₁).
 * Order/freshness are checked WITHOUT touching plaintext (decapsulation is the KEM-DEM slice).
 */
export function verifyChain(segments: readonly HistorySegment[], policy?: FreshnessPolicy): VerifyChainResult {
  if (segments.length === 0) throw new TmfHistoryError("MalformedChain", "empty chain");
  const first = segments[0]!;
  if (first.epoch !== 0) throw new TmfHistoryError("IntegrityError", "first segment must be genesis (epoch 0)");
  if (!bytesEqual(first.prevRoot, GENESIS_PREV_ROOT)) throw new TmfHistoryError("IntegrityError", "genesis prev_root must be 0^32");
  const chainId = first.chainId.slice();
  if (chainId.length !== CHAIN_ID_SIZE) throw new TmfHistoryError("MalformedChain", `chain_id must be ${CHAIN_ID_SIZE} bytes`);

  let prevRootComputed: Uint8Array = GENESIS_PREV_ROOT;
  let lastRoot: Uint8Array = GENESIS_PREV_ROOT;
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k]!;
    if (s.epoch !== k) throw new TmfHistoryError("IntegrityError", `epoch not strictly monotone at index ${k} (got ${s.epoch})`);
    if (!bytesEqual(s.chainId, chainId)) throw new TmfHistoryError("IntegrityError", `chain_id mismatch at index ${k}`);
    // hash-link: this segment's claimed prev_root must equal the predecessor's recomputed root.
    if (!bytesEqual(s.prevRoot, prevRootComputed)) throw new TmfHistoryError("IntegrityError", `broken hash-link at index ${k}`);
    const r = segmentRoot(s); // recompute rₖ (binds header_core + content leaves + link-leaf)
    prevRootComputed = r;
    lastRoot = r;
  }
  const head = segments[segments.length - 1]!;
  enforceFreshness({ chainId, epoch: head.epoch, root: lastRoot }, policy);
  return { headEpoch: head.epoch, headRoot: lastRoot, chainId, length: segments.length };
}

/**
 * §5 freshness gate (anti-rollback / end-truncation). Standalone so callers can apply it to a head they
 * obtained out-of-band. Fail-closed: a non-monotone epoch, or a head that does not match the trusted
 * head pointer, ⇒ RollbackError. With NO policy this is a no-op (the spec MANDATES one of the two for
 * any rollback-resistant deployment — calling verify without a policy gets interior tamper-evidence
 * ONLY, never freshness; that is the documented §5 boundary).
 */
export function enforceFreshness(
  head: { chainId: Uint8Array; epoch: number; root: Uint8Array },
  policy?: FreshnessPolicy,
): void {
  if (!policy) return; // §5: no policy ⇒ only interior tamper-evidence; freshness explicitly not claimed.
  if (policy.minEpoch !== undefined) {
    assertU32(policy.minEpoch, "minEpoch");
    if (head.epoch < policy.minEpoch) {
      throw new TmfHistoryError("RollbackError", `head epoch ${head.epoch} below monotone floor ${policy.minEpoch} (rollback)`);
    }
  }
  if (policy.trustedHead !== undefined) {
    const th = policy.trustedHead;
    if (th.chainId.length !== CHAIN_ID_SIZE || th.root.length !== H) {
      throw new TmfHistoryError("MalformedChain", "trusted head malformed");
    }
    if (!bytesEqual(th.chainId, head.chainId)) {
      throw new TmfHistoryError("RollbackError", "head chain_id does not match the trusted head");
    }
    // The presented head must BE the trusted head: same authoritative epoch AND same root. An old,
    // validly-signed shorter head has a lower epoch / different root ⇒ rejected (§5 truncation).
    if (head.epoch !== th.latestEpoch) {
      throw new TmfHistoryError("RollbackError", `head epoch ${head.epoch} != trusted latest_epoch ${th.latestEpoch}`);
    }
    if (!bytesEqual(head.root, th.root)) {
      throw new TmfHistoryError("RollbackError", "head root does not match the trusted head pointer");
    }
  }
}

// ── §8 on-wire multi-segment pack ───────────────────────────────────────────
/** A segment to pack (§8). Carries content leaf digests + prev_root; the LINK leaf is added internally. */
export interface PackSegment {
  readonly epoch: number;
  readonly flags: number;
  readonly contentLeaves: readonly Uint8Array[];
  readonly prevRoot: Uint8Array; // 32 B (genesis = 0³²)
}

/**
 * §8 segment body layout (the bytes that recompute rₖ):
 *   chain_header(24) ∥ leaf_count u32 LE ∥ leaf_count × 32-B leaf digest ∥ prev_root(32)
 * The leaves are [content leaves … , LINK leaf]; the trailing prev_root lets the reader recover what the
 * (one-way) LINK leaf binds, then re-hash linkLeaf(epoch, prev_root) and confirm it equals the stored
 * LINK digest (so prev_root cannot be forged independently of the root). rₖ = TMX.root(chain_header,
 * [leaves]) — the prev_root trailer is NOT hashed into rₖ (it only mirrors what the LINK leaf already
 * binds), matching the container's "leaves/roots recomputed, hints re-verified" philosophy (spec §8).
 */
function encodeSegmentBody(chainId: Uint8Array, s: PackSegment): Uint8Array {
  if (s.prevRoot.length !== H) throw new TmfHistoryError("MalformedChain", `prev_root must be ${H} bytes`);
  const hc = chainHeader(s.epoch, s.flags, chainId);
  const leaves = [...s.contentLeaves, linkLeaf(s.epoch, s.prevRoot)];
  const parts: Uint8Array[] = [hc, wU32(leaves.length)];
  for (const d of leaves) {
    if (d.length !== H) throw new TmfHistoryError("MalformedChain", `leaf must be ${H} bytes`);
    parts.push(d);
  }
  parts.push(s.prevRoot.slice());
  return concat(parts);
}

interface DecodedSeg { epoch: number; flags: number; chainId: Uint8Array; root: Uint8Array; prevRoot: Uint8Array; }

/** Decode + recompute a §8 segment body, fail-closed on every shape/bounds error (used by verifyPack). */
function decodeSegmentBody(body: Uint8Array, packChainId: Uint8Array): DecodedSeg {
  // minimum: header(24) + count(4) + 1 leaf(32) + prev_root(32)
  if (body.length < CHAIN_HEADER_SIZE + 4 + H + H) throw new TmfHistoryError("MalformedTable", "segment body too short");
  const hdr = body.slice(0, CHAIN_HEADER_SIZE);
  const { epoch, flags, chainId } = parseChainHeader(hdr);
  if (!bytesEqual(chainId, packChainId)) throw new TmfHistoryError("IntegrityError", "segment chain_id != pack chain_id");
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const count = dv.getUint32(CHAIN_HEADER_SIZE, true);
  if (count < 1) throw new TmfHistoryError("MalformedTable", "segment body needs ≥ 1 leaf (the LINK leaf)");
  const needed = CHAIN_HEADER_SIZE + 4 + count * H + H; // + trailing prev_root
  if (body.length !== needed) throw new TmfHistoryError("MalformedTable", "segment body length does not match leaf count");
  const leaves: Uint8Array[] = [];
  let off = CHAIN_HEADER_SIZE + 4;
  for (let i = 0; i < count; i++) { leaves.push(body.slice(off, off + H)); off += H; }
  const prevRoot = body.slice(off, off + H);
  // bind: the final leaf MUST be linkLeaf(epoch, prevRoot) — otherwise prev_root is forged.
  if (!bytesEqual(leaves[leaves.length - 1]!, linkLeaf(epoch, prevRoot))) {
    throw new TmfHistoryError("IntegrityError", "LINK leaf does not bind the stated prev_root");
  }
  if (epoch === 0 && !bytesEqual(prevRoot, GENESIS_PREV_ROOT)) throw new TmfHistoryError("IntegrityError", "genesis prev_root must be 0^32");
  const root = tmxRoot(hdr, leaves);
  return { epoch, flags, chainId, root, prevRoot };
}

/**
 * §8 pack-encode an ordered chain `S₀..Sₙ` into one blob. `head_signed` stays 0 in v0 (no fake
 * signature; slice 4 / #7). `chainId` is baked into every segment's chain header (under header_core)
 * AND into the pack header. The head is the highest-epoch segment. Fail-closed on malformed input.
 */
export function encodePack(chainIdIn: Uint8Array, segments: readonly PackSegment[]): Uint8Array {
  const chainId = normalizeChainId(chainIdIn);
  if (segments.length === 0) throw new TmfHistoryError("MalformedChain", "pack needs ≥ 1 segment");
  const bodies: Uint8Array[] = [];
  let headIndex = 0;
  let headEpoch = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    assertU32(s.epoch, "epoch");
    bodies.push(encodeSegmentBody(chainId, s));
    if (s.epoch > headEpoch) { headEpoch = s.epoch; headIndex = i; }
  }
  const segmentCount = segments.length;
  const header = concat([
    PACK_MAGIC,                 // [0:8]
    wU16(0),                    // [8:10]  version_major
    wU16(0),                    // [10:12] version_minor
    wU16(0),                    // [12:14] pack_flags (head_signed=0 in v0)
    wU16(0),                    // [14:16] reserved
    chainId,                    // [16:32] chain_id
    wU64(segmentCount),         // [32:40] segment_count
    wU32(headIndex),            // [40:44] head_index
    wU32(headEpoch),            // [44:48] head_epoch (hint; authoritative = head body's header)
  ]);
  const entries: Uint8Array[] = [];
  const region: Uint8Array[] = [];
  let segOff = 0;
  for (let i = 0; i < segmentCount; i++) {
    const s = segments[i]!;
    const body = bodies[i]!;
    const root = tmxRoot(chainHeader(s.epoch, s.flags, chainId), [...s.contentLeaves, linkLeaf(s.epoch, s.prevRoot)]);
    entries.push(concat([
      wU32(s.epoch),            // [0:4]  epoch hint
      wU32(s.flags),            // [4:8]  seg_flags mirror
      wU64(segOff),             // [8:16] seg_off (from start of segment region)
      wU64(body.length),        // [16:24] seg_len
      root,                     // [24:56] seg_root hint (re-verified)
    ]));
    region.push(body);
    segOff += body.length;
  }
  return concat([header, ...entries, ...region]);
}

export interface PackVerifyResult {
  readonly chainId: Uint8Array;
  readonly headEpoch: number;
  readonly headRoot: Uint8Array;
  readonly segmentCount: number;
}

/**
 * §8 reader (extends §3; fail-closed). Order, exactly per the spec:
 *   1. MAGIC ok; version_major == 0                                    else BadMagic / UnsupportedVersion
 *   2. BOUNDS (before any hashing): region_off = 48 + count*56 ≤ len; head_index < count;
 *      ∀ entry region_off + seg_off + seg_len ≤ len                    else MalformedTable
 *   3. ∀ segment: recompute rₖ from its body; chain-header chain_id == pack.chain_id  else IntegrityError
 *      (the table seg_root is only a hint; the recomputed rₖ is authoritative)
 *   4. head = segment[head_index]; head.epoch == head_epoch; head_signed ⇒ AuthError (no v0 verifier)
 *   5. FRESHNESS (§5): head.epoch ≥ monotone floor / == trusted head  else RollbackError
 *   6. backward link walk BY RECOMPUTED ROOT: cur = head; while cur.epoch > 0 find the segment whose
 *      recomputed root == cur's link prev_root AND epoch == cur.epoch-1; genesis prev_root == 0³²
 *   6b. STRICT MEMBERSHIP: walked_count == segment_count (no orphans / off-path insertion / fork) else IntegrityError
 */
export function verifyPack(buf: Uint8Array, policy?: FreshnessPolicy): PackVerifyResult {
  const len = buf.length;
  // 1. magic + version
  if (len < PACK_HEADER_SIZE) throw new TmfHistoryError("MalformedTable", "pack shorter than the 48-byte header");
  if (!bytesEqual(buf.subarray(0, 8), PACK_MAGIC)) throw new TmfHistoryError("BadMagic", "pack magic mismatch");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const versionMajor = dv.getUint16(8, true);
  if (versionMajor !== 0) throw new TmfHistoryError("UnsupportedVersion", `version_major ${versionMajor} unsupported`);
  const packFlags = dv.getUint16(12, true);
  if ((packFlags & ~PACK_FLAG.HEAD_SIGNED) !== 0) throw new TmfHistoryError("MalformedTable", "reserved pack_flags bits must be 0");
  const reserved = dv.getUint16(14, true);
  if (reserved !== 0) throw new TmfHistoryError("MalformedTable", "reserved u16 must be 0");
  const packChainId = buf.slice(16, 32);
  const segCountBig = dv.getBigUint64(32, true);
  const headIndex = dv.getUint32(40, true);
  const headEpochHint = dv.getUint32(44, true);

  // 2. BOUNDS — overflow-safe in BigInt, BEFORE any hashing.
  if (segCountBig === 0n) throw new TmfHistoryError("MalformedTable", "segment_count must be ≥ 1");
  const lenBig = BigInt(len);
  const regionOffBig = 48n + segCountBig * 56n;
  if (regionOffBig > lenBig) throw new TmfHistoryError("MalformedTable", "segment table extends past EOF");
  const segmentCount = Number(segCountBig);
  const regionOff = Number(regionOffBig);
  if (headIndex >= segmentCount) throw new TmfHistoryError("MalformedTable", "head_index out of range");

  interface Tbl { epoch: number; flags: number; segOff: bigint; segLen: bigint; rootHint: Uint8Array; }
  const table: Tbl[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const e = 48 + i * 56;
    const segOff = dv.getBigUint64(e + 8, true);
    const segLen = dv.getBigUint64(e + 16, true);
    if (regionOffBig + segOff + segLen > lenBig) throw new TmfHistoryError("MalformedTable", `segment ${i} body extends past EOF`);
    table.push({ epoch: dv.getUint32(e, true), flags: dv.getUint32(e + 4, true), segOff, segLen, rootHint: buf.slice(e + 24, e + 56) });
  }

  // 3. recompute every root; chain_id under header_core must equal the pack chain_id.
  const segs: DecodedSeg[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const t = table[i]!;
    const start = regionOff + Number(t.segOff);
    const body = buf.subarray(start, start + Number(t.segLen));
    const dec = decodeSegmentBody(body, packChainId);
    if (!bytesEqual(dec.root, t.rootHint)) throw new TmfHistoryError("IntegrityError", `segment ${i} root hint does not match recomputed root`);
    segs.push(dec);
  }

  // 4. head
  const head = segs[headIndex]!;
  if (head.epoch !== headEpochHint) throw new TmfHistoryError("IntegrityError", "head_epoch hint does not match head body epoch");
  if ((packFlags & PACK_FLAG.HEAD_SIGNED) !== 0) {
    throw new TmfHistoryError("AuthError", "head_signed pack rejected: no vetted FIPS-204 verifier wired in v0 (no silent downgrade)");
  }

  // 5. freshness (§5)
  enforceFreshness({ chainId: packChainId, epoch: head.epoch, root: head.root }, policy);

  // index segments by recomputed root for the walk (lookup by root ⇒ table order irrelevant).
  const byRoot = new Map<string, number>();
  for (let i = 0; i < segs.length; i++) {
    const key = Buffer.from(segs[i]!.root).toString("hex");
    if (byRoot.has(key)) throw new TmfHistoryError("IntegrityError", "duplicate segment root (fork/replay)");
    byRoot.set(key, i);
  }

  // 6. backward link walk by recomputed root.
  const visited = new Set<number>();
  let curIndex = headIndex;
  for (;;) {
    if (visited.has(curIndex)) throw new TmfHistoryError("IntegrityError", "cycle in link walk");
    visited.add(curIndex);
    const cur = segs[curIndex]!;
    if (cur.epoch === 0) {
      if (!bytesEqual(cur.prevRoot, GENESIS_PREV_ROOT)) throw new TmfHistoryError("IntegrityError", "genesis prev_root must be 0^32");
      break;
    }
    const predIdx = byRoot.get(Buffer.from(cur.prevRoot).toString("hex"));
    if (predIdx === undefined) throw new TmfHistoryError("IntegrityError", `broken link: predecessor root not present for epoch ${cur.epoch}`);
    const pred = segs[predIdx]!;
    if (pred.epoch !== cur.epoch - 1) throw new TmfHistoryError("IntegrityError", `predecessor epoch ${pred.epoch} != ${cur.epoch - 1}`);
    curIndex = predIdx;
  }

  // 6b. strict membership — no orphans / off-path insertion / fork branch.
  if (visited.size !== segmentCount) throw new TmfHistoryError("IntegrityError", `orphan segment(s): walked ${visited.size} of ${segmentCount}`);

  return { chainId: packChainId, headEpoch: head.epoch, headRoot: head.root, segmentCount };
}
