// Optical need estimator (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit.
//
// Advisory only. Under the v1 freeze no optical/photonic backend is admitted,
// so a non-"none" need is never an execution recommendation.

import type { ComputeWorkload } from "../workload.js";
import { validateComputeWorkload } from "../workload.js";
import type { OpticalNeed } from "./optical-types.js";

/**
 * Advisory optical need. "unknown" for invalid workloads; otherwise a closed
 * need token. Never claims an executable optical path.
 */
export function estimateOpticalNeed(workload: ComputeWorkload): OpticalNeed {
  if (validateComputeWorkload(workload).length > 0) return "unknown";

  const prefersOptical =
    workload.preferredTargets.includes("optical_io") ||
    workload.preferredTargets.includes("photonic") ||
    workload.effects.includes("optical_io") ||
    workload.requiredCapabilities.includes("OpticalTransport");

  // Classify before the small-shape "none" short-circuit.
  if (workload.kind === "route" || workload.dataShape.streamable) {
    return "topology_aware";
  }
  if (
    workload.kind === "stream" ||
    workload.memoryMb >= 1024 ||
    workload.dataShape.byteSize >= 64 * 1024 * 1024
  ) {
    return "high_bandwidth";
  }
  if (
    prefersOptical ||
    workload.deployment.networkAllowed ||
    workload.kind === "batch" ||
    workload.operationCount >= 10_000
  ) {
    return "data_movement";
  }
  return "none";
}