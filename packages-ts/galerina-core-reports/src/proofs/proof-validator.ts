// validateExecutionProof (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ReportDiagnostic } from "../index.js";
import { isAuditTimestamp } from "../shared/audit-reference.js";
import type { ExecutionProof, ExecutionProofPaths } from "./execution-proof.js";
import { PROOF_HASH_FIELDS, hashProofInputs, proofIdFor } from "./proof-hashing.js";
import type { ProofIo } from "./proof-runtime.js";

const HEX64 = /^[0-9a-f]{64}$/;

export function validateExecutionProofShape(proof: unknown): readonly ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const add = (code: string, message: string, path: string): void => { out.push(Object.freeze({ code, severity: "error" as const, message, path })); };
  if (typeof proof !== "object" || proof === null || Array.isArray(proof)) { add("FUNGI-PROOF-001", "Proof must be a plain record.", "proof"); return Object.freeze(out); }
  const p = proof as Record<string, unknown>;
  if (p.schemaVersion !== "galerina.proof.v1") add("FUNGI-PROOF-001", "schemaVersion must be galerina.proof.v1.", "schemaVersion");
  if (typeof p.proofId !== "string" || !/^proof-[0-9a-f]{24}$/.test(p.proofId)) add("FUNGI-PROOF-002", "proofId is invalid.", "proofId");
  if (!isAuditTimestamp(p.generatedAt)) add("FUNGI-PROOF-002", "generatedAt must be ISO-8601 UTC.", "generatedAt");
  const h = p.hashes;
  if (typeof h !== "object" || h === null || Array.isArray(h)) add("FUNGI-PROOF-003", "hashes must be a plain record.", "hashes");
  else {
    const keys = Object.keys(h);
    if (keys.length !== PROOF_HASH_FIELDS.length || !PROOF_HASH_FIELDS.every((f) => keys.includes(f))) add("FUNGI-PROOF-003", "hashes must have exactly the five hash fields.", "hashes");
    for (const f of PROOF_HASH_FIELDS) if (!HEX64.test(String((h as Record<string, unknown>)[f]))) add("FUNGI-PROOF-003", `${f} must be 64 lowercase hex characters.`, `hashes.${f}`);
  }
  for (const key of Object.keys(p)) if (!["schemaVersion", "proofId", "generatedAt", "hashes"].includes(key)) add("FUNGI-PROOF-003", `Unknown proof field ${key}.`, key);
  return Object.freeze(out);
}

/** True only when the proof is well-formed, its id matches its hashes, and every input re-hashes to the recorded value. Any read failure is false. */
export async function validateExecutionProof(proof: ExecutionProof, paths: ExecutionProofPaths, io: Pick<ProofIo, "readFile">): Promise<boolean> {
  if (validateExecutionProofShape(proof).length > 0) return false;
  if (proof.proofId !== proofIdFor(proof.hashes)) return false;
  let actual;
  try {
    actual = await hashProofInputs(paths, { readFile: io.readFile, now: () => "" });
  } catch {
    return false;
  }
  let diff = 0;
  for (const f of PROOF_HASH_FIELDS) {
    const a = actual[f];
    const b = proof.hashes[f];
    for (let i = 0; i < 64; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
