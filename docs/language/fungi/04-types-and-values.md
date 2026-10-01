# 04 — Types & Values

> Grounded in: `parser.ts:5326-5352` (`type` alias / legacy-body refusal), `parser.ts:5353-5391`
> (`record`), `parser.ts:5394-5426` (`enum`), `parser.ts:1134-1140` (`protected`/`redacted`
> qualifier on a type), type IDs in `type-registry.ts:22-99`, generics/arity + `Some/None/Ok/Err`
> in KB `formal-type-system-spec.md`. Real examples: `examples/healthcare/getPatient.fungi`,
> `examples/auth-service/createSession.fungi`, `.../self-hosted/lexer.fungi`.

## Primitive types

These are the built-in primitives. The authoritative acceptance set is the **`isBuiltInType()` union gate** in
`type-checker.ts` (`TypeId` ∪ `BUILT_IN_TYPES` ∪ `KNOWN_DOMAIN_TYPES`), not any single table — the bare primitives
below live in the `TypeId` fast path, but the full writable vocabulary (incl. `Verdict`, the currency/error/domain
families) is the union. See [reference/types.md](../../reference/types.md).

| Type | Notes |
|---|---|
| `Bool` | `true` / `false` |
| `Int` | platform integer, at least 64-bit; sized variants exist: `Int8/16/32/64`, `UInt8/16/32/64` |
| `Float` | approximate maths; sized variants `Float16/32/64` |
| `Decimal` | **use for money and precise values** (never `Float` for currency) |
| `String` | UTF-8 text |
| `Char` | a single character |
| `Timestamp`, `Duration` | time values |
| `SecureString` | a string derived from a secret — the taint checker guards it (see [05](05-bindings-taint-privacy.md)) |
| `None` | the absent value (the `None` case of `Option`) |

```fungi
let message: String = "hello"
let count: Int = 42
let price: Decimal = 19.99
```

> Rule from the KB: **use `Decimal` for money, `Float` only for approximate maths.** Avoid `Any`.

## Declaring types

### Alias — `type Name = TypeRef`

The most common declaration. It names a type expression, usually your flow's result type.
`parser.ts:5332` captures the right-hand side as a child type reference.

```fungi
type GetPatientResult = Result<PatientSummary, PatientError>   // getPatient.fungi:1
type CreateSessionResult = Result<Session, SessionError>       // createSession.fungi:1
type PatientId = Brand<String, "PatientId">                    // getPatient.fungi:2
```

### Record — one canonical form

A record is a struct with named fields. **Fields are separated by newlines or commas** (both parse;
the parser preserves declaration order and the checker enforces the closed field set):

```fungi
record Token {
  kind: TokenKind
  value: String
  line: Int
  column: Int
}

record Session {
  sessionId: SessionId
  expiresAt: Timestamp
}
```

`type Name { ... }` is rejected with `FUNGI-PARSE-007`; older compilers silently discarded its
fields, so accepting that spelling would make the type name exist without a schema. Use
`type Name = TypeRef` only for an alias. Record values use `Name { field: value }`, not positional
`Name(value)` calls. Capitalization never grants constructor or call authority.

One record declaration or literal may contain at most **64 fields**. The
compiler emits `FUNGI-PARSE-008` on field 65 and does not retain surplus fields
in the authorizing AST. The limit is deliberately separate from the narrower
SLIDE record ABI: the current independently admitted `.slide` profile permits
one schema with one to eight fields.

### Record guarantees — fixed shape and bounded current emission

Two properties hold for every record *by construction* and are worth stating as named guarantees (RD-0286a/g):

- **Fixed shape.** A record's field set is closed at declaration. There is no syntax to add, remove, or
  mutate a field — or to attach a prototype / dynamic key — at runtime: shape mutation is **unrepresentable,
  not merely forbidden** (the same discipline that makes bounded cycles unrepresentable). You can read a
  record declaration and know everything the value is — no hidden state, no shape mutation, no hidden-class
  transition — so field access is a static offset, never a key lookup.
- **Current measured emission.** The Stage-A checker and WAT path preserve declaration-order field layout;
  reordered source literals execute with the same field offsets. The bounded independent SLIDE ABI now carries
  a versioned nominal descriptor with one to eight ordered fields through GIR and `.slide`, revalidates it in
  VOK and binds the values into a field-level Safe Value receipt. That evidence is intentionally narrow: general,
  nested or recursive records, multiple schemas and effectful/mutable records are not admitted by this profile.
  Do not generalise the bounded result into a claim that every record value has one end-to-end canonical byte
  form across Galerina and SLIDE.

> **`sealed` surface — owner-gated.** Because there is no *unsealed* record semantics to opt into, a record
> is already fixed-shape ("sealed") by nature; this section states the guarantee, it adds no grammar.
> Whether to surface an explicit `sealed` keyword vs. leave the guarantee implicit-by-default is an **owner
> decision** (RD-0266 §8.3 / RD-0286a) — deferred, not assumed. The `.gate` v0.4 accept set stays closed;
> any new keyword lands only as a v0.5 proposal.

### Enum — `enum Name { A B C }`

Variants are **space/newline-separated** (commas optional); `parser.ts:5394-5426`.

```fungi
// Top-level enum (self-hosted/lexer.fungi:23-37)
enum TokenKind {
  Identifier
  Keyword
  StringLiteral
  NumberLiteral
}

// Inline enum in an alias (getPatient.fungi:6)
type PatientError = enum { NotFound Unauthorized }

// (createSession.fungi:7)
type SessionError = enum { InvalidToken SessionLimitReached }
```

> **Common mistake:** writing `enum { A, B, C }` and assuming commas are *required*. They are
> optional — the canonical corpus style is whitespace-separated (`NotFound Unauthorized`).

## Generic / wrapper types

The real generic types (with their argument counts, from `type-registry.ts` + the formal spec):

| Type | Arity | Meaning |
|---|---|---|
| `Result<T, E>` | 2 | success `Ok(T)` or failure `Err(E)` |
| `Option<T>` | 1 | present `Some(T)` or absent `None` |
| `Array<T>` | 1 | ordered sequence |
| `Set<T>` | 1 | unordered unique collection |
| `Map<K, V>` | 2 | key-value map |
| `Brand<T, "Name">` | 2 | a plain type given a distinct compile-time identity |
| `Money<Currency>` | 1 | an amount tagged with a currency type |

### `Result` and `Option` — the workhorses

You construct them with `Ok(x)` / `Err(e)` / `Some(x)` / `None`, and you consume them with `match`
or the `?` operator. From `examples/auth-service/createSession.fungi`:

```fungi
type CreateSessionResult = Result<Session, SessionError>

secure flow createSession(readonly request: Request) -> CreateSessionResult
contract { ... }
{
  let session = Session.create(request.body.token)?   // ? unwraps Ok / early-returns Err
  ...
  return Ok(session)
}
```

Matching them (see [07 — Control flow](07-control-flow.md)):

```fungi
match user {
  Some(value) => { return value.name }
  None        => { return "missing" }
  _           => { return "unknown" }
}
```

### `Brand<T, "Name">` — nominal identity for a primitive

`Brand` gives a plain `String` (or `Int`, ...) a distinct domain type so you can't accidentally pass a
raw string where a `PatientId` is required.

```fungi
type PatientId = Brand<String, "PatientId">     // getPatient.fungi:2
type SessionId = Brand<String, "SessionId">     // createSession.fungi:6
```

### `hallmark` — developer-minted open types (RD-0353)

Where `Brand<T, "Name">` is an inline one-off, a **hallmark** is a *declared, gated* nominal type — a
name, a carrier, and a **mandatory assay gate**. The declaration IS the mint (no separate registration),
and a hallmark is constructed **only** through its gate:

```fungi
hallmark CustomerRef of String {
  gate: flow assayCustomerRef                      // the assay — returns Result<CustomerRef, E>, must be able to fail
}

hallmark LoyaltyPoints of Decimal {
  ops:      { add, subtract, scale, compare }      // the CLOSED algebra — deny-by-default
  gate:     flow assayPoints                       // "whole, never negative" is checked HERE, in the gate
}
```

The name is the assay-office metaphor: the compiler is the assay, the gate is the test that must be able
to fail, the name is a *protected mark*. Everything about a hallmark is fail-closed:

| Rule | Enforced by |
|---|---|
| minted **only** through its gate (no raw assignment) | `FUNGI-TYPE-003` (a hallmark is a declared brand) |
| distinct hallmarks / hallmark vs `Money` never unify | `FUNGI-TYPE-004` |
| an undeclared name can't be *used* (no use-equals-create) | `FUNGI-TYPE-001` (+ did-you-mean) |
| a reserved name (built-in, currency tag, `Verdict`/`Trusted`/…) can't be *minted* | `FUNGI-HALLMARK-001` |
| non-ASCII / mixed-script name (homoglyph) | lexer `FUNGI-PARSE-001` (+ `FUNGI-HALLMARK-002` backstop) |
| a hallmark with no gate is just an alias | `FUNGI-HALLMARK-003` |
| `ops {}` may only draw from `{ add, subtract, scale, ratio, compare }` — never an effect | `FUNGI-HALLMARK-004` |
| an undeclared op (`points / points` when `ratio` isn't declared) | `FUNGI-HALLMARK-005` |
| **minting is not sanitizing** — a gate does not untaint | `FUNGI-VALUESTATE-004` / `-001` |
| a schema field nothing enforces (`decimals:` / `sign:`) is refused, not silently ignored — check it in the gate | `FUNGI-HALLMARK-006` (pending KB registration) |

Worked examples: `docs/examples/Level-2-Types/094-hallmark-declaration` (the mint) and `095`–`098` (ops
deny-by-default · reserved names · construction-only · taint-transparency). Cross-package schema
hash-pinning (so package B can't redeclare A's name with a looser schema) is owner-gated — until then a
hallmark type is package-local.

### `Money<Currency>` and `Decimal`

`Money<Currency>` tags an amount with a currency (`Money<GBP>`). For plain precise numbers use
`Decimal`. Note that *currency-literal* forms like `GBP0.00` are **not** general expression syntax —
see "Literals" below.

**Money arithmetic is exact** (RD-0349 I3). `add` / `subtract` / `multiply` / `divideBy` compute on the
one canonical BigInt decimal core — the decimal string goes straight in, with **no `parseFloat`, no
`toFixed`, no `1/x` float reciprocal** — and division fails closed on a zero divisor (`DivisionByZero`).
Cross-currency `Money<A> + Money<B>` is a compile error (`FUNGI-TYPE-004`; convert first with
`fx.convert`), and `Money<C> * Money<C>` is dimensionally rejected.

**Rounding is always explicit** (R5/R11, 2026-09-30 — zero-trust defaults, owner may revisit):

- A Money amount is admitted only at **at most** its currency's ISO-4217 minor units (GBP 2, JPY 0,
  BHD 3) and is stored at exactly that scale: `Money.gbp("0.125")` and `Money.jpy("100.5")` are refused
  (`MoneyScaleExceedsMinorUnits`), never rounded. A Float amount is refused (`InexactOperandRefused`).
- Anything that has to round names its mode — a string literal from
  `halfEven | halfUp | halfDown | up | down | ceiling | floor`; there is **no default mode**:
  `m.multiply(rate, "halfEven")`, `m.divideBy(n, "halfUp")`, `a.divideBy(b, scale, mode)` (a Decimal
  ratio), `d.divide(e, scale, mode)`, `d.round(places, mode)`, `d.toFixed(places, mode)`.
  `d.floor(places)` / `d.ceil(places)` carry their direction as the mode.
- The bare operators `Money * x`, `Money / x` and `Money % x` are compile errors that name the method form
  (`FUNGI-NUMERIC-OP-002`); `Money + 1` is `FUNGI-TYPE-004`. `Decimal / Decimal` and `Decimal % Decimal`
  redirect to `divide` / `remainder` (`FUNGI-NUMERIC-OP-001`).
- Decimal never mixes with Int or Float under an operator (`FUNGI-NUMERIC-OP-003`): convert an Int
  explicitly with `Decimal.fromInt(n)`; a Float has no exact conversion.
- `a.remainder(b)` is exact and **truncated**: the result takes the sign of the dividend
  (`Decimal("-10").remainder(Decimal("3"))` is `-1`; `Decimal("10").remainder(Decimal("-3"))` is `1`).

## Value-state qualifiers on a type

`protected` and `redacted` (and `tainted`, `secret`) are **governance qualifiers** that prefix a base
type; they are not types themselves. The parser preserves the qualifier as part of the type
annotation (`parser.ts:1134-1140`), and the taint/value-state checker enforces it.

```fungi
type PatientSummary = record { patientId: redacted String, ... }   // field is redacted
let patientId: protected PatientId = validate.patientId(...)?      // binding is protected
```

There is **also** a generic-wrapper spelling that appears in one example —
`Protected<MedicalNote>` (`examples/healthcare/classifyPrivateMedicalNote.fungi:14`):

```fungi
secure flow classifyPrivateMedicalNote(readonly note: Protected<MedicalNote>) -> ...
```

So both `protected T` (qualifier) and `Protected<T>` (wrapper) occur in real code. Full semantics in
[05 — Bindings, taint & privacy](05-bindings-taint-privacy.md).

## Governed memory-residency hardening (RD-0358, PROTOTYPE)

A value's **maximum memory-residency tier** is a governed, fail-closed property — **auto-derived** from
what the type system already knows, invisible for the common case. A `Secret`/`SecureString`/`Tainted`
value, or a flow with the `secret.read` effect, is **automatically** hardened with the strictest floor,
with **zero annotation**:

```fungi
secure flow useApiKey(k: SecureString) -> Bool
contract { intent { "…" } privacy { contains PII } }
{ return true }
// the compiler injects — the developer writes NOTHING:
//   hardening { residency no_swap  erase on_exit  timing constant  substrate binary }
```

* `residency: no_swap` — never spills to swap/disk. A ceiling, deny-by-default (strictest→loosest:
  `register_only` < `no_dram_spill` < `no_swap` < `no_disk`).
* `erase: on_exit` — zeroized when it leaves scope (the existing `flowHandlesSecrets` zeroize rail).
* `timing: constant` — no secret-dependent branch/index (the cache-side-channel obligation).
* `substrate: binary` — a secret never routes to the analog photonic path.

This is **auto-SECURE, never auto-convenient** — the optimizer may not relax it. An explicit `hardening {}`
block is written **only** at the exceptions: to *tighten* a non-secret, or to *audibly loosen* a derived
default (a visible, deny-by-default act — add `audited_loosen`, and governance may still refuse). A ceiling
the declared `host` seam cannot honour is **REJECTED, never silently spilled**:

| Rule | Diagnostic |
|---|---|
| unknown `residency` / `erase` / `timing` value | `FUNGI-HARDEN-001` / `-002` / `-003` |
| a secret default loosened without `audited_loosen` | `FUNGI-HARDEN-004` |
| a residency ceiling the declared host can't honour → REJECT | `FUNGI-HARDEN-005` |
| a secret-dependent branch under `timing constant` (checkable subset) | `FUNGI-HARDEN-006` |
| a proven spill re-types the value `Refuted` (contagious, denies at a trust boundary) | `FUNGI-HARDEN-007` |

Inspect exactly what the compiler injects (auditable, not authored): `node
scripts/hardening-show-derived.mjs <file>`. Worked examples:
`docs/examples/Level-4-Security/179-hardening-secret-auto` (auto), `180-hardening-spill-rejected`
(the fail-closed REJECT), `181-hardening-unlabelled-limit` (the honest HV8 limit).

**PROTOTYPE status + honest limits (do not over-read).** The derivation + explicit-block enforcement are
implemented and checker-verified, but this is a **checker-verified shadow** — the actual placement /
`mlock` / zeroize *execution* is host + execution-switch (#143) territory, exactly like the Stage-6
twins. The RD-0337 "governed downgrade that re-types a spilled value `Refuted`" is now **wired for real**
(RD-0360 Option A): a proven spill re-types the value `Refuted` (`FUNGI-HARDEN-007`, sticky + contagious,
so it denies at a trust boundary), via a compiler-side epistemic trit held equivalent to the runtime
RD-0337 trit by a mandatory conformance gate. `timing: constant` (H-4) is **honestly partial** —
constant-time is undecidable in general, so `FUNGI-HARDEN-006` flags the common case only and does **not**
prove constant-time. HV8: auto-hardening covers only *labelled* values — an unlabelled secret is
unhardened (example 181). `memory.spill` as an effect (H-6) is now **registered deny-only** (RD-0360 Q2):
declaring it is `FUNGI-EFFECT-006` (never grantable), closing the *explicit*-spill door that
`FUNGI-HARDEN-005/007` already closes on the *implicit* side — see
[03 — Effects](03-effects-and-capabilities.md). A grantable "audited paged-optimizer" spill remains a
distinct future effect (RD-0356 B5), never this name.

**Strip-list (binding).** *Photonic* = a classical analog matrix accelerator (the dataflow half only,
never secrets); *tri/K3* = a classical governor, not a qubit; there is **no "unhackable"** — this shrinks
and governs a memory-attack surface, it never zeroes it.

## Which "fancy" types are real vs aspirational

Be careful here — several types are described in the KB/canonical docs but do **not** appear in the
passing example corpus and have no parser/type-registry backing as first-class generics:

| Type | Status |
|---|---|
| `Result`, `Option`, `Array`, `Set`, `Map`, `Brand`, `Money`, `Decimal`, primitives | **Real** — in `type-registry.ts` and used by examples |
| `Protected<T>` | **Real** (appears in `classifyPrivateMedicalNote.fungi`); `protected T` qualifier is the more common form |
| `SecureString` | **Real** — a TypeId; produced by secret reads |
| `Tainted<T>` | **KB/aspirational** — no parser reference, no passing example. Use the `tainted` param qualifier or `unsafe let` instead (see [05](05-bindings-taint-privacy.md)) |
| `SafeFor<Ctx, T>` | **KB/aspirational** — appears in specs only; not parser-verified |
| `Tensor<Float32, [dims]>`, `Matrix<...>` | **Spec-level** — described in `formal-type-system-spec.md` for the compute/AI story; not used by the general corpus. Treat as advanced/forward-looking |

When in doubt, grep `examples/**/*.fungi` for the type. If it isn't used there, treat it as
aspirational and prefer the qualifier forms that are.

## Literals

| Literal | Example | Notes |
|---|---|---|
| String | `"Hello"`, `"say \"hi\""`, `"emoji \u{1F600}"` | escapes `\n \t \\ \"`, Unicode `\u{...}`/`\uXXXX` |
| Char | `' '`, `'\n'`, `'\''` | single character |
| Int | `42`, `0xFF`, `0b1010`, `0o755`, `1_000_000` | hex/binary/octal, underscores allowed |
| Float | `3.14159`, `1.23e-4` | scientific notation allowed |
| Bool | `true`, `false` | keywords |
| Array | `[1, 2, 3]`, `[]` | comma-separated; persistent/immutable — consume the value returned by `push` or `append` |
| Record/object | `{ event: "X", id: redact(id) }` | `field: value`, comma-separated, trailing comma OK |

### The unit-suffix gotcha (`16MB`, `5mj`, `GBP0.00`)

Unit-suffixed literals appear in the corpus **only inside contract clauses** — e.g.
`max_memory_ceiling: 16MB`, `max_energy_budget 5mj`, `max_token_cost GBP0.00`
(`guard-domain-ceiling.fungi:35`, `classifyPrivateMedicalNote.fungi:57,62`). The **lexer does not
produce a single "16MB" token** — in ordinary expression position that would be a number `16`
followed by an identifier `MB`. Inside contract-clause bodies the clause sub-parser reads the
`number` + `identifier` pair as one budget value.

**Takeaway:** don't write `let size = 16MB` in a flow body and expect it to work. Unit suffixes are a
contract-clause convenience, not a general number literal.

## Module-path calls

Method and module calls may use `.` or `::`; the parser treats them as equivalent path separators.
Existing standard-library examples predominantly use `.`, such as `AuditLog.write(...)` and
`PatientsDB.find(...)`. This syntax does not itself authorize a call: the receiver or imported value
must still be admitted by resolution and governance.

## Named record construction

Named and contextually typed anonymous literals are supported. The checker requires nominal identity
for a named literal, unique fields, the exact declared field set, and assignment-compatible values:

```fungi
let named: PatientSummary = PatientSummary { patientId: id, name: n }
let contextual: PatientSummary = { patientId: id, name: n }
```

`OtherSummary { ... }` cannot be adopted as `PatientSummary` even when its fields happen to match.
Duplicate, missing, surplus, and wrongly typed fields are errors. Emission uses declaration order,
so source-field reordering cannot change record layout.

## Common mistakes (types)

| Mistake | Why wrong | Fix |
|---|---|---|
| `-> Result<Foo, Bar>` in a contract flow signature | contract flows return a named alias | `type FooResult = Result<Foo, Bar>` then `-> FooResult` |
| `enum E { A, B }` assuming commas are required | commas are optional | `enum E { A B }` (whitespace) is canonical |
| `let x: Tainted<Foo> = ...` | `Tainted<T>` isn't parser-backed | use `unsafe let` or a `tainted` param (see [05](05-bindings-taint-privacy.md)) |
| `Decimal` vs `Float` for money | `Float` loses precision | use `Decimal` (or `Money<Currency>`) |
| `TypeName(value)` for a record | records are not positional calls | `TypeName { field: value }` |
| `let x = 16MB` in a body | unit suffixes are contract-clause-only | keep budgets inside contract clauses |
| `result of X else Y` type form | proposal, not in parser | `Result<X, Y>` (`DO_NOT_USE_YET.md` §1) |

## Real files to open

* `examples/auth-service/createSession.fungi` — alias, canonical `record`, `enum`, `Brand`.
* `examples/healthcare/getPatient.fungi` — `record` with a `redacted` field, `enum`, `Brand`, `Result`.
* `packages-ts/galerina-core-compiler/src/self-hosted/lexer.fungi` — top-level `record`/`enum`,
  `Option<Char>`, `Array<String>`, real `match`/`Some`/`None` usage.

Next: **[05 — Bindings, taint & privacy](05-bindings-taint-privacy.md)**.
