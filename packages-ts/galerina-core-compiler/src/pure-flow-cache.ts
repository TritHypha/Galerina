// =============================================================================
// Galerina Pure Flow Memoization Cache
//
// Pure flows with EffectCheckerFlags.EffectFree are deterministic:
// same inputs → same output, always. Cache them.
//
// LRU eviction: max 1000 entries. Least-recently-used entries are evicted
// when the cache is full.
//
// Cache key: flowName + ":" + canonicalHash(args) — stable across calls
// Cache invalidation: explicit clear on source change (uses sourceHash)
// =============================================================================

import { createHash } from "node:crypto";
import type { GalerinaValue } from "./interpreter.js";
import { productArtifactKey, type ProductArtifactContext } from "./product-artifact-identity.js";

const MAX_ENTRIES = 1000;

// LRU doubly-linked list node
interface LRUNode {
  key:   string;
  exact: string;
  value: GalerinaValue;
  prev:  LRUNode | null;
  next:  LRUNode | null;
}

class LRUCache {
  private map    = new Map<string, LRUNode>();
  private head:  LRUNode = { key: "", exact: "", value: {} as GalerinaValue, prev: null, next: null };
  private tail:  LRUNode = { key: "", exact: "", value: {} as GalerinaValue, prev: null, next: null };
  private hits   = 0;
  private misses = 0;
  private evictions = 0;

  constructor() {
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: string, exact: string): GalerinaValue | undefined {
    const node = this.map.get(key);
    if (node === undefined) { this.misses++; return undefined; }
    if (exact.length > 0 && node.exact.length > 0 && node.exact !== exact) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.moveToFront(node);
    return ownGalerinaValue(node.value);
  }

  set(key: string, value: GalerinaValue, exact: string): void {
    const owned = ownGalerinaValue(value);
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = owned;
      existing.exact = exact;
      this.moveToFront(existing);
      return;
    }
    const node: LRUNode = { key, exact, value: owned, prev: null, next: null };
    this.map.set(key, node);
    this.addToFront(node);
    if (this.map.size > MAX_ENTRIES) { this.evictLast(); this.evictions++; }
  }

  clear(): void { this.map.clear(); this.head.next = this.tail; this.tail.prev = this.head; }

  get stats() { return { size: this.map.size, hits: this.hits, misses: this.misses, evictions: this.evictions, hitRate: this.hits / Math.max(1, this.hits + this.misses) }; }

  private moveToFront(node: LRUNode): void { this.removeNode(node); this.addToFront(node); }
  private addToFront(node: LRUNode): void {
    node.prev = this.head; node.next = this.head.next!;
    this.head.next!.prev = node; this.head.next = node;
  }
  private removeNode(node: LRUNode): void {
    node.prev!.next = node.next; node.next!.prev = node.prev;
  }
  private evictLast(): void {
    const last = this.tail.prev!;
    if (last === this.head) return;
    this.removeNode(last); this.map.delete(last.key);
  }
}

// Session-scoped cache — lives for the lifetime of the process
const SESSION_CACHE = new LRUCache();

// ---------------------------------------------------------------------------
// FNV-1a structural fingerprint — O(1) cache-key derivation for GalerinaValue
//
// FNV-1a (32-bit) over the discriminant tag bytes + the numeric payload.
// Not a cryptographic hash — not used for security. Used only for the LRU
// cache key where:
//   • collisions are harmless (a false hit → wrong cached value → incorrect
//     result — impossible because same tag+payload is structural equality
//     for the simple variants that dominate the hot path).
//   • speed is critical (called on every memoised pure-flow lookup).
//
// Tag encoding: each __tag char contributes one FNV round.
// Payload encoding:
//   int/byte       — value as an integer FNV round.
//   int64/uint64   — low 32 bits XOR high 32 bits.
//   float/decimal  — string-of-value contributes per-char rounds.
//   bool/verdict   — numeric literal round.
//   string/secure  — per-char rounds.
//   char           — single-char round.
//   bytes          — per-byte rounds.
//   void/none      — no payload (tag alone).
//   record/list/
//   some/ok/err    — XOR child fingerprints (order-insensitive for record,
//                    order-sensitive for list).
//   others         — string rounds on toString representation.
//
// The 32-bit output is widened to a JS number (safe integer range).
// ---------------------------------------------------------------------------

const FNV_PRIME   = 0x01000193; // 16777619
const FNV_OFFSET  = 0x811c9dc5; // 2166136261

/** Compute one FNV-1a round for a single byte value (0–255). */
function fnvByte(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
}

/** Mix a non-negative integer into the FNV-1a accumulator. */
function fnvInt(hash: number, n: number): number {
  hash = fnvByte(hash, n & 0xff);
  hash = fnvByte(hash, (n >>> 8)  & 0xff);
  hash = fnvByte(hash, (n >>> 16) & 0xff);
  hash = fnvByte(hash, (n >>> 24) & 0xff);
  return hash;
}

/** Mix a string into the FNV-1a accumulator (UTF-16 code units). */
function fnvStr(hash: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    hash = fnvByte(hash, s.charCodeAt(i) & 0xff);
    hash = fnvByte(hash, (s.charCodeAt(i) >>> 8) & 0xff);
  }
  return hash;
}

/**
 * Compute an FNV-1a structural fingerprint for a GalerinaValue.
 *
 * Returns a 32-bit unsigned integer as a JS number. Identical inputs always
 * produce the same output. Distinct strings can collide; cache identity uses
 * exact encodings, not this fingerprint.
 */
export function galerinaValueFingerprint(v: GalerinaValue): number {
  // Seed each variant with the FNV offset XOR the tag's first char code so
  // distinct empty variants (void, none) never collide.
  let h = fnvStr(FNV_OFFSET, v.__tag);
  switch (v.__tag) {
    case "int":    return fnvInt(h, v.value);
    case "byte":   return fnvInt(h, v.value);
    case "bool":   return fnvInt(h, v.value ? 1 : 0);
    case "verdict":return fnvInt(h, v.value + 1); // shift -1→0, 0→1, 1→2
    case "char":   return fnvStr(h, v.value);
    case "string": return fnvStr(h, v.value);
    case "secure": return fnvStr(h, v.value);
    case "decimal":return fnvStr(h, v.value);
    case "float":  return fnvStr(h, String(v.value));
    case "int64":
    case "uint64": {
      const lo = Number(v.value & BigInt(0xffffffff));
      const hi = Number((v.value >> BigInt(32)) & BigInt(0xffffffff));
      return fnvInt(fnvInt(h, lo), hi);
    }
    case "bytes": {
      for (let i = 0; i < v.value.length; i++) h = fnvByte(h, v.value[i]!);
      return h;
    }
    case "void":
    case "none":
      return h; // tag alone
    case "some":
    case "ok":
      return fnvInt(h, galerinaValueFingerprint(v.value));
    case "err":
      return fnvInt(h, galerinaValueFingerprint(v.error));
    case "list": {
      for (const item of v.items) h = fnvInt(h, galerinaValueFingerprint(item));
      return h;
    }
    case "record": {
      // Records are structurally unordered — XOR the per-field fingerprints.
      let xor = 0;
      for (const [k, fv] of v.fields) {
        xor ^= fnvInt(fnvStr(FNV_OFFSET, k), galerinaValueFingerprint(fv));
      }
      return fnvInt(h, xor);
    }
    case "protected":
    case "redacted":
    case "unresolved":
    case "runtimeError":
    case "error":
    case "function":
      return fnvStr(h, String("value" in v ? v.value : "name" in v ? v.name : "message" in v ? v.message : ""));
    default:
      // Exhaustive fallback — should never reach here for known tags.
      return h;
  }
}

/**
 * Build a stable cache key for a pure flow call.
 * @param flowName   Name of the flow (e.g. "main")
 * @param args       Flow arguments
 * @param sourceTag  Optional tag that scopes the cache to a specific source context
 *                   (e.g. the source file path or source hash). Prevents cross-file
 *                   pollution when multiple files have a flow named "main".
 */
const MAX_EXACT_BYTES = 65_536;
const MAX_EXACT_DEPTH = 32;
const MAX_EXACT_NODES = 4_096;

export function admitPureFlowSourceTag(sourceTag: string | undefined | null): string {
  if (
    typeof sourceTag !== "string" ||
    sourceTag.length === 0 ||
    sourceTag.length > 256 ||
    sourceTag.includes("\0")
  ) {
    throw new Error("FUNGI-CACHE-001: pure-flow cache requires a non-empty source identity");
  }
  return sourceTag;
}

export function composeSourceBoundTag(sourceHash: string, extra: string): string {
  if (extra.length === 0) return sourceHash;
  const tag = `${sourceHash}:${extra}`;
  if (tag.length <= 256) return tag;
  const x = createHash("sha256").update(new TextEncoder().encode(extra)).digest("hex");
  return `${sourceHash}:x:${x}`;
}

function encodeValue(v: GalerinaValue, depth: number, nodes: { n: number }, seen: WeakSet<object>): string | null {
  if (depth > MAX_EXACT_DEPTH || nodes.n >= MAX_EXACT_NODES) return null;
  nodes.n += 1;
  switch (v.__tag) {
    case "int":
      if (!Number.isSafeInteger(v.value)) return null;
      return `I${v.value}`;
    case "byte":
      if (!Number.isInteger(v.value) || v.value < 0 || v.value > 255) return null;
      return `U${v.value}`;
    case "bool":
      return v.value ? "Bt" : "Bf";
    case "verdict":
      return `V${v.value}`;
    case "char":
      return `Y${v.value.length}:${v.value}`;
    case "string":
      return `S${v.value.length}:${v.value}`;
    case "decimal":
      return `D${v.value.length}:${v.value}`;
    case "float": {
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, v.value, false);
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `F${hex}`;
    }
    case "int64":
    case "uint64":
      return `J${v.__tag[0]}${v.value.toString()}`;
    case "bytes": {
      const hex = [...v.value].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `X${v.value.length}:${hex}`;
    }
    case "void":
      return "0";
    case "none":
      return "N";
    case "some":
    case "ok": {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return null;
        seen.add(v);
      }
      const inner = encodeValue(v.value, depth + 1, nodes, seen);
      if (inner === null) return null;
      return `${v.__tag === "some" ? "M" : "K"}${inner}`;
    }
    case "err": {
      if (seen.has(v)) return null;
      seen.add(v);
      const inner = encodeValue(v.error, depth + 1, nodes, seen);
      if (inner === null) return null;
      return `E${inner}`;
    }
    case "list": {
      if (seen.has(v)) return null;
      seen.add(v);
      const items: string[] = [];
      for (const item of v.items) {
        const enc = encodeValue(item, depth + 1, nodes, seen);
        if (enc === null) return null;
        items.push(enc);
      }
      return `L${items.length}:[${items.join(",")}]`;
    }
    case "record": {
      if (seen.has(v)) return null;
      seen.add(v);
      const keys = [...v.fields.keys()].sort();
      const fields: string[] = [];
      for (const k of keys) {
        const fv = v.fields.get(k);
        if (fv === undefined) return null;
        const enc = encodeValue(fv, depth + 1, nodes, seen);
        if (enc === null) return null;
        fields.push(`${k.length}:${k}=${enc}`);
      }
      return `R${fields.length}:{${fields.join(",")}}`;
    }
    case "secure":
    case "protected":
    case "redacted":
    case "unresolved":
    case "function":
    case "runtimeError":
    case "error":
      return null;
    default:
      return null;
  }
}

export function encodePureFlowArgs(args: ReadonlyMap<string, GalerinaValue>): string | null {
  const nodes = { n: 0 };
  const seen = new WeakSet<object>();
  const keys = [...args.keys()].sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = args.get(k);
    if (v === undefined) return null;
    const enc = encodeValue(v, 0, nodes, seen);
    if (enc === null) return null;
    parts.push(`${k.length}:${k}=${enc}`);
  }
  const exact = parts.join(";");
  if (new TextEncoder().encode(exact).byteLength > MAX_EXACT_BYTES) return null;
  return exact;
}

function ownGalerinaValue(v: GalerinaValue): GalerinaValue {
  switch (v.__tag) {
    case "int":
    case "byte":
    case "bool":
    case "verdict":
    case "char":
    case "string":
    case "decimal":
    case "float":
    case "int64":
    case "uint64":
      return { ...v };
    case "bytes":
      return { __tag: "bytes", value: Uint8Array.from(v.value) };
    case "void":
      return { __tag: "void" };
    case "none":
      return { __tag: "none" };
    case "some":
      return { __tag: "some", value: ownGalerinaValue(v.value) };
    case "ok":
      return { __tag: "ok", value: ownGalerinaValue(v.value) };
    case "err":
      return { __tag: "err", error: ownGalerinaValue(v.error) };
    case "list":
      return { __tag: "list", items: Object.freeze(v.items.map(ownGalerinaValue)) };
    case "record": {
      const fields = new Map<string, GalerinaValue>();
      for (const [k, fv] of v.fields) fields.set(k, ownGalerinaValue(fv));
      return { __tag: "record", fields };
    }
    default:
      return { ...v };
  }
}

export interface PureFlowCacheIdentity {
  readonly key: string;
  readonly exact: string;
}

export function admitPureFlowCacheIdentity(
  context: ProductArtifactContext,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag: string,
): PureFlowCacheIdentity | null {
  const admitted = admitPureFlowSourceTag(sourceTag);
  const exact = encodePureFlowArgs(args);
  if (exact === null) return null;
  const digest = "sha256:" + createHash("sha256")
    .update(new TextEncoder().encode(`${flowName}\n${admitted}\n${exact}`))
    .digest("hex");
  return { key: `${productArtifactKey(context, digest)}:${flowName}`, exact };
}

export function pureFlowCacheKey(
  context: ProductArtifactContext,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag: string,
): string {
  const identity = admitPureFlowCacheIdentity(context, flowName, args, sourceTag);
  if (identity === null) {
    throw new Error("FUNGI-CACHE-002: arguments are not cache-eligible");
  }
  return identity.key;
}

export function getCachedPureFlow(key: string, exact = ""): GalerinaValue | undefined {
  return SESSION_CACHE.get(key, exact);
}

/**
 * Set a cached pure-flow result.
 *
 * Phase 33 security: The cache is process-wide. PII-touching flows MUST NOT
 * be cached — a result from user A could be served to user B if they send
 * the same arguments. The caller is responsible for checking PII status before
 * calling this function.
 *
 * Flows that have `ContainsPII` in their GovernanceFlags, or whose declared
 * effects include `pii.*` / `phi.*`, should set `noCache: true` in their
 * runtimeOptions and never reach this function.
 *
 * @param key   - Cache key from pureFlowCacheKey()
 * @param value - The deterministic result to cache
 */
export function setCachedPureFlow(key: string, value: GalerinaValue, exact = ""): void {
  // Guard: never cache error results (they may contain internal state info)
  if (value.__tag === "runtimeError" || value.__tag === "error") return;
  SESSION_CACHE.set(key, value, exact);
}

export function clearPureFlowCache(): void {
  SESSION_CACHE.clear();
}

export function getPureFlowCacheStats() {
  return SESSION_CACHE.stats;
}
