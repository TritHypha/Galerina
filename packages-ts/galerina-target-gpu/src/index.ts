import { isProxy as isNodeProxy } from "node:util/types";

export interface GpuTargetCapability {
  readonly name: string;
  readonly backend: "cuda" | "rocm" | "webgpu" | "vulkan" | "plan-only";
  readonly features: readonly string[];
}

export interface GpuKernelPlan {
  readonly flow: string;
  readonly backend: GpuTargetCapability["backend"];
  readonly operations: readonly string[];
}

export interface GpuTargetReport {
  readonly capabilities: readonly GpuTargetCapability[];
  readonly plans: readonly GpuKernelPlan[];
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for kernel plans that arrive as untrusted parsed JSON. Fail-closed,
// mirroring the green sibling target packages (target-cpu, target-ai-accelerator):
// a plan may not target a backend the host does not advertise.

export type GpuDiagnosticSeverity = "warning" | "error";

export interface GpuDiagnostic {
  readonly code: string;
  readonly severity: GpuDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const GPU_BACKENDS: readonly GpuTargetCapability["backend"][] = [
  "cuda", "rocm", "webgpu", "vulkan", "plan-only",
];

function gpuDiagnostic(
  code: string,
  severity: GpuDiagnosticSeverity,
  message: string,
  path?: string,
): GpuDiagnostic {
  return Object.freeze({ code, severity, message, ...(path === undefined ? {} : { path }) });
}

type GpuDecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: GpuDiagnostic };

const MAX_GPU_ARRAY_ITEMS = 1024;
const MAX_GPU_STRING_LENGTH = 512;

function gpuDecodeFailure(path: string, detail: string): GpuDecodeResult<never> {
  return {
    diagnostic: gpuDiagnostic(
      "Galerina_GPU_INPUT_REFUSED",
      "error",
      `GPU input refused: ${detail}.`,
      path,
    ),
  };
}

function isGpuDecodeFailure<T>(result: GpuDecodeResult<T>): result is { readonly diagnostic: GpuDiagnostic } {
  return "diagnostic" in result;
}

function gpuDecodeRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): GpuDecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isNodeProxy(value)) {
      return gpuDecodeFailure(path, "expected a non-proxy plain record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return gpuDecodeFailure(path, "inherited or non-plain records are refused");
    }
    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (
      stringKeys.length !== keys.length
      || stringKeys.some((key) => !allowedKeys.includes(key))
      || requiredKeys.some((key) => !stringKeys.includes(key))
    ) {
      return gpuDecodeFailure(path, "surplus, symbol, or missing fields are refused");
    }
    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return gpuDecodeFailure(`${path}.${key}`, "accessor or non-enumerable fields are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return gpuDecodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function gpuDecodeArray(value: unknown, path: string): GpuDecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || isNodeProxy(value)) {
      return gpuDecodeFailure(path, "expected a plain non-proxy array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined
      || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_GPU_ARRAY_ITEMS
    ) {
      return gpuDecodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return gpuDecodeFailure(path, "sparse or surplus array fields are refused");
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!keys.includes(key) || descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return gpuDecodeFailure(`${path}.${index}`, "array elements must be own enumerable data");
      }
      copy.push(descriptor.value);
    }
    return { value: Object.freeze(copy) };
  } catch {
    return gpuDecodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function gpuDecodeString(value: unknown, path: string, allowEmpty = false): GpuDecodeResult<string> {
  if (typeof value !== "string" || value.length > MAX_GPU_STRING_LENGTH || (!allowEmpty && value.length === 0)) {
    return gpuDecodeFailure(path, "expected a bounded string");
  }
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character === "\u007f")) {
    return gpuDecodeFailure(path, "control characters are refused");
  }
  return { value };
}

function gpuDecodeStringArray(value: unknown, path: string): GpuDecodeResult<readonly string[]> {
  const array = gpuDecodeArray(value, path);
  if (isGpuDecodeFailure(array)) return array;
  const copy: string[] = [];
  for (const [index, item] of array.value.entries()) {
    const decoded = gpuDecodeString(item, `${path}.${index}`);
    if (isGpuDecodeFailure(decoded)) return decoded;
    copy.push(decoded.value);
  }
  return { value: Object.freeze(copy) };
}

function gpuDecodeCapability(value: unknown, path: string): GpuDecodeResult<GpuTargetCapability> {
  const record = gpuDecodeRecord(value, ["name", "backend", "features"], ["name", "backend", "features"], path);
  if (isGpuDecodeFailure(record)) return record;
  const name = gpuDecodeString(record.value.name, `${path}.name`);
  if (isGpuDecodeFailure(name)) return name;
  const backend = gpuDecodeString(record.value.backend, `${path}.backend`);
  if (isGpuDecodeFailure(backend)) return backend;
  if (!GPU_BACKENDS.includes(backend.value as GpuTargetCapability["backend"])) {
    return gpuDecodeFailure(`${path}.backend`, "unknown GPU backend vocabulary");
  }
  const features = gpuDecodeStringArray(record.value.features, `${path}.features`);
  if (isGpuDecodeFailure(features)) return features;
  return { value: Object.freeze({ name: name.value, backend: backend.value as GpuTargetCapability["backend"], features: features.value }) };
}

function gpuDecodePlan(value: unknown, path: string): GpuDecodeResult<GpuKernelPlan> {
  const record = gpuDecodeRecord(value, ["flow", "backend", "operations"], ["flow", "backend", "operations"], path);
  if (isGpuDecodeFailure(record)) return record;
  const flow = gpuDecodeString(record.value.flow, `${path}.flow`, true);
  if (isGpuDecodeFailure(flow)) return flow;
  const backend = gpuDecodeString(record.value.backend, `${path}.backend`);
  if (isGpuDecodeFailure(backend)) return backend;
  const operations = gpuDecodeStringArray(record.value.operations, `${path}.operations`);
  if (isGpuDecodeFailure(operations)) return operations;
  return { value: Object.freeze({ flow: flow.value, backend: backend.value as GpuKernelPlan["backend"], operations: operations.value }) };
}

function gpuDecodeCapabilities(value: unknown, path: string): GpuDecodeResult<readonly GpuTargetCapability[]> {
  const array = gpuDecodeArray(value, path);
  if (isGpuDecodeFailure(array)) return array;
  const capabilities: GpuTargetCapability[] = [];
  for (const [index, capability] of array.value.entries()) {
    const decoded = gpuDecodeCapability(capability, `${path}.${index}`);
    if (isGpuDecodeFailure(decoded)) return decoded;
    capabilities.push(decoded.value);
  }
  return { value: Object.freeze(capabilities) };
}

function gpuDecodePlans(value: unknown, path: string): GpuDecodeResult<readonly GpuKernelPlan[]> {
  const array = gpuDecodeArray(value, path);
  if (isGpuDecodeFailure(array)) return array;
  const plans: GpuKernelPlan[] = [];
  for (const [index, plan] of array.value.entries()) {
    const decoded = gpuDecodePlan(plan, `${path}.${index}`);
    if (isGpuDecodeFailure(decoded)) return decoded;
    plans.push(decoded.value);
  }
  return { value: Object.freeze(plans) };
}

// A kernel plan must name its flow, use a known backend, list at least one
// operation, and — fail-closed — only target a backend that appears in the
// available capabilities (you cannot lower onto hardware the host lacks).
export function validateGpuKernelPlan(
  plan: unknown,
  capabilities: unknown,
  path = "plan",
): readonly GpuDiagnostic[] {
  const decodedPlan = gpuDecodePlan(plan, path);
  if (isGpuDecodeFailure(decodedPlan)) return [decodedPlan.diagnostic];
  const decodedCapabilities = gpuDecodeCapabilities(capabilities, "capabilities");
  if (isGpuDecodeFailure(decodedCapabilities)) return [decodedCapabilities.diagnostic];
  const safePlan = decodedPlan.value;
  const safeCapabilities = decodedCapabilities.value;
  const diagnostics: GpuDiagnostic[] = [];

  if (safePlan.flow.trim().length === 0) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_FLOW_REQUIRED",
      "error",
      "GPU kernel plan requires a flow.",
      `${path}.flow`,
    ));
  }

  if (!GPU_BACKENDS.includes(safePlan.backend)) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_BACKEND_INVALID",
      "error",
      `GPU kernel plan backend must be one of: ${GPU_BACKENDS.join(", ")}.`,
      `${path}.backend`,
    ));
  } else if (!safeCapabilities.some((c) => c.backend === safePlan.backend)) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE",
      "error",
      `GPU kernel plan targets backend "${safePlan.backend}" which no advertised capability provides.`,
      `${path}.backend`,
    ));
  }

  if (safePlan.operations.length === 0) {
    diagnostics.push(gpuDiagnostic(
      "Galerina_GPU_PLAN_NO_OPERATIONS",
      "error",
      "GPU kernel plan lists no operations; it would do nothing.",
      `${path}.operations`,
    ));
  }

  return diagnostics;
}

// Build a GPU target report, validating every plan against the advertised
// capabilities and surfacing warnings.
export function createGpuTargetReport(input: {
  readonly capabilities: readonly GpuTargetCapability[];
  readonly plans: readonly GpuKernelPlan[];
}): { readonly report: GpuTargetReport; readonly diagnostics: readonly GpuDiagnostic[] } {
  const record = gpuDecodeRecord(input, ["capabilities", "plans"], ["capabilities", "plans"], "input");
  if (isGpuDecodeFailure(record)) {
    return {
      report: Object.freeze({ capabilities: Object.freeze([]), plans: Object.freeze([]), warnings: Object.freeze([record.diagnostic.message]) }),
      diagnostics: Object.freeze([record.diagnostic]),
    };
  }
  const capabilities = gpuDecodeCapabilities(record.value.capabilities, "capabilities");
  const plans = gpuDecodePlans(record.value.plans, "plans");
  const refusedReport = (diagnostic: GpuDiagnostic) => {
    return {
      report: Object.freeze({ capabilities: Object.freeze([]), plans: Object.freeze([]), warnings: Object.freeze([diagnostic.message]) }),
      diagnostics: Object.freeze([diagnostic]),
    };
  };
  if (isGpuDecodeFailure(capabilities)) return refusedReport(capabilities.diagnostic);
  if (isGpuDecodeFailure(plans)) return refusedReport(plans.diagnostic);
  const safeCapabilities = capabilities.value;
  const safePlans = plans.value;
  const diagnostics: GpuDiagnostic[] = [];
  const warnings: string[] = [];

  safePlans.forEach((plan, index) => {
    for (const d of validateGpuKernelPlan(plan, safeCapabilities, `plans.${index}`)) {
      diagnostics.push(d);
      if (d.severity === "warning") warnings.push(d.message);
    }
  });

  return {
    report: Object.freeze({ capabilities: safeCapabilities, plans: safePlans, warnings: Object.freeze(warnings) }),
    diagnostics: Object.freeze(diagnostics),
  };
}
