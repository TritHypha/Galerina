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

import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { SecurityTrap } from "./errors.js";
import type { Snapshot } from "./state-serializer.js";

const SNAPSHOT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_SNAPSHOT_BYTES = 1_048_576;

function admitSnapshotName(name: string): string {
  if (typeof name !== "string" || !SNAPSHOT_NAME.test(name) || name.includes("..")) {
    throw new SecurityTrap("LSS-NAME-001", `snapshot name '${name}' is not an admitted filename`);
  }
  return name;
}

export function refuseSnapshotSpecialFile(
  st: { isSymbolicLink(): boolean; isFile(): boolean; isFIFO?: () => boolean },
  name: string,
): void {
  if (typeof st.isFIFO === "function" && st.isFIFO() === true) {
    throw new SecurityTrap("LSS-FIFO-001", `snapshot "${name}" is a FIFO and is refused`);
  }
  if (st.isSymbolicLink()) {
    throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" path is a link and is refused`);
  }
}

function openFlags(write: boolean): number {
  const base = write ? constants.O_WRONLY : constants.O_RDONLY;
  const nonblock = typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0;
  return base | nonblock;
}

function openSnapshotFd(path: string, write: boolean, name: string): number {
  try {
    return openSync(path, openFlags(write));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENXIO" || code === "EAGAIN" || code === "EWOULDBLOCK") {
      throw new SecurityTrap("LSS-FIFO-001", `snapshot "${name}" is a FIFO and is refused`);
    }
    throw err;
  }
}

function assertContained(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  if (basename(resolved) !== basename(candidate)) {
    throw new SecurityTrap("LSS-NAME-001", "snapshot path is not a single filename");
  }
  const rel = relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || rel.split(sep).includes("..")) {
    throw new SecurityTrap("LSS-NAME-001", "snapshot path escapes the storage directory");
  }
  return resolved;
}

export class AtomicWriter {
  readonly #dir: string;

  constructor(dir: string) {
    this.#dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  #live(name: string): string {
    return assertContained(this.#dir, join(this.#dir, `${admitSnapshotName(name)}.snap`));
  }

  /** Resolve the live `.snap` path for a name (the writer owns the on-disk layout). */
  livePath(name: string): string {
    return this.#live(name);
  }

  #temp(name: string): string {
    return assertContained(this.#dir, join(this.#dir, `${admitSnapshotName(name)}.tmp`));
  }

  /** Atomically persist a snapshot: exclusive `.tmp` create, then rename over `.snap`. */
  write(name: string, snap: Snapshot): void {
    const tmp = this.#temp(name);
    const live = this.#live(name);
    const payload = JSON.stringify(snap);
    if (Buffer.byteLength(payload, "utf8") > MAX_SNAPSHOT_BYTES) {
      throw new SecurityTrap("LSS-READ-002", `snapshot "${name}" exceeds the admitted size ceiling`);
    }
    this.#refuseLink(tmp, name);
    this.#refuseLink(live, name);
    try {
      unlinkSync(tmp);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const fd = openSync(tmp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      writeSync(fd, payload, undefined, "utf8");
    } finally {
      closeSync(fd);
    }
    this.#refuseLink(live, name);
    renameSync(tmp, live);
  }

  /** Read the live snapshot, or null if none exists. Throws on malformed JSON. */
  read(name: string): Snapshot | null {
    const live = this.#live(name);
    let raw: string;
    try {
      const st = lstatSync(live);
      refuseSnapshotSpecialFile(st, name);
      if (!st.isFile() || st.size > MAX_SNAPSHOT_BYTES) {
        throw new SecurityTrap("LSS-READ-002", `snapshot "${name}" exceeds the admitted size ceiling`);
      }
      const fd = openSnapshotFd(live, false, name);
      try {
        const opened = fstatSync(fd);
        refuseSnapshotSpecialFile(opened, name);
        if (!opened.isFile() || opened.size > MAX_SNAPSHOT_BYTES) {
          throw new SecurityTrap("LSS-READ-002", `snapshot "${name}" exceeds the admitted size ceiling`);
        }
        if (opened.ino !== st.ino || opened.dev !== st.dev || opened.size !== st.size || opened.size > MAX_SNAPSHOT_BYTES) {
          throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" identity changed before read`);
        }
        const buf = Buffer.alloc(opened.size);
        const n = readSync(fd, buf, 0, opened.size, 0);
        raw = buf.subarray(0, n).toString("utf8");
      } finally {
        closeSync(fd);
      }
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

  /** Zero-overwrite then unlink live `.snap` and sibling `.tmp`. No-op if both absent. Refuses links. */
  scrub(name: string): void {
    this.#zeroUnlinkIfPresent(this.#temp(name), name);
    this.#zeroUnlinkIfPresent(this.#live(name), name);
  }

  #zeroUnlinkIfPresent(path: string, name: string): void {
    let st;
    try {
      st = lstatSync(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    refuseSnapshotSpecialFile(st, name);
    if (!st.isFile()) {
      throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" is not a regular file and cannot be scrubbed`);
    }
    if (st.size > MAX_SNAPSHOT_BYTES) {
      throw new SecurityTrap("LSS-READ-002", `snapshot "${name}" exceeds the admitted size ceiling`);
    }
    const fd = openSnapshotFd(path, true, name);
    try {
      const opened = fstatSync(fd);
      refuseSnapshotSpecialFile(opened, name);
      if (!opened.isFile()) {
        throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" is not a regular file and cannot be scrubbed`);
      }
      if (opened.ino !== st.ino || opened.dev !== st.dev || opened.size !== st.size) {
        throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" identity changed before scrub`);
      }
      writeSync(fd, Buffer.alloc(opened.size, 0));
    } finally {
      closeSync(fd);
    }
    const after = lstatSync(path);
    if (after.ino !== st.ino || after.dev !== st.dev) {
      throw new SecurityTrap("LSS-LINK-001", `snapshot "${name}" identity changed before unlink`);
    }
    unlinkSync(path);
  }

  #refuseLink(path: string, name: string): void {
    try {
      const st = lstatSync(path);
      refuseSnapshotSpecialFile(st, name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }
}
