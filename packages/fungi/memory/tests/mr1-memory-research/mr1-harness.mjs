// MEM-R1 shared harness: loads the app-kernel SecretArena provider (frozen TS
// reference, compiled dist) and drives it against the synthetic custodian.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, "..", "..", "..", "..", "..");
export const DIST_PROVIDER = join(
  REPO,
  "packages-ts",
  "galerina-framework-app-kernel",
  "dist",
  "secret-arena-provider.js",
);
const FAKE = join(HERE, "mr1-fake-custodian.mjs");

// Synthetic canary. Not a secret; chosen so any 4-byte window is distinctive.
export const CANARY = "MR1-CANARY-7f3a9c-SYNTHETIC";

export function linuxOnly(t) {
  if (process.platform !== "linux") {
    t.skip("SecretArena provider is Linux-only; refuses elsewhere by design");
    return false;
  }
  return true;
}

let scratch;
function scratchDir() {
  if (scratch === undefined) {
    scratch = mkdtempSync(join(tmpdir(), "mr1-"));
    process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
  }
  return scratch;
}

let wrapperPath;
export function fakeBin() {
  if (wrapperPath === undefined) {
    wrapperPath = join(scratchDir(), "mr1-custodian.sh");
    writeFileSync(wrapperPath, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}'\n`);
    chmodSync(wrapperPath, 0o755);
  }
  return wrapperPath;
}

let mutantSeq = 0;
export async function loadProvider(transform) {
  if (transform === undefined) return import(pathToFileURL(DIST_PROVIDER).href);
  const src = readFileSync(DIST_PROVIDER, "utf8");
  const next = transform(src);
  assert.notEqual(next, src, "mutant must be a real edit");
  mutantSeq += 1;
  const file = join(scratchDir(), `provider-mutant-${mutantSeq}.mjs`);
  writeFileSync(file, next);
  return import(pathToFileURL(file).href);
}

export function replaceOnce(src, needle, next) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, `mutant anchor must occur exactly once: ${needle}`);
  return parts[0] + next + parts[1];
}

export function open(mod, mode) {
  process.env.MR1_MODE = mode;
  try {
    return mod.createSecretArenaProvider({ binPath: fakeBin() });
  } finally {
    delete process.env.MR1_MODE;
  }
}

export function bytes(text) {
  return new TextEncoder().encode(text);
}

export function capture(fn) {
  try {
    fn();
    return { thrown: false, error: undefined };
  } catch (error) {
    return { thrown: true, error };
  }
}

export function windows(text, width = 4) {
  const out = [];
  for (let i = 0; i + width <= text.length; i += 1) out.push(text.slice(i, i + width));
  return out;
}

export function assertNoCanary(text, label) {
  for (const w of windows(CANARY)) {
    assert.equal(String(text).includes(w), false, `${label} leaks canary window ${JSON.stringify(w)}`);
  }
}

export function allZero(view) {
  for (const b of view) if (b !== 0) return false;
  return true;
}
