# Reference — the typed-boundary vocabulary

The built-in types a flow's params and returns may use, the qualifiers that mark sensitivity, and the ways a
developer extends the set. This is the detail page behind the "Typed boundary" table in
[contract-authoring-model.md](../contract-authoring-model.md) — a **Table 1 (standard)** element: you type the
boundary, and the value-state checker holds you to it.

**Source of truth:** `packages-galerina/galerina-core-compiler/src/type-registry.ts` (`TypeId`, `TYPE_QUALIFIERS`).
**Verified against source 2026-07-15.** The overview table shows a representative subset; the full registry below is
**~55 built-in identifiers**.

> **Honest scope:** `TypeId` is the numeric registry of built-in type identifiers (Phase 18D). What actually
> *compiles* is the type-checker's surfaced set (`BUILT_IN_TYPES`); a few identifiers here (notably the 64-bit
> integers) are **gated behind their language switch** and are registry-reserved rather than currently writable.
> Verify against `BUILT_IN_TYPES` for the surfaced subset. Developer-defined types are assigned IDs ≥ 1000 by the
> symbol resolver.

---

## A. How the type vocabulary works (the shared slots)

- **What (in general)** — a flow's parameters and returns are **typed**, and the type drives governance: it is the
  input to the value-state lattice (a `SecureString` param is a `Secret`; a `Tainted<T>` propagates), to the
  hardening auto-derivation (a `Secret` type derives the `no_swap`/`binary` floor), and to numeric lowering.
- **Where — authored** — in the flow signature and in `record`/`enum` declarations. A **qualifier** may prefix a
  type (`protected Email`, `redacted String`, `unsafe let raw`).
- **Where — enforced** — `type-registry.ts` (`resolveTypeId`, which strips qualifiers and generic args) + the type
  checker (`BUILT_IN_TYPES`) + the value-state checker.
- **How — the set extends upward, never downward** — the built-in set is closed; the developer adds **nominal /
  record / ADT / Hallmark / value-unit** types on top. You cannot remove or redefine a built-in.
- **If omitted** — an untyped boundary is not governed; typed boundaries are how the checker knows what a value *is*.
  An unrecognised type name resolves to `TypeId.Unknown` (fail-closed — it matches no built-in).
- **Result — guarantee** — the typed boundary is what makes the rest of governance decidable: value-state,
  hardening, redaction, and lowering all key off the resolved type.

## B. The built-in types (by category)

**Logical** — `Bool` (two-valued) and **`Tri`** — the three-valued native type (`+1`/`0`/`−1`), the type-level
expression of the K3 governance trit. `Tri` is the one most 2-valued languages cannot express; it is why "unknown"
can be a first-class, fail-closed value (see [trust-trit.md](trust-trit.md)).

**Integer** — `Int` (the default) plus fixed widths `Int8` · `Int16` · `Int32` · `Int64` · `UInt8` · `UInt16` ·
`UInt32` · `UInt64`. Widths matter for wire formats and overflow behaviour; the **64-bit** types are gated behind
their language switch (registry-reserved). Value-unit types (below) sit on top of the integer core.

**Floating point** — `Float16` · `Float32` · `Float64` · `Double` · `Decimal`. Float is **discouraged** for value
carrying — value-unit / financial types carry **no float bridge** (a currency is never a `Float`), so money and
quantity use `Decimal` / value-unit types, not binary floats.

**Text** — `String` · `Char` · **`SecureString`** (the `Secret` value-state — approved operations only, never
logged/compared/serialised; see [value-states.md](value-states.md)).

**Binary** — `Byte` · `Bytes` (raw octet payloads).

**Temporal** — `Timestamp` · `Duration` · `Date` · `Time` · `DateTime`. Distinct types so a duration is never
confused with an instant (and to keep the non-deterministic `clock.read` effect explicit).

**JSON** — `Json` (a structured document value).

**Collections (generic)** — `Array<T>` · `List<T>` · `Set<T>` · `Map<K,V>` · `Option<T>` (`Some`/`None`) ·
`Result<T,E>` (`Ok`/`Err`). `Option`/`Result` are the governed alternatives to null and to thrown errors — absence
and failure are values you must handle, not surprises.

**Compute / AI** — `Tensor<T,[dims]>` · `AnyTensor` · `Vector` · `Matrix`. The shaped numeric types the
`compute.*` lanes operate on; a `pure` flow over these is a `PureComputeCandidate` (see [effects.md](effects.md)).

**Security** — `Hash` · `Signature` · `Secret`. First-class types for cryptographic material, so a signature or a
secret is never "just a string" — they carry their own handling rules.

**HTTP / API** — `Request` · `Response` · `Context`. The boundary types for API flows; a `Request` is an untrusted
boundary source (its fields start `Unsafe`).

**Domain / financial** — `Money`. A value-unit type with typed arithmetic and no float bridge — the anchor of the
Hallmark financial story (fixed-point, MarketTime).

**Branded** — `Brand` — the nominal-typing primitive: a `Brand` over `String` makes `UserId` and `OrderId`
non-interchangeable even though both are strings.

**AI types** — `Prompt` · `Embedding` · `Classification` · `ModelOutput`. Typed so an embedding of PII is classified
as sensitively as its source, and a model output carries its inputs' sensitivity.

**Governance** — `AuditRecord` · `AuditProof` · `ExecutionPlan` · `RuntimeReport`. The types the tower-citizen
runtime produces; they let governance artifacts be values a flow can reason about.

**Unit / sentinel** — `Void` · `Unit` (no meaningful value) and `Unknown` (the fail-closed sentinel an unresolved
type name maps to).

## C. Qualifiers (the sensitivity prefix)

The **single source of truth** is `TYPE_QUALIFIERS`: `protected` · `redacted` · `unsafe` · `safe` · `secret`. A
qualifier prefixes a type (`protected Email`) and sets the value-state; `resolveTypeId` strips it to find the base
type. This list is machine-extracted by the `.gate` tooling — never duplicate it in a regex. The qualifiers are
documented from the value's side in [value-states.md](value-states.md).

## D. Developer-defined types (extend upward)

| Kind | What it is |
|---|---|
| `record { … }` | a struct — named, typed fields |
| `enum` / variant ADT | a closed set of variants (exhaustively matched) |
| `Brand` nominal | a distinct type over a base (e.g. `UserId` over `String`) — no accidental interchange |
| **Hallmark** open types | developer-minted nominal types with **mandatory assay gates** (RD-0353) — an open type that still cannot skip its checks |
| **value-unit** types | currency / quantity types (RD-0349) with typed arithmetic and **no float bridge** |

Each extends the vocabulary **upward** (adds a type) and is assigned an ID ≥ 1000; none can weaken or remove a
built-in.

---

*Provenance: `type-registry.ts` (`TypeId`, `TYPE_NAME_TO_ID`, `TYPE_QUALIFIERS`, `resolveTypeId`); RD-0353
(Hallmark), RD-0349 (value-unit). The surfaced/checked subset is `BUILT_IN_TYPES`. Verified against source
2026-07-15.*
