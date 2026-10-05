# Galerina Reports TODO

```text
[x] Create /packages-ts/galerina-core-reports
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define common report metadata
[x] Define report severity model
[x] Define diagnostic summary contract
[x] Define build report contract
[x] Define security report contract
[x] Add package-owned `ReportStatusCounts` and `selectReportStatus` Fungi semantic twin
[x] Prove all 27 bounded priority combinations through interpretation, signed Wasm and physical SLIDE/VOK
[x] Keep the TypeScript selector and `summarizeDiagnostics` consumer active pending an authorised switch
[ ] Define policy index, definitions, effective, conflict and AI-summary report contracts
[ ] Define malicious data, exploit-resistance, resource-budget, taint-flow and hardware-risk report contracts
[ ] Define specialist hardware, AI accelerator capability, accelerator fallback, data-sensitivity and precision-compatibility report contracts
[x] Upgrade RuntimeAuditStatus to v0.2: allowed|denied|warning|error|executed|verified
[x]   - document v0.1 form as active until reconciliation: started|running|completed|denied|failed|fallback|deferred
[x] Define RuntimeAuditEvent v0.2: schemaVersion "galerina.runtime.audit.v1", eventId, timestamp, category (8 values), status, message, runtime, effect?, capability?, destination?, references?, metadata?
[x] Define RuntimeAuditRuntime: runtimeId, environment, target, processId, region?
[x] Define RuntimeAuditReference: type (proof|denial|evidence|manifest|policy), id
[x] Implement serializeAuditEvent(event): string — sync
[x] Implement appendAuditEvent(event, filePath): Promise<void> — async JSONL append
[x] Implement validateAuditSafety(event): boolean — reject sk_live_ and Bearer tokens
[x] Define FUNGI-REPORT-001 through FUNGI-REPORT-005 diagnostic codes
[x] Create audit/ dir: audit-events.ts, audit-jsonl.ts, audit-runtime.ts, audit-validator.ts, audit-redaction.ts
[x] Create shared/ dir: audit-reference.ts, audit-status.ts
[ ] Define runtime audit log format (JSONL, event categories, trace correlation, FUNGI-AUDIT codes)
[x]   - runtime-audit.jsonl schema with all required fields
[x]   - status values aligned with RuntimeAuditStatus v0.2
[ ]   - capability and effect evidence event shapes
[ ]   - scheduler evidence event shape
[ ]   - runtime health schema
[x] Define ExecutionProofHashes: manifestSha256, auditSha256, evidenceSha256, denialSha256, artefactSha256
[x] Define ExecutionProof v0.2: schemaVersion "galerina.proof.v1", proofId, generatedAt, hashes: ExecutionProofHashes
[x]   - document v0.1 form: { executionProofVersion, manifestHash, graphHash, policyHash, auditHash, runtimeHash }
[x] Implement buildExecutionProof(paths): Promise<ExecutionProof>
[x] Implement validateExecutionProof(proof, paths): Promise<boolean>
[x] Implement sha256(input: string): string — crypto hash helper
[x] Define FUNGI-PROOF-001 through FUNGI-PROOF-005 diagnostic codes
[x] Create proofs/ dir: execution-proof.ts, proof-hashing.ts, proof-validator.ts, proof-runtime.ts, proof-report.ts
[x] Upgrade DenialReport to v0.2: schemaVersion "galerina.denial.v1", denialId, timestamp, category (6 values), reason, policyId?, runtimeId, effect?, capability?, destination?, diagnostics[], references[]
[x] Define FUNGI-DENIAL-001 through FUNGI-DENIAL-004 diagnostic codes
[x] Create denials/ dir: denial-report.ts, denial-runtime.ts, denial-validator.ts, denial-serializer.ts
[x] Upgrade CapabilityEvidence v0.2: schemaVersion, evidenceId, generatedAt, capability, decision (allow|deny), policyId?, reason, references[]
[x] Upgrade EffectEvidence v0.2: schemaVersion, evidenceId, generatedAt, effect, declared, inferred, transitive, allowed, reason
[x] Upgrade RuntimeEvidence v0.2: schemaVersion, runtimeId, generatedAt, target, environment, capabilityEvidence[], effectEvidence[], denialReferences[], proofReferences[], diagnostics[]
[x] Implement buildRuntimeEvidence(params): Promise<RuntimeEvidence>
[x] Define FUNGI-EVIDENCE-001 through FUNGI-EVIDENCE-004 diagnostic codes
[x] Create evidence/ dir: capability-evidence.ts, effect-evidence.ts, runtime-evidence.ts, evidence-aggregator.ts, evidence-validator.ts
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

### Runtime audit v0.2 (2026-10-05, Grok Bot, standing permission, owner may revisit)

- `src/shared/` (`audit-status.ts`: v0.2 `RuntimeAuditStatus` plus the v0.1 form
  `RuntimeAuditStatusV01`, documented as ACTIVE until reconciliation and never mapped
  implicitly; `audit-reference.ts`; `report-codes.ts` with the FUNGI-REPORT/PROOF/
  DENIAL/EVIDENCE registries, whose meanings are this pass's proposal).
- `src/audit/`: `RuntimeAuditEvent` v0.2 with a strict validator, `RuntimeAuditRuntime`,
  secret-material detection (sk_live_/sk_test_, Bearer, private-key blocks; keys
  included), `validateAuditSafety`, canonical one-line `serializeAuditEvent`, and
  `appendAuditEvent(event, filePath, append)`. The appender is injected because the
  package border admits no Node core; nothing is written for a refused event.
- `src/proofs/`: `ExecutionProofHashes`, `ExecutionProof` v0.2 (v0.1 form documented as
  `ExecutionProofV01`), pure `sha256`, `buildExecutionProof(paths, io)` and
  `validateExecutionProof(proof, paths, io)` with injected reads (any read failure is
  false), deterministic proof id, `createProofReport`.
- `src/denials/`: `DenialReport` v0.2, validator, `createDenialReport`, canonical
  `serializeDenialReport`.
- `src/evidence/`: `CapabilityEvidence`, `EffectEvidence`, `RuntimeEvidence`,
  `buildRuntimeEvidence` (invalid, contradictory, duplicate or unsafe entries are kept
  out of the evidence arrays and listed as FUNGI-EVIDENCE codes), validators and
  `summarizeRuntimeEvidence`.
- Tests: `tests/runtime-audit-v02.test.mjs`. Still open: FUNGI-AUDIT codes and trace
  correlation, audit-log evidence/scheduler/health event shapes, the four report-file
  contracts and the three broad contract rows at the top.
