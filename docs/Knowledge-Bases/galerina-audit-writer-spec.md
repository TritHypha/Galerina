# Galerina Audit Writer Specification

## Status

```text
JSONL writer: specified - implementation Phase 7B/8
Applies to:    Runtime audit records during flow execution
```

This document defines the JSONL audit writer used by the Stage 1 runtime. It
specifies persistence rules, event field meaning, redaction behaviour, and file
paths. Shared report types remain owned by `galerina-core-reports-v02.md`.

---

## Rules at a Glance

- Audit output is append-only JSONL.
- Every event is one compact JSON object followed by newline.
- Runtime metadata is injected by the runtime, not trusted from flow code.
- Protected and secret values must be redacted before serialization.
- Concurrent writers use separate files to preserve order per writer instance.
- Production mode requires audit persistence.

---

## JSONL Format Contract

1. Append-only: never overwrite or delete records.
2. One record per line: no multiline JSON.
3. Newline-terminated: each record ends with `\n`.
4. Reject invalid `schemaVersion`; only `lln.runtime.audit.v1` is accepted.
5. Reject raw secrets; `SecureString` values must not appear in any field.
6. No pretty-printing; use compact single-line JSON only.
7. Preserve event order per writer instance; concurrent writers use separate
   files.

## RuntimeAuditEvent Fields

`galerina-core-reports-v02.md` owns the shared report type. The JSONL writer uses
this runtime event shape for Stage 1 audit persistence:

| Field | Type | Meaning | Example |
|---|---|---|---|
| `schemaVersion` | string | Audit schema identifier. | `"lln.runtime.audit.v1"` |
| `id` | string | Unique audit event id. | `"evt_01HY..."` |
| `timestamp` | ISO8601 string | Runtime write time. | `"2026-05-29T12:00:00.000Z"` |
| `status` | string | Runtime status. | `"Success"` |
| `eventType` | string | Event category. | `"FunctionExecution"` |
| `source` | string | Runtime source component. | `"galerina-runtime"` |
| `message` | string | Safe human-readable summary. | `"Flow completed"` |
| `flowName` | string | Current flow name. | `"createPatient"` |
| `qualifier` | string | `pure`, `guarded`, or `secure`. | `"secure"` |
| `actor` | object | Runtime-owned actor identity. | `{ "type": "user", "id": "usr_123" }` |
| `traceId` | string | Request/execution trace id. | `"trace_abc"` |
| `spanId` | string | Current span id. | `"span_001"` |
| `metadata` | object | Sanitized metadata from flow call. | `{ "action": "deletePatient" }` |
| `evidence` | array | Runtime evidence records. | `[]` |
| `proof` | object? | Optional execution proof. | `{ "executionId": "exec_1" }` |
| `diagnostics` | array? | Safe diagnostics. | `[]` |

The v0.2 shared report document defines related `RuntimeAuditStatus`,
`RuntimeEvidence`, and `ExecutionProof` shapes.

## AuditLog.write() Runtime Behaviour

When flow code calls:

```galerina
AuditLog.write({ event: "PatientDeleted", patientId: auditId })
```

the runtime:

1. Constructs a `RuntimeAuditEvent`.
2. Adds runtime metadata: `flowName`, `qualifier`, `actor`, `timestamp`,
   `traceId`, and `spanId`.
3. Copies the safe Galerina field map into `metadata`.
4. Redacts protected and secure values.
5. Writes one compact JSON line to the JSONL writer.

Application code may provide event metadata. It may not override runtime-owned
identity fields such as actor, trace, route, or flow.

## Protected Value Redaction

Before serialization:

| Runtime value | Audit output |
|---|---|
| protected type | `"[PROTECTED]"` |
| `SecureString` | `"[SECURE]"` |
| redacted type | included as-is |
| unsafe value | rejected unless validated/sanitized/redacted by policy |

The writer must recursively sanitize object, array, map, and set values.

## Audit File Path

Default path:

```text
./audit/<date>/<flowName>.audit.jsonl
```

Example:

```text
./audit/2026-05-29/deletePatient.audit.jsonl
```

The runtime profile may configure:

- root audit directory
- per-route or per-flow file split
- retention policy
- deterministic output path
- production writer adapter

## Compiler Status

```text
JSONL writer:       specified - implementation Phase 7B/8
AuditLog runtime:   specified - implementation Phase 7B/8
Redaction adapter:  specified - implementation Phase 7B/8
```

## See Also

- `docs/Knowledge-Bases/galerina-core-reports-v02.md`
- `docs/Knowledge-Bases/audit-actor-model.md`
- `docs/Knowledge-Bases/galerina-runtime-lifecycle.md`
- `docs/Knowledge-Bases/galerina-runtime-value-model.md`
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/stdlib-gates.yaml`
