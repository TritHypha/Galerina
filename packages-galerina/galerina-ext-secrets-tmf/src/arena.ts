// arena.ts — the SealTaint arena + source-agnostic zero-wiped store (Part 4 discipline).
//
// Mirrors the @galerina/ext-secrets-vault SecretsRotationManager zero-wipe + atomic-swap
// discipline (rotation-manager.ts:45-49 replace-wipe, :90-95 stage->swap->wipe,
// :108-110 fail-closed getActive, :212-220 dispose), but is SOURCE-AGNOSTIC: it holds
// raw plaintext Buffers fed from the env.tmf decrypt path — it does NOT import VaultClient
// or do any HTTP. This is the "store + swap + wipe + fail-closed" pattern reuse the design
// doc calls for, NOT a drop-in of the Vault-coupled manager.
//
// HARD invariants enforced here (not just documented):
//   - every plaintext value lives ONLY in an arena Buffer; callers never get a long-lived ref
//   - zero-wipe on replace / remove / dispose / error
//   - a faulted entry is NEVER served (fail-closed)
//   - best-effort mlock against swap where the platform allows (see mlock.ts)
import { tryMlock } from "./mlock.js";

interface ArenaEntry {
  value: Buffer;            // plaintext, zero-wiped on replace/remove/dispose
  staging: Buffer | null;  // for atomic-swap rotation; zero-wiped after swap
  faulted: boolean;        // a faulted entry fails closed (never served)
}

/**
 * In-memory, zero-wiped, fail-closed store for decrypted secret VALUES.
 * Keyed by the secret name (the name only ever lives in RAM here, never on the
 * cleartext section table — see schema.coordForName).
 */
export class SealArena {
  private readonly entries = new Map<string, ArenaEntry>();
  private disposed = false;

  /** Copy `value` into a fresh arena Buffer, mlock it, wipe nothing of the caller's, store it. */
  put(name: string, value: Uint8Array): void {
    this.assertLive();
    const buf = Buffer.alloc(value.length);
    buf.set(value);
    tryMlock(buf);
    const existing = this.entries.get(name);
    if (existing !== undefined) {
      existing.value.fill(0);                       // rotation-manager.ts:45-49 replace-wipe
      if (existing.staging !== null) existing.staging.fill(0);
    }
    this.entries.set(name, { value: buf, staging: null, faulted: false });
  }

  /**
   * Run `fn` with a short-lived view of the plaintext. Fail-closed: a faulted or missing
   * entry yields undefined and `fn` is never called. The arena buffer stays live for the
   * session; no plaintext escapes except through the explicit `fn` return value.
   */
  use<T>(name: string, fn: (value: Buffer) => T): T | undefined {
    this.assertLive();
    const e = this.entries.get(name);
    if (e === undefined || e.faulted) return undefined; // rotation-manager.ts:108-110
    return fn(e.value);
  }

  /** True if a (non-faulted) value is present. */
  has(name: string): boolean {
    const e = this.entries.get(name);
    return e !== undefined && !e.faulted;
  }

  /** Names currently held (for `list` — values are never exposed). */
  names(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Atomic-swap rotation of a single value (rotation-manager.ts:84-95 choreography,
   * minus the network fetch + 50ms quiesce — env.tmf re-seal is synchronous in-arena).
   * stage -> swap -> zero-wipe old buffer.
   */
  rotateValue(name: string, newValue: Uint8Array): void {
    this.assertLive();
    const e = this.entries.get(name);
    if (e === undefined) { this.put(name, newValue); return; }
    const staging = Buffer.alloc(newValue.length);
    staging.set(newValue);
    tryMlock(staging);
    e.staging = staging;
    const old = e.value;          // atomic swap (JS single-threaded; no lock needed)
    e.value = e.staging;
    e.staging = null;
    old.fill(0);                  // rotation-manager.ts:95 zero-wipe stale
    e.faulted = false;
  }

  /** Mark an entry faulted (fail-closed) and wipe its plaintext. */
  fault(name: string): void {
    const e = this.entries.get(name);
    if (e === undefined) return;
    e.value.fill(0);
    if (e.staging !== null) { e.staging.fill(0); e.staging = null; }
    e.faulted = true;
  }

  /** Zero-wipe + remove a single entry. */
  remove(name: string): void {
    const e = this.entries.get(name);
    if (e === undefined) return;
    e.value.fill(0);
    if (e.staging !== null) e.staging.fill(0);
    this.entries.delete(name);
  }

  /** Zero-wipe ALL entries and clear (rotation-manager.ts:212-220 dispose). Idempotent. */
  dispose(): void {
    for (const e of this.entries.values()) {
      e.value.fill(0);
      if (e.staging !== null) e.staging.fill(0);
    }
    this.entries.clear();
    this.disposed = true;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error("SealArena: use-after-dispose (fail-closed)");
  }
}

/**
 * Run a function with a transient plaintext Buffer that is GUARANTEED zero-wiped
 * afterwards, even on throw. This is the primitive the decrypt path uses for values
 * that must NOT persist in the arena (e.g. `get` piping to stdout, a re-seal source).
 */
export function withWiped<T>(plain: Uint8Array, fn: (b: Buffer) => T): T {
  const buf = Buffer.alloc(plain.length);
  buf.set(plain);
  tryMlock(buf);
  try {
    return fn(buf);
  } finally {
    buf.fill(0); // zero-wipe on every path (success / error)
  }
}
