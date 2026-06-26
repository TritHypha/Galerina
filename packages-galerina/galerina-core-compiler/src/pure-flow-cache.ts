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

/**
 * Build a stable cache key for a pure flow call.
 * Key: flowName + ":" + hash(args) — identical args → identical key.
 */
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
  const argsObj: Record<string, unknown> = {};
  for (const [k, v] of args) argsObj[k] = v;
  const base = `${flowName}:${canonicalHash(argsObj)}`;
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
