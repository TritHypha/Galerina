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
