# Galerina Phase 10 Roadmap

## Status

```
Active — Phase 9 complete (426 tests)
Phase 10A: Contract expansion + signed attestation
Phase 10B: Governance enforcement (GOV-003, CONTEXT-001)
Phase 10C: Governed memory blocks
```

## TL;DR

- Phase 10A expands the contract model with request, response, context, and model sections, and adds Ed25519 signed attestation
- Phase 10B wires governance enforcement for the new contract sections into the compiler
- Phase 10C adds runtime memory tagging and capability-checked access for protected values

---

## Phase 10A: Contract Model Expansion + Attestation

**Goal:** Expand the flow contract to cover the full meaning of a flow and
produce signed build artifacts.

### 10A-1: Parser — new contract sections

Add `request`, `response`, `context`, and `model` sections to
`parseContractDecl()` in `src/parser.ts`.

**Sections to implement:**

| Section | Syntax |
|---|---|
| `request {}` | `accepts`, `params { name: TrustState Type }`, `requires { field, ... }` |
| `response {}` | `returns`, `exposes { fields }`, `denies { fields }` |
| `context {}` | `require field` |
| `model {}` | `uses TypeName`, `reads TypeName`, `constraints { ... }` |

Each section is optional. The parser should record its presence or absence in
the contract AST node so the governance verifier can check requirements in
Phase 10B.

### 10A-2: src/attestation.ts

Implement `src/attestation.ts` with Ed25519 signing.

**Exports:**

```typescript
signAttestation(hashes: AttestationHashes, privateKey: KeyObject, keyId: string): AttestationArtifact
verifyAttestation(attestation: AttestationArtifact, publicKey: KeyObject): boolean
computeHashes(source: string, gir: GirNode, contract: ContractNode, ...): AttestationHashes
```

**Hash inputs:**

- `source`: `.spore` file content (UTF-8 bytes)
- `gir`: canonical JSON serialization of the GIR node
- `contract`: canonical JSON serialization of the contract block
- `target_plan`: compute target selection record
- `runtime_report`: execution report from the runtime
- `audit_proof`: proof chain output from `galerina-proof-chain-spec.md`
- `package_manifest`: `package.json` content

All hashes use SHA-256. Private key is read from environment variable or key
file — never from the repository.

### 10A-3: RuntimeResult — optional attestation output

Extend `RuntimeResult` in `src/runtime.ts` with an optional `attestation`
field:

```typescript
interface RuntimeResult {
  // ... existing fields
  attestation?: AttestationArtifact;
}
```

When the flow contract declares `audit { require signed attestation }`,
the runtime calls `signAttestation()` before returning the result.

### 10A-4: Test suite extension

Extend the 426-test suite to cover:

- Contract parsing for all new sections
- Attestation hash computation
- Attestation signing and verification
- RuntimeResult attestation output for flows with `audit { require signed attestation }`

All 426 existing tests must continue to pass unchanged.

---

## Phase 10B: Governance Enforcement

**Goal:** Wire the new contract sections into the compiler's governance pass
and enforce them at compile time.

### 10B-1: SPORE-GOV-003 — protected data in response without exposes

The governance verifier checks that every `protected` or `secret` field in the
response body is listed in `response.exposes`. A field in `response.denies`
that appears in the response body is also rejected.

```
Trigger: protected or secret value assigned to response body field
Missing: response.exposes declaration for that field
Diagnostic: SPORE-GOV-003
Severity: error
```

### 10B-2: SPORE-CONTEXT-001 — required context field not accessed

The governance verifier checks that every field declared in `context.require`
is accessed in the flow body before the first operation that touches a
`protected` or `secret` value.

```
Trigger: context.require declares a field
Missing: that field is not read before the first protected operation
Diagnostic: SPORE-CONTEXT-001
Severity: error
```

### 10B-3: response.denies validation in value-state checker

Extend the value-state checker to recognise `response.denies` declarations
and treat listed fields as forbidden sinks inside the response expression.

### 10B-4: SPORE-CONTRACT-001 — section order violation (formatter)

The formatter (`galerina fmt`) reorders contract sections to canonical order and
emits `SPORE-CONTRACT-001` as an informational note when it does so. The compiler
does not error on order violations; the formatter fixes them.

---

## Phase 10C: Governed Memory Blocks

**Goal:** Give `protected` and `secret` bindings runtime identity, ownership,
and capability-checked access.

### 10C-1: Runtime value tagging for protected bindings

When the interpreter executes a binding of type `protected T` or `secret T`,
allocate a Governed Memory Block (GMB) instead of a plain value slot.

The GMB carries:
- `id` (ULID)
- `owner_flow` (current flow name)
- `permissions.read` (default: current flow + `redact`)
- `permissions.export` (default: denied)
- `hash` (SHA-256 of current content)
- `signature` (runtime key over `id + hash`)

### 10C-2: Capability-checked access in interpreter

Before every read or write of a GMB, the interpreter checks:

1. Caller is in `permissions.read` (for reads) or `permissions.write` (for writes)
2. Block hash matches current content (tamper check)
3. Export is not attempted when `permissions.export: denied`

A failed check produces a runtime integrity violation and writes an audit event.

### 10C-3: Runtime integrity report generation

At flow completion, the runtime produces a GMB summary section in the
execution report listing:

- All GMBs allocated during the run
- All access checks performed
- Any access denials
- Final block hashes

This report section feeds the attestation hash for `runtime_report`.

---

## What Does NOT Change

These items are stable across all of Phase 10.

- `with effects [...]` at the flow signature remains valid and is not deprecated
- Phase 9 diagnostics (`SPORE-VALUESTATE-*`, `SPORE-SECRET-*`, `SPORE-EFFECT-*`,
  `SPORE-GOV-001/002`) are unchanged
- All 426 existing tests must continue to pass after every phase milestone
- The proof chain format from `galerina-proof-chain-spec.md` is not changed
- The JSONL audit writer format from `galerina-audit-writer-spec.md` is not changed
- `src/interpreter.ts`, `src/parser.ts`, `src/symbol-resolver.ts`, and
  `src/runtime.ts` are extended, not replaced

---

## Phase 10 Success Criteria

### Phase 10A complete when:

- Parser handles `request`, `response`, `context`, and `model` contract sections
- `src/attestation.ts` signs and verifies attestation artifacts with Ed25519
- `RuntimeResult.attestation` is populated for flows with the `require signed attestation` audit declaration
- All 426 existing tests pass; new test suite coverage for attestation and contract parsing

### Phase 10B complete when:

- `SPORE-GOV-003` fires on protected fields in response body without `exposes`
- `SPORE-CONTEXT-001` fires on required context fields not accessed before protected work
- `response.denies` fields are blocked by the value-state checker
- Formatter reorders contract sections to canonical order

### Phase 10C complete when:

- Protected and secret bindings allocate Governed Memory Blocks at runtime
- Every read and write is checked against the GMB capability list
- Tamper detection (hash mismatch) produces a runtime integrity violation
- Execution report includes the GMB access summary

---

## Estimated Complexity

| Milestone | Complexity |
|---|---|
| 10A-1: Parser contract sections | Medium |
| 10A-2: src/attestation.ts | Medium |
| 10A-3: RuntimeResult attestation | Low |
| 10B-1: SPORE-GOV-003 | Medium |
| 10B-2: SPORE-CONTEXT-001 | Medium |
| 10B-3: response.denies in value-state checker | Low |
| 10C-1: Runtime value tagging | High |
| 10C-2: Capability-checked access | High |
| 10C-3: Runtime integrity report | Medium |

---

## See Also

- `docs/Knowledge-Bases/galerina-contract-full-model.md` — canonical contract section reference
- `docs/Knowledge-Bases/galerina-signed-attestation.md` — attestation artifact format and signing model
- `docs/Knowledge-Bases/galerina-governed-memory-blocks.md` — GMB specification for Phase 10C
- `docs/Knowledge-Bases/galerina-phase-9-roadmap.md` — Phase 9 (426 tests, async interpreter)
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md` — proof chain format used by attestation
- `docs/Knowledge-Bases/galerina-governance-verifier-spec.md` — governance verifier (Phase 10B target)
