# Galerina Reports

`galerina-core-reports` is the package for shared Galerina report schemas and report-writing
contracts.

It belongs in:

```text
/packages-galerina/galerina-core-reports
```

Use this package for:

```text
report metadata
report severity
diagnostic summary contracts
build report contracts
security report contracts
policy index, definition, effective and conflict report contracts
malicious data, exploit-resistance, resource-budget and hardware-risk report contracts
specialist hardware and accelerator fallback report contracts
target report contracts
runtime report contracts
async/concurrency report contracts
storage and build-cache report contracts
passive LLM cache report contracts
network, TLS, port, firewall, packet-filter and network-performance report contracts
task report contracts
processing report contracts
AI guide report contracts
report writer interface
JSON serialization helper
```

## Boundary

`galerina-core-reports` should define shared report shapes and writer contracts. It should
not own package-specific analysis.

```text
compiler analysis -> galerina-core-compiler
security checks   -> galerina-core-security / galerina-core-compiler
network facts     -> galerina-core-network / galerina-framework-api-server / galerina-framework-app-kernel
runtime events    -> galerina-core-runtime
task execution    -> galerina-core-tasks
target analysis   -> target packages
```

## Contracts

The package defines:

```text
ReportMetadata
ReportGenerator
ReportDiagnostic
DiagnosticSummary
BuildReport
SecurityReport
PolicyIndexReport
PolicyDefinitionsReport
PolicyEffectiveReport
PolicyConflictReport
MaliciousDataReport
ExploitResistanceReport
ResourceBudgetReport
TaintFlowReport
HardwareRiskReport
SpecialistHardwareReport
AiAcceleratorCapabilityReport
AcceleratorFallbackReport
AcceleratorDataSensitivityReport
PrecisionCompatibilityReport
TargetReport
RuntimeReport
TaskReport
ProcessingReport
BatchResultReport
AsyncReport
AwaitSiteReport
AwaitGroupReport
StorageReport
BuildCacheReport
LlmCacheReport
NetworkReport
TlsReport
PortReport
RateLimitReport
FirewallReport
PacketFilterReport
NetworkPerformanceReport
AiGuideReport
CustomReport
ReportWriter
```

Use these contracts to keep package-specific reports consistent while leaving
the actual analysis in the owning package.

Processing reports are for resilient/batch flows that can continue after
item-level failures. They record totals, successes, failures, retries,
quarantined items, checkpoints and failure-type summaries. They must not be used
to hide system/runtime integrity failures.

Async reports are for Structured Await analysis. They record await points,
await groups, race blocks, stream blocks, queue awaits, missing timeout counts,
unscoped task counts, background task counts, structured-concurrency status and
source locations. Compiler, runtime and kernel packages produce the facts;
`galerina-core-reports` only owns the shared shape.

Storage and build-cache reports are for conservative performance planning. They
record optional storage facts, unknown-storage fallback, recommended bounded
cache mode, cache hits, misses, bypasses, evictions and invalidations. Cache
reports must make clear that cached data is not required for correctness and
that secrets or sensitive payloads are denied by default.

Passive LLM cache reports are for provider-neutral AI cache visibility. They
record whether caching was enabled, store type, hit/miss counts, blocked counts,
blocked reasons, models used, semantic-cache status, invalidation facts and
whether secret values were stored. They must not include prompt text, raw user
messages, secret values, credentials, authorization headers or unredacted
personal data.

Network reports are for deployment and observability planning. They record
inbound ports, outbound hosts, TLS policy, selected I/O backend, zero-copy
availability, rate limits, firewall posture, packet-filter facts and network
performance bottlenecks. `galerina-core-reports` owns the shared report shape;
`galerina-core-network`, the API server and the app kernel produce the facts.

Policy reports are for source-visible policy analysis. They record policy
declarations, source locations, usage, canonical definitions, effective merged
policy per target and conflict diagnostics. Security/compiler packages produce
the facts; `galerina-core-reports` owns the shared shape.

Malicious data and exploit-resistance reports are for evidence that untrusted
input was bounded, validated, canonicalised, assigned to a boundary and denied
from unsafe sinks unless a typed safe operation allowed it. Runtime, compiler,
security and framework packages produce the facts; `galerina-core-reports` owns
the shared shape.

Specialist hardware reports are for governed compute target evidence. They
record selected CPU/GPU/NPU/TPU/VPU/FPGA/ASIC targets, backend profile,
precision compatibility, data sensitivity, isolation level, memory limits,
fallback decisions and audit status. Compute and target packages produce the
facts; `galerina-core-reports` owns the shared shape.

## Runtime Audit Log Format

The runtime audit log uses JSONL (JSON Lines) for the primary append-only event
stream. Each event is one JSON object per line. The format is structured,
immutable, machine-readable, and AI-readable.

Key audit files:

```text
build/reports/
  audit/
    runtime-audit.jsonl     — append-only runtime events
  proofs/
    execution-proof.json    — execution integrity (5 SHA256 hashes)
  denials/
    denial-report.json
  evidence/
    capability-evidence.json
    effect-evidence.json
    runtime-evidence.json
```

### Architecture Depth: TypeScript Contracts (v0.2 Specification)

#### RuntimeAuditStatus (v0.2)

```ts
// v0.2 canonical form
export type RuntimeAuditStatus =
    | "allowed"
    | "denied"
    | "warning"
    | "error"
    | "executed"
    | "verified"

// v0.1 form (active until reconciliation is complete)
// "started" | "running" | "completed" | "denied" | "failed" | "fallback" | "deferred"
```

#### RuntimeAuditEvent (v0.2)

```ts
export interface RuntimeAuditEvent {
    schemaVersion: "galerina.runtime.audit.v1"
    eventId: string
    timestamp: string             // ISO-8601
    category:
        | "effect"
        | "capability"
        | "boundary"
        | "secret"
        | "network"
        | "policy"
        | "denial"
        | "proof"
    status: RuntimeAuditStatus
    message: string
    runtime: RuntimeAuditRuntime
    effect?: string
    capability?: string
    destination?: string
    references?: RuntimeAuditReference[]
    metadata?: Record<string, string>  // string values only — no secrets
}

export interface RuntimeAuditRuntime {
    runtimeId: string
    environment: string
    target: RuntimeTarget
    processId: string
    region?: string
}

export interface RuntimeAuditReference {
    type: "proof" | "denial" | "evidence" | "manifest" | "policy"
    id: string
}

// Sync: build the event object
export function serializeAuditEvent(event: RuntimeAuditEvent): string
// Async: append to JSONL file
export async function appendAuditEvent(
    event: RuntimeAuditEvent,
    filePath: string
): Promise<void>
```

#### ExecutionProof (v0.2)

```ts
export interface ExecutionProofHashes {
    manifestSha256: string    // compiler manifest integrity
    auditSha256: string       // runtime audit stream integrity
    evidenceSha256: string    // capability/effect evidence integrity
    denialSha256: string      // denial log integrity
    artefactSha256: string    // build artefact integrity
}

export interface ExecutionProof {
    schemaVersion: "galerina.proof.v1"
    proofId: string
    generatedAt: string
    hashes: ExecutionProofHashes
}

// v0.1 form (active until v0.2 finalised):
// { executionProofVersion, manifestHash, graphHash, policyHash, auditHash, runtimeHash }

export async function buildExecutionProof(paths: {
    manifest: string
    audit: string
    evidence: string
    denials: string
    artefact: string
}): Promise<ExecutionProof>

export async function validateExecutionProof(
    proof: ExecutionProof,
    paths: { manifest: string; audit: string; evidence: string; denials: string; artefact: string }
): Promise<boolean>
```

#### DenialReport (v0.2)

```ts
export interface DenialReport {
    schemaVersion: "galerina.denial.v1"
    denialId: string
    timestamp: string
    category:
        | "effect"
        | "capability"
        | "boundary"
        | "secret"
        | "network"
        | "policy"
    reason: string
    policyId?: string
    runtimeId: string
    effect?: string
    capability?: string
    destination?: string
    diagnostics: string[]
    references: RuntimeAuditReference[]
}
```

#### Evidence Types (v0.2)

```ts
export interface CapabilityEvidence {
    schemaVersion: "galerina.evidence.v1"
    evidenceId: string
    generatedAt: string
    capability: string
    decision: "allow" | "deny"
    policyId?: string
    reason: string
    references: RuntimeAuditReference[]
}

export interface EffectEvidence {
    schemaVersion: "galerina.evidence.v1"
    evidenceId: string
    generatedAt: string
    effect: string
    declared: boolean
    inferred: boolean
    transitive: boolean
    allowed: boolean
    reason: string
}

export interface RuntimeEvidence {
    schemaVersion: "galerina.evidence.v1"
    runtimeId: string
    generatedAt: string
    target: RuntimeTarget
    environment: string
    capabilityEvidence: CapabilityEvidence[]
    effectEvidence: EffectEvidence[]
    denialReferences: RuntimeAuditReference[]
    proofReferences: RuntimeAuditReference[]
    diagnostics: string[]
}

export async function buildRuntimeEvidence(params: {
    runtimeId: string
    target: RuntimeTarget
    environment: string
    capabilityDecisions: CapabilityEvidence[]
    effectDecisions: EffectEvidence[]
}): Promise<RuntimeEvidence>
```

#### Audit Safety Validation

```ts
// Rejects events that contain raw secrets: sk_live_ or Bearer tokens
export function validateAuditSafety(event: RuntimeAuditEvent): boolean
```

### Internal Structure

```text
src/
  audit/
    audit-events.ts        ← RuntimeAuditEvent, RuntimeAuditStatus (v0.2)
    audit-jsonl.ts         ← serializeAuditEvent(), appendAuditEvent()
    audit-runtime.ts       ← RuntimeAuditRuntime
    audit-validator.ts     ← validateAuditSafety()
    audit-redaction.ts
  proofs/
    execution-proof.ts     ← ExecutionProof, ExecutionProofHashes
    proof-hashing.ts       ← buildExecutionProof()
    proof-validator.ts     ← validateExecutionProof()
    proof-runtime.ts
    proof-report.ts
  denials/
    denial-report.ts       ← DenialReport (v0.2)
    denial-runtime.ts
    denial-validator.ts
    denial-serializer.ts
  evidence/
    capability-evidence.ts ← CapabilityEvidence
    effect-evidence.ts     ← EffectEvidence
    runtime-evidence.ts    ← RuntimeEvidence, buildRuntimeEvidence()
    evidence-aggregator.ts
    evidence-validator.ts
  shared/
    audit-reference.ts     ← RuntimeAuditReference
    audit-status.ts        ← RuntimeAuditStatus
```

### Diagnostic Codes

```text
FUNGI-AUDIT-001 through FUNGI-AUDIT-007
FUNGI-REPORT-001 through FUNGI-REPORT-005
FUNGI-PROOF-001 through FUNGI-PROOF-005
FUNGI-DENIAL-001 through FUNGI-DENIAL-004
FUNGI-EVIDENCE-001 through FUNGI-EVIDENCE-004
```

Secret safety rule: audit logs must never store API keys, passwords, tokens,
or private certificates — only hashes, status flags, presence checks, and
capability names. `validateAuditSafety()` enforces this by rejecting events
containing `sk_live_` or `Bearer` token patterns.

See `../../../ZTF-Knowledge-Bases/runtime-audit-log-format.md` for the full schema,
execution proof design, JSONL format rationale, and v0.1 scope.

Final rule:

```text
galerina-core-reports owns shared report shapes.
Owning packages produce their own facts and diagnostics.
Report output must stay deterministic and safe to inspect.
```
