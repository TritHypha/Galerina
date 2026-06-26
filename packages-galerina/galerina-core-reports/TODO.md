# Galerina Reports TODO

```text
[x] Create /packages-galerina/galerina-core-reports
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define common report metadata
[x] Define report severity model
[x] Define diagnostic summary contract
[x] Define build report contract
[x] Define security report contract
[ ] Define policy index, definitions, effective, conflict and AI-summary report contracts
[ ] Define malicious data, exploit-resistance, resource-budget, taint-flow and hardware-risk report contracts
[ ] Define specialist hardware, AI accelerator capability, accelerator fallback, data-sensitivity and precision-compatibility report contracts
[ ] Upgrade RuntimeAuditStatus to v0.2: allowed|denied|warning|error|executed|verified
[ ]   - document v0.1 form as active until reconciliation: started|running|completed|denied|failed|fallback|deferred
[ ] Define RuntimeAuditEvent v0.2: schemaVersion "galerina.runtime.audit.v1", eventId, timestamp, category (8 values), status, message, runtime, effect?, capability?, destination?, references?, metadata?
[ ] Define RuntimeAuditRuntime: runtimeId, environment, target, processId, region?
[ ] Define RuntimeAuditReference: type (proof|denial|evidence|manifest|policy), id
[ ] Implement serializeAuditEvent(event): string — sync
[ ] Implement appendAuditEvent(event, filePath): Promise<void> — async JSONL append
[ ] Implement validateAuditSafety(event): boolean — reject sk_live_ and Bearer tokens
[ ] Define SPORE-REPORT-001 through SPORE-REPORT-005 diagnostic codes
[ ] Create audit/ dir: audit-events.ts, audit-jsonl.ts, audit-runtime.ts, audit-validator.ts, audit-redaction.ts
[ ] Create shared/ dir: audit-reference.ts, audit-status.ts
[ ] Define runtime audit log format (JSONL, event categories, trace correlation, SPORE-AUDIT codes)
[ ]   - runtime-audit.jsonl schema with all required fields
[ ]   - status values aligned with RuntimeAuditStatus v0.2
[ ]   - capability and effect evidence event shapes
[ ]   - scheduler evidence event shape
[ ]   - runtime health schema
[ ] Define ExecutionProofHashes: manifestSha256, auditSha256, evidenceSha256, denialSha256, artefactSha256
[ ] Define ExecutionProof v0.2: schemaVersion "galerina.proof.v1", proofId, generatedAt, hashes: ExecutionProofHashes
[ ]   - document v0.1 form: { executionProofVersion, manifestHash, graphHash, policyHash, auditHash, runtimeHash }
[ ] Implement buildExecutionProof(paths): Promise<ExecutionProof>
[ ] Implement validateExecutionProof(proof, paths): Promise<boolean>
[ ] Implement sha256(input: string): string — crypto hash helper
[ ] Define SPORE-PROOF-001 through SPORE-PROOF-005 diagnostic codes
[ ] Create proofs/ dir: execution-proof.ts, proof-hashing.ts, proof-validator.ts, proof-runtime.ts, proof-report.ts
[ ] Upgrade DenialReport to v0.2: schemaVersion "galerina.denial.v1", denialId, timestamp, category (6 values), reason, policyId?, runtimeId, effect?, capability?, destination?, diagnostics[], references[]
[ ] Define SPORE-DENIAL-001 through SPORE-DENIAL-004 diagnostic codes
[ ] Create denials/ dir: denial-report.ts, denial-runtime.ts, denial-validator.ts, denial-serializer.ts
[ ] Upgrade CapabilityEvidence v0.2: schemaVersion, evidenceId, generatedAt, capability, decision (allow|deny), policyId?, reason, references[]
[ ] Upgrade EffectEvidence v0.2: schemaVersion, evidenceId, generatedAt, effect, declared, inferred, transitive, allowed, reason
[ ] Upgrade RuntimeEvidence v0.2: schemaVersion, runtimeId, generatedAt, target, environment, capabilityEvidence[], effectEvidence[], denialReferences[], proofReferences[], diagnostics[]
[ ] Implement buildRuntimeEvidence(params): Promise<RuntimeEvidence>
[ ] Define SPORE-EVIDENCE-001 through SPORE-EVIDENCE-004 diagnostic codes
[ ] Create evidence/ dir: capability-evidence.ts, effect-evidence.ts, runtime-evidence.ts, evidence-aggregator.ts, evidence-validator.ts
[ ] Define audit report contract (audit-report.json) fed from runtime audit log
[ ] Define capability report contract (capability-report.json)
[ ] Define effect report contract (effect-report.json)
[ ] Define denial report contract (denial-report.json)
[x] Define target report contract
[x] Define runtime report contract
[x] Define async/concurrency report contract
[x] Define storage and build-cache report contracts
[x] Define task report contract
[x] Define processing report contract
[x] Define AI guide report contract
[x] Add examples
[x] Add tests
```
