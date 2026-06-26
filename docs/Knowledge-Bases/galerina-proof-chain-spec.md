# Galerina Execution Proof Chain Specification

## Status

```text
Proof chain generation: specified - implementation Phase 7B/8
Related graph support:   spore-graph ExecutionProofChain / buildProofChain()
```

This document defines the execution proof chain that connects compiler
declarations, runtime execution, audit output, and built artefacts.

---

## Rules at a Glance

- Proof chains bind what was declared to what was executed and audited.
- Hashes use SHA-256 over canonical serialized content.
- Production and deterministic modes require proof generation.
- Dev mode generates proofs only when requested.
- Denials are included so rejected operations cannot be silently omitted.
- Proof chains are execution evidence, not mathematical proofs.

---

## TL;DR
- Five SHA-256 hashes bind declared → executed → audited
- Production and deterministic modes require proof generation
- Denials are always recorded — they cannot be silently omitted

---

## What the Proof Chain Is

An execution proof chain is a set of SHA-256 hashes over:

- the source manifest: what was declared
- the JSONL audit log: what was executed
- the evidence record: validation and redaction proofs
- the denial log: what was denied at runtime
- the build artefact: the compiled GIR, JS, or backend output

Together they prove:

```text
what was declared = what was executed = what was audited
```

Formal mathematical proofs are a separate concept covered by
`formal-proof-system.md`.

## ExecutionProofChain Schema

```yaml
schemaVersion: "spore.execution.proof.v1"
proofId: uuid
generatedAt: ISO8601
hashes:
  manifestSha256: string
  auditSha256: string
  evidenceSha256: string
  denialSha256: string
  artefactSha256: string
```

## Hash Computation

| Hash | Computation |
|---|---|
| `manifestSha256` | SHA-256 of canonical `galerina-manifest.json` content. |
| `auditSha256` | SHA-256 of the full JSONL audit log file for this execution. |
| `evidenceSha256` | SHA-256 of the evidence record, including validation gates fired and redactions applied. |
| `denialSha256` | SHA-256 of the denial log containing runtime governance rejections. |
| `artefactSha256` | SHA-256 of compiled GIR, JS, or backend output. |

Canonicalization rules:

- sort object keys for JSON inputs
- preserve JSONL line order for audit logs
- include trailing newlines where the format requires them
- never include raw secrets
- hash bytes, not platform-specific text abstractions

## Generation Modes

| Mode | Proof generation |
|---|---|
| `production` | After every execution. |
| `dev` | Only when explicitly requested. |
| `deterministic` | Always. |
| `check-only` | Not generated because no execution occurs. |

## What the Proof Chain Proves

- The program that ran matches what was compiled through `artefactSha256`.
- Declared effects match executed effects through manifest and audit evidence.
- Protected values were validated or redacted before reaching sinks through
  `evidenceSha256`.
- Governance denials were recorded, not suppressed, through `denialSha256`.
- Audit records were not rewritten after the fact without changing
  `auditSha256`.

## What It Does Not Prove

- It does not prove mathematical correctness of the business algorithm.
- It does not replace type checking or the governance verifier.
- It does not grant runtime authority.
- It does not permit execution when prior compiler errors exist.

## Compiler Status

```text
Proof chain generation: specified - implementation Phase 7B/8
Hash canonicalization:   specified - implementation Phase 7B/8
Runtime integration:     specified - implementation Phase 7B/8
```

## See Also

- `docs/Knowledge-Bases/galerina-core-reports-v02.md`
- `docs/Knowledge-Bases/galerina-audit-writer-spec.md`
- `docs/Knowledge-Bases/formal-proof-system.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/galerina-core-compiler-manifest-generation-pass-14.md`
- `docs/Knowledge-Bases/governed-execution-director.md`
