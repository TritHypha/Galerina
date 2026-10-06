// compute-plan.json emitter (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Built from a ComputePlan. Does not trust caller success: recomputed as
// diagnostics.length === 0. Diagnostic messages are withheld (fixed token); only
// FUNGI-form codes and closed field tokens are copied. Nested gpu/optical/compat
// copy only closed tokens. Exclusive create only (never overwrite). Limitations
// note advisory estimate only; no live GPU/optical/memory/energy/graph probe.

import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  PLAN_COMPAT_SCHEMA,
  PLAN_GPU_SCHEMA,
  PLAN_OPTICAL_SCHEMA,
  PLAN_RUNTIME_TARGETS,
  isPlanGpuSuitability,
  isPlanOpticalFallbackTarget,
  isPlanOpticalMode,
  isPlanOpticalNeed,
  isPlanRuntimeTarget,
  isPlanWasmTarget,
  type ComputePlan,
  type PlanRuntimeTarget,
  type PlanWasmTarget,
} from "./plan-contracts.js";

export const COMPUTE_PLAN_REPORT_SCHEMA = "galerina.compute-plan/v1";
export const COMPUTE_PLAN_REPORT_FILE = "compute-plan.json";

export const COMPUTE_PLAN_REPORT_LIMITATIONS: readonly string[] = Object.freeze([
  "closed-shape advisory estimate only; no live GPU / optical / memory probe",
  "does not walk a live plan-graph or measure energy",
  "GpuPlan.recommendedTarget is frozen to node under v1 (never an execution admission)",
]);

export interface ComputePlanReportDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: string;
}

export interface ComputePlanReportGpu {
  readonly schema: typeof PLAN_GPU_SCHEMA;
  readonly suitability: string;
  readonly recommendedTarget: "node";
  readonly diagnostics: readonly ComputePlanReportDiagnostic[];
}

export interface ComputePlanReportOptical {
  readonly schema: typeof PLAN_OPTICAL_SCHEMA;
  readonly need: string;
  readonly recommendedMode: string;
  readonly fallbackTarget: string;
  readonly diagnostics: readonly ComputePlanReportDiagnostic[];
}

export interface ComputePlanReportCompat {
  readonly schema: typeof PLAN_COMPAT_SCHEMA;
  readonly compatible: boolean;
  readonly targets: readonly PlanRuntimeTarget[];
  readonly diagnostics: readonly ComputePlanReportDiagnostic[];
}

export interface ComputePlanReport {
  readonly schema: typeof COMPUTE_PLAN_REPORT_SCHEMA;
  readonly success: boolean;
  readonly target: PlanRuntimeTarget;
  readonly gpu: ComputePlanReportGpu | null;
  readonly optical: ComputePlanReportOptical | null;
  readonly wasm: PlanWasmTarget | null;
  readonly compatibility: ComputePlanReportCompat | null;
  readonly estimatedMemoryMb: number;
  readonly parallelism: number;
  readonly diagnostics: readonly ComputePlanReportDiagnostic[];
  readonly limitations: readonly string[];
  readonly generatedAt?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CODE = /^FUNGI-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_MEMORY_MB = 1_048_576;
const MAX_PARALLELISM = 65_536;
const TARGET_FALLBACK: PlanRuntimeTarget = PLAN_RUNTIME_TARGETS[0] as PlanRuntimeTarget;

const get = (o: unknown, key: string): unknown => {
  if (o === null || typeof o !== "object") return undefined;
  try {
    return (o as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
};
const list = (v: unknown): readonly unknown[] => {
  try {
    return Array.isArray(v) ? Array.from(v as readonly unknown[]) : [];
  } catch {
    return [];
  }
};
const safeCode = (v: unknown): string => (typeof v === "string" && CODE.test(v) ? v : "code withheld");
const safeField = (v: unknown): string => (typeof v === "string" && FIELD.test(v) ? v : "field");

function copyDiagnostic(d: unknown): ComputePlanReportDiagnostic {
  return Object.freeze({
    code: safeCode(get(d, "code")),
    severity: "error" as const,
    message: "diagnostic message withheld",
    field: safeField(get(d, "field")),
  });
}

function copyGpu(v: unknown): ComputePlanReportGpu | null {
  if (v === null || v === undefined) return null;
  const suitabilityRaw = get(v, "suitability");
  const suitability = isPlanGpuSuitability(suitabilityRaw) ? suitabilityRaw : "unknown";
  return Object.freeze({
    schema: PLAN_GPU_SCHEMA,
    suitability,
    recommendedTarget: "node" as const,
    diagnostics: Object.freeze(list(get(v, "diagnostics")).map(copyDiagnostic)),
  });
}

function copyOptical(v: unknown): ComputePlanReportOptical | null {
  if (v === null || v === undefined) return null;
  const needRaw = get(v, "need");
  const modeRaw = get(v, "recommendedMode");
  const fallbackRaw = get(v, "fallbackTarget");
  return Object.freeze({
    schema: PLAN_OPTICAL_SCHEMA,
    need: isPlanOpticalNeed(needRaw) ? needRaw : "unknown",
    recommendedMode: isPlanOpticalMode(modeRaw) ? modeRaw : "none",
    fallbackTarget: isPlanOpticalFallbackTarget(fallbackRaw) ? fallbackRaw : "cpu",
    diagnostics: Object.freeze(list(get(v, "diagnostics")).map(copyDiagnostic)),
  });
}

function copyCompat(v: unknown): ComputePlanReportCompat | null {
  if (v === null || v === undefined) return null;
  const compatible = get(v, "compatible") === true;
  const targets: PlanRuntimeTarget[] = [];
  for (const t of list(get(v, "targets"))) {
    if (isPlanRuntimeTarget(t)) targets.push(t);
  }
  return Object.freeze({
    schema: PLAN_COMPAT_SCHEMA,
    compatible,
    targets: Object.freeze(targets),
    diagnostics: Object.freeze(list(get(v, "diagnostics")).map(copyDiagnostic)),
  });
}

function copyBoundedInt(v: unknown, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && Number.isSafeInteger(v) && v >= 0 && v <= max
    ? v
    : 0;
}

/** Build a frozen, JSON-safe compute-plan report. Throws RangeError for a malformed generatedAt. */
export function createComputePlanReport(
  plan: ComputePlan,
  options: { readonly generatedAt?: string } = {},
): ComputePlanReport {
  const generatedAt = options.generatedAt;
  if (
    generatedAt !== undefined &&
    (typeof generatedAt !== "string" || !ISO_UTC.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)))
  ) {
    throw new RangeError("generatedAt must be a UTC ISO-8601 timestamp ending in Z.");
  }
  const diagnostics = list(get(plan, "diagnostics")).map(copyDiagnostic);
  const targetRaw = get(plan, "target");
  const target: PlanRuntimeTarget = isPlanRuntimeTarget(targetRaw) ? targetRaw : TARGET_FALLBACK;
  const wasmRaw = get(plan, "wasm");
  const wasm: PlanWasmTarget | null = wasmRaw === null || wasmRaw === undefined
    ? null
    : isPlanWasmTarget(wasmRaw)
      ? wasmRaw
      : null;
  const success = diagnostics.length === 0;
  const report: ComputePlanReport = {
    schema: COMPUTE_PLAN_REPORT_SCHEMA,
    success,
    target,
    gpu: copyGpu(get(plan, "gpu")),
    optical: copyOptical(get(plan, "optical")),
    wasm,
    compatibility: copyCompat(get(plan, "compatibility")),
    estimatedMemoryMb: copyBoundedInt(get(plan, "estimatedMemoryMb"), MAX_MEMORY_MB),
    parallelism: copyBoundedInt(get(plan, "parallelism"), MAX_PARALLELISM),
    diagnostics: Object.freeze(diagnostics),
    limitations: COMPUTE_PLAN_REPORT_LIMITATIONS,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  };
  return Object.freeze(report);
}

export function renderComputePlanReport(report: ComputePlanReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}

/**
 * Write compute-plan.json into an existing directory. Exclusive create only.
 * Caller maps failures to a fixed CLI code (never echo paths).
 */
export async function writeComputePlanReport(
  plan: ComputePlan,
  outDir: string,
  options: { readonly generatedAt?: string } = {},
): Promise<{ readonly report: ComputePlanReport }> {
  if (typeof outDir !== "string" || outDir.length === 0) throw new TypeError("outDir must be a non-empty string.");
  const dir = await realpath(outDir);
  if (!(await stat(dir)).isDirectory()) throw new TypeError("outDir must be a directory.");
  const report = createComputePlanReport(plan, options);
  const path = join(dir, COMPUTE_PLAN_REPORT_FILE);
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_EXCL |
    (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0));
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(renderComputePlanReport(report), "utf8");
  } finally {
    await handle.close();
  }
  return Object.freeze({ report });
}

