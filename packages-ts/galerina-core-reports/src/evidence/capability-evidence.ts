// CapabilityEvidence v0.2 (TODO pass, Grok 2026-10-05; owner may revisit).

import type { RuntimeAuditReference } from "../shared/audit-reference.js";

export interface CapabilityEvidence {
  readonly schemaVersion: "galerina.evidence.v1";
  readonly evidenceId: string;
  readonly generatedAt: string;
  readonly capability: string;
  readonly decision: "allow" | "deny";
  readonly policyId?: string;
  readonly reason: string;
  readonly references: readonly RuntimeAuditReference[];
}
