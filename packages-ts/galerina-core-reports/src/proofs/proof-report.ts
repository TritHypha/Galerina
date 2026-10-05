// Proof report summary (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ExecutionProof } from "./execution-proof.js";
import { validateExecutionProofShape } from "./proof-validator.js";

export { FUNGI_PROOF_CODES } from "../shared/report-codes.js";

export interface ProofReport {
  readonly schema: "galerina.proof.report.v1";
  readonly proofId: string;
  readonly generatedAt: string;
  readonly verified: boolean;
  readonly diagnosticCodes: readonly string[];
}

/** Summary for build/reports/proofs; `verified` is the caller's validateExecutionProof result, never assumed. */
export function createProofReport(proof: ExecutionProof, verified: boolean): ProofReport {
  const codes = validateExecutionProofShape(proof).map((d) => d.code);
  return Object.freeze({
    schema: "galerina.proof.report.v1",
    proofId: typeof proof?.proofId === "string" ? proof.proofId : "",
    generatedAt: typeof proof?.generatedAt === "string" ? proof.generatedAt : "",
    verified: verified === true && codes.length === 0,
    diagnosticCodes: Object.freeze(verified === true || codes.length > 0 ? codes : [...codes, "FUNGI-PROOF-005"]),
  });
}
