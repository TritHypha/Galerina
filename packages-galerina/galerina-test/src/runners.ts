// The four checks + the `all` aggregate.
//
// Each runner DELEGATES to an existing, shipped tool by spawning it — none is
// reimplemented, and none modifies the tool it drives:
//
//   runUnit        → scripts/run-all-tests.cjs
//   runE2e         → node galerina.mjs check|build <example>
//   runConformance → node --test tests/r6-corpus/r6-parity.test.mjs
//   runFidelity    → node --test .../galerina-core-compiler/tests/fidelity-differential.test.mjs
//
// Fail-closed throughout: a missing target, an empty corpus, a timeout, or a
// non-zero child exit yields `ok: false` with a non-zero `exitCode` — never a
// silent pass. The child's exit code is the verdict; parsed counts are advisory.

import { existsSync } from "node:fs";
import { resolveRoot, resolveTarget } from "./paths.js";
import { runNode } from "./spawn.js";
import { parseCounts, parseAggregateTotal } from "./parse.js";
import type {
  AllOptions,
  CheckResult,
  CheckScope,
  ConformanceOptions,
  E2eOptions,
  FidelityOptions,
  UnitOptions,
} from "./types.js";

// ── Default target locations within a Galerina workspace ───────────────────────
const UNIT_RUNNER = "scripts/run-all-tests.cjs";
const R6_PARITY = "tests/r6-corpus/r6-parity.test.mjs";
const FIDELITY_DIFFERENTIAL =
  "packages-galerina/galerina-core-compiler/tests/fidelity-differential.test.mjs";
const COMPILER_DIST = "packages-galerina/galerina-core-compiler/dist/index.js";
const GALERINA_CLI = "galerina.mjs";

/**
 * The default e2e corpus: example entry flows that compile clean through
 * `galerina check` (probed 2026-06-23). Override via E2eOptions.examples to point
 * the harness at your own app's entry flows.
 */
export const DEFAULT_E2E_EXAMPLES: readonly string[] = [
  "examples/wasm-hello-world/greet.spore",
  "examples/healthcare/getPatient.spore",
  "examples/deployment/health-check.spore",
  "examples/aerospace/updateFlightPath.spore",
];

// ── Result helpers ───────────────────────────────────────────────────────────

/** A fail-closed "target not found" verdict (never an accidental pass). */
function targetMissing(kind: CheckScope, target: string): CheckResult {
  return {
    kind,
    ok: false,
    exitCode: 1,
    durationMs: 0,
    detail: `target not found: ${target}`,
  };
}

// ── unit ─────────────────────────────────────────────────────────────────────

/**
 * Per-package node:test suites, via scripts/run-all-tests.cjs. This is the same
 * aggregation (and the same totals) the root `npm test` produces.
 */
export async function runUnit(opts: UnitOptions = {}): Promise<CheckResult> {
  const root = resolveRoot(opts.rootDir);
  const runner = resolveTarget(root, UNIT_RUNNER);
  if (!existsSync(runner)) return targetMissing("unit", runner);

  const args: string[] = [runner];
  if (opts.core) args.push("--core");
  if (opts.bail) args.push("--bail");
  for (const p of opts.packages ?? []) args.push(p);

  const r = runNode(args, root, opts);
  // run-all-tests.cjs prints its own cross-package "<N> tests total" line, not the
  // node:test "ℹ tests N" format, so fall back to that for the aggregate count.
  const parsed = parseCounts(r.output);
  const total = parsed.tests ?? parseAggregateTotal(r.output);
  const counts = { tests: total, pass: parsed.pass, fail: parsed.fail };
  const ok = r.exitCode === 0;
  const detail = ok
    ? `unit suites passed${total != null ? ` (${total} tests)` : ""}`
    : r.timedOut
      ? "unit run timed out"
      : `unit suites failed (exit ${r.exitCode})`;
  return {
    kind: "unit",
    ok,
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    detail,
    command: `node ${UNIT_RUNNER}${args.length > 1 ? " " + args.slice(1).join(" ") : ""}`,
    counts,
  };
}

// ── e2e ──────────────────────────────────────────────────────────────────────

/**
 * End-to-end compile of example apps through the shipped `galerina` CLI. Each
 * entry must `galerina check` (or, with `build: true`, `galerina build`) cleanly.
 * Exercises the real toolchain end to end (parse → govern → emit → manifest).
 */
export async function runE2e(opts: E2eOptions = {}): Promise<CheckResult> {
  const root = resolveRoot(opts.rootDir);
  const cli = resolveTarget(root, GALERINA_CLI);
  if (!existsSync(cli)) return targetMissing("e2e", cli);

  const entries = opts.examples ?? DEFAULT_E2E_EXAMPLES;
  // Fail-closed: an empty corpus is a failure, never a vacuous pass.
  if (entries.length === 0) {
    return {
      kind: "e2e",
      ok: false,
      exitCode: 1,
      durationMs: 0,
      detail: "e2e: no examples to run (empty corpus)",
    };
  }

  const verb = opts.build ? "build" : "check";
  const t0 = Date.now();
  let failures = 0;
  for (const entry of entries) {
    const abs = resolveTarget(root, entry);
    if (!existsSync(abs)) {
      failures++;
      if (opts.onOutput) opts.onOutput(`MISSING ${entry}\n`);
      continue;
    }
    const r = runNode([cli, verb, entry], root, opts);
    if (r.exitCode !== 0) failures++;
  }
  const durationMs = Date.now() - t0;
  const ok = failures === 0;
  return {
    kind: "e2e",
    ok,
    exitCode: ok ? 0 : 1,
    durationMs,
    detail: ok
      ? `e2e: ${entries.length}/${entries.length} examples ${verb}ed clean`
      : `e2e: ${failures}/${entries.length} examples failed (${verb})`,
    command: `node ${GALERINA_CLI} ${verb} <${entries.length} example(s)>`,
  };
}

// ── conformance (R6) ─────────────────────────────────────────────────────────

/**
 * The R6 bootstrap corpus — the Stage-A ≡ Stage-B parity gate. Drives the real
 * tests/r6-corpus/r6-parity.test.mjs (which itself runs `galerina check` + `build`
 * over the 5 R6 reference flows and asserts manifest parity).
 */
export async function runConformance(
  opts: ConformanceOptions = {},
): Promise<CheckResult> {
  const root = resolveRoot(opts.rootDir);
  const target = resolveTarget(root, opts.corpus ?? R6_PARITY);
  if (!existsSync(target)) return targetMissing("conformance", target);

  const r = runNode(["--test", target], root, opts);
  const counts = parseCounts(r.output);
  const ok = r.exitCode === 0;
  return {
    kind: "conformance",
    ok,
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    detail: ok
      ? `conformance (R6) passed${counts.tests != null ? ` (${counts.tests} assertions)` : ""}`
      : r.timedOut
        ? "conformance (R6) timed out"
        : `conformance (R6) failed (exit ${r.exitCode})`,
    command: `node --test ${opts.corpus ?? R6_PARITY}`,
    counts,
  };
}

// ── fidelity-differential (0014) ─────────────────────────────────────────────

/**
 * The 0014 fidelity-differential harness — tree-walker ≡ bytecode-VM ≡ WASM,
 * byte-exact. The differential imports the compiler's built `dist/`, so the
 * default path is guarded fail-closed: if the compiler is not built, the check
 * fails with a clear reason rather than erroring opaquely.
 */
export async function runFidelity(
  opts: FidelityOptions = {},
): Promise<CheckResult> {
  const root = resolveRoot(opts.rootDir);
  const target = resolveTarget(root, opts.target ?? FIDELITY_DIFFERENTIAL);
  if (!existsSync(target)) return targetMissing("fidelity", target);

  // The default differential imports galerina-core-compiler/dist — fail closed if
  // it is not built (a custom `target` is the caller's own responsibility).
  if (!opts.target) {
    const dist = resolveTarget(root, COMPILER_DIST);
    if (!existsSync(dist)) {
      return {
        kind: "fidelity",
        ok: false,
        exitCode: 1,
        durationMs: 0,
        detail: `fidelity prerequisite missing: ${COMPILER_DIST} (build the compiler first)`,
        command: `node --test ${FIDELITY_DIFFERENTIAL}`,
      };
    }
  }

  const r = runNode(["--test", target], root, opts);
  const counts = parseCounts(r.output);
  const ok = r.exitCode === 0;
  return {
    kind: "fidelity",
    ok,
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    detail: ok
      ? `fidelity (0014) passed${counts.tests != null ? ` (${counts.tests} checks)` : ""}`
      : r.timedOut
        ? "fidelity (0014) timed out"
        : `fidelity (0014) failed (exit ${r.exitCode})`,
    command: `node --test ${opts.target ?? FIDELITY_DIFFERENTIAL}`,
    counts,
  };
}

// ── all ──────────────────────────────────────────────────────────────────────

/**
 * Run every check and aggregate. Fail-closed: the aggregate is `ok` only when
 * EVERY child is ok; any failure makes exitCode non-zero. By default all four
 * run (so a single invocation reports the full picture); `bailScope: true` stops
 * at the first failing check.
 */
export async function runAll(opts: AllOptions = {}): Promise<CheckResult> {
  const order: ReadonlyArray<(o: AllOptions) => Promise<CheckResult>> = [
    runUnit,
    runE2e,
    runConformance,
    runFidelity,
  ];
  const t0 = Date.now();
  const children: CheckResult[] = [];
  for (const run of order) {
    const res = await run(opts);
    children.push(res);
    if (!res.ok && opts.bailScope) break;
  }
  const durationMs = Date.now() - t0;
  const failed = children.filter((c) => !c.ok).map((c) => c.kind);
  const ok = failed.length === 0;
  return {
    kind: "all",
    ok,
    exitCode: ok ? 0 : 1,
    durationMs,
    detail: ok
      ? `all ${children.length} checks passed`
      : `failed: ${failed.join(", ")}`,
    children,
  };
}
