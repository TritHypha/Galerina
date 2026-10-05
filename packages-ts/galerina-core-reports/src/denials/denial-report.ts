// DenialReport v0.2 (TODO pass, Grok 2026-10-05; owner may revisit).
// Named DenialReport so no v0.1 consumer type is silently replaced.

import type { RuntimeAuditReference } from "../shared/audit-reference.js";

export type DenialCategory = "effect" | "capability" | "boundary" | "secret" | "network" | "policy";

export const DENIAL_CATEGORIES: readonly DenialCategory[] = Object.freeze(["effect", "capability", "boundary", "secret", "network", "policy"] as const);

export interface DenialReport {
  readonly schemaVersion: "galerina.denial.v1";
  readonly denialId: string;
  readonly timestamp: string;
  readonly category: DenialCategory;
  readonly reason: string;
  readonly policyId?: string;
  readonly runtimeId: string;
  readonly effect?: string;
  readonly capability?: string;
  readonly destination?: string;
  readonly diagnostics: readonly string[];
  readonly references: readonly RuntimeAuditReference[];
}
