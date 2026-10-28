// MEM-R2 harness: reuses the MEM-R1 helpers (provider loader, canary, capture)
// and adds a wrapper for the MEM-R2 length-equality custodian.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export {
  CANARY,
  allZero,
  assertNoCanary,
  bytes,
  capture,
  linuxOnly,
  loadProvider,
  open as openR1,
  replaceOnce,
  windows,
} from "../mr1-memory-research/mr1-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, "mr2-fake-custodian.mjs");

// Synthetic secret NAME, distinct from the canary value, so error census can
// check that names never reach an error message either.
// No 4-character window of it occurs in repo paths, so stacks cannot false-match.
export const NAME = "Zq7xVk3Jw9pL";

let wrapperPath;
function fakeBin() {
  if (wrapperPath === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "mr2-"));
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
    wrapperPath = join(dir, "mr2-custodian.sh");
    writeFileSync(wrapperPath, `#!/bin/sh\nexec '${process.execPath}' '${FAKE}'\n`);
    chmodSync(wrapperPath, 0o755);
  }
  return wrapperPath;
}

export function open(mod, mode) {
  process.env.MR2_MODE = mode;
  try {
    return mod.createSecretArenaProvider({ binPath: fakeBin() });
  } finally {
    delete process.env.MR2_MODE;
  }
}

// Every message the frozen TS provider is allowed to put in an error. The H4
// census fails if any fault path produces a message outside this set.
export const ALLOWED_MESSAGES = new Set([
  "SecretArena is unavailable on this platform",
  "SecretArena store is quarantined",
  "SecretArena custodian write timed out",
  "SecretArena custodian stdin closed",
  "SecretArena custodian read timed out",
  "SecretArena custodian stdout closed",
  "SecretArena custodian binary is unavailable",
  "SecretArena custodian spawn failed",
  "SecretArena custodian stdio is unavailable",
  "SecretArena custodian is disposed",
  "SecretArena put refused",
  "SecretArena custodian returned an invalid frame",
  "SecretArena custodian returned no frame",
  "SecretArena use was aborted",
  "SecretArena get refused",
  "SecretArena epoch is unavailable",
  "SecretArena epoch is stale",
  "SecretArenaProvider: callback return/async escape channel is forbidden",
  "SecretArenaProvider: ArrayBuffer.transfer of a live secret view is forbidden",
]);
