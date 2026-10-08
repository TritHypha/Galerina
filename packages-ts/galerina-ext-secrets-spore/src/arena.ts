// arena.ts — the SealTaint arena + source-agnostic zero-wiped store (Part 4 discipline).
//
// Mirrors the @galerina/ext-secrets-vault SecretsRotationManager zero-wipe + atomic-swap
// discipline (rotation-manager.ts:45-49 replace-wipe, :90-95 stage->swap->wipe,
// :108-110 fail-closed getActive, :212-220 dispose), but is SOURCE-AGNOSTIC: it holds
// raw plaintext Buffers fed from the env.spore decrypt path — it does NOT import VaultClient
// or do any HTTP. This is the "store + swap + wipe + fail-closed" pattern reuse the design
// doc calls for, NOT a drop-in of the Vault-coupled manager.
//
// HARD invariants enforced here (not just documented):
//   - every plaintext value lives ONLY in an arena Buffer; callers never get a long-lived ref
//   - zero-wipe on replace / remove / dispose / error
//   - a faulted entry is NEVER served (fail-closed)
//   - best-effort mlock against swap where the platform allows (see mlock.ts)
import { tryMlock } from "./mlock.js";
import { copyBytes, wipeBytes } from "./wipe.js";

interface ArenaEntry {
  value: Buffer;            // plaintext, zero-wiped on replace/remove/dispose
  staging: Buffer | null;  // for atomic-swap rotation; zero-wiped after swap
  faulted: boolean;        // a faulted entry fails closed (never served)
}

function stageSecretCopy(source: Uint8Array): Buffer {
  const staged = Buffer.alloc(source.length);
  try {
    copyBytes(staged, source);
    tryMlock(staged);
    return staged;
  } catch (error) {
    wipeBytes(staged);
    throw error;
  }
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
    const buf = stageSecretCopy(value);
    const existing = this.entries.get(name);
    if (existing !== undefined) {
      wipeBytes(existing.value);                     // rotation-manager.ts:45-49 replace-wipe
      if (existing.staging !== null) wipeBytes(existing.staging);
    }
    this.entries.set(name, { value: buf, staging: null, faulted: false });
  }

  /**
   * Run `fn` with an owned transient copy of the plaintext. The live arena
   * buffer is never exposed. The transient is wiped on every exit, callback
   * return values are forbidden, and asynchronous callbacks are refused.
   */
  use(name: string, fn: (value: Buffer) => void): void {
    this.assertLive();
    const e = this.entries.get(name);
    if (e === undefined || e.faulted) return undefined; // rotation-manager.ts:108-110
    const transient = stageSecretCopy(e.value);
    try {
      const result: unknown = (fn as (value: Buffer) => unknown)(transient);
      if (result !== undefined) {
        throw new Error("SealArena: callback return/async escape channel is forbidden");
      }
    } finally {
      wipeBytes(transient);
    }
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
   * minus the network fetch + 50ms quiesce — env.spore re-seal is synchronous in-arena).
   * stage -> swap -> zero-wipe old buffer.
   */
  rotateValue(name: string, newValue: Uint8Array): void {
    this.assertLive();
    const e = this.entries.get(name);
    if (e === undefined) { this.put(name, newValue); return; }
    const staging = stageSecretCopy(newValue);
    e.staging = staging;
    const old = e.value;          // atomic swap (JS single-threaded; no lock needed)
    e.value = e.staging;
    e.staging = null;
    wipeBytes(old);               // rotation-manager.ts:95 zero-wipe stale
    e.faulted = false;
  }

  /** Mark an entry faulted (fail-closed) and wipe its plaintext. */
  fault(name: string): void {
    const e = this.entries.get(name);
    if (e === undefined) return;
    wipeBytes(e.value);
    if (e.staging !== null) { wipeBytes(e.staging); e.staging = null; }
    e.faulted = true;
  }

  /** Zero-wipe + remove a single entry. */
  remove(name: string): void {
    const e = this.entries.get(name);
    if (e === undefined) return;
    wipeBytes(e.value);
    if (e.staging !== null) wipeBytes(e.staging);
    this.entries.delete(name);
  }

  /** Zero-wipe ALL entries and clear (rotation-manager.ts:212-220 dispose). Idempotent. */
  dispose(): void {
    for (const e of this.entries.values()) {
      wipeBytes(e.value);
      if (e.staging !== null) wipeBytes(e.staging);
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
  const buf = stageSecretCopy(plain);
  try {
    return fn(buf);
  } finally {
    wipeBytes(buf); // zero-wipe on every path (success / error)
  }
}
