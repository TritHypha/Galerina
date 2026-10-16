/**
 * SecretArena-backed SecretsProvider. Bytes at rest live in the vok-authority
 * custodian (Linux memfd_secret). Construction refuses on Windows, non-Linux,
 * missing binary, or spawn failure. There is no SealArena fallback.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeSync, readSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM = "ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM";
export const ERR_SECRET_ARENA_QUARANTINED = "ERR_SECRET_ARENA_QUARANTINED";

const intrinsicApply = Reflect.apply;
const intrinsicFill = Uint8Array.prototype.fill;
const intrinsicWriteSync = writeSync;
const intrinsicReadSync = readSync;
const intrinsicNow = performance.now.bind(performance);
const RPC_DEADLINE_MS = 5000;
const MAX_FRAME = 64 * 1024 * 1024 + 1024;
const WASM_PAGE = 65536;
const SIGTERM_GRACE_MS = 100;

function terminateChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    return;
  }
  const timer = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    try {
      child.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, SIGTERM_GRACE_MS);
  child.once("exit", () => {
    clearTimeout(timer);
  });
}

function isAgain(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { readonly code?: unknown }).code;
  return code === "EAGAIN" || code === "EWOULDBLOCK";
}

const OP_PUT = 1;
const OP_HAS = 2;
const OP_GET = 3;
const OP_CLEANUP = 4;
const OP_STATUS = 5;
const OP_EPOCH = 7;

const ST_OK = 0;
const ST_NOT_FOUND = 1;
const ST_QUARANTINED = 2;

function streamFd(stream: { readonly fd?: number } | null | undefined): number | undefined {
  if (stream == null) return undefined;
  if (typeof stream.fd === "number" && stream.fd >= 0) return stream.fd;
  const handle = (stream as { _handle?: { fd?: number } })._handle;
  if (handle && typeof handle.fd === "number" && handle.fd >= 0) return handle.fd;
  return undefined;
}

export class SecretArenaUnavailable extends Error {
  readonly code = ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM;
  constructor(message = "SecretArena is unavailable on this platform") {
    super(message);
    this.name = "SecretArenaUnavailable";
  }
}

export class SecretArenaQuarantined extends Error {
  readonly code = ERR_SECRET_ARENA_QUARANTINED;
  constructor(message = "SecretArena store is quarantined") {
    super(message);
    this.name = "SecretArenaQuarantined";
  }
}

export interface SecretArenaProvider {
  has(name: string): boolean;
  use(name: string, fn: (value: Uint8Array) => void, options?: { signal?: AbortSignal }): void;
  revocationEpoch(): number;
  put(name: string, value: Uint8Array): void;
  dispose(): void;
  status(): { readonly state: "active" | "quarantined" };
}

function defaultCustodianPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(
    here,
    "..",
    "..",
    "galerina-core-runtime",
    "native",
    "vok-authority",
    "target",
    "debug",
    "galerina-secret-arena-custodian",
  );
}

function writeAll(fd: number, buffer: Uint8Array): void {
  const deadline = intrinsicNow() + RPC_DEADLINE_MS;
  let offset = 0;
  while (offset < buffer.length) {
    if (intrinsicNow() > deadline) {
      throw new SecretArenaUnavailable("SecretArena custodian write timed out");
    }
    try {
      const wrote = intrinsicWriteSync(fd, buffer, offset, buffer.length - offset);
      if (typeof wrote !== "number" || wrote <= 0) {
        throw new SecretArenaUnavailable("SecretArena custodian stdin closed");
      }
      offset += wrote;
    } catch (error) {
      if (isAgain(error)) continue;
      throw error;
    }
  }
}

function readExact(fd: number, n: number): Uint8Array {
  const deadline = intrinsicNow() + RPC_DEADLINE_MS;
  const out = new Uint8Array(n);
  let offset = 0;
  try {
    while (offset < n) {
      if (intrinsicNow() > deadline) {
        throw new SecretArenaUnavailable("SecretArena custodian read timed out");
      }
      try {
        const got = intrinsicReadSync(fd, out, offset, n - offset, null);
        if (typeof got !== "number" || got <= 0) {
          throw new SecretArenaUnavailable("SecretArena custodian stdout closed");
        }
        offset += got;
      } catch (error) {
        if (isAgain(error)) continue;
        throw error;
      }
    }
    return out;
  } catch (error) {
    intrinsicApply(intrinsicFill, out, [0]);
    throw error;
  }
}

function encodeName(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  const out = new Uint8Array(2 + encoded.length);
  out[0] = (encoded.length >> 8) & 0xff;
  out[1] = encoded.length & 0xff;
  out.set(encoded, 2);
  return out;
}

function isDetachedBuffer(buffer: ArrayBufferLike): boolean {
  if (!(buffer instanceof ArrayBuffer)) return false;
  const rec = buffer as ArrayBuffer & { readonly detached?: unknown };
  if (typeof rec.detached === "boolean") return rec.detached;
  try {
    void new Uint8Array(buffer);
    return false;
  } catch {
    return true;
  }
}

function allocateNonDetachableSecret(data: Uint8Array): {
  readonly view: Uint8Array;
  readonly buffer: ArrayBuffer;
  wipe(): boolean;
} {
  const pages = Math.max(1, Math.ceil(data.length / WASM_PAGE));
  const memory = new WebAssembly.Memory({ initial: pages });
  const backing = new Uint8Array(memory.buffer);
  try {
    backing.set(data);
  } catch (error) {
    try {
      intrinsicApply(intrinsicFill, backing, [0]);
    } catch {
      // wipe best-effort; the wasm memory is dropped on this path
    }
    throw error;
  }
  const view = backing.subarray(0, data.length);
  return {
    view,
    buffer: memory.buffer,
    wipe(): boolean {
      try {
        intrinsicApply(intrinsicFill, backing.subarray(0, data.length), [0]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

const TRANSFER_FORBIDDEN = "SecretArenaProvider: ArrayBuffer.transfer of a live secret view is forbidden";

function forbidTransferOn(buffer: ArrayBuffer): () => void {
  const restore: Array<() => void> = [];
  const forbid = (): never => {
    throw new Error(TRANSFER_FORBIDDEN);
  };
  for (const name of ["transfer", "transferToFixedLength"] as const) {
    const desc = Object.getOwnPropertyDescriptor(buffer, name);
    try {
      Object.defineProperty(buffer, name, {
        configurable: true,
        writable: true,
        value: forbid,
      });
      restore.push(() => {
        if (desc !== undefined) Object.defineProperty(buffer, name, desc);
        else Reflect.deleteProperty(buffer, name);
      });
    } catch {
      // non-configurable; the prototype wrapper and detached check remain
    }
  }
  return () => {
    for (const undo of restore) {
      try {
        undo();
      } catch {
        // restore best-effort
      }
    }
  };
}

function withTransferForbidden<T>(secretBuffer: ArrayBuffer, fn: () => T): T {
  const proto = ArrayBuffer.prototype as unknown as Record<string, unknown>;
  const names = ["transfer", "transferToFixedLength"] as const;
  const saved: Array<{ name: string; desc: PropertyDescriptor | undefined }> = [];
  for (const name of names) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    saved.push({ name, desc });
    const original = proto[name];
    if (typeof original !== "function") continue;
    const wrapped = function (this: ArrayBuffer, ...args: unknown[]) {
      if (this === secretBuffer) {
        throw new Error(TRANSFER_FORBIDDEN);
      }
      return (original as (...inner: unknown[]) => unknown).apply(this, args);
    };
    try {
      Object.defineProperty(proto, name, {
        configurable: true,
        writable: true,
        value: wrapped,
      });
    } catch {
      // leave original
    }
  }
  try {
    return fn();
  } finally {
    for (const { name, desc } of saved) {
      try {
        if (desc !== undefined) Object.defineProperty(proto, name, desc);
      } catch {
        // restore best-effort
      }
    }
  }
}

export function createSecretArenaProvider(
  options: { readonly binPath?: string } = {},
): SecretArenaProvider {
  if (process.platform !== "linux") {
    throw new SecretArenaUnavailable();
  }
  const binPath = options.binPath ?? defaultCustodianPath();
  if (!existsSync(binPath)) {
    throw new SecretArenaUnavailable("SecretArena custodian binary is unavailable");
  }

  let child: ChildProcess;
  try {
    child = spawn(binPath, [], {
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
    });
  } catch {
    throw new SecretArenaUnavailable("SecretArena custodian spawn failed");
  }
  child.stdout?.pause();
  const stdinFd = streamFd(child.stdin);
  const stdoutFd = streamFd(child.stdout);
  if (typeof stdinFd !== "number" || typeof stdoutFd !== "number" || child.pid === undefined) {
    try {
      terminateChild(child);
    } catch {
      // spawn failed closed
    }
    throw new SecretArenaUnavailable("SecretArena custodian stdio is unavailable");
  }

  let quarantined = false;
  let disposed = false;

  const wipe = (bytes: Uint8Array | undefined): boolean => {
    if (bytes === undefined) return true;
    try {
      intrinsicApply(intrinsicFill, bytes, [0]);
      return true;
    } catch {
      return false;
    }
  };

  const killCustodian = (): void => {
    quarantined = true;
    try {
      child.stdin?.destroy();
    } catch {
      // already closed
    }
    try {
      child.stdout?.destroy();
    } catch {
      // already closed
    }
    try {
      child.stderr?.destroy();
    } catch {
      // already closed
    }
    try {
      terminateChild(child);
    } catch {
      // already exited
    }
  };

  const rpc = (opcode: number, payload: Uint8Array = new Uint8Array(0)): { status: number; data: Uint8Array } => {
    if (disposed) throw new SecretArenaUnavailable("SecretArena custodian is disposed");
    if (quarantined && opcode !== OP_STATUS && opcode !== OP_EPOCH) {
      throw new SecretArenaQuarantined();
    }
    if (1 + payload.length > MAX_FRAME) {
      throw new SecretArenaUnavailable("SecretArena put refused");
    }
    const body = new Uint8Array(1 + payload.length);
    body[0] = opcode;
    body.set(payload, 1);
    const header = new Uint8Array(4);
    const len = body.length;
    header[0] = (len >>> 24) & 0xff;
    header[1] = (len >>> 16) & 0xff;
    header[2] = (len >>> 8) & 0xff;
    header[3] = len & 0xff;
    let respHeader: Uint8Array | undefined;
    let resp: Uint8Array | undefined;
    try {
      writeAll(stdinFd, header);
      writeAll(stdinFd, body);
      respHeader = readExact(stdoutFd, 4);
      const respLen =
        ((respHeader[0] ?? 0) << 24) |
        ((respHeader[1] ?? 0) << 16) |
        ((respHeader[2] ?? 0) << 8) |
        (respHeader[3] ?? 0);
      if (!(respLen > 0) || respLen > MAX_FRAME) {
        throw new SecretArenaUnavailable("SecretArena custodian returned an invalid frame");
      }
      resp = readExact(stdoutFd, respLen);
      const status = resp[0] ?? ST_QUARANTINED;
      const data = Uint8Array.from(resp.subarray(1));
      if (status === ST_QUARANTINED) {
        quarantined = true;
      }
      return { status, data };
    } catch (error) {
      killCustodian();
      throw error;
    } finally {
      wipe(body);
      wipe(header);
      wipe(respHeader);
      wipe(resp);
    }
  };

  try {
    const hello = rpc(OP_STATUS);
    if (hello.status !== ST_OK) {
      throw new SecretArenaUnavailable();
    }
  } catch (error) {
    try {
      terminateChild(child);
    } catch {
      // already dead
    }
    if (error instanceof SecretArenaUnavailable) throw error;
    throw new SecretArenaUnavailable();
  }

  const enterQuarantine = (): never => {
    quarantined = true;
    throw new SecretArenaQuarantined();
  };

  const provider: SecretArenaProvider = {
    has(name: string): boolean {
      if (quarantined) throw new SecretArenaQuarantined();
      const nameBytes = encodeName(name);
      try {
        const { status, data } = rpc(OP_HAS, nameBytes);
        if (status === ST_QUARANTINED) return enterQuarantine();
        if (status !== ST_OK) return false;
        const present = data[0] === 1;
        wipe(data);
        return present;
      } finally {
        wipe(nameBytes);
      }
    },
    use(name: string, fn: (value: Uint8Array) => void, options?: { signal?: AbortSignal }): void {
      if (options?.signal?.aborted) {
        throw new SecretArenaUnavailable("SecretArena use was aborted");
      }
      if (quarantined) throw new SecretArenaQuarantined();
      let slot: ReturnType<typeof allocateNonDetachableSecret> | undefined;
      let restoreTransfer: (() => void) | undefined;
      let detached = false;
      const nameBytes = encodeName(name);
      try {
        const { status, data } = rpc(OP_GET, nameBytes);
        if (status === ST_QUARANTINED) return enterQuarantine();
        if (status === ST_NOT_FOUND) return;
        if (status !== ST_OK) {
          throw new SecretArenaUnavailable("SecretArena get refused");
        }
        if (data.length === 0) {
          wipe(data);
          return;
        }
        try {
          const allocated = allocateNonDetachableSecret(data);
          slot = allocated;
        } catch (error) {
          quarantined = true;
          throw error;
        } finally {
          wipe(data);
        }
        if (slot === undefined) {
          quarantined = true;
          throw new SecretArenaUnavailable("SecretArena get refused");
        }
        const allocated = slot;
        if (options?.signal?.aborted) {
          throw new SecretArenaUnavailable("SecretArena use was aborted");
        }
        restoreTransfer = forbidTransferOn(allocated.buffer);
        const result: unknown = withTransferForbidden(allocated.buffer, () =>
          (fn as (value: Uint8Array) => unknown)(allocated.view),
        );
        if (result !== undefined) {
          void Promise.resolve(result).catch(() => undefined);
          throw new Error("SecretArenaProvider: callback return/async escape channel is forbidden");
        }
      } finally {
        wipe(nameBytes);
        if (restoreTransfer !== undefined) restoreTransfer();
        if (slot !== undefined) {
          detached = isDetachedBuffer(slot.buffer);
          if (detached || !slot.wipe()) {
            quarantined = true;
            detached = true;
          }
        }
      }
      if (detached) throw new SecretArenaQuarantined();
    },
    revocationEpoch(): number {
      if (quarantined) throw new SecretArenaQuarantined();
      const { status, data } = rpc(OP_EPOCH);
      if (status === ST_QUARANTINED) return enterQuarantine();
      if (status !== ST_OK || data.length !== 8) {
        throw new SecretArenaUnavailable("SecretArena epoch is unavailable");
      }
      let epoch = 0;
      for (let i = 0; i < 8; i += 1) {
        epoch = epoch * 256 + (data[i] ?? 0);
      }
      wipe(data);
      if (!Number.isSafeInteger(epoch) || epoch < 0) {
        throw new SecretArenaUnavailable("SecretArena epoch is unavailable");
      }
      return epoch;
    },
    put(name: string, value: Uint8Array): void {
      if (quarantined) throw new SecretArenaQuarantined();
      const nameBytes = encodeName(name);
      const payload = new Uint8Array(nameBytes.length + value.length);
      payload.set(nameBytes, 0);
      payload.set(value, nameBytes.length);
      try {
        const { status } = rpc(OP_PUT, payload);
        if (status === ST_QUARANTINED) enterQuarantine();
        if (status !== ST_OK) {
          throw new SecretArenaUnavailable("SecretArena put refused");
        }
      } finally {
        wipe(payload);
        wipe(nameBytes);
      }
    },
    dispose(): void {
      if (disposed) return;
      try {
        rpc(OP_CLEANUP);
      } catch {
        quarantined = true;
      } finally {
        disposed = true;
        try {
          terminateChild(child);
        } catch {
          // already exited
        }
      }
    },
    status(): { readonly state: "active" | "quarantined" } {
      if (quarantined) return { state: "quarantined" };
      try {
        const { status, data } = rpc(OP_STATUS);
        const quarantinedBit = data[0] === 1;
        wipe(data);
        if (status !== ST_OK || quarantinedBit) {
          quarantined = true;
          return { state: "quarantined" };
        }
        return { state: "active" };
      } catch {
        quarantined = true;
        return { state: "quarantined" };
      }
    },
  };
  return provider;
}
