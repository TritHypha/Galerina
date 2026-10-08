// Phase 9 in-package comparison runners (P4c, SuperGrok 2026-10-08).
//
// Owner decision 2026-10-06 17:29 BST: comparison sides are `runtime|compiled`.
// `runtime` = the case run in TypeScript; `compiled` = the case run against
// compiled `.fungi` output. This module is the runner side that feeds
// `createBenchmarkComparisonReport`. It does not parse argv, spawn a child
// process, import core-cli, or touch OS/file/environment/network. The package
// border stays `node:util/types`.
//
// Runtime runner: runs one closed light TypeScript case already in this
// package (logic.bool_branch / logic.tri_match / logic.result_option), hashes
// the canonical generated input it actually described with the in-package
// FIPS SHA-256, and builds a runtime-only comparison report.
//
// Compiled runner: refusal pin only. Without a closed admitted-artefact
// record the call is refused. With one, compiled `.fungi` execution is still
// refused in this TypeScript package (owner/Codex must name an admitted
// artefact path; CROSS-DOMAIN Astra review + Codex sign-off if SLIDE/VOK).
//
// Output is evidence, not a verdict: shareable stays false and authority
// stays NON_AUTHORIZING because `createBenchmarkComparisonReport` pins those.

import { isProxy } from "node:util/types";

import { runBoolLogicBenchmark } from "./bool-logic-benchmark.js";
import {
  createBenchmarkComparisonReport,
  type BenchmarkComparisonDiagnostic,
  type BenchmarkComparisonReport,
} from "./comparison-report.js";
import { runResultOptionBenchmark } from "./result-option-benchmark.js";
import { benchSha256Hex } from "./sha256-benchmark.js";
import { runTriLogicBenchmark } from "./tri-logic-benchmark.js";

/** Runner input is not a closed plain record, or a field is outside its domain. */
export const FUNGI_BENCH_CMP_RUN_001 = "FUNGI-BENCH-CMP-RUN-001";
/** caseId is outside the closed in-package runtime comparison set. */
export const FUNGI_BENCH_CMP_RUN_002 = "FUNGI-BENCH-CMP-RUN-002";
/** Compiled side refuses without a closed admitted-artefact record. */
export const FUNGI_BENCH_CMP_RUN_003 = "FUNGI-BENCH-CMP-RUN-003";
/** Compiled `.fungi` execution is not admitted in this TypeScript package. */
export const FUNGI_BENCH_CMP_RUN_004 = "FUNGI-BENCH-CMP-RUN-004";

export const RUNTIME_COMPARISON_CASE_IDS = Object.freeze([
  "logic.bool_branch",
  "logic.tri_match",
  "logic.result_option",
] as const);
export type RuntimeComparisonCaseId = (typeof RUNTIME_COMPARISON_CASE_IDS)[number];

export const RUNTIME_COMPARISON_INPUT_KIND = "galerina.tools-benchmark.runtime-input/v1";

export const DEFAULT_RUNTIME_COMPARISON_OPERATIONS = 1_000;
export const MAX_RUNTIME_COMPARISON_OPERATIONS = 10_000;
export const DEFAULT_RUNTIME_COMPARISON_MAX_DURATION_MS = 1_000;
export const MAX_RUNTIME_COMPARISON_MAX_DURATION_MS = 5_000;

export const RUNTIME_COMPARISON_INPUT_FIELDS = Object.freeze([
  "caseId", "runtime", "operations", "maxDurationMs",
] as const);
export const COMPILED_COMPARISON_INPUT_FIELDS = Object.freeze([
  "caseId", "runtime", "compiler", "admittedArtifact",
] as const);
export const ADMITTED_ARTIFACT_FIELDS = Object.freeze(["digestSha256"] as const);

export interface ComparisonRunnerDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export type ComparisonRunnerResult =
  | { readonly ok: true; readonly report: BenchmarkComparisonReport; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly ComparisonRunnerDiagnostic[] };

const TOOL_NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
const TOOL_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const FLAG = /^--?[A-Za-z0-9][A-Za-z0-9_-]{0,47}(?:=[A-Za-z0-9._:,+-]{1,64})?$/u;

const fail = (code: string, message: string, path: string): ComparisonRunnerDiagnostic =>
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
  out: ComparisonRunnerDiagnostic[],
): Read {
  if (!isPlainRecord(value)) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Comparison runner records must be plain data records.", path));
    return { ok: false };
  }
  const allowed = new Set([...required, ...optional]);
  const values = new Map<string, unknown>();
  let clean = true;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Comparison runner record has an unknown or symbolic field; it was refused unread.", `${path}.<unknown>`));
      clean = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Comparison runner records must hold inert data properties, not accessors.", `${path}.${key}`));
      clean = false;
      continue;
    }
    values.set(key, descriptor.value);
  }
  for (const key of required) {
    if (!values.has(key) && clean) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Comparison runner record is missing a required field.", `${path}.${key}`));
      clean = false;
    }
  }
  return clean ? { ok: true, values } : { ok: false };
}

function readTool(value: unknown, path: string, out: ComparisonRunnerDiagnostic[]): { readonly name: string; readonly version: string } | null {
  const read = readClosed(value, ["name", "version"], [], path, out);
  if (!read.ok) return null;
  const name = read.values.get("name");
  const version = read.values.get("version");
  if (typeof name !== "string" || !TOOL_NAME.test(name)) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "runtime.name must be a short closed token.", `${path}.name`));
    return null;
  }
  if (typeof version !== "string" || !TOOL_VERSION.test(version)) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "runtime.version must be a short closed token.", `${path}.version`));
    return null;
  }
  return { name, version };
}

function readCompiler(value: unknown, path: string, out: ComparisonRunnerDiagnostic[]): { readonly name: string; readonly version: string; readonly flags: readonly string[] } | null {
  const read = readClosed(value, ["name", "version", "flags"], [], path, out);
  if (!read.ok) return null;
  const name = read.values.get("name");
  const version = read.values.get("version");
  const flags = read.values.get("flags");
  if (typeof name !== "string" || !TOOL_NAME.test(name)) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "compiler.name must be a short closed token.", `${path}.name`));
    return null;
  }
  if (typeof version !== "string" || !TOOL_VERSION.test(version)) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "compiler.version must be a short closed token.", `${path}.version`));
    return null;
  }
  let arrayOk = false;
  try {
    arrayOk = Array.isArray(flags) && !isProxy(flags) && Object.getPrototypeOf(flags) === Array.prototype;
  } catch {
    arrayOk = false;
  }
  if (!arrayOk || flags === undefined) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "compiler.flags must be a plain array of closed flag tokens.", `${path}.flags`));
    return null;
  }
  const list = flags as unknown[];
  if (list.length > 32) {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "compiler.flags exceeds 32 entries.", `${path}.flags`));
    return null;
  }
  const seen = new Set<string>();
  const outFlags: string[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const flag = list[index];
    if (typeof flag !== "string" || !FLAG.test(flag) || seen.has(flag)) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "compiler.flags must be unique closed tokens with no paths or spaces.", `${path}.flags.${index}`));
      return null;
    }
    seen.add(flag);
    outFlags.push(flag);
  }
  return { name, version, flags: Object.freeze(outFlags) };
}

function isRuntimeCaseId(value: unknown): value is RuntimeComparisonCaseId {
  return typeof value === "string" && (RUNTIME_COMPARISON_CASE_IDS as readonly string[]).includes(value);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return undefined;
  return value;
}

function generatedInputBytes(caseId: string, operations: number): Uint8Array {
  return new TextEncoder().encode(`${RUNTIME_COMPARISON_INPUT_KIND}\n${caseId}\n${operations}\n`);
}

function digestOf(bytes: Uint8Array): string | undefined {
  const hex = benchSha256Hex(bytes);
  if (typeof hex !== "string" || !DIGEST.test(hex)) return undefined;
  return hex;
}

function mapStatus(status: string): "passed" | "failed" | "skipped" | undefined {
  if (status === "passed" || status === "failed") return status;
  if (status === "skipped_timeout") return "skipped";
  return undefined;
}

function refuse(out: ComparisonRunnerDiagnostic[]): ComparisonRunnerResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze([...out]) });
}

function toRunnerDiagnostics(from: readonly BenchmarkComparisonDiagnostic[]): ComparisonRunnerDiagnostic[] {
  return from.map((d) => fail(d.code, d.message, d.path));
}

type CaseRun = (input: { readonly operations: number; readonly maxDurationMs: number }) =>
  | { readonly ok: true; readonly value: { readonly id: string; readonly status: string; readonly durationMs: number } }
  | { readonly ok: false };

const CASE_RUNS: Readonly<Record<RuntimeComparisonCaseId, CaseRun>> = Object.freeze({
  "logic.bool_branch": runBoolLogicBenchmark as CaseRun,
  "logic.tri_match": runTriLogicBenchmark as CaseRun,
  "logic.result_option": runResultOptionBenchmark as CaseRun,
});

/**
 * Run one closed light TypeScript case and build a runtime-only comparison report.
 * Never throws. Host supplies runtime identity; generated input is canonical.
 */
export function runRuntimeComparison(input: unknown): ComparisonRunnerResult {
  const out: ComparisonRunnerDiagnostic[] = [];
  try {
    const read = readClosed(input, ["caseId", "runtime"], ["operations", "maxDurationMs"], "runtimeComparison", out);
    if (!read.ok) return refuse(out);
    const caseId = read.values.get("caseId");
    if (!isRuntimeCaseId(caseId)) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_002, "caseId is outside the closed in-package runtime comparison set.", "runtimeComparison.caseId"));
      return refuse(out);
    }
    const runtime = readTool(read.values.get("runtime"), "runtimeComparison.runtime", out);
    if (runtime === null) return refuse(out);
    const operations = boundedInt(
      read.values.get("operations"),
      DEFAULT_RUNTIME_COMPARISON_OPERATIONS,
      1,
      MAX_RUNTIME_COMPARISON_OPERATIONS,
    );
    if (operations === undefined) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "operations must be a safe integer in 1..10000.", "runtimeComparison.operations"));
      return refuse(out);
    }
    const maxDurationMs = boundedInt(
      read.values.get("maxDurationMs"),
      DEFAULT_RUNTIME_COMPARISON_MAX_DURATION_MS,
      1,
      MAX_RUNTIME_COMPARISON_MAX_DURATION_MS,
    );
    if (maxDurationMs === undefined) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "maxDurationMs must be a safe integer in 1..5000.", "runtimeComparison.maxDurationMs"));
      return refuse(out);
    }
    const bytes = generatedInputBytes(caseId, operations);
    const inputDigestSha256 = digestOf(bytes);
    if (inputDigestSha256 === undefined) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Generated input digest could not be produced.", "runtimeComparison.input"));
      return refuse(out);
    }
    const run = CASE_RUNS[caseId];
    const outcome = run({ operations, maxDurationMs });
    if (!outcome.ok) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Light TypeScript case refused.", "runtimeComparison.case"));
      return refuse(out);
    }
    const status = mapStatus(outcome.value.status);
    if (status === undefined || outcome.value.id !== caseId) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Light TypeScript case returned an unusable result.", "runtimeComparison.case"));
      return refuse(out);
    }
    const durationMs = outcome.value.durationMs;
    const side = status === "skipped"
      ? { side: "runtime" as const, status, inputDigestSha256, runtime }
      : { side: "runtime" as const, status, durationMs, inputDigestSha256, runtime };
    const built = createBenchmarkComparisonReport({ caseId, sides: [side] });
    if (!built.ok) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(toRunnerDiagnostics(built.diagnostics)) });
    return Object.freeze({ ok: true as const, report: built.report, diagnostics: Object.freeze([]) as readonly [] });
  } catch {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Runtime comparison input could not be read safely.", "runtimeComparison"));
    return refuse(out);
  }
}

/**
 * Compiled comparison refusal pin. Never loads or executes `.fungi` or Wasm.
 */
export function runCompiledComparison(input: unknown): ComparisonRunnerResult {
  const out: ComparisonRunnerDiagnostic[] = [];
  try {
    const read = readClosed(input, ["caseId", "runtime", "compiler"], ["admittedArtifact"], "compiledComparison", out);
    if (!read.ok) return refuse(out);
    const caseId = read.values.get("caseId");
    if (!isRuntimeCaseId(caseId)) {
      out.push(fail(FUNGI_BENCH_CMP_RUN_002, "caseId is outside the closed in-package runtime comparison set.", "compiledComparison.caseId"));
      return refuse(out);
    }
    if (readTool(read.values.get("runtime"), "compiledComparison.runtime", out) === null) return refuse(out);
    if (readCompiler(read.values.get("compiler"), "compiledComparison.compiler", out) === null) return refuse(out);
    if (!read.values.has("admittedArtifact")) {
      out.push(fail(
        FUNGI_BENCH_CMP_RUN_003,
        "Compiled comparison refuses without a closed admitted-artefact record.",
        "compiledComparison.admittedArtifact",
      ));
      return refuse(out);
    }
    const artefact = readClosed(
      read.values.get("admittedArtifact"),
      ["digestSha256"],
      [],
      "compiledComparison.admittedArtifact",
      out,
    );
    if (!artefact.ok) return refuse(out);
    const digest = artefact.values.get("digestSha256");
    if (typeof digest !== "string" || !DIGEST.test(digest)) {
      out.push(fail(
        FUNGI_BENCH_CMP_RUN_003,
        "admittedArtifact.digestSha256 must be a lowercase 64-hex SHA-256.",
        "compiledComparison.admittedArtifact.digestSha256",
      ));
      return refuse(out);
    }
    out.push(fail(
      FUNGI_BENCH_CMP_RUN_004,
      "Compiled .fungi execution is not admitted in this TypeScript package. Owner/Codex must name an admitted artefact path; CROSS-DOMAIN Astra review plus Codex sign-off if SLIDE/VOK apply.",
      "compiledComparison.admittedArtifact",
    ));
    return refuse(out);
  } catch {
    out.push(fail(FUNGI_BENCH_CMP_RUN_001, "Compiled comparison input could not be read safely.", "compiledComparison"));
    return refuse(out);
  }
}
