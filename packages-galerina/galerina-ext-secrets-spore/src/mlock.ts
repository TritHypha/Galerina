// mlock.ts — best-effort page-lock of a Buffer against swap (Part 4 hard constraint).
//
// The design doc requires "mlock pages against swap WHERE THE PLATFORM ALLOWS". Node has no
// portable mlock() in core, and we add NO native dependency (no new crypto / no native addon
// per FUNGI-SUBSTRATE-001 layering). So this is a best-effort, never-throwing shim:
//   - On platforms with a vetted mlock addon present, callers may inject it via setMlockHook.
//   - Otherwise it is a no-op, and the README states plainly that swap-locking is best-effort.
// This is honest: zero-wipe is the guaranteed mitigation; mlock is opportunistic hardening.
//
// IMPORTANT: this is purely a HARDENING hook. The confidentiality guarantee does NOT depend
// on it. A missing mlock never fails the decrypt path open.

type MlockFn = (buf: Buffer) => boolean;

let hook: MlockFn | null = null;

/**
 * Inject a vetted page-lock implementation (e.g. a small N-API addon calling mlock()/
 * VirtualLock()). The hub may wire this in production; the package itself ships no addon.
 */
export function setMlockHook(fn: MlockFn | null): void {
  hook = fn;
}

/** Attempt to lock the buffer's pages against swap. Returns true if locked, false otherwise. Never throws. */
export function tryMlock(buf: Buffer): boolean {
  if (hook === null) return false;
  try {
    return hook(buf) === true;
  } catch {
    return false; // best-effort: a failed lock must never break the secret path
  }
}
