// Optical runtime architecture vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Documents the planned pipeline as an
// ordered closed list. No stage is executable here.

/** Ordered planning stages for optical/photonic transport. */
export const OPTICAL_RUNTIME_ARCHITECTURE_STAGES = Object.freeze([
  "optical_planner",
  "topology_resolver",
  "wavelength_allocator",
  "transport_adapter",
  "optical_backend",
] as const);

export type OpticalRuntimeArchitectureStage = (typeof OPTICAL_RUNTIME_ARCHITECTURE_STAGES)[number];

/** OpticalTransport capability stays planning_only under the v1 freeze. */
export const V1_OPTICAL_TRANSPORT_AVAILABILITY = "planning_only" as const;