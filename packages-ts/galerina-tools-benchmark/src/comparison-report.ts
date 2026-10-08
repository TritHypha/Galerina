// Phase 9 comparison report contract (Grok 2026-10-06; zero-trust defaults,
// owner may revisit).
//
// Owner decision 2026-10-06 17:29 BST: `--compare` takes `runtime|compiled`.
// `runtime` = the case run in TypeScript; `compiled` = the case run against the
// compiled `.fungi` output. README "External Runtime Comparisons": "The
// comparison must use the same generated input data, record runtime or compiler
// versions and remain optional for normal benchmark runs."
//
// This module is the report side only. It does not run either side and does
// not load or compile anything:
//  - Pure and injectable. The host supplies each side's result, the digest of
//    the generated input it actually fed, and its runtime (and, for the
//    compiled side, compiler) identity. No OS, file, environment, network or
//    clock read; the package border stays `node:util/types`.
//  - Same input or no comparison: every side must carry the same lowercase
//    SHA-256 input digest, otherwise the report is refused.
//  - Versions are recorded, never guessed: the runtime side records its
//    runtime; the compiled side records its runtime and its compiler name,
//    version and flags ("where applicable" = compiled side only; a compiler on
//    the runtime side is refused).
//  - Closed shapes: inert own data properties only; proxies, accessors, symbol
//    or unknown keys and non-plain prototypes are refused unread. Never throws,
//    never echoes a refused value. Flags carry no paths or spaces.
//  - Output is evidence, not a verdict: `shareable` is always false and
//    `authority` is always "NON_AUTHORIZING".
//
// Runtime/compiled runners live in `comparison-runner.ts`. `--save` of the
// comparison report stays with parked draft #149.

import { isProxy } from "node:util/types";

export const BENCHMARK_COMPARISON_SCHEMA = "galerina.tools-benchmark.comparison/v1";

export const BENCHMARK_COMPARE_SIDES = Object.freeze(["runtime", "compiled"] as const);
export type BenchmarkCompareSide = (typeof BENCHMARK_COMPARE_SIDES)[number];

export const BENCHMARK_COMPARISON_STATUSES = Object.freeze(["passed", "failed", "skipped"] as const);
export type BenchmarkComparisonStatus = (typeof BENCHMARK_COMPARISON_STATUSES)[number];

export const BENCHMARK_COMPARISON_LIMITS = Object.freeze({
  maxCaseIdLength: 96,
  maxFlags: 32,
  maxDurationMs: 24 * 60 * 60 * 1000,
});

export const FUNGI_BENCH_CMP_SHAPE = "FUNGI-BENCH-CMP-001";
export const FUNGI_BENCH_CMP_INPUT_MISMATCH = "FUNGI-BENCH-CMP-002";
export const FUNGI_BENCH_CMP_VERSION_RECORD = "FUNGI-BENCH-CMP-003";
export const FUNGI_BENCH_CMP_SIDES = "FUNGI-BENCH-CMP-004";
export const FUNGI_BENCH_CMP_RESULT = "FUNGI-BENCH-CMP-005";

export interface BenchmarkComparisonDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export interface BenchmarkToolIdentity {
  readonly name: string;
  readonly version: string;
}

export interface BenchmarkCompilerIdentity extends BenchmarkToolIdentity {
  readonly flags: readonly string[];
}

export interface BenchmarkComparisonSideResult {
  readonly side: BenchmarkCompareSide;
  readonly status: BenchmarkComparisonStatus;
  readonly durationMs?: number;
  readonly inputDigestSha256: string;
  readonly runtime: BenchmarkToolIdentity;
  readonly compiler?: BenchmarkCompilerIdentity;
}

export interface BenchmarkComparisonInput {
  readonly caseId: string;
  readonly sides: readonly BenchmarkComparisonSideResult[];
}

export interface BenchmarkComparisonReport {
  readonly schema: typeof BENCHMARK_COMPARISON_SCHEMA;
  readonly caseId: string;
  readonly sameInput: true;
  readonly inputDigestSha256: string;
  readonly sides: readonly BenchmarkComparisonSideResult[];
  /** Present only when both sides passed with a positive duration. runtime/compiled, 3 decimals. */
  readonly durationRatioRuntimeOverCompiled?: number;
  readonly shareable: false;
  readonly authority: "NON_AUTHORIZING";
}

export type BenchmarkComparisonResult =
  | { readonly ok: true; readonly report: BenchmarkComparisonReport; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly BenchmarkComparisonDiagnostic[] };

const CASE_ID = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const TOOL_NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
const TOOL_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/u;
const FLAG = /^--?[A-Za-z0-9][A-Za-z0-9_-]{0,47}(?:=[A-Za-z0-9._:,+-]{1,64})?$/u;

const fail = (code: string, message: string, path: string): BenchmarkComparisonDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, path });

type Read = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function isPlainRecord(value: unknown): value is object {
  try {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function readClosed(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  out: BenchmarkComparisonDiagnostic[],
): Read {
  if (!isPlainRecord(value)) {
    out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Comparison records must be plain data records.", path));
    return { ok: false };
  }
  const allowed = new Set([...required, ...optional]);
  const values = new Map<string, unknown>();
  let clean = true;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Comparison record has an unknown or symbolic field; it was refused unread.", `${path}.<unknown>`));
      clean = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Comparison records must hold inert data properties, not accessors.", `${path}.${key}`));
      clean = false;
      continue;
    }
    values.set(key, descriptor.value);
  }
  for (const key of required) {
    if (!values.has(key) && clean) {
      out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Comparison record is missing a required field.", `${path}.${key}`));
      clean = false;
    }
  }
  return clean ? { ok: true, values } : { ok: false };
}

function readDenseArray(value: unknown, max: number, path: string, code: string, out: BenchmarkComparisonDiagnostic[]): readonly unknown[] | null {
  let ok = false;
  try {
    ok = Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Array.prototype;
  } catch {
    ok = false;
  }
  if (!ok) {
    out.push(fail(code, "Expected a plain array.", path));
    return null;
  }
  const array = value as unknown[];
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, "length");
  const length = lengthDescriptor !== undefined && "value" in lengthDescriptor ? lengthDescriptor.value : -1;
  if (typeof length !== "number" || length > max) {
    out.push(fail(code, `Array exceeds the limit of ${max} entries.`, path));
    return null;
  }
  const keys = Reflect.ownKeys(array);
  if (keys.length !== length + 1) {
    out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Array must be dense with no extra properties.", path));
    return null;
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Array entries must be inert data properties.", `${path}.${index}`));
      return null;
    }
    items.push(descriptor.value);
  }
  return items;
}

function readTool(value: unknown, path: string, withFlags: boolean, out: BenchmarkComparisonDiagnostic[]): BenchmarkToolIdentity | BenchmarkCompilerIdentity | null {
  const read = readClosed(value, withFlags ? ["name", "version", "flags"] : ["name", "version"], [], path, out);
  if (!read.ok) return null;
  const name = read.values.get("name");
  const version = read.values.get("version");
  let ok = true;
  if (typeof name !== "string" || !TOOL_NAME.test(name)) {
    out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "Tool name must be a short lowercase identifier.", `${path}.name`));
    ok = false;
  }
  if (typeof version !== "string" || !TOOL_VERSION.test(version)) {
    out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "Tool version must be a short version token (no spaces or paths).", `${path}.version`));
    ok = false;
  }
  if (!withFlags) return ok ? Object.freeze({ name: name as string, version: version as string }) : null;
  const flags = readDenseArray(read.values.get("flags"), BENCHMARK_COMPARISON_LIMITS.maxFlags, `${path}.flags`, FUNGI_BENCH_CMP_VERSION_RECORD, out);
  if (flags === null) return null;
  const seen = new Set<string>();
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (typeof flag !== "string" || !FLAG.test(flag)) {
      out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "Compiler flag must be a plain --flag or --flag=value token (no paths or spaces).", `${path}.flags.${index}`));
      ok = false;
    } else if (seen.has(flag)) {
      out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "Compiler flags must not repeat.", `${path}.flags.${index}`));
      ok = false;
    } else {
      seen.add(flag);
    }
  }
  return ok ? Object.freeze({ name: name as string, version: version as string, flags: Object.freeze([...seen]) }) : null;
}

function readSide(value: unknown, path: string, out: BenchmarkComparisonDiagnostic[]): BenchmarkComparisonSideResult | null {
  const read = readClosed(value, ["side", "status", "inputDigestSha256", "runtime"], ["durationMs", "compiler"], path, out);
  if (!read.ok) return null;
  const side = read.values.get("side");
  const status = read.values.get("status");
  const digest = read.values.get("inputDigestSha256");
  let ok = true;
  if (typeof side !== "string" || !(BENCHMARK_COMPARE_SIDES as readonly string[]).includes(side)) {
    out.push(fail(FUNGI_BENCH_CMP_SIDES, "Side must be runtime or compiled.", `${path}.side`));
    return null;
  }
  if (typeof status !== "string" || !(BENCHMARK_COMPARISON_STATUSES as readonly string[]).includes(status)) {
    out.push(fail(FUNGI_BENCH_CMP_RESULT, "Status must be passed, failed or skipped.", `${path}.status`));
    ok = false;
  }
  let durationMs: number | undefined;
  if (read.values.has("durationMs")) {
    const duration = read.values.get("durationMs");
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > BENCHMARK_COMPARISON_LIMITS.maxDurationMs) {
      out.push(fail(FUNGI_BENCH_CMP_RESULT, "durationMs must be a finite, non-negative number within the limit.", `${path}.durationMs`));
      ok = false;
    } else {
      durationMs = duration;
    }
  }
  if (status === "passed" && !read.values.has("durationMs")) {
    out.push(fail(FUNGI_BENCH_CMP_RESULT, "A passed side must record durationMs.", `${path}.durationMs`));
    ok = false;
  }
  if (typeof digest !== "string" || !DIGEST.test(digest)) {
    out.push(fail(FUNGI_BENCH_CMP_INPUT_MISMATCH, "inputDigestSha256 must be 64 lowercase hex characters.", `${path}.inputDigestSha256`));
    ok = false;
  }
  const runtime = readTool(read.values.get("runtime"), `${path}.runtime`, false, out);
  if (runtime === null) ok = false;
  let compiler: BenchmarkCompilerIdentity | undefined;
  if (side === "compiled") {
    if (!read.values.has("compiler")) {
      out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "The compiled side must record its compiler name, version and flags.", `${path}.compiler`));
      ok = false;
    } else {
      const tool = readTool(read.values.get("compiler"), `${path}.compiler`, true, out);
      if (tool === null) ok = false;
      else compiler = tool as BenchmarkCompilerIdentity;
    }
  } else if (read.values.has("compiler")) {
    out.push(fail(FUNGI_BENCH_CMP_VERSION_RECORD, "The runtime side runs TypeScript directly and must not record a compiler.", `${path}.compiler`));
    ok = false;
  }
  if (!ok) return null;
  return Object.freeze({
    side: side as BenchmarkCompareSide,
    status: status as BenchmarkComparisonStatus,
    ...(durationMs === undefined ? {} : { durationMs }),
    inputDigestSha256: digest as string,
    runtime: runtime as BenchmarkToolIdentity,
    ...(compiler === undefined ? {} : { compiler }),
  });
}

/**
 * Build a Phase 9 comparison report from host-supplied side results.
 * Refuses (ok: false) on any closure, input, version or side problem; never throws.
 */
export function createBenchmarkComparisonReport(input: unknown): BenchmarkComparisonResult {
  const out: BenchmarkComparisonDiagnostic[] = [];
  const refuse = (): BenchmarkComparisonResult => Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
  try {
    const read = readClosed(input, ["caseId", "sides"], [], "comparison", out);
    if (!read.ok) return refuse();
    const caseId = read.values.get("caseId");
    if (typeof caseId !== "string" || caseId.length > BENCHMARK_COMPARISON_LIMITS.maxCaseIdLength || !CASE_ID.test(caseId)) {
      out.push(fail(FUNGI_BENCH_CMP_RESULT, "caseId must be a dotted lowercase benchmark id.", "comparison.caseId"));
    }
    const rawSides = readDenseArray(read.values.get("sides"), BENCHMARK_COMPARE_SIDES.length, "comparison.sides", FUNGI_BENCH_CMP_SIDES, out);
    if (rawSides === null) return refuse();
    if (rawSides.length === 0) {
      out.push(fail(FUNGI_BENCH_CMP_SIDES, "A comparison needs at least one side.", "comparison.sides"));
      return refuse();
    }
    const sides: BenchmarkComparisonSideResult[] = [];
    const seen = new Set<string>();
    rawSides.forEach((raw, index) => {
      const side = readSide(raw, `comparison.sides.${index}`, out);
      if (side === null) return;
      if (seen.has(side.side)) {
        out.push(fail(FUNGI_BENCH_CMP_SIDES, "Each side may appear only once.", `comparison.sides.${index}.side`));
        return;
      }
      seen.add(side.side);
      sides.push(side);
    });
    if (out.length > 0) return refuse();
    const first = sides[0];
    if (first === undefined) return refuse();
    const digest = first.inputDigestSha256;
    if (sides.some((side) => side.inputDigestSha256 !== digest)) {
      out.push(fail(FUNGI_BENCH_CMP_INPUT_MISMATCH, "Sides did not use the same generated input data; no comparison is made.", "comparison.sides"));
      return refuse();
    }
    const ordered = BENCHMARK_COMPARE_SIDES
      .map((name) => sides.find((side) => side.side === name))
      .filter((side): side is BenchmarkComparisonSideResult => side !== undefined);
    const runtime = ordered.find((side) => side.side === "runtime");
    const compiled = ordered.find((side) => side.side === "compiled");
    let ratio: number | undefined;
    if (runtime?.status === "passed" && compiled?.status === "passed"
      && runtime.durationMs !== undefined && compiled.durationMs !== undefined
      && runtime.durationMs > 0 && compiled.durationMs > 0) {
      const value = Math.round((runtime.durationMs / compiled.durationMs) * 1000) / 1000;
      if (Number.isFinite(value)) ratio = value;
    }
    const report: BenchmarkComparisonReport = Object.freeze({
      schema: BENCHMARK_COMPARISON_SCHEMA,
      caseId: caseId as string,
      sameInput: true as const,
      inputDigestSha256: digest,
      sides: Object.freeze(ordered),
      ...(ratio === undefined ? {} : { durationRatioRuntimeOverCompiled: ratio }),
      shareable: false as const,
      authority: "NON_AUTHORIZING" as const,
    });
    return Object.freeze({ ok: true as const, report, diagnostics: Object.freeze([]) as readonly [] });
  } catch {
    out.push(fail(FUNGI_BENCH_CMP_SHAPE, "Comparison input could not be read safely.", "comparison"));
    return refuse();
  }
}
