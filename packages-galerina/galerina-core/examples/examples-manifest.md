# Galerina — Examples Manifest

## Purpose

This manifest classifies every `.spore` example as **v1** or **post-v1**. The
v1 subset must be parseable by the Phase 4 parser or intentionally marked as a
rejection fixture. Post-v1 examples are drafts kept for reference but are
excluded from Phase 4 parser tests.

Phase 2 corpus target: ≥ 20 v1 examples covering all five categories.

---

## V1 Examples

These examples demonstrate v1 language features and must parse (or be marked
`EXPECT: REJECT`) when the Phase 4 parser is implemented.

### Basic (5)

These cover the fundamentals: flow declaration, records, simple Result, and
simple Option.

| File | Demonstrates | Status |
|---|---|---|
| `hello.spore` | Simple `flow`, `return`, `print`, `Result<Void, Error>` | ✅ v1 |
| `result.spore` | `type` alias, `enum`, `flow`, `match Result` | ✅ v1 |
| `option.spore` | `type`, `Option<T>`, `match Option`, `Some`/`None` | ✅ v1 |
| `strict-types.spore` | Type aliases, record declaration, field access | ✅ v1 |
| `decision.spore` | Multi-variant `enum`, exhaustive `match` on enum | ✅ v1 |

### Type-System (5)

These cover the extended type system: Tri, generics, effects declarations, and
explicit type contracts.

| File | Demonstrates | Status |
|---|---|---|
| `ternary-sim.spore` | `Tri` enum, `pure flow`, guard clauses in `match` | ✅ v1 |
| `json-decode.spore` | Generic type parameters, `json.decode<T>`, typed decode | ✅ v1 |
| `contracts.spore` | Effect declarations (`effects [...]`), contract-style typing | ✅ v1 |
| `source-map-error.spore` | Source-map diagnostics, compute target errors | ✅ v1 (tooling) |
| `api-orders.spore` | API route shapes, typed responses, explicit error types | ✅ v1 |

### API / JSON (5)

These cover API surfaces: typed decode, validation, explicit errors, safe
response shapes, and webhook-style input.

| File | Demonstrates | Status |
|---|---|---|
| `payment-webhook.spore` | `webhook` declaration, HMAC security, `json.decode`, policy | ✅ v1 |
| `json-decode.spore` | Typed JSON decode, `Result<T, ApiError>` | ✅ v1 (shared with type-system) |
| `contracts.spore` | Request/response contract types | ✅ v1 (shared with type-system) |
| `api-orders.spore` | Route manifest with explicit input/output types | ✅ v1 (shared with type-system) |
| `rollback.spore` | Checkpoint + rollback for transactional flows | ✅ v1 |

### Memory (3)

These cover Galerina's memory model. Galerina is **value-semantics** (no shared mutable aliasing,
no references, no raw pointers) — `borrow`/`move` are reserved-but-unenforced surface, and there
is no "use after move" / borrow error class. The genuine consume-once guarantee for linear
resources is SPORE-AFFINE-001 in the production value-state checker (#65 / RD-0130).

| File | Demonstrates | Expected |
|---|---|---|
| `borrow-scope.spore` | Scoped `borrow` syntax (reserved; unenforced) | ACCEPT |
| `move-cleanup.spore` | `move` annotation; value owned by the binding (reserved; unenforced) | ACCEPT |
| `value-semantics-ownership.spore` | Value semantics: re-use after `move` is ACCEPTED (no use-after-move class; cf. SPORE-AFFINE-001) | ACCEPT |

### Concurrency (2)

These cover the Structured Await pattern. Included as v1 if Structured Await
remains in scope (see Phase 2 exit criteria).

| File | Demonstrates | Status |
|---|---|---|
| `parallel-api-calls.spore` | `async flow`, `parallel`, `await`, `timeout` | ✅ v1 (Structured Await) |
| `workers.spore` | `channel`, `worker`, event loop | ⚠️ v1 candidate — `for` loop and `channel` syntax need Phase 1 grammar confirmation |

---

## V1 Total Count

| Category | Required | Present | Status |
|---|---|---|---|
| Basic | 5 | 5 | ✅ |
| Type-system | 5 | 5 | ✅ |
| API/JSON | 5 | 5 | ✅ |
| Memory | 3 | 3 | ✅ |
| Concurrency | 2 | 2 | ⚠️ (see `workers.spore` note) |
| **Total** | **≥ 20** | **20** | ✅ |

---

## Post-V1 Examples

These files use features that are deferred until after the Phase 0–3
foundation. They must not be included in Phase 4 parser tests.

| File | Reason deferred |
|---|---|
| `gpu-plan.spore` | GPU target — deferred to post-v1 |
| `photonic-plan.spore` | Photonic target — deferred to post-v1 |
| `compute-block.spore` | Heterogeneous compute blocks — post-v1 target planning |
| `compute-mix-throughput-benchmark.spore` | Benchmark — no repeatable method yet |
| `arithmetic-threshold-benchmark.spore` | Benchmark — no repeatable method yet |
| `four-digit-guess-benchmark.spore` | Benchmark — no repeatable method yet |
| `browser-form.spore` | Browser target — post-v1 |
| `logic-review-scale.spore` | Large-scale example — review for v1 content before classifying |
| `ai-context.spore` | AI context generation — report/tooling feature, not core language |
| `boot.spore` | Project manifest — tooling configuration, not a language example |

---

## Rejection Fixtures

These examples must produce specific diagnostics. They are valid v1 test
inputs but must not be parsed as correct programs:

| File | Expected diagnostic | Reason |
|---|---|---|
| _(none)_ | — | The use-after-move fixture was retired in #65 — Galerina is value-semantics, so there is no use-after-move / borrow error class to reject. The consume-once guarantee is SPORE-AFFINE-001, exercised in the production compiler's value-state tests (not this prototype corpus). |

---

## Parser Test Classification

When the Phase 4 parser is implemented, test files are divided as follows:

```
Phase 4 accept corpus:
  hello.spore
  result.spore
  option.spore
  strict-types.spore
  decision.spore
  ternary-sim.spore
  json-decode.spore
  contracts.spore
  api-orders.spore
  payment-webhook.spore
  rollback.spore
  borrow-scope.spore
  move-cleanup.spore
  value-semantics-ownership.spore
  parallel-api-calls.spore
  workers.spore (pending grammar confirmation)
  source-map-error.spore (pending grammar confirmation)

Phase 4 reject corpus (intentional failures):
  (none — the use-after-move reject fixture was retired in #65; Galerina is value-semantics)

Post-v1 (excluded from Phase 4 tests):
  gpu-plan.spore
  photonic-plan.spore
  compute-block.spore
  compute-mix-throughput-benchmark.spore
  arithmetic-threshold-benchmark.spore
  four-digit-guess-benchmark.spore
  browser-form.spore
  logic-review-scale.spore
  ai-context.spore
  boot.spore
```

---

## Authoring Rules for New Examples

1. Each example demonstrates exactly one language rule or pattern.
2. The first line comment must be one of:
   - `// EXPECT: ACCEPT` for correct programs
   - `// EXPECT: REJECT` with `// ERROR: SPORE-CODE` for intentional failures
3. Examples must not depend on archived domain packages or post-v1 targets.
4. Examples must be added to this manifest before they are referenced in tests.
