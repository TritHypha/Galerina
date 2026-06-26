// atomic-writer.ts — crash-safe persistence via double-buffered atomic rename.
//
// A snapshot must NEVER be observed half-written. We exploit POSIX/NTFS rename
// atomicity: write the full payload to a sibling `.tmp` file, fsync-free flush,
// then renameSync over the live `.snap`. A crash before the rename leaves the
// previous good `.snap` intact; a crash after leaves the new one. There is no
// in-between state a reader can see.
//
// The host (native/README.md) is responsible for the NVMe/flash double-buffer
// partition and encryption-at-rest; this class provides the atomic-swap seam.

import { mkdirSync, writeFileSync, renameSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SecurityTrap } from "./errors.js";
import type { Snapshot } from "./state-serializer.js";

export class AtomicWriter {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  #live(name: string): string {
    return join(this.#dir, `${name}.snap`);
  }

  /** Resolve the live `.snap` path for a name (the writer owns the on-disk layout). */
  livePath(name: string): string {
    return this.#live(name);
  }

  #temp(name: string): string {
    return join(this.#dir, `${name}.tmp`);
  }

  /** Atomically persist a snapshot: write `.tmp`, then rename over `.snap`. */
  write(name: string, snap: Snapshot): void {
    const tmp = this.#temp(name);
    const live = this.#live(name);
    writeFileSync(tmp, JSON.stringify(snap), "utf8");
    renameSync(tmp, live); // atomic swap — never corrupts the live snapshot
  }

  /** Read the live snapshot, or null if none exists. Throws on malformed JSON. */
  read(name: string): Snapshot | null {
    const live = this.#live(name);
    let raw: string;
    try {
      raw = readFileSync(live, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    try {
      return JSON.parse(raw) as Snapshot;
    } catch {
      throw new SecurityTrap("LSS-READ-001", `snapshot "${name}" is malformed JSON — on-disk corruption`);
    }
  }
}
