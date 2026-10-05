// buildCompatibilityReport (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ComputeDiagnostic } from "../index.js";
import { validateComputeWorkload, type ComputeWorkload, type RuntimeTarget } from "../workload.js";
import type { CompatibilityResult, TargetProfile } from "./target-compatibility.js";
import { validateTarget } from "./target-validator.js";

export interface CompatibilityReport {
  readonly schemaVersion: "galerina.compatibility.report.v0.2";
  readonly workloadId: string;
  readonly targets: readonly CompatibilityResult[];
  /** "none" when nothing requested is compatible: there is no implicit CPU default. */
  readonly recommendedTarget: RuntimeTarget | "none";
  readonly diagnostics: readonly ComputeDiagnostic[];
}

export function buildCompatibilityReport(workload: ComputeWorkload, profiles: readonly TargetProfile[]): CompatibilityReport {
  const diagnostics: ComputeDiagnostic[] = [...validateComputeWorkload(workload)];
  const workloadId = typeof workload === "object" && workload !== null && typeof workload.id === "string" ? workload.id : "";
  if (diagnostics.length > 0) {
    return Object.freeze({ schemaVersion: "galerina.compatibility.report.v0.2", workloadId, targets: Object.freeze([]), recommendedTarget: "none", diagnostics: Object.freeze(diagnostics) });
  }
  const seen = new Set<RuntimeTarget>();
  const targets: CompatibilityResult[] = [];
  profiles.forEach((profile, index) => {
    if (seen.has(profile.target)) {
      diagnostics.push({ code: "Galerina_COMPAT_DUPLICATE_PROFILE", severity: "error", message: `Duplicate profile for ${profile.target}; only the first is used.`, path: `profiles.${index}` });
      return;
    }
    seen.add(profile.target);
    targets.push(validateTarget(workload, profile));
  });
  let recommendedTarget: RuntimeTarget | "none" = "none";
  for (const target of [...workload.preferredTargets, ...workload.fallbackTargets]) {
    const result = targets.find((r) => r.target === target);
    if (result === undefined) {
      diagnostics.push({ code: "Galerina_COMPAT_PROFILE_MISSING", severity: "warning", message: `No profile for requested target ${target}; it cannot be recommended.`, path: "profiles" });
      continue;
    }
    if (result.level !== "incompatible") { recommendedTarget = target; break; }
  }
  if (recommendedTarget === "none") {
    diagnostics.push({ code: "Galerina_COMPAT_NO_COMPATIBLE_TARGET", severity: "error", message: "No requested target is compatible with this workload.", path: "targets" });
  }
  return Object.freeze({ schemaVersion: "galerina.compatibility.report.v0.2", workloadId, targets: Object.freeze(targets), recommendedTarget, diagnostics: Object.freeze(diagnostics) });
}
