# Galerina — Metadata Erasure

## Status

```
Phase 13 — Architecture specification
```

## TL;DR

- Metadata should inform execution; metadata should not become execution
- Intent, comments, AI guidance, and readable logic forms are erased from executables
- Effects, timeouts, limits, and privacy rules MUST survive because the runtime needs them for enforcement

---

## The Core Problem

Galerina source has more metadata than most languages. A single flow may carry:

- An `intent` block describing its business purpose in natural language
- AI-readable comments explaining reasoning and tradeoffs
- Human comments for developers
- Readable logic forms (`when`, `given`, `then`) that the parser lowers to AST
- Timeout declarations, limit declarations, and privacy rules
- Effect declarations and capability proofs
- Contract blocks with observability and privacy settings

If all of this survives into emitted code and execution plans, the output is:

```text
larger — more bytes to parse and transmit
slower — more structure for the runtime to traverse
leaky — business intent readable in compiled output
redundant — metadata already validated at compile time
```

The solution is deliberate erasure: keep what the runtime needs, remove everything else.

---

## Galerina Principle

> **Metadata should inform execution. Metadata should not become execution.**

Metadata exists to make source code understandable to humans, AI assistants, the compiler, and governance tooling. It does its job at compile time. Once the compiler has used it, most metadata has no further role in the executable.

The compiler consumes metadata. The executable does not carry it. The Semantic Graph preserves it for tooling. The attestation chain proves it was present.

---

## What Is Metadata vs What Is Execution

| Source construct | Classification | Fate in executable |
| --- | --- | --- |
| `intent "Process patient record"` | Metadata | Erased |
| `// AI: prefer the fast path here` | Metadata | Erased |
| `# human comment` | Metadata | Erased |
| `when age > 18 then ...` | Readable form (metadata surface) | Lowered by parser; raw form erased |
| `fn processOrder(...)` | Execution | Survives as operation |
| `effects { database.read }` | Capability proof / execution | Survives in plan as approved_capabilities |
| `timeout: 5s` | Runtime enforcement | Survives in plan |
| `limit: 100` | Runtime enforcement | Survives in plan |
| `privacy { redact: [email] }` | Runtime / compiler enforcement | Survives in plan |

The line is not between "important" and "unimportant" metadata. It is between "metadata the runtime must enforce" and "metadata the runtime has no role in enforcing."

---

## Examples of Metadata to Erase

### Intent blocks

```galerina
intent ProcessPatientRecord {
  purpose "Read a patient record and write an audit entry"
  actor "Clinician or automated care-coordination system"
  sensitivity "High — contains protected health information"
}
```

This is useful to the compiler (validates capability requirements match stated purpose), to the IDE (surfaces context during development), and to governance tooling (diffs intent across versions). It serves no purpose inside the executable. It is erased.

### AI comments

```galerina
// AI: The patient lookup should happen before the audit write.
// If the patient does not exist, the audit write is skipped.
// This avoids orphaned audit entries.
```

AI tooling reads this during development and during code review. The runtime does not need it. It is erased.

### Human comments

```galerina
# TODO: consider adding a cache layer here once load testing confirms the bottleneck
```

Erased from the executable. Preserved in source. Visible to developers and AI assistants through the Semantic Graph if needed.

### Readable logic forms

```galerina
when patient.status is Active
  and patient.consentRecorded is true
then
  allow lookup
```

The parser lowers this to a standard conditional structure in the AST. The readable form (`when`, `and`, `then`) is a surface-level metadata aid for humans and AI. Once lowered, the surface representation is not preserved in deeper compiler stages or the executable.

---

## What Must NOT Be Erased

Some metadata is not metadata at runtime — it is a runtime contract. Erasing it would break enforcement.

### Effects (capability proof + runtime report)

```galerina
contract {
  effects {
    database.read
    audit.write
  }
}
```

The capability proof must survive into the Passive Execution Plan as `approved_capabilities`. The runtime enforces this list. The runtime report records capabilities actually used against it. Without it, the runtime cannot enforce capability boundaries.

### Timeouts (cancellation enforcement)

```galerina
contract {
  timeout: 3s
}
```

The timeout must appear in the plan. The runtime uses it to cancel execution if the flow exceeds the declared bound. Erasing it removes the enforcement.

### Limits (runtime enforcement)

```galerina
contract {
  limits {
    maxRows: 500
    maxPayloadBytes: 65536
  }
}
```

Limits are enforced by the runtime at execution boundaries. They must survive into the plan.

### Privacy rules (compiler proves + runtime may enforce)

```galerina
contract {
  privacy {
    redact: [email, dateOfBirth]
    exposes: []
  }
}
```

The compiler proves that redaction is applied correctly at compile time. The runtime may also enforce redaction at response serialisation. Privacy rules must survive.

---

## Metadata Lifecycle

Metadata is richest in source. It is progressively erased as it moves toward execution.

```text
Source (.spore file)
  full metadata — intent, comments, readable forms, effects, timeouts, limits, privacy

      ↓ Lexer + Parser

AST
  structured representation — all metadata preserved in nodes

      ↓ Type Checker + Effect Checker + Value State Checker

Typed AST
  type-annotated — all metadata still present; checker results attached

      ↓ Semantic Resolver

Semantic Graph
  resolved, queryable — rich metadata preserved for IDE, AI, governance, docs
  this is the canonical metadata store for tooling; not for the executable

      ↓ GIR Emitter (Governed IR)

GIR
  compiler IR — execution-relevant metadata only
  intent text begins to disappear; AI comments gone; human comments gone
  effects, timeouts, limits, privacy rules remain

      ↓ Passive Execution Planner

Passive Execution Plan
  only execution-relevant content
  no intent text, no comments, no readable forms
  approved_capabilities, timeouts, limits, privacy rules present
  capability_proof section present
  steps describe what the runtime executes

      ↓ Runtime

Runtime execution + Runtime Report
  no metadata at all in execution path
  runtime report records what happened, not what was said about it
```

---

## Semantic Graph Retention

The Semantic Graph deliberately retains rich metadata that the executable discards:

```text
Semantic Graph preserves:
  intent blocks
  AI comments (structured)
  effect declarations
  contract metadata
  type information
  call graph edges
  privacy policies
  governance annotations
```

This is not a contradiction. The Semantic Graph is not the executable. It is the compiler's and tooling's queryable model of program meaning. It is consulted by:

- IDE hover cards and inline documentation
- AI code assistants (understanding intent without running code)
- Governance tooling (diffing intent and effects between commits)
- `galerina explain` (showing developers why a decision was made)
- Self-hosted compiler (reasoning about its own structure)

The Semantic Graph preserves metadata for machines that read code. The executable discards metadata that serves no runtime enforcement role.

---

## Passive Execution Plan

The Passive Execution Plan is the primary artifact of metadata erasure.

It contains only what the runtime needs to execute:

```yaml
executionPlan:
  flow: getPatient
  version: "1.0"

  # NO intent block — erased
  # NO comments — erased
  # NO readable logic forms — erased

  capability_proof:
    status: passed
    verified_at_compile: true
    required_effects:
      - database.read
      - audit.write
    declared_effects:
      - database.read
      - audit.write
    undeclared_effects: []

  approved_capabilities:
    - host.database.read
    - host.audit.write

  timeout_ms: 3000

  limits:
    maxRows: 500

  privacy:
    redact:
      - email
      - dateOfBirth

  steps:
    - kind: validate_context
    - kind: capability_call
      capability: host.database.read
      op: PatientsDB.find
    - kind: capability_call
      capability: host.audit.write
      op: AuditLog.write
    - kind: response
      form: okJson
```

No intent string. No AI comment. No human comment. The steps describe work without explaining why it is valuable.

---

## Runtime Report and Attestation

Erasing metadata from the executable does not mean the metadata is lost. It means it was used and confirmed at compile time, then preserved outside the execution path.

The runtime report proves execution happened as governed:

```json
{
  "flow": "getPatient",
  "capabilities_used": ["host.database.read", "host.audit.write"],
  "timeout_enforced_ms": 3000,
  "privacy_redactions_applied": ["email", "dateOfBirth"],
  "capability_proof_status": "passed",
  "runtime_enforcement_status": "clean"
}
```

The attestation chain links:

```text
source hash
  → semantic graph hash (rich metadata present here)
  → typed AST hash
  → GIR hash
  → passive execution plan hash (lean metadata here)
  → execution proof hash
```

An auditor can verify that the rich metadata in the Semantic Graph corresponds to the lean execution plan. The metadata was present. It informed the plan. It was then deliberately not carried into execution.

---

## AI Benefits

AI assistants operate on source and the Semantic Graph — not on the executable. Rich metadata in source has zero runtime cost because it is never included in the executable.

This means Galerina can afford to be generous with AI-readable metadata in source:

```galerina
// AI: This flow is the primary entry point for patient data access.
// The double-write pattern (DB then audit) is intentional and must not be reordered.
// If PatientsDB.find fails, AuditLog.write must still record the attempt.
intent GetPatient {
  purpose "Retrieve a patient record with a guaranteed audit trail"
  sensitivity "PHI — highest privacy classification"
}
```

The AI assistant reads all of this. The executable carries none of it.

---

## Performance Benefits

Erasing metadata from executables has direct performance consequences:

```text
smaller output
  fewer bytes to parse, transmit, and load

faster startup
  runtime does not parse intent strings or comment blocks
  Passive Execution Plan is compact and pre-verified

less memory
  plan fits in smaller working set
  no large metadata structures in the hot path

less serialisation
  plan YAML/JSON is smaller
  network transfer of plans is faster
```

A Passive Execution Plan for a moderate flow should be significantly smaller than an AST representation of the same flow, even though the source carries much more information.

---

## Security Benefits

Erasing intent from the executable is a security property:

```text
source:     intent "Detect fraudulent banking activity for transaction risk scoring"
executable: [intent block erased]
```

The business purpose of a governed system is not readable by inspecting the executable. An adversary who obtains the compiled output cannot trivially discover:

- What the system is for
- What business logic it implements
- What sensitive domains it touches
- What the operator considers high-risk behavior

Intent, business rationale, and domain sensitivity remain in source and the Semantic Graph, accessible only to authorised tooling, not to executable inspection.

---

## Verification Benefits

Metadata erasure does not weaken the verification model. Metadata still contributes to the semantic hash chain:

```yaml
attestation:
  source_hash: sha256:...             # includes intent blocks, comments, all metadata
  semantic_graph_hash: sha256:...     # richest metadata representation
  typed_ast_hash: sha256:...
  gir_hash: sha256:...
  passive_execution_plan_hash: sha256:...   # lean — only execution-relevant content
  execution_proof_hash: sha256:...
```

An auditor can verify that the lean plan is the correct product of the rich source. The chain proves continuity from intent to execution without requiring the executable to carry the intent.

---

## Galerina Rule

> **Metadata should survive verification. Metadata should not survive execution.**

---

## Relationship to Static Capability Proofs

Static capability proofs use metadata (effect declarations in the contract) to generate facts (approved_capabilities in the plan). The metadata input is erased from the executable; the proof output survives. The proof is not metadata — it is a runtime contract.

---

## Relationship to Passive Execution Plans

Passive Execution Plans are the direct product of metadata erasure. The compiler consumes all source metadata, uses it to prove safety and correctness, then emits a plan that contains only what the runtime must enforce. Everything else is gone.

---

## Rules at a Glance

```text
RULE 1   Intent blocks are erased from executables.
RULE 2   AI comments are erased from executables.
RULE 3   Human comments are erased from executables.
RULE 4   Readable logic forms (when/given/then) are lowered in the parser; surface forms are erased.
RULE 5   Effects must survive — they become approved_capabilities in the plan.
RULE 6   Timeouts must survive — the runtime uses them for cancellation.
RULE 7   Limits must survive — the runtime uses them for enforcement.
RULE 8   Privacy rules must survive — compiler proves, runtime may enforce.
RULE 9   The Semantic Graph retains rich metadata for tooling; it is not the executable.
RULE 10  Metadata still contributes to the semantic hash chain; it does not survive execution.
RULE 11  Metadata should survive verification. Metadata should not survive execution.
```

---

## See Also

- `galerina-passive-execution-plans.md` — the primary artifact of metadata erasure
- `galerina-static-capability-proofs.md` — what survives from effects into the plan
- `galerina-semantic-graph-system.md` — where rich metadata is retained for tooling
- `galerina-phase-13-decisions.md` — Decision 5 (canonical form hashing for attestation)
- `galerina-concept-governed-execution-plan.md` — governed execution plan concept
- `galerina-proof-chain-spec.md` — attestation chain spec
- `galerina-signed-attestation.md` — signed attestation format
- `compile-time-metadata-reflection.md` — compiler-time metadata access rules
