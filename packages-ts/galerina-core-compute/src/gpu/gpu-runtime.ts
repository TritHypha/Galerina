// GPU runtime architecture vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit.
// Documents the planned pipeline as an ordered closed list. No stage is
// executable here; vendor plugins are named only (not loaded).

/** Ordered planning stages: compute planner -> GPU scheduler -> ... -> backend. */
export const GPU_RUNTIME_ARCHITECTURE_STAGES = Object.freeze([
  "compute_planner",
  "gpu_scheduler",
  "buffer_manager",
  "kernel_adapter",
  "gpu_backend",
] as const);

export type GpuRuntimeArchitectureStage = (typeof GPU_RUNTIME_ARCHITECTURE_STAGES)[number];

/** Vendor-neutral adapter plugin names (runtime plugins, not language syntax). */
export const GPU_VENDOR_ADAPTERS = Object.freeze([
  "cuda",
  "rocm",
  "metal",
  "vulkan",
] as const);

export type GpuVendorAdapter = (typeof GPU_VENDOR_ADAPTERS)[number];

/** V1 freeze: no vendor adapter is admitted for execution. */
export const V1_ADMITTED_GPU_VENDOR_ADAPTERS = Object.freeze([] as const);

export function isGpuVendorAdapter(value: unknown): value is GpuVendorAdapter {
  return typeof value === "string" && (GPU_VENDOR_ADAPTERS as readonly string[]).includes(value);
}

export function isGpuVendorAdapterAdmitted(_value: GpuVendorAdapter): boolean {
  return false;
}
