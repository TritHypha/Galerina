# Reference — the typed-boundary vocabulary

The built-in types a flow's params and returns may use, the qualifiers that mark sensitivity, and the ways a
developer extends the set. This is the detail page behind the "Typed boundary" table in
[contract-authoring-model.md](../contract-authoring-model.md) — a **Table 1 (standard)** element: you type the
boundary, and the type checker holds you to it.

**Source of truth — one function, not one table:** `isBuiltInType()` in
`packages-galerina/galerina-core-compiler/src/type-checker.ts` (the R5A unified gate). A bare type name is accepted
**iff** it passes this gate (or is developer-declared / imported); otherwise `FUNGI-TYPE-001`. The gate is the
**union of three tables**:

| # | Table | File | What it uniquely contributes |
|---|---|---|---|
| 1 | `TypeId` registry (fast path: `resolveTypeId(name) ≠ Unknown`) | `type-registry.ts` | **`Tri`** (its only name not also in table 2) |
| 2 | `BUILT_IN_TYPES` string set | `type-checker.ts` | **`Verdict`**, `Float`, `Boolean`, `Channel`, `ReadOnlyView`, JSON subtypes, currencies, error + domain-identity families, `DynamicShape` |
| 3 | `KNOWN_DOMAIN_TYPES` | `package-type-registry.ts` | `SessionId` · `AuthToken` · `ProductId` · `PaymentMethodId` · `InvoiceId` · `WebhookId` · `WebhookEvent` · `PhoneNumber` · `Diagnosis` · `MedicalRecord` · `LabResult` · `ConsentRecord` (the rest overlap table 2) |

**Verified against source 2026-07-15 (full zero-trust re-verification).** Two earlier versions of this page were each
wrong in one direction — first documenting table 1 alone (missing `Verdict` + the domain families), then table 2 alone
(wrongly stating `Tri` is not writable). **The authoritative answer is the union gate.** If in doubt, read
`isBuiltInType()` — never a single table.

---

## A. How the type vocabulary works (the shared slots)

- **What (in general)** — a flow's parameters and returns are **typed**, and the type drives governance: it feeds the
  value-state lattice (a `SecureString` param is a `Secret`; `Tainted<T>` propagates), the hardening auto-derivation
  (a `Secret` type derives the `no_swap`/`binary` floor), and numeric lowering.
- **Where — authored** — in the flow signature and in `record`/`enum` declarations. A **qualifier** may prefix a type
  (`protected Email`, `redacted String`, `unsafe let raw`).
- **Where — enforced** — the type checker: a name failing `isBuiltInType()` that is not locally declared or imported
  is `FUNGI-TYPE-001` (with a fuzzy "did you mean" drawn from the same tables). Internally, `resolveTypeId` also maps
  names to numeric IDs for hot-path comparisons, stripping qualifiers and generic args (`Array<Int>` → `Array`).
- **How — the set extends upward, never downward** — the built-in union is closed; the developer adds **record /
  ADT / Brand / Hallmark / value-unit** types on top (IDs ≥ 1000 from the symbol resolver). A Hallmark may not mint a
  reserved name — the reserved set is exactly this union plus the epistemic/security vocabulary.
- **If omitted / unknown** — an unrecognised type name is a hard `FUNGI-TYPE-001` (fail-closed; it matches no
  built-in and no declaration).
- **Result — guarantee** — the typed boundary is what makes the rest of governance decidable: value-state, hardening,
  redaction, and lowering all key off the resolved type.

## B. The built-in types (the union, by category)

**Logical (three of them — two are three-valued)** — `Bool` / `Boolean` (two-valued) · **`Tri`** (three-valued
**truth**: True / False / Unknown — must never silently convert to `Bool`; exhaustive `match` or an explicit
conversion policy) · **`Verdict`** (three-valued **governance**: the K3 lattice `DENY(-1) < UNKNOWN(0) < ALLOW(+1)`,
lowers to WAT `i32`) · `Char` · `Void` · `Unit`. `Tri` and `Verdict` are **distinct writable types** with the same
balanced-trit shape — one speaks truth, the other speaks authorization (see
[three-valued-logic-primer.md](three-valued-logic-primer.md)).

**Numeric** — `Int` (default) · fixed widths `Int8/16/32/64` · `UInt8/16/32/64` · `Float` · `Float16/32/64` ·
`Double` · `Decimal`. Float is **discouraged** for value carrying — value-unit / financial types carry **no float
bridge** (a currency is never a `Float`).

**Text** — `String` · `SecureString` (the `Secret` value-state — approved operations only; see
[value-states.md](value-states.md)).

**Binary** — `Byte` · `Bytes` · `ReadOnlyView` (a read-only window over bytes).

**Temporal** — `Timestamp` · `Duration` · `Date` · `Time` · `DateTime`.

**JSON** — `Json` and its structural subtypes `JsonNull` · `JsonBool` · `JsonNumber` · `JsonString` · `JsonArray` ·
`JsonObject`.

**Collections** — `Array<T>` · `List<T>` (ordered-collection alias for `Array`) · `Set<T>` · `Map<K,V>` ·
`Channel<T>`.

**Algebraic** — `Option<T>` (`Some`/`None`) · `Result<T,E>` (`Ok`/`Err`).

**Compute / AI** — `Tensor<T,[dims]>` · `AnyTensor` · `Vector` · `Matrix` · `DynamicShape` (a compute dimension
label). A `pure` flow over these is a `PureComputeCandidate` (see [effects.md](effects.md)).

**Domain / financial** — `Money` and the currency types `GBP` · `USD` · `EUR` · `JPY` · `CHF` · `CAD` · `AUD` (typed
value-units, fixed-point, no float bridge).

**HTTP / API** — `Request` · `Response` · `Context` (a `Request`'s fields start `Unsafe`).

**Security** — `Hash` · `Signature` · `Secret`.

**Error types** — `Error` · `ApiError` · `EmailError` · `PaymentError` · `ValidationError` · `WebhookError` ·
`DecodeError` · `ParseError`, plus the domain error family (`AiError` · `HealthError` · `PatientError` ·
`ReferralError` · `NotificationError` · `ExportError` · `RecordError` · `UserError` · `OrderError` · `AuthError` ·
`PermissionError` · `NetworkError`). First-class error types so `Result<T,E>` carries a *typed* failure.

**Branded** — `Brand` — the nominal-typing primitive (`UserId` over `String` stays non-interchangeable).

**AI / ML** — `Prompt` · `Embedding` · `Classification` · `ModelOutput` · `Token` · `Label` · `ClassificationResult`
· `EmbeddingResult` · `RiskScore` · `Score`. Typed so an embedding of PII is classified as sensitively as its source.

**Governance** — `Policy` · `AuditRecord` · `AuditProof` · `ExecutionPlan` · `RuntimeReport` (the tower-citizen
runtime's artifacts as first-class values).

**Domain-identity (string-backed nominal)** — `Email` · `Url` · `Path` · `Hostname` · `Port` · `CurrencyCode` ·
`Reference` · `Deadline` · `Actor` · `TraceId` · `TenantId` · `UserId`; healthcare `PatientId` · `NhsNumber` ·
`PatientName` · `DateOfBirth` · `Diagnosis` · `MedicalRecord` · `LabResult` · `ConsentRecord`; financial/commerce
`AccountId` · `CardNumber` · `SortCode` · `TransactionId` · `CustomerId` · `OrderId` · `ProductId` ·
`PaymentMethodId` · `InvoiceId`; identity/session `SessionId` · `AuthToken` · `PhoneNumber` · `WebhookId` ·
`WebhookEvent`. Branded identity types whose representation is `String` — so `UserId` and `OrderId` never
interchange even though both are strings; the string-backed ones concatenate without an explicit `.toString()`.

**Record / request / response** — request/response shapes registered as built-ins (`PatientReadRequest` ·
`PatientProfileResponse` · `CreateOrderRequest` · `CreateOrderResponse` · …) plus import-resolved record types
(`PatientRecord` · `HealthRecord` · `ClinicalActor` · `FinancialActor`) accepted without a local declaration.

## C. Qualifiers (the sensitivity prefix)

The **single source of truth** is `TYPE_QUALIFIERS` (in `type-registry.ts`): `protected` · `redacted` · `unsafe` ·
`safe` · `secret`. A qualifier prefixes a type (`protected Email`) and sets the value-state; `resolveTypeId` strips it
to find the base type. Documented from the value's side in [value-states.md](value-states.md).

## D. Developer-defined types (extend upward)

| Kind | What it is |
|---|---|
| `record { … }` | a struct — named, typed fields |
| `enum` / variant ADT | a closed set of variants (exhaustively matched) |
| `Brand` nominal | a distinct type over a base (e.g. `UserId` over `String`) |
| **Hallmark** open types | developer-minted nominal types with **mandatory assay gates** (RD-0353); may not mint a reserved (built-in-union) name |
| **value-unit** types | currency / quantity types (RD-0349) with typed arithmetic and **no float bridge** |

Each extends the vocabulary **upward** (adds a type; custom types get `TypeId` ≥ 1000 from the symbol resolver) and
none can weaken or remove a built-in.

---

*Provenance: `type-checker.ts` — `isBuiltInType()` (the R5A unified acceptance gate = the source of truth) +
`BUILT_IN_TYPES`; `type-registry.ts` — `TypeId` (the numeric fast path; contributes `Tri`) + `TYPE_QUALIFIERS` +
`resolveTypeId`; `package-type-registry.ts` — `KNOWN_DOMAIN_TYPES`. RD-0353 (Hallmark), RD-0349 (value-unit). Full
zero-trust re-verification 2026-07-15: corrected twice — the vocabulary is the **union gate**, not any single table;
`Tri` (truth) and `Verdict` (governance) are both writable three-valued types.*
