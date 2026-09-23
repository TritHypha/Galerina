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

/**
 * Read a secret value from STDIN (no TTY echo concern — piped/redirected input). Returns the
 * raw bytes (caller wipes). If stdin is a TTY and no piped data is available, callers should use
 * `promptNoEcho` instead. This reads to EOF.
 */
export function readStdinBytes(): Uint8Array {
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  // fd 0 = stdin
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EAGAIN") continue;
      if ((e as NodeJS.ErrnoException).code === "EOF") break;
      throw e;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  const out = Buffer.concat(chunks);
  // strip a single trailing newline (operator convenience; raw bytes otherwise preserved)
  let end = out.length;
  if (end > 0 && out[end - 1] === 0x0a) end -= 1;
  if (end > 0 && out[end - 1] === 0x0d) end -= 1;
  const res = new Uint8Array(out.subarray(0, end));
  out.fill(0);
  return res;
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
  try {
    stdin.setRawMode(true);
    rawChanged = true;
    stdin.resume();
    await new Promise<void>((resolve, reject) => {
      const onData = (d: Buffer): void => {
        for (const ch of d) {
          if (ch === 0x0d || ch === 0x0a) { // CR/LF = end of line
            stdin.removeListener("data", onData);
            resolve();
            return;
          }
          if (ch === 0x7f || ch === 0x08) { // backspace/del
            if (bytes.length > 0) bytes.pop();
            continue;
          }
          if (ch === 0x03) { // Ctrl-C
            stdin.removeListener("data", onData);
            reject(new Error("aborted"));
            return;
          }
          bytes.push(ch);
        }
      };
      stdin.on("data", onData);
    });
  } finally {
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
  const res = Uint8Array.from(bytes);
  bytes.fill(0);
  return res;
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
