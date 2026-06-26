// @galerina/test — shared vocabulary for the consolidated Galerina test harness.
//
// One type model for the four check kinds a downstream app runs against a Galerina
// workspace: per-package `unit` suites, `e2e` end-to-end compile of example apps,
// `conformance` (the R6 Stage-A ≡ Stage-B parity gate) and `fidelity` (the 0014
// tree-walker ≡ bytecode ≡ WASM differential).
//
// Every runner returns a CheckResult — never a bare boolean — so a caller can
// aggregate, render, or gate CI on it. Fail-closed is encoded in the shape: a
// result is only `ok` when the underlying tool exited 0; anything uncertain
// (missing target, timeout, signal kill) is `ok: false` with a non-zero exitCode.

/** A single category of check the harness can run. */
export type CheckKind = "unit" | "e2e" | "conformance" | "fidelity";

/** Every check kind plus the `all` aggregate. */
export type CheckScope = CheckKind | "all";

/**
 * A node:test run summary parsed from a child's output. Any field may be `null`
 * when the underlying runner did not print that line. Parsing is best-effort and
 * NEVER gates the verdict — the child's EXIT CODE is the source of truth.
 */
export interface TestCounts {
  readonly tests: number | null;
  readonly pass: number | null;
  readonly fail: number | null;
}

/** The verdict of one check (or the `all` aggregate). */
export interface CheckResult {
  readonly kind: CheckScope;
  /** true ⟺ the check passed. Fail-closed: anything uncertain is `false`. */
  readonly ok: boolean;
  /** Process-style exit code: 0 on pass, non-zero on fail (default 1). */
  readonly exitCode: number;
  readonly durationMs: number;
  /** One-line human-readable status or failure reason. */
  readonly detail: string;
  /** The underlying command that produced this verdict (provenance). */
  readonly command?: string;
  /** node:test summary, when the runner emitted one. */
  readonly counts?: TestCounts;
  /** Sub-results, for the `all` aggregate. */
  readonly children?: readonly CheckResult[];
}

/** Options common to every runner. */
export interface HarnessOptions {
  /**
   * The Galerina workspace root (the directory holding galerina.workspace.json). When
   * omitted it is auto-detected: $GALERINA_ROOT, then cwd (walking up), then this
   * module (walking up). A downstream consumer points this at THEIR workspace.
   */
  readonly rootDir?: string;
  /** Per-target spawn timeout in ms. Default 600_000 (10 min). */
  readonly timeoutMs?: number;
  /** Pipe the child's stdout/stderr straight to the parent as it runs. Default false. */
  readonly inheritStdio?: boolean;
  /** Receive the child's combined output (only in capture mode, i.e. not inheritStdio). */
  readonly onOutput?: (chunk: string) => void;
}

/** `unit` — per-package node:test suites via scripts/run-all-tests.cjs. */
export interface UnitOptions extends HarnessOptions {
  /** Run only the SOT-core packages (run-all-tests.cjs --core — fast). */
  readonly core?: boolean;
  /** Restrict to these package names (positional args to run-all-tests.cjs). */
  readonly packages?: readonly string[];
  /** Stop at the first failing package (run-all-tests.cjs --bail). */
  readonly bail?: boolean;
}

/** `conformance` — the R6 Stage-A ≡ Stage-B parity gate (tests/r6-corpus). */
export interface ConformanceOptions extends HarnessOptions {
  /** Override the R6 parity test path (absolute, or relative to rootDir). */
  readonly corpus?: string;
}

/** `fidelity` — the 0014 walker ≡ bytecode ≡ WASM differential harness. */
export interface FidelityOptions extends HarnessOptions {
  /** Override the fidelity-differential test path (absolute, or relative to rootDir). */
  readonly target?: string;
}

/** `e2e` — end-to-end compile of example apps through the shipped `galerina` CLI. */
export interface E2eOptions extends HarnessOptions {
  /** Example entry flows to compile (absolute, or relative to rootDir). */
  readonly examples?: readonly string[];
  /** Also run `galerina build` (not just `check`) on each entry. Default false. */
  readonly build?: boolean;
}

/** `all` — the aggregate over every check kind. */
export interface AllOptions
  extends UnitOptions,
    ConformanceOptions,
    FidelityOptions,
    E2eOptions {
  /** Stop the aggregate at the first failing check. Default false (run all, report all). */
  readonly bailScope?: boolean;
}
