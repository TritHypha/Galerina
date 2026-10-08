// io.ts — secret-safe input + atomic ciphertext-only file replace (CLI plumbing).
//
// HARD constraints enforced here:
//   - secret values come from STDIN or a NO-ECHO TTY prompt — NEVER argv (argv leaks via
//     ps/proc/cmdline/history). The CLI never accepts a value as a positional/flag arg.
//   - the atomic replace writes a CIPHERTEXT-ONLY temp in the SAME dir, fsyncs, then renames.
//     The temp holds sealed bytes only — NEVER plaintext (the SOPS #624 leak class). We use a
//     dot-prefixed ".<name>.spore.tmp-<rand>" temp and rename over the target.
import { writeFileSync, renameSync, openSync, fsyncSync, closeSync, readSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, basename, join } from "node:path";
import { copyBytes, wipeBytes } from "./wipe.js";

/**
 * Read a secret value from STDIN (no TTY echo concern — piped/redirected input). Returns the
 * raw bytes (caller wipes). If stdin is a TTY and no piped data is available, callers should use
 * `promptNoEcho` instead. This reads to EOF.
 */
export function readStdinBytes(): Uint8Array {
  return readStdinBytesWith(readSync);
}

/** @internal Reader injection keeps scratch-buffer cleanup testable without touching real stdin. */
export function readStdinBytesWith(reader: typeof readSync): Uint8Array {
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  try {
    // fd 0 = stdin
    for (;;) {
      let n: number;
      try {
        n = reader(0, buf, 0, buf.length, null);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EAGAIN") continue;
        if ((e as NodeJS.ErrnoException).code === "EOF") break;
        throw e;
      }
      if (n === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, n)));
    }
    const out = Buffer.concat(chunks);
    try {
      // strip a single trailing newline (operator convenience; raw bytes otherwise preserved)
      let end = out.length;
      if (end > 0 && out[end - 1] === 0x0a) end -= 1;
      if (end > 0 && out[end - 1] === 0x0d) end -= 1;
      const res = new Uint8Array(end);
      try {
        copyBytes(res, out.subarray(0, end));
        return res;
      } catch (error) {
        wipeBytes(res);
        throw error;
      }
    } finally {
      wipeBytes(out);
    }
  } finally {
    wipeBytes(buf);
    for (const chunk of chunks) wipeBytes(chunk);
  }
}

/**
 * No-echo TTY prompt for a secret value. Disables terminal echo, reads a line, re-enables.
 * NEVER echoes the value; NEVER writes it anywhere but the returned buffer. If stdin is not a
 * TTY this throws (callers should pipe via stdin instead).
 */
export async function promptNoEcho(prompt: string): Promise<Uint8Array> {
  const stdin = process.stdin;
  if (!stdin.isTTY) throw new Error("promptNoEcho requires a TTY; pipe the value via STDIN instead");
  if (typeof stdin.setRawMode !== "function") {
    throw new Error("promptNoEcho requires a TTY with setRawMode");
  }
  process.stderr.write(prompt); // prompt to stderr so stdout stays clean for piping
  const stolenData = stdin.listeners("data").slice() as Array<(...args: unknown[]) => void>;
  const stolenKeypress = stdin.listeners("keypress").slice() as Array<(...args: unknown[]) => void>;
  stdin.removeAllListeners("data");
  stdin.removeAllListeners("keypress");
  const wasRaw = stdin.isRaw ?? false;
  let rawChanged = false;
  const bytes: number[] = [];
  let onData: ((d: Buffer) => void) | undefined;
  let onEnd: (() => void) | undefined;
  let onClose: (() => void) | undefined;
  let onError: ((error: Error) => void) | undefined;
  try {
    try {
      stdin.setRawMode(true);
      rawChanged = true;
      stdin.resume();
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const removePromptListeners = (): void => {
          if (onData !== undefined) stdin.removeListener("data", onData);
          if (onEnd !== undefined) stdin.removeListener("end", onEnd);
          if (onClose !== undefined) stdin.removeListener("close", onClose);
          if (onError !== undefined) stdin.removeListener("error", onError);
        };
        const settleError = (error: unknown): void => {
          if (settled) return;
          settled = true;
          removePromptListeners();
          reject(error);
        };
        const settleLine = (): void => {
          if (settled) return;
          settled = true;
          removePromptListeners();
          resolve();
        };
        onData = (d: Buffer): void => {
          let lineComplete = false;
          let aborted = false;
          try {
            for (const ch of d) {
              if (ch === 0x0d || ch === 0x0a) { // CR/LF = end of line
                lineComplete = true;
                break;
              }
              if (ch === 0x7f || ch === 0x08) { // backspace/del
                if (bytes.length > 0) {
                  const last = bytes.length - 1;
                  bytes[last] = 0;
                  bytes.length = last;
                }
                continue;
              }
              if (ch === 0x03) { // Ctrl-C
                aborted = true;
                break;
              }
              bytes.push(ch);
            }
          } catch (error) {
            settleError(error);
          } finally {
            try { wipeBytes(d); } catch (error) { settleError(error); }
          }
          if (aborted) settleError(new Error("aborted"));
          else if (lineComplete) settleLine();
        };
        onEnd = () => settleError(new Error("stdin ended before a complete secret line"));
        onClose = () => settleError(new Error("stdin closed before a complete secret line"));
        onError = (error) => settleError(error);
        stdin.on("data", onData);
        stdin.on("end", onEnd);
        stdin.on("close", onClose);
        stdin.on("error", onError);
      });
    } finally {
      if (onEnd !== undefined) stdin.removeListener("end", onEnd);
      if (onClose !== undefined) stdin.removeListener("close", onClose);
      if (onError !== undefined) stdin.removeListener("error", onError);
      stdin.removeAllListeners("data");
      stdin.removeAllListeners("keypress");
      for (const listener of stolenData) stdin.on("data", listener);
      for (const listener of stolenKeypress) stdin.on("keypress", listener);
      if (rawChanged) {
        try {
          stdin.setRawMode(wasRaw);
        } catch {
          try { stdin.setRawMode(false); } catch { /* best-effort echo restore */ }
        }
      }
      try { stdin.pause(); } catch { /* ignore */ }
      try { process.stderr.write("\n"); } catch { /* ignore */ }
    }
    return Uint8Array.from(bytes);
  } finally {
    for (let i = 0; i < bytes.length; i++) bytes[i] = 0;
  }
}

/** Readline (or similar) that would echo keypresses onto an output stream. */
export interface EchoingLineReader {
  pause(): unknown;
  resume(): unknown;
  _ttyWrite?: (...args: unknown[]) => unknown;
}

/**
 * Secret prompt with exclusive stdin ownership. An attached echoing line reader
 * is paused and its TTY writer is muted for the prompt lifetime, including abort.
 */
export async function promptNoEchoExclusive(
  prompt: string,
  lineReader?: EchoingLineReader,
): Promise<Uint8Array> {
  if (lineReader === undefined) return promptNoEcho(prompt);
  lineReader.pause();
  const originalTty = lineReader._ttyWrite;
  if (typeof originalTty === "function") {
    lineReader._ttyWrite = () => undefined;
  }
  try {
    return await promptNoEcho(prompt);
  } finally {
    if (typeof originalTty === "function") {
      lineReader._ttyWrite = originalTty;
    }
    lineReader.resume();
  }
}

/**
 * Atomic, ciphertext-only file replace. `bytes` MUST already be sealed container bytes. Writes a
 * dot-prefixed temp in the SAME directory, fsyncs it, then renames over `target`. The temp is
 * NEVER plaintext. On any error the temp write throws before the rename, so `target` is untouched.
 */
export function atomicWriteCiphertext(target: string, bytes: Uint8Array): void {
  const dir = dirname(target);
  const tmp = join(dir, `.${basename(target)}.tmp-${randomBytes(6).toString("hex")}`);
  writeFileSync(tmp, bytes, { mode: 0o600 });
  // fsync the temp so the rename is durable
  const fd = openSync(tmp, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, target); // atomic on POSIX + Windows same-volume
}
