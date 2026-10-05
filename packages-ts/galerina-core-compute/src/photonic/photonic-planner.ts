// Optical/photonic plan builder (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit.
// Under the v1 freeze: never admits optical execution. recommendedMode is
// planning awareness only; fallback.target is always "cpu" for an executable path.

import type { ComputeDiagnostic } from "../index.js";
import type { ComputeWorkload } from "../workload.js";
import { validateComputeWorkload } from "../workload.js";
import { estimateOpticalNeed } from "./optical-estimator.js";
import { cpuOpticalFallback } from "./optical-fallback.js";
import type { OpticalFallbackReason, OpticalPlan, OpticalRecommendedMode } from "./optical-types.js";

function diag(code: string, message: string, path?: string): ComputeDiagnostic {
  return Object.freeze({
    code,
    severity: "error" as const,
    message,
    ...(path === undefined ? {} : { path }),
  });
}

function freezePlan(plan: OpticalPlan): OpticalPlan {
  return Object.freeze({
    ...plan,
    fallback: Object.freeze({ ...plan.fallback }),
    diagnostics: Object.freeze(plan.diagnostics.map((d) => Object.freeze({ ...d }))),
  });
}

function modeForNeed(need: OpticalPlan["need"]): OpticalRecommendedMode {
  if (need === "none" || need === "unknown") return "none";
  if (need === "topology_aware") return "photonic_planning_only";
  return "optical_io_awareness";
}

/**
 * Build an OpticalPlan v0.2. Always falls back to cpu under the v1 freeze.
 * recommendedMode may be optical_io_awareness or photonic_planning_only as
 * advisory planning vocabulary only — never execution admission.
 */
export function buildOpticalPlan(workload: ComputeWorkload): OpticalPlan {
  const structural = validateComputeWorkload(workload);
  if (structural.length > 0) {
    return freezePlan({
      schemaVersion: "galerina.compute.optical-plan.v0.2",
      need: "unknown",
      recommendedMode: "none",
      fallback: cpuOpticalFallback("workload_invalid"),
      diagnostics: [
        diag("Galerina_OPTICAL_WORKLOAD_INVALID", "Workload invalid for optical planning.", "workload"),
        diag("Galerina_OPTICAL_NOT_ADMITTED", "Optical/photonic backend not admitted under v1 freeze."),
        diag("Galerina_OPTICAL_CPU_FALLBACK", "CPU fallback required (optical not executable)."),
        ...structural,
      ],
    });
  }

  const need = estimateOpticalNeed(workload);
  const diagnostics: ComputeDiagnostic[] = [
    diag("Galerina_OPTICAL_NOT_ADMITTED", "Optical/photonic backend not admitted under v1 freeze."),
    diag("Galerina_OPTICAL_CPU_FALLBACK", "CPU fallback required (optical not executable)."),
  ];
  let reason: OpticalFallbackReason = "optical_not_admitted";

  if (need === "none") {
    reason = "no_optical_need";
    diagnostics.push(diag("Galerina_OPTICAL_NO_NEED", "No optical need estimated for this workload."));
  }

  if (workload.dataShape.sensitive) {
    reason = "sensitive_data";
    diagnostics.push(
      diag("Galerina_OPTICAL_SENSITIVE", "Sensitive data refused on optical planning path.", "dataShape.sensitive"),
    );
  }

  if (!workload.deployment.networkAllowed && need !== "none") {
    // Optical I/O awareness without network is still planning-only; keep cpu fallback.
    diagnostics.push(
      diag("Galerina_OPTICAL_NETWORK_DISALLOWED", "Deployment disallows network; optical path stays planning-only.", "deployment.networkAllowed"),
    );
    if (reason === "optical_not_admitted") reason = "network_disallowed";
  }

  return freezePlan({
    schemaVersion: "galerina.compute.optical-plan.v0.2",
    need,
    recommendedMode: modeForNeed(need),
    fallback: cpuOpticalFallback(reason === "no_optical_need" ? "explicit_cpu_fallback" : reason),
    diagnostics,
  });
}