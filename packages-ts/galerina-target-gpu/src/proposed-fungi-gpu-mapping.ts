// PROPOSED FUNGI-GPU-001..005 mapping of the live Galerina_GPU_* set.
// Not owner-approved FUNGI-CATEGORY-NNN registry ownership. Source still emits
// the legacy names. GPU_DIAGNOSTIC_CODES does not include FUNGI-GPU-*.

export const PROPOSED_FUNGI_GPU_MAPPING_SCHEMA =
  "galerina.target-gpu.proposed-fungi-gpu-mapping.v1" as const;

export const PROPOSED_FUNGI_GPU_STATUS = "PROPOSED_NOT_ADMITTED" as const;

export interface ProposedFungiGpuRow {
  readonly fungi: string;
  readonly legacy: string;
}

export const PROPOSED_FUNGI_GPU_MAPPING: readonly ProposedFungiGpuRow[] = Object.freeze([
  Object.freeze({ fungi: "FUNGI-GPU-001", legacy: "Galerina_GPU_INPUT_REFUSED" }),
  Object.freeze({ fungi: "FUNGI-GPU-002", legacy: "Galerina_GPU_PLAN_FLOW_REQUIRED" }),
  Object.freeze({ fungi: "FUNGI-GPU-003", legacy: "Galerina_GPU_PLAN_BACKEND_INVALID" }),
  Object.freeze({ fungi: "FUNGI-GPU-004", legacy: "Galerina_GPU_PLAN_BACKEND_UNAVAILABLE" }),
  Object.freeze({ fungi: "FUNGI-GPU-005", legacy: "Galerina_GPU_PLAN_NO_OPERATIONS" }),
]);
