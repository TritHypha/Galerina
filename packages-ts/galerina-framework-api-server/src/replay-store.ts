import type {
  AtomicAdmissionStore,
  AtomicClaimResult,
  ReplayStore,
} from "../../galerina-core-network/dist/index.js";

export interface MemoryReplayStoreOptions {
  /** Injectable for deterministic tests; production defaults to Date.now. */
  readonly now?: () => number;
  /** Fail-closed ceiling on live (unexpired) keys across has/put and scoped claims. */
  readonly maxEntries?: number;
  /** Fail-closed ceiling on a single claim/has key's UTF-8 byte length. */
  readonly maxKeyBytes?: number;
}

/**
 * Small process-local ReplayStore adapter for the API-server scaffold.
 *
 * It is deliberately not a durability or multi-process replay authority. The
 * API pipeline must still decide when to call it and must fail closed if an
 * operation throws.
 */
const DEFAULT_MAX_ENTRIES = 4_096;
const DEFAULT_MAX_KEY_BYTES = 256;
const PROCESS_LOCAL_REPLAY_STORES = new WeakSet<object>();
const ADMITTED_DURABLE_REPLAY_STORES = new WeakSet<object>();

/** True when the store is the process-local MemoryReplayStore (not durable). */
export function isProcessLocalReplayStore(store: object): boolean {
  return PROCESS_LOCAL_REPLAY_STORES.has(store);
}

/**
 * Positive durability admit-list. Empty until an owner-admitted durable backend
 * exists. Unknown adapters, wrappers, and MemoryReplayStore are not admitted.
 */
export function isAdmittedDurableReplayStore(store: object): boolean {
  return ADMITTED_DURABLE_REPLAY_STORES.has(store);
}

export class MemoryReplayStore implements ReplayStore, AtomicAdmissionStore {
  readonly #now: () => number;
  readonly #maxEntries: number;
  readonly #maxKeyBytes: number;
  readonly #entries = new Map<string, number>();
  // Keep scope and key separate; both are arbitrary strings and delimiter
  // concatenation would make distinct claims collide.
  readonly #claims = new Map<string, Map<string, number>>();

  public constructor(options: MemoryReplayStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#maxKeyBytes = options.maxKeyBytes ?? DEFAULT_MAX_KEY_BYTES;
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new RangeError("ReplayStore maxEntries must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.#maxKeyBytes) || this.#maxKeyBytes < 1) {
      throw new RangeError("ReplayStore maxKeyBytes must be a positive safe integer");
    }
    PROCESS_LOCAL_REPLAY_STORES.add(this);
  }

  public has(key: string): boolean {
    this.#assertKey(key);
    const now = this.#readNow();
    const expiresAtMs = this.#entries.get(key);
    if (expiresAtMs === undefined) return false;
    if (now >= expiresAtMs) {
      this.#entries.delete(key);
      return false;
    }
    return true;
  }

  public claim(scope: string, key: string, ttlSeconds: number): AtomicClaimResult {
    if (typeof scope !== "string" || scope.trim().length === 0) {
      throw new TypeError("ReplayStore scope must be a non-empty string");
    }
    this.#assertKey(key);
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError("ReplayStore TTL must be a positive finite number of seconds");
    }
    const now = this.#readNow();
    const scopeEntries = this.#claims.get(scope);
    const expiresAtMs = scopeEntries?.get(key);
    if (expiresAtMs !== undefined && now < expiresAtMs) return "duplicate";
    const nextExpiry = now + ttlSeconds * 1000;
    if (!Number.isFinite(nextExpiry)) {
      throw new RangeError("ReplayStore expiry is outside the finite clock range");
    }
    this.#admitCapacity(expiresAtMs !== undefined);
    // pruneExpired may delete an empty scope map; re-resolve after admission.
    (this.#claims.get(scope) ?? this.#newScope(scope)).set(key, nextExpiry);
    return "claimed";
  }

  public put(key: string, ttlSeconds: number): void {
    this.#assertKey(key);
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new RangeError("ReplayStore TTL must be a positive finite number of seconds");
    }
    const now = this.#readNow();
    const expiresAtMs = now + ttlSeconds * 1000;
    if (!Number.isFinite(expiresAtMs)) {
      throw new RangeError("ReplayStore expiry is outside the finite clock range");
    }
    this.#admitCapacity(this.#entries.has(key));
    this.#entries.set(key, expiresAtMs);
  }

  /** Remove all expired entries using the same validated clock as has/put. */
  public pruneExpired(): void {
    const now = this.#readNow();
    for (const [key, expiresAtMs] of this.#entries) {
      if (now >= expiresAtMs) this.#entries.delete(key);
    }
    for (const [scope, entries] of this.#claims) {
      for (const [key, expiresAtMs] of entries) {
        if (now >= expiresAtMs) entries.delete(key);
      }
      if (entries.size === 0) this.#claims.delete(scope);
    }
  }

  #assertKey(key: string): void {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new TypeError("ReplayStore key must be a non-empty string");
    }
    const bytes = Buffer.byteLength(key, "utf8");
    if (bytes > this.#maxKeyBytes) {
      throw new RangeError("ReplayStore key exceeds the admitted byte ceiling");
    }
  }

  #liveCount(): number {
    let n = this.#entries.size;
    for (const entries of this.#claims.values()) n += entries.size;
    return n;
  }

  #admitCapacity(replacing: boolean): void {
    if (replacing) return;
    if (this.#liveCount() < this.#maxEntries) return;
    this.pruneExpired();
    if (this.#liveCount() >= this.#maxEntries) {
      throw new RangeError("ReplayStore capacity reached");
    }
  }

  #newScope(scope: string): Map<string, number> {
    const entries = new Map<string, number>();
    this.#claims.set(scope, entries);
    return entries;
  }

  #readNow(): number {
    const now = this.#now();
    if (!Number.isFinite(now)) {
      throw new RangeError("ReplayStore clock must return a finite number");
    }
    return now;
  }
}
