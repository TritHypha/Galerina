// The five checks + the `all` aggregate.
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
// silent pass. Child exit is necessary; the SLIDE lane additionally requires
// parseable non-zero counts so an empty/suppressed suite cannot authorize.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { join, relative } from "node:path";
import { resolveRoot, resolveTarget } from "./paths.js";
import { runNode } from "./spawn.js";
import type { SpawnOutcome } from "./spawn.js";
import { parseCounts, parseAggregateTotal } from "./parse.js";
import type {
  AllOptions,
  CheckResult,
  CheckResultKind,
  ConformanceOptions,
  E2eOptions,
  FidelityOptions,
  SlideOptions,
  SpawnInvocation,
  UnitOptions,
} from "./types.js";

// ── Default target locations within a Galerina workspace ───────────────────────
const UNIT_RUNNER = "scripts/run-all-tests.cjs";
const R6_PARITY = "tests/r6-corpus/r6-parity.test.mjs";
const FIDELITY_DIFFERENTIAL =
  "packages-ts/galerina-core-compiler/tests/fidelity-differential.test.mjs";
const COMPILER_DIST = "packages-ts/galerina-core-compiler/dist/index.js";
const COMPILER_BUILD_EVIDENCE =
  "packages-ts/galerina-core-compiler/dist/build-evidence.json";
const COMPILER_PACKAGE = "packages-ts/galerina-core-compiler";
const GALERINA_CLI = "galerina.mjs";
const COMPILER_EVIDENCE_SCHEMA = "galerina.compiler-build-evidence.v1";

function compilerFreshnessFailure(
  root: string,
  compilerPackage: string,
): string | null {
  const packageFromRoot = relative(root, compilerPackage).replace(/\\/g, "/");
  if (packageFromRoot === ".." || packageFromRoot.startsWith("../")) {
    return "fidelity freshness cannot be proven: compiler package is outside the workspace";
  }

  const gitPaths = (args: readonly string[]): readonly string[] | null => {
    const result = spawnSync(
      "git",
      [
        "-C",
        root,
        ...args,
        "-z",
        "--",
        `${packageFromRoot}/src`,
        `${packageFromRoot}/tests`,
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    if (result.error || result.status !== 0 || result.signal) return null;
    return result.stdout.split("\0").filter(Boolean).sort();
  };

  const inputs = gitPaths(["ls-files"]);
  if (inputs === null) {
    return "fidelity freshness cannot be proven from tracked compiler inputs (build the compiler first)";
  }
  if (inputs.length === 0) {
    return "fidelity freshness cannot be proven: no tracked compiler source/test inputs (build the compiler first)";
  }
  const untracked = gitPaths(["ls-files", "--others", "--exclude-standard"]);
  if (untracked === null) {
    return "fidelity freshness cannot be proven while untracked-input enumeration is unavailable";
  }
  if (untracked.length > 0) {
    return `fidelity found untracked compiler inputs; freshness cannot be proven: ${untracked.join(", ")}`;
  }

  const evidencePath = resolveTarget(root, COMPILER_BUILD_EVIDENCE);
  let evidence: unknown;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return `fidelity build evidence is missing or unreadable: ${COMPILER_BUILD_EVIDENCE} (build the compiler first)`;
  }
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) {
    return "fidelity build evidence is malformed (build the compiler first)";
  }
  const record = evidence as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = ["algorithm", "inputDigest", "schema", "trackedInputs"];
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    record.schema !== COMPILER_EVIDENCE_SCHEMA ||
    record.algorithm !== "sha256" ||
    !Array.isArray(record.trackedInputs) ||
    !record.trackedInputs.every((path) => typeof path === "string") ||
    typeof record.inputDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.inputDigest)
  ) {
    return "fidelity build evidence is malformed (build the compiler first)";
  }
  if (JSON.stringify(record.trackedInputs) !== JSON.stringify(inputs)) {
    return "fidelity build evidence input set mismatch (build the compiler first)";
  }

  const hash = createHash("sha256");
  try {
    for (const input of inputs) {
      hash.update(input);
      hash.update("\0");
      hash.update(readFileSync(join(root, input)));
      hash.update("\0");
    }
  } catch {
    return "fidelity build evidence cannot be recomputed from every tracked input";
  }
  if (hash.digest("hex") !== record.inputDigest) {
    return "fidelity build evidence digest mismatch (build the compiler first)";
  }
  return null;
}

/**
 * The default e2e corpus: example entry flows that compile clean through
 * `galerina check` (probed 2026-06-23). Override via E2eOptions.examples to point
 * the harness at your own app's entry flows.
 */
export const DEFAULT_E2E_EXAMPLES: readonly string[] = Object.freeze([
  "examples/wasm-hello-world/greet.fungi",
  "examples/healthcare/getPatient.fungi",
  "examples/deployment/health-check.fungi",
  "examples/aerospace/updateFlightPath.fungi",
]);

// ── Result helpers ───────────────────────────────────────────────────────────

/** A fail-closed "target not found" verdict (never an accidental pass). */
function targetMissing(kind: CheckResultKind, target: string): CheckResult {
  return {
    kind,
    ok: false,
    exitCode: 1,
    durationMs: 0,
    detail: `target not found: ${target}`,
  };
}

function spawnFailureDetail(prefix: string, result: SpawnOutcome): string {
  switch (result.failureKind) {
    case "timeout":
      return `${prefix} timed out`;
    case "signal":
      return `${prefix} terminated by ${result.signal ?? "signal"}`;
    case "output-limit":
      return `${prefix} output limit exceeded`;
    case "spawn-error":
      return `${prefix} spawn failed${result.errorCode ? ` (${result.errorCode})` : ""}`;
    case "none":
      return `${prefix} failed (exit ${result.exitCode})`;
  }
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
    : spawnFailureDetail("unit run", r);
  return {
    kind: "unit",
    ok,
    exitCode: r.exitCode,
    durationMs: r.durationMs,
    detail,
    command: `node ${UNIT_RUNNER}${args.length > 1 ? " " + args.slice(1).join(" ") : ""}`,
    invocations: Object.freeze([r.invocation]),
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
  const t0 = performance.now();
  let failures = 0;
  const invocations: SpawnInvocation[] = [];
  for (const entry of entries) {
    const abs = resolveTarget(root, entry);
    if (!existsSync(abs)) { // perf-allow: loop-sync-io — one-shot e2e corpus existence scan; distinct example path per iteration
      failures++;
      if (opts.onOutput) opts.onOutput(`MISSING ${entry}\n`);
      continue;
    }
    const r = runNode([cli, verb, entry], root, opts);
    invocations.push(r.invocation);
    if (r.exitCode !== 0) failures++;
  }
  const durationMs = performance.now() - t0;
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
    invocations: Object.freeze(invocations),
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
      : spawnFailureDetail("conformance (R6)", r),
    command: `node --test ${opts.corpus ?? R6_PARITY}`,
    invocations: Object.freeze([r.invocation]),
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
    const freshnessFailure = compilerFreshnessFailure(
      root,
      resolveTarget(root, COMPILER_PACKAGE),
    );
    if (freshnessFailure !== null) {
      return {
        kind: "fidelity",
        ok: false,
        exitCode: 1,
        durationMs: 0,
        detail: freshnessFailure,
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
      : spawnFailureDetail("fidelity (0014)", r),
    command: `node --test ${opts.target ?? FIDELITY_DIFFERENTIAL}`,
    invocations: Object.freeze([r.invocation]),
    counts,
  };
}

// ── SLIDE ────────────────────────────────────────────────────────────────────
function discoverExactTests(
  directory: string,
  pattern: RegExp,
): readonly string[] | null {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => join(directory, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

function runExactNodeCorpus(
  kind: "slide" | "slide-independent",
  tests: readonly string[],
  cwd: string,
  opts: SlideOptions,
): CheckResult {
  let output = "";
  const r = runNode(["--test", ...tests], cwd, {
    ...opts,
    inheritStdio: false,
    onOutput: (chunk) => {
      output += chunk;
      if (opts.inheritStdio) process.stdout.write(chunk);
      opts.onOutput?.(chunk);
    },
  });
  const counts = parseCounts(output);
  const countable = counts.tests !== null && counts.tests > 0;
  const ok = r.exitCode === 0 && countable;
  return {
    kind,
    ok,
    exitCode: ok ? 0 : r.exitCode === 0 ? 1 : r.exitCode,
    durationMs: r.durationMs,
    detail: ok
      ? `${kind} passed (${counts.tests} tests from ${tests.length} files)`
      : r.failureKind !== "none"
        ? spawnFailureDetail(kind, r)
        : r.exitCode !== 0
          ? `${kind} failed (exit ${r.exitCode})`
          : `${kind} refused uncountable or zero-test success`,
    command: `node --test <${tests.length} exact test files>`,
    invocations: Object.freeze([r.invocation]),
    counts,
  };
}

/**
 * Run the exact Galerina-owned `slide-*.test.mjs` corpus. A supplied
 * independent repository is additional evidence, never a substitute for the
 * in-repo corpus, and is reported as a distinct child.
 */
export async function runSlide(opts: SlideOptions = {}): Promise<CheckResult> {
  const root = resolveRoot(opts.rootDir);
  const compilerPackage = resolveTarget(root, opts.compilerPackage ?? COMPILER_PACKAGE);
  const compilerTests = join(compilerPackage, "tests");
  const tests = discoverExactTests(compilerTests, /^slide-.*\.test\.mjs$/);
  if (tests === null) return targetMissing("slide", compilerTests);
  if (tests.length === 0) {
    return {
      kind: "slide",
      ok: false,
      exitCode: 1,
      durationMs: 0,
      detail: "empty SLIDE corpus: no exact slide-*.test.mjs files",
    };
  }

  const local = runExactNodeCorpus("slide", tests, root, opts);
  if (!opts.independentRoot) return local;

  const independentRoot = resolveTarget(root, opts.independentRoot);
  const independentTestsDir = join(independentRoot, "tests");
  const independentTests = discoverExactTests(independentTestsDir, /^.*\.test\.mjs$/);
  const independent = independentTests === null
    ? targetMissing("slide-independent", independentTestsDir)
    : independentTests.length === 0
      ? {
          kind: "slide-independent" as const,
          ok: false,
          exitCode: 1,
          durationMs: 0,
          detail: "empty independent SLIDE corpus: no exact *.test.mjs files",
        }
      : runExactNodeCorpus("slide-independent", independentTests, independentRoot, opts);
  const ok = local.ok && independent.ok;
  return {
    ...local,
    ok,
    exitCode: ok ? 0 : 1,
    detail: ok
      ? `${local.detail}; independent SLIDE evidence passed`
      : `SLIDE failed: ${[local, independent]
          .filter((result) => !result.ok)
          .map((result) => result.kind)
          .join(", ")}`,
    children: [independent],
  };
}

// ── all ──────────────────────────────────────────────────────────────────────

/**
 * Run every check and aggregate. Fail-closed: the aggregate is `ok` only when
 * EVERY child is ok; any failure makes exitCode non-zero. By default all five
 * run (so a single invocation reports the full picture); `bailScope: true`
 * stops at the first failing check.
 */
export async function runAll(opts: AllOptions = {}): Promise<CheckResult> {
  const order: ReadonlyArray<(o: AllOptions) => Promise<CheckResult>> = [
    runUnit,
    runE2e,
    runConformance,
    runFidelity,
    runSlide,
  ];
  const t0 = performance.now();
  const children: CheckResult[] = [];
  for (const run of order) {
    const res = await run(opts);
    children.push(res);
    if (!res.ok && opts.bailScope) break;
  }
  const durationMs = performance.now() - t0;
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
    invocations: Object.freeze(children.flatMap((child) => child.invocations ?? [])),
    children,
  };
}
