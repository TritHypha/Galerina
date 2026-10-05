// FUNGI-REPORT / FUNGI-PROOF / FUNGI-DENIAL / FUNGI-EVIDENCE registries
// (TODO pass, Grok 2026-10-05; owner may revisit: meanings are this pass's proposal).

export interface ReportCodeEntry {
  readonly code: string;
  readonly meaning: string;
}

const freeze = (entries: readonly ReportCodeEntry[]): readonly ReportCodeEntry[] => Object.freeze(entries.map((e) => Object.freeze({ ...e })));

export const FUNGI_REPORT_CODES = freeze([
  { code: "FUNGI-REPORT-001", meaning: "Audit event schemaVersion is not galerina.runtime.audit.v1." },
  { code: "FUNGI-REPORT-002", meaning: "Audit event required field missing or invalid (id, category, status, message, runtime)." },
  { code: "FUNGI-REPORT-003", meaning: "Audit timestamp is not an ISO-8601 UTC timestamp." },
  { code: "FUNGI-REPORT-004", meaning: "Audit event contains secret material (sk_live_/sk_test_ keys, Bearer tokens, private keys)." },
  { code: "FUNGI-REPORT-005", meaning: "Audit metadata or references are malformed (non-string metadata value, bad reference, size limit)." },
]);

export const FUNGI_PROOF_CODES = freeze([
  { code: "FUNGI-PROOF-001", meaning: "Execution proof schemaVersion is not galerina.proof.v1." },
  { code: "FUNGI-PROOF-002", meaning: "Execution proof id or generatedAt is invalid." },
  { code: "FUNGI-PROOF-003", meaning: "A proof hash is not 64 lowercase hex characters, or a hash field is missing or extra." },
  { code: "FUNGI-PROOF-004", meaning: "A proof input could not be read; the proof does not validate." },
  { code: "FUNGI-PROOF-005", meaning: "A recomputed hash does not match the proof." },
]);

export const FUNGI_DENIAL_CODES = freeze([
  { code: "FUNGI-DENIAL-001", meaning: "Denial report schemaVersion is not galerina.denial.v1." },
  { code: "FUNGI-DENIAL-002", meaning: "Denial category is not one of effect|capability|boundary|secret|network|policy." },
  { code: "FUNGI-DENIAL-003", meaning: "Denial required field missing or invalid (denialId, timestamp, reason, runtimeId, diagnostics, references)." },
  { code: "FUNGI-DENIAL-004", meaning: "Denial report contains secret material." },
]);

export const FUNGI_EVIDENCE_CODES = freeze([
  { code: "FUNGI-EVIDENCE-001", meaning: "Evidence schemaVersion is not galerina.evidence.v1." },
  { code: "FUNGI-EVIDENCE-002", meaning: "Evidence field missing or invalid, or contradictory (an effect allowed that was neither declared nor inferred)." },
  { code: "FUNGI-EVIDENCE-003", meaning: "Duplicate evidenceId within one runtime evidence document." },
  { code: "FUNGI-EVIDENCE-004", meaning: "Evidence contains secret material." },
]);
