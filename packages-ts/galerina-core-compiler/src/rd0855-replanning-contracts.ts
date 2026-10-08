// RD-0855 admission-time replanning (compiler).
//
// Pure fail-closed binder: alternative plans reuse one sealed checked-module
// snapshot digest and never re-enter source, AST, WAT or runtime. No lowering.
// SLIDE admission and VOK authority are not granted here.

import type { Sha256Digest } from "./artifact-reference.js";

export const RD0855_REPLAN_SCHEMA = "galerina.compiler.rd0855-replan.v1" as const;

export const ADMITTED_TRIT_WIDTHS_V1: readonly number[] = Object.freeze([1, 32, 64, 256]);

export type FallbackTier = "requested-width" | "k3-trit" | "binary-same-semantics";

export const FALLBACK_TIER_ORDER: readonly FallbackTier[] = Object.freeze([
  "requested-width",
  "k3-trit",
  "binary-same-semantics",
]);

export const K3_REFUSAL_PARITY_EVIDENCE = "UNPROVEN" as const;

export type K3Trit = "false" | "true" | "unknown";

export type ReplanReentry = "none" | "source" | "ast" | "wat" | "runtime" | "typescript";

export interface CompilerReplanDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

const refuse = (code: string, message: string, path: string): CompilerReplanDiagnostic => ({
  code,
  severity: "error",
  message,
  path,
});

const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function asDigest(value: string): Sha256Digest | undefined {
  return DIGEST.test(value) ? (value as Sha256Digest) : undefined;
}

export interface SealedReplanTask {
  readonly taskId: string;
  readonly snapshotDigest: string;
}

export interface AlternativeReplanPlan {
  readonly taskId: string;
  readonly snapshotDigest: string;
  readonly tier: FallbackTier;
  readonly tritWidth: number;
  readonly reentry: ReplanReentry;
}

export interface ReplanBindDecision {
  readonly schema: typeof RD0855_REPLAN_SCHEMA;
  readonly status: "BOUND" | "REFUSED";
  readonly snapshotDigest: string;
  readonly selectedTier: FallbackTier | "";
  readonly keptRefusal: string;
  readonly authorityReleased: false;
  readonly slideAdmission: "not-evaluated";
  readonly vokDecision: "not-evaluated";
  readonly k3ParityEvidence: typeof K3_REFUSAL_PARITY_EVIDENCE;
  readonly diagnostics: readonly CompilerReplanDiagnostic[];
}

const base = {
  schema: RD0855_REPLAN_SCHEMA,
  authorityReleased: false as const,
  slideAdmission: "not-evaluated" as const,
  vokDecision: "not-evaluated" as const,
  k3ParityEvidence: K3_REFUSAL_PARITY_EVIDENCE,
};

function bindRefuse(snapshotDigest: string, keptRefusal: string, diagnostics: readonly CompilerReplanDiagnostic[]): ReplanBindDecision {
  return {
    ...base,
    status: "REFUSED",
    snapshotDigest,
    selectedTier: "",
    keptRefusal,
    diagnostics,
  };
}

export function decodeTwoBitCarrier(code: number): { readonly ok: true; readonly trit: K3Trit } | { readonly ok: false; readonly diagnostics: readonly CompilerReplanDiagnostic[] } {
  if (code === 0) return { ok: true, trit: "false" };
  if (code === 1) return { ok: true, trit: "true" };
  if (code === 2) return { ok: true, trit: "unknown" };
  return {
    ok: false,
    diagnostics: [refuse("Galerina_COMPILER_REPLAN_ILLEGAL_CARRIER", "The unused fourth code of a two-bit K3 carrier refuses.", "carrier")],
  };
}

export function k3Not(trit: K3Trit): K3Trit {
  if (trit === "true") return "false";
  if (trit === "false") return "true";
  return "unknown";
}

export interface PermissionDecision {
  readonly status: "ALLOW" | "DENY" | "REFUSED";
  readonly allowed: boolean;
  readonly trit: K3Trit;
  readonly diagnostic: "none" | "unknown";
  readonly diagnostics: readonly CompilerReplanDiagnostic[];
}

export function collapseUnknownAtFinalBoundary(trit: K3Trit, boundary: "final" | "intermediate"): PermissionDecision {
  if (trit === "true") return { status: "ALLOW", allowed: true, trit, diagnostic: "none", diagnostics: [] };
  if (trit === "false") return { status: "DENY", allowed: false, trit, diagnostic: "none", diagnostics: [] };
  if (boundary === "intermediate") {
    return { status: "DENY", allowed: false, trit: "unknown", diagnostic: "unknown", diagnostics: [] };
  }
  return { status: "DENY", allowed: false, trit: "unknown", diagnostic: "unknown", diagnostics: [] };
}

export function k3NotThenFinalCollapse(trit: K3Trit): PermissionDecision {
  return collapseUnknownAtFinalBoundary(k3Not(trit), "final");
}

export function collapseThenBinaryNot(trit: K3Trit): PermissionDecision {
  if (trit === "unknown") {
    return {
      status: "REFUSED",
      allowed: false,
      trit: "unknown",
      diagnostic: "unknown",
      diagnostics: [refuse(
        "Galerina_COMPILER_REPLAN_UNKNOWN_EARLY_COLLAPSE",
        "Early UNKNOWN-to-false collapse followed by binary NOT refuses (K3 NOT of UNKNOWN stays UNKNOWN; the binary composition yields true).",
        "trit",
      )],
    };
  }
  const collapsed = collapseUnknownAtFinalBoundary(trit, "final");
  return collapseUnknownAtFinalBoundary(collapsed.allowed ? "false" : "true", "final");
}

export function bindAlternativePlan(task: SealedReplanTask, plan: AlternativeReplanPlan): ReplanBindDecision {
  const taskDigest = asDigest(task.snapshotDigest);
  const planDigest = asDigest(plan.snapshotDigest);
  if (typeof task.taskId !== "string" || task.taskId.trim().length === 0) {
    return bindRefuse("", "task-id", [refuse("Galerina_COMPILER_REPLAN_TASK_ID", "Replan taskId must be a non-empty string.", "taskId")]);
  }
  if (taskDigest === undefined) {
    return bindRefuse(task.snapshotDigest, "snapshot-digest", [refuse("Galerina_COMPILER_REPLAN_SNAPSHOT_DIGEST", "Task snapshotDigest must be sha256:<64 lowercase hex>.", "snapshotDigest")]);
  }
  if (typeof plan.taskId !== "string" || plan.taskId !== task.taskId) {
    return bindRefuse(taskDigest, "task-id", [refuse("Galerina_COMPILER_REPLAN_TASK_MISMATCH", "An alternative plan must carry the same taskId.", "taskId")]);
  }
  if (planDigest === undefined) {
    return bindRefuse(taskDigest, "snapshot-digest", [refuse("Galerina_COMPILER_REPLAN_SNAPSHOT_DIGEST", "Plan snapshotDigest must be sha256:<64 lowercase hex>.", "snapshotDigest")]);
  }
  if (planDigest !== taskDigest) {
    return bindRefuse(taskDigest, "new-task-not-alternative", [refuse(
      "Galerina_COMPILER_REPLAN_NEW_TASK_NOT_ALTERNATIVE",
      "A changed snapshot digest is a new task, not an alternative of the sealed task.",
      "snapshotDigest",
    )]);
  }
  if (plan.reentry !== "none") {
    const code = plan.reentry === "ast" ? "Galerina_COMPILER_REPLAN_AST_REENTRY"
      : plan.reentry === "wat" ? "Galerina_COMPILER_REPLAN_WAT_REENTRY"
      : plan.reentry === "runtime" ? "Galerina_COMPILER_REPLAN_RUNTIME_REENTRY"
      : plan.reentry === "source" ? "Galerina_COMPILER_REPLAN_SOURCE_REENTRY"
      : "Galerina_COMPILER_REPLAN_TYPESCRIPT_REENTRY";
    return bindRefuse(taskDigest, plan.reentry, [refuse(code, "Post-snapshot re-entry of source, AST, WAT, runtime or TypeScript refuses.", "reentry")]);
  }
  if (!Number.isSafeInteger(plan.tritWidth) || plan.tritWidth <= 0 || !ADMITTED_TRIT_WIDTHS_V1.includes(plan.tritWidth)) {
    return bindRefuse(taskDigest, "unregistered_width", [refuse(
      "Galerina_COMPILER_REPLAN_WIDTH_UNREGISTERED",
      "Requested trit-width is not an admitted v1 execution profile.",
      "tritWidth",
    )]);
  }
  if (plan.tier !== "requested-width" && plan.tier !== "k3-trit" && plan.tier !== "binary-same-semantics") {
    return bindRefuse(taskDigest, "tier", [refuse("Galerina_COMPILER_REPLAN_TIER", "Fallback tier must be requested-width, k3-trit or binary-same-semantics.", "tier")]);
  }
  if (plan.tier === "binary-same-semantics") {
    return bindRefuse(taskDigest, "binary_step_unresolved", [refuse(
      "Galerina_COMPILER_REPLAN_BINARY_STEP_UNRESOLVED",
      "Binary same-semantics step 3 is an unresolved alternative and is never bound.",
      "tier",
    )]);
  }
  return {
    ...base,
    status: "BOUND",
    snapshotDigest: taskDigest,
    selectedTier: plan.tier,
    keptRefusal: "",
    diagnostics: [],
  };
}
