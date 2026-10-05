// ExecutionProof v0.2 (TODO pass, Grok 2026-10-05; owner may revisit).

export interface ExecutionProofHashes {
  readonly manifestSha256: string;
  readonly auditSha256: string;
  readonly evidenceSha256: string;
  readonly denialSha256: string;
  readonly artefactSha256: string;
}

export interface ExecutionProof {
  readonly schemaVersion: "galerina.proof.v1";
  readonly proofId: string;
  readonly generatedAt: string;
  readonly hashes: ExecutionProofHashes;
}

/** v0.1 form, active until v0.2 is finalised. Documented only; no converter. */
export interface ExecutionProofV01 {
  readonly executionProofVersion: string;
  readonly manifestHash: string;
  readonly graphHash: string;
  readonly policyHash: string;
  readonly auditHash: string;
  readonly runtimeHash: string;
}

export interface ExecutionProofPaths {
  readonly manifest: string;
  readonly audit: string;
  readonly evidence: string;
  readonly denials: string;
  readonly artefact: string;
}
