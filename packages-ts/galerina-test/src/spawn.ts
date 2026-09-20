// Child-process helper.
//
// The harness NEVER reimplements a runner — it spawns the existing, shipped tool
// (scripts/run-all-tests.cjs, `node --test` on a corpus, `node galerina.mjs`) and
// reports its verdict. This is the one place that spawns, so timeout and
// fail-closed exit-code handling live here, in one auditable spot.

import { spawnSync } from "node:child_process";
import type { HarnessOptions } from "./types.js";

export interface SpawnOutcome {
  /** Exit code; fail-closed to 1 when the child did not exit normally. */
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Combined stdout+stderr — the text count-parsing runs against. */
  readonly output: string;
  readonly durationMs: number;
  /** Exact terminal classification for this spawn attempt. */
  readonly failureKind: "none" | "timeout" | "signal" | "spawn-error" | "output-limit";
  /** True only when the configured deadline expired. */
  readonly timedOut: boolean;
  /** Signal reported by the child process, when the host exposes one. */
  readonly signal?: NodeJS.Signals;
  /** Stable host error code for timeout, output-limit or launch failures. */
  readonly errorCode?: string;
}

/** Default per-target timeout: 10 minutes (matches scripts/run-all-tests.cjs). */
export const DEFAULT_TIMEOUT_MS = 600_000;
/** Default captured output ceiling: 8 MiB per child. */
export const DEFAULT_OUTPUT_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * Spawn `node <args>` in `cwd`. Fail-closed: a missing exit status is reported
 * as exit code 1, never as success, and is classified from the host error or
 * signal instead of being misreported as a timeout.
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
  const requestedOutputLimit = opts.outputLimitBytes ?? DEFAULT_OUTPUT_LIMIT_BYTES;
  if (!Number.isSafeInteger(requestedOutputLimit) || requestedOutputLimit <= 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "",
      output: "",
      durationMs: 0,
      failureKind: "spawn-error",
      timedOut: false,
      errorCode: "INVALID_OUTPUT_LIMIT",
    };
  }
  // A child launched by this harness is an independent test process, not a
  // nested worker owned by the parent's node:test runner. Inheriting this
  // marker can make Node suppress the child's suite while still exiting zero.
  const { NODE_TEST_CONTEXT: _parentTestContext, ...childEnv } = process.env;
  const r = spawnSync(process.execPath, [...args], {
    cwd,
    env: childEnv,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: requestedOutputLimit,
    stdio: live ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const durationMs = Date.now() - t0;
  const stdout = live ? "" : r.stdout ?? "";
  const stderr = live ? "" : r.stderr ?? "";
  const output = `${stdout}\n${stderr}`;
  if (!live && opts.onOutput) opts.onOutput(output);
  const errorCode =
    typeof r.error === "object" &&
    r.error !== null &&
    "code" in r.error &&
    typeof r.error.code === "string"
      ? r.error.code
      : undefined;
  const signal = typeof r.signal === "string" ? r.signal : undefined;
  const failureKind = r.status !== null
    ? "none"
    : errorCode === "ETIMEDOUT"
      ? "timeout"
      : errorCode === "ENOBUFS"
        ? "output-limit"
        : signal !== undefined
          ? "signal"
          : "spawn-error";
  const exitCode = r.status === null ? 1 : r.status;
  return {
    exitCode,
    stdout,
    stderr,
    output,
    durationMs,
    failureKind,
    timedOut: failureKind === "timeout",
    ...(signal !== undefined ? { signal } : {}),
    ...(typeof errorCode === "string" ? { errorCode } : {}),
  };
}
