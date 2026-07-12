# Galerina `.fungi` — syntax reference

One table per construct family. Every **Example** links a curriculum example that is verified `galerina check`-clean — enforced by `scripts/audit-syntax-reference-links.mjs`, which extracts every example link in this file and re-checks it (a broken/failing link is a RED gate). This doc is only trustworthy because its links are machine-verified.

> Convention: `Construct | meaning | Example | Ref`. Examples are positive (clean) demonstrations. For rejected forms, see the negative twins in the same curriculum level and the diagnostics catalog.

## Flows

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `pure flow f() -> T` | no effects, no governance obligations | [001-pure-flow](../../examples/Level-1-Basics/001-pure-flow/example.fungi) | AGENTS.md grammar |
| `guarded flow f() -> T` | may hold effects; lighter tier | [002-guarded-flow](../../examples/Level-1-Basics/002-guarded-flow/example.fungi) | — |
| `secure flow f() -> T` | secure-tier: intent justification, epilogue proof, secret-egress sealing (required for secret/network/audit effects) | [003-secure-flow](../../examples/Level-1-Basics/003-secure-flow/example.fungi) | `FUNGI-TIER-001` |
| `fn helper(...) -> T` | local (in-flow) helper; cannot declare its own effects | [004-local-fn-helper](../../examples/Level-1-Basics/004-local-fn-helper/example.fungi) | `FUNGI-EFFECT-*` |

## Bindings

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `let x = …` | immutable binding | [005-let-binding](../../examples/Level-1-Basics/005-let-binding/example.fungi) | — |
| `mut x: T = …` | mutable binding (not `let mut`) | [006-mut-binding](../../examples/Level-1-Basics/006-mut-binding/example.fungi) | — |
| `readonly` param | caller-owned, not reassignable | [007-readonly-parameter](../../examples/Level-1-Basics/007-readonly-parameter/example.fungi) | — |
| `readonly` local | frozen local view | [008-readonly-local-binding](../../examples/Level-1-Basics/008-readonly-local-binding/example.fungi) | — |
| `unsafe let x = boundary` | untrusted boundary input — "unknown until proven" | [009-unsafe-let-boundary](../../examples/Level-1-Basics/009-unsafe-let-boundary/example.fungi) | `FUNGI-VALUESTATE-003` |
| `static NAME = …` | module constant (NOT `const` — that is lexer drift) | [05-bindings-taint-privacy.md](05-bindings-taint-privacy.md) | — |
| No top-level `let` | bindings live inside a flow (a top-level `let` is rejected) | — | `FUNGI-SYNTAX-006` |

## Contract blocks

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `contract { intent {…} }` | one-sentence purpose (mandatory) | [021-flow-contract-basic](../../examples/Level-1-Basics/021-flow-contract-basic/example.fungi) | — |
| `effects { … }` | declared effect whitelist | [113-secure-flow-with-effects](../../examples/Level-3-Effects/113-secure-flow-with-effects/example.fungi) | `FUNGI-EFFECT-*` |
| `privacy { deny protected T to response.body }` | privacy rules | [getPatient](../../../examples/healthcare/getPatient.fungi) | `FUNGI-PRIVACY-*`, `FUNGI-GOV-003` |
| `request { context { require actor } }` | required boundary context | [getPatient](../../../examples/healthcare/getPatient.fungi) | — |
| `audit { require runtime report }` | audit obligations | [getPatient](../../../examples/healthcare/getPatient.fungi) | — |
| `types { Name {…} }` | contract-local type decls | [178-governed-data-query](../../examples/Level-4-Security/178-governed-data-query/example.fungi) uses top-level; see below | `FUNGI-TYPE-001` |

## Effects

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `effects { }` (empty) | pure, no effects | [101-pure-no-effects](../../examples/Level-3-Effects/101-pure-no-effects/example.fungi) | — |
| `effects { database.write }` | one declared effect | [102-guarded-database-write](../../examples/Level-3-Effects/102-guarded-database-write/example.fungi) | — |
| `effects { database.read phi.read audit.write }` | multiple; secure tier | [113-secure-flow-with-effects](../../examples/Level-3-Effects/113-secure-flow-with-effects/example.fungi) | — |
| `effects { database.write network.outbound audit.write }` | multiple effects **+ a network egress** — a `protected` value must be redacted before the outbound sink | [104-multiple-effects](../../examples/Level-3-Effects/104-multiple-effects/example.fungi) | `FUNGI-VALUESTATE-006` |
| Canonical effect names | the single-source set | — | `effect-checker.ts` `CANONICAL_EFFECTS`; `FUNGI-EFFECT-004/005` |

## Types

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `Int` · `Decimal` · `String` · `Bool` · `Byte` · `Char` | primitives | [051-int-basic](../../examples/Level-2-Types/051-int-basic/example.fungi), [053-string-basic](../../examples/Level-2-Types/053-string-basic/example.fungi) | — |
| `type X = Brand<String, Tag>` | domain-branded newtype (inline one-off) | [017-domain-brand-type](../../examples/Level-1-Basics/017-domain-brand-type/example.fungi), [057-email-type](../../examples/Level-2-Types/057-email-type/example.fungi) | `FUNGI-TYPE-001` |
| `hallmark X of T { gate: flow f }` | developer-minted nominal type — a *declared* brand, constructed **only** through its mandatory assay gate; schema `ops {}` is deny-by-default | [094-hallmark-declaration](../../examples/Level-2-Types/094-hallmark-declaration/example.fungi) | `FUNGI-HALLMARK-001..005`, `FUNGI-TYPE-003` |
| `type X = Y` | type alias | [016-type-alias](../../examples/Level-1-Basics/016-type-alias/example.fungi) | — |
| `record X { field: T, … }` | record **declaration** (NOT `type X = record {…}` — fails strict, see F2) | [015-record-basic](../../examples/Level-1-Basics/015-record-basic/example.fungi) | `FUNGI-TYPE-001` |
| `enum X { A B }` | enum **declaration** (NOT `type X = enum {…}`) | [014-enum-basic](../../examples/Level-1-Basics/014-enum-basic/example.fungi) | `FUNGI-TYPE-001` |
| `Result<T, E>` | success-or-error value | [010-result-return](../../examples/Level-1-Basics/010-result-return/example.fungi), [066-result-success](../../examples/Level-2-Types/066-result-success/example.fungi) | — |
| `Option<T>` | present-or-absent | [011-option-return](../../examples/Level-1-Basics/011-option-return/example.fungi), [063-option-some](../../examples/Level-2-Types/063-option-some/example.fungi) | — |
| `Money<GBP>` | currency-typed money (cross-currency ops rejected) | [071-money-gbp](../../examples/Level-2-Types/071-money-gbp/example.fungi) | `FUNGI-TYPE-009` |
| `Tensor<…>` | typed tensor | [079-tensor-basic](../../examples/Level-2-Types/079-tensor-basic/example.fungi) | — |
| `Array` / range | array + range | [088-array-range](../../examples/Level-2-Types/088-array-range/example.fungi) | — |
| `Auto` | inferred type | [069-auto-inference](../../examples/Level-2-Types/069-auto-inference/example.fungi) | `FUNGI-TYPE-023/024` |

## Value-state & untaint

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `protected T` | sensitive value label | [018-protected-type-label](../../examples/Level-1-Basics/018-protected-type-label/example.fungi) | `FUNGI-VALUESTATE-006` |
| `redacted T` | masked value, safe for sinks | [019-redacted-type-label](../../examples/Level-1-Basics/019-redacted-type-label/example.fungi) | — |
| `validate.*(raw)?` | untaint boundary input (prove or `Err`) | [154-validate-email](../../examples/Level-4-Security/154-validate-email/example.fungi) | `FUNGI-VALUESTATE-003` |
| `redact(x)` → bind to `let` before a sink | strip PII **and** gate the boundary | [161-safe-audit-log](../../examples/Level-4-Security/161-safe-audit-log/example.fungi), [168-redacted-network-send](../../examples/Level-4-Security/168-redacted-network-send/example.fungi) | `FUNGI-VALUESTATE-006/008` |
| Validate-before-DB (query) | prove filters before `database.read` | [178-governed-data-query](../../examples/Level-4-Security/178-governed-data-query/example.fungi) | `FUNGI-VALUESTATE-003/008` |

## Control flow

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| `match r { Ok(v) => … Err(e) => … }` | exhaustive match on `Result` | [012-match-result](../../examples/Level-1-Basics/012-match-result/example.fungi) | `FUNGI-MATCH-001` |
| `match o { Some(v) => … None => … }` | exhaustive match on `Option` | [013-match-option](../../examples/Level-1-Basics/013-match-option/example.fungi) | `FUNGI-MATCH-001` |
| `_ => deny` / `_ => trap` | **fail-closed** default arm (never `_ => proceed`) | [DO-DONT-TERNARY.md](DO-DONT-TERNARY.md) | `FUNGI-MATCH-001`; RD-0341 |
| `?` (error propagation) | short-circuit `Err`/`None` | [010-result-return](../../examples/Level-1-Basics/010-result-return/example.fungi) | — |

## `.gate` (light-ASCII authoring)

| Construct | Meaning | Example | Ref |
|---|---|---|---|
| the frozen 8 glyphs `-> [] ✓ × ? ! + -` | control marks | [gate/01-authorized-read](../../examples/gate/01-authorized-read.gate) | SPEC §1.1 |
| `[name:cut(<field>) fu op]` | privacy cut that **declares** its field (RD-0340) | [gate/03-phi-redaction](../../examples/gate/03-phi-redaction.gate) | RD-0340; `@version 1.2.0` |
| `PRIVACY deny <class> <field> -> <sink>` | privacy rule bound to a dominating `cut(<field>)` | [gate/03-phi-redaction](../../examples/gate/03-phi-redaction.gate) | RULES.md R8 |

## Diagnostics

The `FUNGI-CATEGORY-NNN` series: [`compiler-diagnostics.md`](../../../../ZTF-Knowledge-Bases/compiler-diagnostics.md) (spec catalog) and `build/code-registry/REGISTRY.md` (live, generated). Key series: `TYPE` · `VALUESTATE` · `MATCH` · `EFFECT` · `PRIVACY` · `GOV` · `TIER` · `SAFETY` · `PARSE` · `NAME`.
