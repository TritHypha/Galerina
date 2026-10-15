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
const OP_FORCE_FAIL = 6;
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
  debugForceCleanupFailure(): void;
}

function defaultCustodianPath(): string {
  const fromEnv = process.env.GALERINA_SECRET_ARENA_CUSTODIAN;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
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
}

function encodeName(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  const out = new Uint8Array(2 + encoded.length);
  out[0] = (encoded.length >> 8) & 0xff;
  out[1] = encoded.length & 0xff;
  out.set(encoded, 2);
  return out;
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
      child.kill();
    } catch {
      // spawn failed closed
    }
    throw new SecretArenaUnavailable("SecretArena custodian stdio is unavailable");
  }

  let quarantined = false;
  let disposed = false;

  const wipe = (bytes: Uint8Array | undefined): void => {
    if (bytes === undefined) return;
    try {
      intrinsicApply(intrinsicFill, bytes, [0]);
    } catch {
      // transferred or detached buffers are out of wipe scope
    }
  };

  const rpc = (opcode: number, payload: Uint8Array = new Uint8Array(0)): { status: number; data: Uint8Array } => {
    if (disposed) throw new SecretArenaUnavailable("SecretArena custodian is disposed");
    if (quarantined && opcode !== OP_STATUS && opcode !== OP_EPOCH && opcode !== OP_FORCE_FAIL) {
      throw new SecretArenaQuarantined();
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
    try {
      writeAll(stdinFd, header);
      writeAll(stdinFd, body);
      wipe(body);
      const respHeader = readExact(stdoutFd, 4);
      const respLen =
        ((respHeader[0] ?? 0) << 24) |
        ((respHeader[1] ?? 0) << 16) |
        ((respHeader[2] ?? 0) << 8) |
        (respHeader[3] ?? 0);
      if (!(respLen > 0) || respLen > 64 * 1024 * 1024 + 1024) {
        throw new SecretArenaUnavailable("SecretArena custodian returned an invalid frame");
      }
      const resp = readExact(stdoutFd, respLen);
      const status = resp[0] ?? ST_QUARANTINED;
      const data = resp.subarray(1);
      if (status === ST_QUARANTINED) {
        quarantined = true;
      }
      return { status, data };
    } catch (error) {
      quarantined = true;
      throw error;
    }
  };

  try {
    const hello = rpc(OP_STATUS);
    if (hello.status !== ST_OK) {
      throw new SecretArenaUnavailable();
    }
  } catch (error) {
    try {
      child.kill();
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

  return {
    has(name: string): boolean {
      if (quarantined) throw new SecretArenaQuarantined();
      const { status, data } = rpc(OP_HAS, encodeName(name));
      if (status === ST_QUARANTINED) return enterQuarantine();
      if (status !== ST_OK) return false;
      return data[0] === 1;
    },
    use(name: string, fn: (value: Uint8Array) => void, options?: { signal?: AbortSignal }): void {
      if (options?.signal?.aborted) {
        throw new SecretArenaUnavailable("SecretArena use was aborted");
      }
      if (quarantined) throw new SecretArenaQuarantined();
      let view: Uint8Array | undefined;
      try {
        const { status, data } = rpc(OP_GET, encodeName(name));
        if (status === ST_QUARANTINED) return enterQuarantine();
        if (status === ST_NOT_FOUND) return;
        if (status !== ST_OK) {
          throw new SecretArenaUnavailable("SecretArena get refused");
        }
        if (data.length === 0) return;
        view = data;
        if (options?.signal?.aborted) {
          throw new SecretArenaUnavailable("SecretArena use was aborted");
        }
        const result: unknown = (fn as (value: Uint8Array) => unknown)(view);
        if (result !== undefined) {
          void Promise.resolve(result).catch(() => undefined);
          throw new Error("SecretArenaProvider: callback return/async escape channel is forbidden");
        }
      } finally {
        wipe(view);
      }
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
      const { status } = rpc(OP_PUT, payload);
      wipe(payload);
      if (status === ST_QUARANTINED) enterQuarantine();
      if (status !== ST_OK) {
        throw new SecretArenaUnavailable("SecretArena put refused");
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
          child.kill();
        } catch {
          // already exited
        }
      }
    },
    status(): { readonly state: "active" | "quarantined" } {
      if (quarantined) return { state: "quarantined" };
      try {
        const { status, data } = rpc(OP_STATUS);
        if (status !== ST_OK || data[0] === 1) {
          quarantined = true;
          return { state: "quarantined" };
        }
        return { state: "active" };
      } catch {
        quarantined = true;
        return { state: "quarantined" };
      }
    },
    debugForceCleanupFailure(): void {
      rpc(OP_FORCE_FAIL);
      quarantined = true;
    },
  };
}
