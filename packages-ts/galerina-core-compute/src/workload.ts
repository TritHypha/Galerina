// Shared compute workload types (TODO pass, Grok 2026-10-05; owner may revisit).
// Planning data only: nothing here selects hardware or executes anything. V1 freeze:
// active selection stays on CPU/WASM; the other RuntimeTarget values are planning
// vocabulary so reports can say "not compatible" explicitly instead of guessing.

import type { ComputeDiagnostic } from "./index.js";

/** The 11 runtime targets a workload can be planned against. */
export type RuntimeTarget =
  | "cpu"
  | "node"
  | "wasm"
  | "browser-wasm"
  | "wasi"
  | "gpu"
  | "optical_io"
  | "photonic"
  | "native"
  | "serverless"
  | "edge";

export const RUNTIME_TARGETS: readonly RuntimeTarget[] = Object.freeze([
  "cpu", "node", "wasm", "browser-wasm", "wasi", "gpu", "optical_io", "photonic", "native", "serverless", "edge",
] as const);

export function isRuntimeTarget(value: unknown): value is RuntimeTarget {
  return typeof value === "string" && (RUNTIME_TARGETS as readonly string[]).includes(value);
}

export interface DataShape {
  readonly rank: number;
  readonly dimensions: readonly number[];
  readonly elementType: string;
  readonly byteSize: number;
  readonly sensitive: boolean;
  readonly streamable: boolean;
}

export interface DeploymentShape {
  readonly environment: "development" | "test" | "staging" | "production";
  readonly onDevice: boolean;
  readonly networkAllowed: boolean;
}

export type ComputeWorkloadShapeKind =
  | "scalar"
  | "vector"
  | "matrix"
  | "tensor"
  | "image"
  | "ai_inference"
  | "batch"
  | "stream"
  | "route";

export interface ComputeWorkload {
  readonly id: string;
  readonly kind: ComputeWorkloadShapeKind;
  readonly dataShape: DataShape;
  readonly deployment: DeploymentShape;
  readonly operationCount: number;
  readonly memoryMb: number;
  readonly deterministic: boolean;
  readonly effects: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly preferredTargets: readonly RuntimeTarget[];
  readonly fallbackTargets: readonly RuntimeTarget[];
}

const WORKLOAD_KINDS: readonly string[] = ["scalar", "vector", "matrix", "tensor", "image", "ai_inference", "batch", "stream", "route"];
const ENVIRONMENTS: readonly string[] = ["development", "test", "staging", "production"];

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/** Structural check for a workload. Fails closed: anything malformed is an error.
 * Hostile getters that throw are treated as invalid (never escape). */
export function validateComputeWorkload(workload: unknown): readonly ComputeDiagnostic[] {
  try {
  const out: ComputeDiagnostic[] = [];
  const bad = (path: string, message: string): void => {
    out.push({ code: "Galerina_COMPUTE_WORKLOAD_INVALID", severity: "error", message, path });
  };
  if (typeof workload !== "object" || workload === null || Array.isArray(workload)) {
    bad("workload", "Compute workload must be a plain record.");
    return out;
  }
  const w = workload as Record<string, unknown>;
  if (typeof w.id !== "string" || w.id.trim().length === 0) bad("id", "Workload id must be a non-empty string.");
  if (typeof w.kind !== "string" || !WORKLOAD_KINDS.includes(w.kind)) bad("kind", "Workload kind is not in the closed vocabulary.");
  if (!isNonNegativeSafeInteger(w.operationCount)) bad("operationCount", "operationCount must be a non-negative safe integer.");
  if (!isNonNegativeSafeInteger(w.memoryMb)) bad("memoryMb", "memoryMb must be a non-negative safe integer.");
  if (typeof w.deterministic !== "boolean") bad("deterministic", "deterministic must be Boolean.");
  if (!isStringList(w.effects)) bad("effects", "effects must be a list of non-empty strings.");
  if (!isStringList(w.requiredCapabilities)) bad("requiredCapabilities", "requiredCapabilities must be a list of non-empty strings.");
  for (const key of ["preferredTargets", "fallbackTargets"] as const) {
    const list = w[key];
    if (!Array.isArray(list) || !list.every(isRuntimeTarget)) bad(key, `${key} must list known RuntimeTarget values.`);
  }
  const shape = w.dataShape;
  if (typeof shape !== "object" || shape === null || Array.isArray(shape)) {
    bad("dataShape", "dataShape must be a plain record.");
  } else {
    const s = shape as Record<string, unknown>;
    if (!isNonNegativeSafeInteger(s.rank)) bad("dataShape.rank", "rank must be a non-negative safe integer.");
    if (!Array.isArray(s.dimensions) || !s.dimensions.every(isNonNegativeSafeInteger) || s.dimensions.length !== s.rank) bad("dataShape.dimensions", "dimensions must be rank non-negative safe integers.");
    if (typeof s.elementType !== "string" || s.elementType.length === 0) bad("dataShape.elementType", "elementType must be a non-empty string.");
    if (!isNonNegativeSafeInteger(s.byteSize)) bad("dataShape.byteSize", "byteSize must be a non-negative safe integer.");
    if (typeof s.sensitive !== "boolean") bad("dataShape.sensitive", "sensitive must be Boolean.");
    if (typeof s.streamable !== "boolean") bad("dataShape.streamable", "streamable must be Boolean.");
  }
  const dep = w.deployment;
  if (typeof dep !== "object" || dep === null || Array.isArray(dep)) {
    bad("deployment", "deployment must be a plain record.");
  } else {
    const d = dep as Record<string, unknown>;
    if (typeof d.environment !== "string" || !ENVIRONMENTS.includes(d.environment)) bad("deployment.environment", "environment is not in the closed vocabulary.");
    if (typeof d.onDevice !== "boolean") bad("deployment.onDevice", "onDevice must be Boolean.");
    if (typeof d.networkAllowed !== "boolean") bad("deployment.networkAllowed", "networkAllowed must be Boolean.");
  }
  return out;
  } catch {
    return [{ code: "Galerina_COMPUTE_WORKLOAD_INVALID", severity: "error", message: "Workload fields threw during validation.", path: "workload" }];
  }
}
