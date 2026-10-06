/**
 * `galerina benchmark` command composition (library side; no console, no I/O).
 *
 * Composes the pieces this package already has:
 *   parseBenchmarkCliArgs -> runLightBenchmark -> formatBenchmarkSummary or
 *   renderBenchmarkReport (--json) -> writeBenchmarkReport (--save, through a
 *   host-supplied BenchmarkReportFileWriter).
 * It returns an exit code and output lines; the caller prints them. The
 * core-cli `benchmark` placeholder is not changed here: wiring core-cli to
 * this package would add a package dependency, so that is a separate step.
 *
 * Zero-trust defaults (owner may revisit):
 * - Exit codes are a closed set:
 *   - 0: success;
 *   - 2: refused, by argv parse, host input, or runner (including `--full`,
 *     which the light runner refuses);
 *   - 4: `--save` was requested and the report was not written.
 *   Code 2 matches the core-cli placeholder's refusal code.
 * - Output lines for a refusal carry fixed diagnostic codes and messages
 *   only, never input values.
 * - `--save` without a writer capability is refused by writeBenchmarkReport
 *   (exit 4). The report is still returned to the caller, and a write is never
 *   claimed.
 */
import {
  parseBenchmarkCliArgs,
  formatBenchmarkSummary,
  renderBenchmarkReport,
  writeBenchmarkReport,
} from "./index.js";
import type { BenchmarkReport, BenchmarkReportFileWriter } from "./index.js";
import { runLightBenchmark } from "./benchmark-runner.js";

export const BENCHMARK_COMMAND_EXIT = Object.freeze({ ok: 0, refused: 2, saveFailed: 4 } as const);

/** Host record is not a closed plain data record. */
export const FUNGI_BENCH_CMD_001 = "FUNGI-BENCH-CMD-001";

export const BENCHMARK_COMMAND_HOST_FIELDS = Object.freeze([
  "benchmarkId", "loVersion", "trigger", "system", "config", "now", "writer",
] as const);

export interface BenchmarkCommandDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface BenchmarkCommandResult {
  readonly exitCode: 0 | 2 | 4;
  readonly lines: readonly string[];
  readonly diagnostics: readonly BenchmarkCommandDiagnostic[];
  /** Present whenever the runner produced a report, including a failed save. */
  readonly report?: BenchmarkReport;
}

function done(
  exitCode: 0 | 2 | 4,
  diagnostics: readonly { readonly code: string; readonly message: string }[],
  lines?: readonly string[],
  report?: BenchmarkReport,
): BenchmarkCommandResult {
  const diags = Object.freeze(diagnostics.map((d) => Object.freeze({ code: d.code, message: d.message })));
  const out = lines ?? diags.map((d) => `${d.code}: ${d.message}`);
  return Object.freeze({
    exitCode,
    lines: Object.freeze([...out]),
    diagnostics: diags,
    ...(report === undefined ? {} : { report }),
  });
}

function snapshotHost(host: unknown): Map<string, unknown> | undefined {
  try {
    if (host === null || typeof host !== "object" || Array.isArray(host)) return undefined;
    const proto: unknown = Object.getPrototypeOf(host);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const out = new Map<string, unknown>();
    for (const key of Reflect.ownKeys(host)) {
      if (typeof key !== "string" || !(BENCHMARK_COMMAND_HOST_FIELDS as readonly string[]).includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(host, key);
      if (d === undefined || !("value" in d)) return undefined;
      out.set(key, d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

/** Run `galerina benchmark <argv>` against host-injected facts. Never throws. */
export async function runBenchmarkCommand(argv: unknown, host: unknown): Promise<BenchmarkCommandResult> {
  try {
    const parsed = parseBenchmarkCliArgs(argv);
    if (!parsed.ok || !("mode" in parsed.args)) return done(BENCHMARK_COMMAND_EXIT.refused, parsed.diagnostics);
    const args = parsed.args;

    const snap = snapshotHost(host);
    if (snap === undefined) {
      return done(BENCHMARK_COMMAND_EXIT.refused, [{ code: FUNGI_BENCH_CMD_001, message: "Benchmark host input must be a closed plain data record." }]);
    }
    const runnerInput: Record<string, unknown> = { mode: args.mode };
    for (const key of ["benchmarkId", "loVersion", "trigger", "system", "config", "now"] as const) {
      if (snap.has(key)) runnerInput[key] = snap.get(key);
    }
    const run = runLightBenchmark(runnerInput);
    if (!run.ok) return done(BENCHMARK_COMMAND_EXIT.refused, run.diagnostics);
    const report = run.report;
    const lines = args.json ? [renderBenchmarkReport(report).trimEnd()] : [...formatBenchmarkSummary(report)];

    if (args.save) {
      const written = await writeBenchmarkReport(report, args.outDir, snap.get("writer") as BenchmarkReportFileWriter);
      if (written.status !== "WRITTEN") {
        return done(
          BENCHMARK_COMMAND_EXIT.saveFailed,
          written.diagnostics,
          [...lines, ...written.diagnostics.map((d) => `${d.code}: ${d.message}`)],
          report,
        );
      }
    }
    return done(BENCHMARK_COMMAND_EXIT.ok, [], lines, report);
  } catch {
    return done(BENCHMARK_COMMAND_EXIT.refused, [{ code: FUNGI_BENCH_CMD_001, message: "Benchmark command refused after an unexpected failure." }]);
  }
}