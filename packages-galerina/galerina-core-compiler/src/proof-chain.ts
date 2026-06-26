// =============================================================================
// Galerina Stage A — Execution Proof Chain
//
// Produces SHA-256-based cryptographic evidence that what was declared matches
// what was executed and audited.
//
// Spec: docs/Knowledge-Bases/galerina-proof-chain-spec.md
// Schema version: spore.execution.proof.v1
// =============================================================================

import { createHash } from "node:crypto";
import { type AuditEvent } from "./audit-writer.js";
import { type GIRProgram } from "./gir-emitter.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecutionProofChain {
  readonly schemaVersion: "spore.execution.proof.v1";
  readonly proofId: string;
  readonly generatedAt: string;
  readonly hashes: ProofHashes;
}

export interface ProofHashes {
  /** SHA-256 of the canonical source manifest content. */
  readonly manifestSha256: string;
  /** SHA-256 of the full JSONL audit log for this execution. */
  readonly auditSha256: string;
  /** SHA-256 of the evidence record (gates fired, redactions applied). */
  readonly evidenceSha256: string;
  /** SHA-256 of the denial log (runtime governance rejections). */
  readonly denialSha256: string;
  /** SHA-256 of the compiled GIR or source text used as artefact. */
  readonly artefactSha256: string;
}

export interface EvidenceRecord {
  readonly validationGatesFired: readonly string[];
  readonly redactionsApplied: readonly string[];
  readonly effectsObserved: readonly string[];
  readonly timestamp: string;
}

export interface DenialRecord {
  readonly denialId: string;
  readonly reason: string;
  readonly flowName: string;
  readonly timestamp: string;
}

export interface ProofChainInputs {
  readonly source?: string;
  readonly gir?: GIRProgram;
  readonly auditEvents: readonly AuditEvent[];
  readonly evidence: readonly EvidenceRecord[];
  readonly denials: readonly DenialRecord[];
}

// ---------------------------------------------------------------------------
// SHA-256 helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Canonicalize a value to a deterministic JSON string. */
function canonical(value: unknown): string {
  return JSON.stringify(value, sortKeysReplacer);
}

function sortKeysReplacer(
  _key: string,
  value: unknown,
): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// ---------------------------------------------------------------------------
// JSONL serialization
// ---------------------------------------------------------------------------

function toJSONL(events: readonly unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length > 0 ? "\n" : "");
}

// ---------------------------------------------------------------------------
// Proof chain builder
// ---------------------------------------------------------------------------

/**
 * Builds an ExecutionProofChain from the inputs produced during a run.
 * Stage A: hashes are computed over in-memory serialized content.
 * Stage B: hashes will be computed over persisted file content.
 */
export function buildProofChain(inputs: ProofChainInputs): ExecutionProofChain {
  // Manifest hash — canonical GIR or source text
  const manifestContent = inputs.gir !== undefined
    ? canonical(inputs.gir)
    : canonical({ schemaVersion: "spore.manifest.v1", source: inputs.source ?? "" });

  // Audit hash — JSONL line order preserved (spec requirement)
  const auditContent = toJSONL(inputs.auditEvents);

  // Evidence hash — validation gates fired, redactions applied
  const evidenceContent = canonical({
    schemaVersion: "spore.evidence.v1",
    records: inputs.evidence,
  });

  // Denial hash — runtime governance rejections
  const denialContent = canonical({
    schemaVersion: "spore.denial.v1",
    records: inputs.denials,
  });

  // Artefact hash — source code as the Stage A artefact
  const artefactContent = inputs.source ?? "";

  return {
    schemaVersion: "spore.execution.proof.v1",
    proofId: `proof_${Date.now()}_${sha256(auditContent + evidenceContent).slice(0, 12)}`,
    generatedAt: new Date().toISOString(),
    hashes: {
      manifestSha256: sha256(manifestContent),
      auditSha256:    sha256(auditContent),
      evidenceSha256: sha256(evidenceContent),
      denialSha256:   sha256(denialContent),
      artefactSha256: sha256(artefactContent),
    },
  };
}

/**
 * Verifies a proof chain against fresh inputs.
 * Returns true when all five hashes match.
 */
export function verifyProofChain(
  chain: ExecutionProofChain,
  inputs: ProofChainInputs,
): { verified: boolean; mismatches: string[] } {
  const fresh = buildProofChain(inputs);
  const mismatches: string[] = [];

  for (const key of Object.keys(fresh.hashes) as Array<keyof ProofHashes>) {
    if (fresh.hashes[key] !== chain.hashes[key]) {
      mismatches.push(`${key}: expected ${chain.hashes[key]} but computed ${fresh.hashes[key]}`);
    }
  }

  return { verified: mismatches.length === 0, mismatches };
}
