import type { ReplayStore } from "../../galerina-core-network/dist/index.js";

export interface MemoryReplayStoreOptions {
  /** Injectable for deterministic tests; production defaults to Date.now. */
  readonly now?: () => number;
}

/**
 * Small process-local ReplayStore adapter for the API-server scaffold.
 *
 * It is deliberately not a durability or multi-process replay authority. The
 * API pipeline must still decide when to call it and must fail closed if an
 * operation throws.
 */
export class MemoryReplayStore implements ReplayStore {
  readonly #now: () => number;
  readonly #entries = new Map<string, number>();

  public constructor(options: MemoryReplayStoreOptions = {}) {
    this.#now = options.now ?? Date.now;
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
    this.#entries.set(key, expiresAtMs);
  }

  /** Remove all expired entries using the same validated clock as has/put. */
  public pruneExpired(): void {
    const now = this.#readNow();
    for (const [key, expiresAtMs] of this.#entries) {
      if (now >= expiresAtMs) this.#entries.delete(key);
    }
  }

  #assertKey(key: string): void {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new TypeError("ReplayStore key must be a non-empty string");
    }
  }

  #readNow(): number {
    const now = this.#now();
    if (!Number.isFinite(now)) {
      throw new RangeError("ReplayStore clock must return a finite number");
    }
    return now;
  }
}
