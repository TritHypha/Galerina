> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Reports v0.2

## Formal Specification — Audit Log, Execution Proof, Denials, Evidence

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-reports`.

See also: `runtime-audit-log-format.md` (prior architecture KB).

---

## RuntimeAuditStatus Enum (v0.2)

```ts
enum RuntimeAuditStatus {
    Success,
    Denied,
    Failed,
    Unsafe,
    Warning,
    Verified
}
```

| Status     | Meaning                              |
| ---------- | ------------------------------------ |
| Success    | Operation completed successfully     |
| Denied     | Runtime denied execution             |
| Failed     | Runtime failure occurred             |
| Unsafe     | Unsafe operation detected            |
| Warning    | Non-fatal issue detected             |
| Verified   | Operation cryptographically verified |

Note: The prior KB used `allowed|denied|warning|error|executed|verified`
as string literals. These enum values are the v0.2 formal specification.

---

## RuntimeAuditEvent (v0.2)

```ts
interface RuntimeAuditEvent {
    id: string;

    timestamp: string;

    status: RuntimeAuditStatus;

    eventType: string;

    source: string;

    message: string;

    evidence: RuntimeEvidence[];

    proof?: ExecutionProof;

    diagnostics?: Diagnostic[];
}
```

---

## Event Categories

| Event Type           | Description                   |
| -------------------- | ----------------------------- |
| FunctionExecution    | Runtime function execution    |
| BoundaryCrossing     | Runtime boundary transition   |
| EffectValidation     | Runtime effect enforcement    |
| DeploymentValidation | Deployment runtime validation |
| SandboxViolation     | Sandbox escape attempt        |
| NetworkAccess        | External network operation    |
| RuntimeAllocation    | Runtime memory allocation     |
| Verification         | Proof verification            |

---

## JSONL Audit Format

All audit events are serialized as JSONL (one JSON object per line):

```jsonl
{"id":"evt_1","status":"Success","eventType":"FunctionExecution"}
{"id":"evt_2","status":"Denied","eventType":"SandboxViolation"}
{"id":"evt_3","status":"Verified","eventType":"Verification"}
```

Output file: `runtime.audit.jsonl`

JSONL provides: append-only logging, stream-safe serialization,
distributed aggregation, deterministic parsing, low-overhead storage.

---

## Execution Proof System

### ExecutionProof

```ts
interface ExecutionProof {
    executionId: string;

    hashes: ExecutionProofHashes;

    verified: boolean;
}
```

---

### ExecutionProofHashes (v0.2)

```ts
interface ExecutionProofHashes {
    sourceHash: string;

    manifestHash: string;

    runtimeHash: string;

    executionHash: string;

    evidenceHash: string;
}
```

Each hash validates a separate execution layer:

| Hash          | Validates          |
| ------------- | ------------------ |
| sourceHash    | Source integrity   |
| manifestHash  | Runtime manifest   |
| runtimeHash   | Runtime version    |
| executionHash | Execution trace    |
| evidenceHash  | Evidence integrity |

Note: The prior KB used different field names such as `auditSha256` and
`denialSha256`. The v0.2 formal spec uses the 5 hashes above.

---

### buildExecutionProof()

```ts
function buildExecutionProof(
    execution: RuntimeExecution
): ExecutionProof {

    return {
        executionId: execution.id,

        hashes: {
            sourceHash:
                hash(execution.source),

            manifestHash:
                hash(execution.manifest),

            runtimeHash:
                hash(execution.runtime),

            executionHash:
                hash(execution.trace),

            evidenceHash:
                hash(execution.evidence)
        },

        verified: true
    };
}
```

---

## Denial Reports

### DenialReport (v0.2)

```ts
interface DenialReport {
    id: string;

    reason: string;

    source: string;

    deniedEffect?: string;

    deniedBoundary?: string;

    evidence: RuntimeEvidence[];

    diagnostics: Diagnostic[];
}
```

---

## Evidence System

### RuntimeEvidence (base)

```ts
interface RuntimeEvidence {
    type: string;

    timestamp: string;

    payload: unknown;
}
```

---

### Evidence Types (v0.2)

Eight evidence types are defined:

| Type                 | Purpose                 |
| -------------------- | ----------------------- |
| FunctionEvidence     | Function execution      |
| EffectEvidence       | Effect propagation      |
| BoundaryEvidence     | Boundary crossing       |
| NetworkEvidence      | External access         |
| DeploymentEvidence   | Deployment metadata     |
| RuntimeEvidence      | Runtime engine state    |
| VerificationEvidence | Verification metadata   |
| DenialEvidence       | Runtime denial metadata |

---

### FunctionEvidence

```ts
interface FunctionEvidence extends RuntimeEvidence {
    functionId: string;

    durationMs: number;
}
```

---

### EffectEvidence

```ts
interface EffectEvidence extends RuntimeEvidence {
    effect: string;

    validated: boolean;
}
```

---

### BoundaryEvidence

```ts
interface BoundaryEvidence extends RuntimeEvidence {
    sourceBoundary: string;

    targetBoundary: string;
}
```

---

### NetworkEvidence

```ts
interface NetworkEvidence extends RuntimeEvidence {
    endpoint: string;

    method: string;

    allowed: boolean;
}
```

---

### VerificationEvidence

```ts
interface VerificationEvidence extends RuntimeEvidence {
    verified: boolean;

    verificationHash: string;
}
```

---

## validateAuditSafety()

```ts
function validateAuditSafety(
    events: RuntimeAuditEvent[]
): Diagnostic[] {

    const diagnostics: Diagnostic[] = [];

    for (const event of events) {

        if (
            event.status ===
                RuntimeAuditStatus.Unsafe &&
            !event.proof
        ) {
            diagnostics.push({
                code: "SPORE-AUDIT-001",
                message:
                    "Unsafe event missing execution proof."
            });
        }
    }

    return diagnostics;
}
```

---

## Diagnostic Codes (v0.2)

### SPORE-AUDIT

| Code         | Meaning                    |
| ------------ | -------------------------- |
| SPORE-AUDIT-001 | Unsafe event missing proof |
| SPORE-AUDIT-002 | Invalid audit event        |
| SPORE-AUDIT-003 | Audit hash mismatch        |

### SPORE-REPORT

| Code          | Meaning                     |
| ------------- | --------------------------- |
| SPORE-REPORT-001 | Invalid report structure    |
| SPORE-REPORT-002 | JSONL serialization failure |
| SPORE-REPORT-003 | Missing runtime metadata    |

### SPORE-PROOF

| Code         | Meaning                 |
| ------------ | ----------------------- |
| SPORE-PROOF-001 | Invalid execution proof |
| SPORE-PROOF-002 | Proof hash mismatch     |
| SPORE-PROOF-003 | Missing execution hash  |

### SPORE-DENIAL

| Code          | Meaning                 |
| ------------- | ----------------------- |
| SPORE-DENIAL-001 | Invalid denial report   |
| SPORE-DENIAL-002 | Missing denial evidence |
| SPORE-DENIAL-003 | Invalid denial boundary |

### SPORE-EVIDENCE

| Code            | Meaning                    |
| --------------- | -------------------------- |
| SPORE-EVIDENCE-001 | Invalid evidence payload   |
| SPORE-EVIDENCE-002 | Unsupported evidence type  |
| SPORE-EVIDENCE-003 | Evidence integrity failure |

---

## Planned v0.3 Features

| Feature                      | Purpose                        |
| ---------------------------- | ------------------------------ |
| Signed audit streams         | Cryptographic signatures       |
| Merkle proof chains          | Distributed proof verification |
| Runtime replay proofs        | Deterministic replay           |
| Cluster audit federation     | Distributed aggregation        |
| Incremental evidence hashing | Performance optimization       |
| Zero-knowledge verification  | Private proof validation       |

---

## Determinism Rule

Given identical:
- execution, runtime, manifest, evidence

The system must produce:
- identical proof hashes
- identical evidence payloads
- identical audit streams
