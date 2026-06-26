// Child-process helper.
//
// The harness NEVER reimplements a runner — it spawns the existing, shipped tool
// (scripts/run-all-tests.cjs, `node --test` on a corpus, `node galerina.mjs`) and
// reports its verdict. This is the one place that spawns, so timeout and
// fail-closed exit-code handling live here, in one auditable spot.

import { spawnSync } from "node:child_process";
import type { HarnessOptions } from "./types.js";

export interface SpawnOutcome {
  /** Exit code; fail-closed to 1 when the child was killed / produced no code. */
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Combined stdout+stderr — the text count-parsing runs against. */
  readonly output: string;
  readonly durationMs: number;
  /** True when the child was terminated by timeout/signal rather than exiting. */
  readonly timedOut: boolean;
}

/** Default per-target timeout: 10 minutes (matches scripts/run-all-tests.cjs). */
export const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Spawn `node <args>` in `cwd`. Fail-closed: a null exit status (timeout or
 * signal kill) is reported as exit code 1, never as success.
 *
 * Two output modes:
 *   - capture (default): child output is piped and captured so counts can be
 *     parsed; mirrored to the parent only via `onOutput`.
 *   - inheritStdio: child output streams live to the parent terminal; nothing is
 *     captured (counts are unavailable — the child prints its own summary).
 */
export function runNode(
  args: readonly string[],
  cwd: string,
  opts: HarnessOptions = {},
): SpawnOutcome {
  const live = opts.inheritStdio === true;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [...args], {
    cwd,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    stdio: live ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const durationMs = Date.now() - t0;
  const stdout = live ? "" : r.stdout ?? "";
  const stderr = live ? "" : r.stderr ?? "";
  const output = `${stdout}\n${stderr}`;
  if (!live && opts.onOutput) opts.onOutput(output);
  // A null status means spawnSync timed out or the child was signal-killed.
  const timedOut = r.status === null;
  const exitCode = r.status === null ? 1 : r.status;
  return { exitCode, stdout, stderr, output, durationMs, timedOut };
}
