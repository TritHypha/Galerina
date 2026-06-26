#!/usr/bin/env node
// cli.ts — the `galerina secrets-tmf` CRUD/shell CLI (design doc Part 2).
//
// bin: galerina-secrets-tmf  (also surfaced as `galerina secrets-tmf <cmd>`)
// default --file ./env.tmf
//
// Commands:
//   init                      create an empty encrypted env.tmf for a recipient pubkey
//   set NAME                  value from STDIN or no-echo prompt — NEVER argv
//   get NAME                  in-arena -> stdout (for piping); REFUSE on a TTY without --force
//   list                      manifest only -> names + metadata, NEVER values
//   rm NAME                   remove section + manifest entry
//   rotate-recipient --new-pub P    re-key every section under a new recipient pub
//   shell                     in-arena REPL (set/get/list/rm/.save/.quit) — NO $EDITOR/FIFO/tmp/.swp
//
// HARD CONSTRAINTS enforced here:
//   - a secret value is NEVER read from argv. `set NAME value` is REJECTED — value must come
//     from STDIN or the no-echo prompt. (Leak class: ps/proc/cmdline/shell-history.)
//   - `get` on a TTY without --force is REFUSED (shoulder-surf/scrollback). Piped get is fine.
//   - the key passphrase is read no-echo; the recipient secret lives ONLY in an arena buffer.
//   - re-seal goes through io.atomicWriteCiphertext (ciphertext-only temp, never plaintext).
//   - the shell REPL never spawns $EDITOR, never opens a FIFO, never writes /tmp or a .swp.
import { existsSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  initEnvTmf, setSecret, rmSecret, rotateRecipient, listSecrets, openValue, readFile, K3,
} from "./store.js";
import { keygen, KEM_PROFILE } from "./tmf.js";
import { fromHex, toHex } from "./schema.js";
import { readStdinBytes, promptNoEcho, atomicWriteCiphertext } from "./io.js";
import { unwrapRecipientSecret } from "./anchor.js";
import type { WrappedKey } from "./anchor.js";

interface Args {
  cmd: string;
  name?: string;
  file: string;
  force: boolean;
  newPub?: string;
  pub?: string;
  rest: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { cmd: argv[0] ?? "help", file: "./env.tmf", force: false, rest: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--file") { out.file = argv[++i]!; }
    else if (a === "--force") { out.force = true; }
    else if (a === "--new-pub") { out.newPub = argv[++i]!; }
    else if (a === "--pub") { out.pub = argv[++i]!; }
    else if (!a.startsWith("--") && out.name === undefined) { out.name = a; }
    else { out.rest.push(a); }
  }
  return out;
}

/** Write a message to stderr and exit — typed `never` so tsc narrows after the guard. */
function die(msg: string, code = 2): never {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

/** A secret value passed as a positional/flag is a HARD error — values never come from argv. */
function rejectValueInArgv(a: Args): void {
  if (a.rest.length > 0) {
    die(
      "REFUSED: a secret value must come from STDIN or the no-echo prompt, never argv " +
      "(argv leaks via ps/proc/cmdline/history). Pipe the value: `printf %s \"$V\" | galerina-secrets-tmf set NAME`.",
    );
  }
}

/**
 * Resolve the recipient key material. For this CLI the operator anchors via a passphrase-wrapped
 * key file (local-dev anchor). Production hosts use anchor.anchorProdSecret with KMS/Vault and
 * the runtime loader instead of this CLI. Returns {pub, withSec} where withSec runs fn with the
 * unwrapped secret in an arena buffer.
 */
function getWrappedKey(): WrappedKey {
  // The wrapped key is provided out-of-band via env GALERINA_ENVTMF_WRAP (hex of salt|iv|ct) — a
  // POINTER to anchored material, NOT a plaintext secret. We never read a plaintext key from argv.
  const hex = process.env.GALERINA_ENVTMF_WRAP;
  if (hex === undefined) die("set GALERINA_ENVTMF_WRAP to the wrapped recipient key (salt|iv|ct hex)");
  const raw = fromHex(hex as string);
  return { salt: raw.subarray(0, 16), iv: raw.subarray(16, 28), ct: raw.subarray(28) };
}

async function withRecipientSecret<T>(fn: (sec: Buffer) => T): Promise<T> {
  const wrapped = getWrappedKey();
  const pass = await promptNoEcho("passphrase: ");
  try {
    return unwrapRecipientSecret(wrapped, pass, fn);
  } finally {
    pass.fill(0);
  }
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));

  switch (a.cmd) {
    case "init": {
      const pub = fromHex(a.pub ?? die("init requires --pub <recipient-pubkey-hex>"));
      if (existsSync(a.file)) die(`refusing to overwrite existing ${a.file}`);
      const bytes = initEnvTmf(pub);
      atomicWriteCiphertext(a.file, bytes);
      process.stderr.write(`initialised ${a.file} (manifest-only, unsigned-but-encrypted)\n`);
      break;
    }

    case "set": {
      const name = a.name ?? die("usage: set NAME (value via STDIN or no-echo prompt)");
      rejectValueInArgv(a);
      const pub = fromHex(a.pub ?? die("set requires --pub <recipient-pubkey-hex>"));
      // value: STDIN if piped, else no-echo prompt — NEVER argv
      const value = process.stdin.isTTY ? await promptNoEcho(`value for ${name}: `) : readStdinBytes();
      try {
        await withRecipientSecret((sec) => {
          const buf = readFile(a.file);
          const res = setSecret(buf, sec, pub, K3.ALLOW, name, value);
          atomicWriteCiphertext(a.file, res.bytes);
        });
        process.stderr.write(`set ${name}\n`);
      } finally {
        value.fill(0);
      }
      break;
    }

    case "get": {
      const name = a.name ?? die("usage: get NAME");
      rejectValueInArgv(a);
      // REFUSE on a TTY without --force (shoulder-surf / scrollback)
      if (process.stdout.isTTY && !a.force) {
        die("REFUSED: get to a TTY would expose the value on screen/scrollback. Pipe it, or pass --force.");
      }
      await withRecipientSecret((sec) => {
        const buf = readFile(a.file);
        openValue(buf, sec, K3.ALLOW, name, (plain) => {
          // SYNCHRONOUS write to fd 1: fs.writeSync drains into the OS before returning, so no
          // plaintext copy is retained in Node's stream write-queue past the arena wipe (the wipe
          // in withWiped's finally then covers ALL surviving copies). process.stdout.write would
          // buffer a chunk async on a pipe and outlive the wipe — see leak-hunter finding #2.
          let off = 0;
          while (off < plain.length) off += writeSync(1, plain, off, plain.length - off);
        });
      });
      break;
    }

    case "list": {
      await withRecipientSecret((sec) => {
        const buf = readFile(a.file);
        const rows = listSecrets(buf, sec, K3.ALLOW); // names + metadata, NEVER values
        for (const r of rows) {
          process.stdout.write(`${r.name}\tcreated=${r.created}\trotated=${r.rotated}\tkem=0x${r.kemProfile.toString(16)}${r.category ? `\tcategory=${r.category}` : ""}${r.environment ? `\tenv=${r.environment}` : ""}\n`);
        }
      });
      break;
    }

    case "rm": {
      const name = a.name ?? die("usage: rm NAME");
      rejectValueInArgv(a);
      const pub = fromHex(a.pub ?? die("rm requires --pub <recipient-pubkey-hex>"));
      await withRecipientSecret((sec) => {
        const buf = readFile(a.file);
        const res = rmSecret(buf, sec, pub, K3.ALLOW, name);
        atomicWriteCiphertext(a.file, res.bytes);
      });
      process.stderr.write(`removed ${name}\n`);
      break;
    }

    case "rotate-recipient": {
      const newPub = fromHex(a.newPub ?? die("usage: rotate-recipient --new-pub <hex>"));
      await withRecipientSecret((sec) => {
        const buf = readFile(a.file);
        const res = rotateRecipient(buf, sec, K3.ALLOW, newPub);
        atomicWriteCiphertext(a.file, res.bytes);
      });
      process.stderr.write("rotated recipient (all sections re-keyed, old buffers zero-wiped)\n");
      break;
    }

    case "keygen": {
      // Print a fresh recipient keypair. The PUBLIC key is hex on stdout (not secret).
      // The SECRET key is secret-zero — the exact material that must be anchored externally and
      // NEVER co-located/echoed. We therefore:
      //   - REFUSE to emit it to a TTY without --force (mirror the `get` TTY guard; a TTY means
      //     scrollback/shoulder-surf — far worse for the key than for a value). leak-hunter #1.
      //   - NEVER build an immutable toHex() string of the secret bytes (a JS string is never
      //     zero-wiped and survives in the GC heap). Instead stream the raw bytes through a
      //     zero-wiped Buffer with a SYNCHRONOUS writeSync(2,...) so no copy outlives the wipe.
      //     Consumers pipe stderr to `wrapRecipientSecret` / a 0600 sink, never to a screen.
      const kp = keygen(KEM_PROFILE.HYBRID_X25519_ML_KEM_768);
      try {
        process.stdout.write(`pub=${toHex(kp.publicKey)}\n`);
        if (process.stderr.isTTY && !a.force) {
          die(
            "REFUSED: keygen would emit the recipient SECRET KEY to a TTY (scrollback/shoulder-surf). " +
            "This is secret-zero — anchor it externally, never on screen. Pipe stderr to a 0600 sink " +
            "(e.g. `galerina-secrets-tmf keygen 2>key.sec` then wrap+wipe), or pass --force to override.",
          );
        }
        // raw secret-key bytes through a Buffer view we OWN and wipe in finally — no hex string.
        const sec = Buffer.from(kp.secretKey.buffer, kp.secretKey.byteOffset, kp.secretKey.length);
        process.stderr.write("SEC-RAW (anchor externally, do NOT co-locate with env.tmf):");
        let off = 0;
        while (off < sec.length) off += writeSync(2, sec, off, sec.length - off);
        process.stderr.write("\n");
      } finally {
        kp.secretKey.fill(0); // wipes the underlying bytes shared with the `sec` view above
      }
      break;
    }

    case "shell": {
      const pub = fromHex(a.pub ?? die("shell requires --pub <recipient-pubkey-hex>"));
      await runShell(a.file, pub);
      break;
    }

    default:
      process.stderr.write(
        "galerina-secrets-tmf <cmd> [--file ./env.tmf]\n" +
        "  init --pub HEX | set NAME --pub HEX | get NAME [--force] | list | rm NAME --pub HEX\n" +
        "  rotate-recipient --new-pub HEX | keygen | shell --pub HEX\n" +
        "  (secret values: STDIN or no-echo prompt — NEVER argv)\n",
      );
  }
}

/**
 * In-arena REPL. Opens the file ONCE per .save; mutates via the same in-arena edit->re-seal flow.
 * NO $EDITOR, NO FIFO, NO /tmp, NO .swp — the only persistence is .save -> atomicWriteCiphertext.
 */
async function runShell(file: string, pub: Uint8Array): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const prompt = (): void => { process.stderr.write("secrets-tmf> "); };
  process.stderr.write("in-arena REPL. commands: set NAME | get NAME | list | rm NAME | .save | .quit\n");
  prompt();
  for await (const line of rl) {
    const t = line.trim();
    try {
      if (t === ".quit" || t === ".exit") { break; }
      else if (t === "list") {
        await withRecipientSecret((sec) => {
          for (const r of listSecrets(readFile(file), sec, K3.ALLOW)) process.stderr.write(`  ${r.name}\n`);
        });
      } else if (t.startsWith("set ")) {
        const name = t.slice(4).trim();
        const value = await promptNoEcho(`  value for ${name}: `);
        try {
          await withRecipientSecret((sec) => {
            const res = setSecret(readFile(file), sec, pub, K3.ALLOW, name, value);
            atomicWriteCiphertext(file, res.bytes);
          });
        } finally { value.fill(0); }
        process.stderr.write(`  set ${name}\n`);
      } else if (t.startsWith("get ")) {
        const name = t.slice(4).trim();
        // in-REPL get always refuses to echo to the TTY (REPL output is the TTY); require pipe via CLI
        process.stderr.write("  REFUSED: get in the REPL would echo to the TTY; use the piped CLI `get` instead.\n");
      } else if (t.startsWith("rm ")) {
        const name = t.slice(3).trim();
        await withRecipientSecret((sec) => {
          const res = rmSecret(readFile(file), sec, pub, K3.ALLOW, name);
          atomicWriteCiphertext(file, res.bytes);
        });
        process.stderr.write(`  removed ${name}\n`);
      } else if (t === ".save") {
        process.stderr.write("  (each mutation already atomic-saves ciphertext; nothing buffered to disk)\n");
      } else if (t.length > 0) {
        process.stderr.write("  unknown. commands: set NAME | get NAME | list | rm NAME | .save | .quit\n");
      }
    } catch (e) {
      process.stderr.write(`  error: ${(e as Error).message}\n`);
    }
    prompt();
  }
  rl.close();
  process.stderr.write("bye (arena wiped)\n");
}

main().catch((e) => { process.stderr.write(`fatal: ${(e as Error).message}\n`); process.exit(1); });
