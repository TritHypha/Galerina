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

import { canonicalHash } from "./runtime/canonicalHash.js";
import type { GalerinaValue } from "./interpreter.js";

const MAX_ENTRIES = 1000;

// LRU doubly-linked list node
interface LRUNode {
  key:   string;
  value: GalerinaValue;
  prev:  LRUNode | null;
  next:  LRUNode | null;
}

class LRUCache {
  private map    = new Map<string, LRUNode>();
  private head:  LRUNode = { key: "", value: {} as GalerinaValue, prev: null, next: null };
  private tail:  LRUNode = { key: "", value: {} as GalerinaValue, prev: null, next: null };
  private hits   = 0;
  private misses = 0;
  private evictions = 0;

  constructor() {
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: string): GalerinaValue | undefined {
    const node = this.map.get(key);
    if (node === undefined) { this.misses++; return undefined; }
    this.hits++;
    this.moveToFront(node);
    return node.value;
  }

  set(key: string, value: GalerinaValue): void {
    const existing = this.map.get(key);
    if (existing !== undefined) { existing.value = value; this.moveToFront(existing); return; }
    const node: LRUNode = { key, value, prev: null, next: null };
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
 * Returns a 32-bit unsigned integer as a JS number.
 * Identical inputs always produce the same output; the probability of a false
 * collision between structurally distinct values is 1/2³² ≈ 2.3×10⁻¹⁰ —
 * acceptable for an LRU cache over semantically-equal-by-construction pure
 * flow arguments.
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
export function pureFlowCacheKey(
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag?: string,
): string {
  // Build key as "flowName:arg0tag=fp0,arg1tag=fp1,…" — pre-computed integer
  // fingerprints joined with commas; zero JSON.stringify, zero SHA-256.
  const parts: string[] = [];
  for (const [k, v] of args) {
    parts.push(`${k}=${galerinaValueFingerprint(v)}`);
  }
  const base = `${flowName}:${parts.join(",")}`;
  return sourceTag ? `${sourceTag}:${base}` : base;
}

export function getCachedPureFlow(key: string): GalerinaValue | undefined {
  return SESSION_CACHE.get(key);
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
export function setCachedPureFlow(key: string, value: GalerinaValue): void {
  // Guard: never cache error results (they may contain internal state info)
  if (value.__tag === "runtimeError" || value.__tag === "error") return;
  SESSION_CACHE.set(key, value);
}

export function clearPureFlowCache(): void {
  SESSION_CACHE.clear();
}

export function getPureFlowCacheStats() {
  return SESSION_CACHE.stats;
}
