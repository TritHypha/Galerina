# The `.fungi` Language — Learning Library

A reference for learning **Galerina** (the `.fungi` source language) from scratch. It is
written for a developer or an AI that needs to produce code the compiler will actually
accept.

> **Ground rule of this library: the parser is the source of truth.**
> Every construct on these pages is grounded in a real source — the parser
> (`packages-galerina/galerina-core-compiler/src/parser.ts`), the lexer keyword table
> (`packages-galerina/galerina-core-compiler/src/lexer.ts`), a passing example under
> `examples/`, the self-hosted compiler (`.../src/self-hosted/*.fungi`), or a Knowledge-Base
> spec. Where the older docs disagree with the parser, the parser wins and we say so.
> If you can't cite it, don't write it. **Verify by running the compiler**, not by trusting a doc.

---

## What Galerina is (in one paragraph)

Galerina is a **governance-first** language. A unit of code (a *flow*) does not just compute —
it **declares** what it is allowed to do (effects), what it promises (a `contract`), how sensitive
data is handled (taint / privacy qualifiers), and which callers may reach it (gates, guards,
capabilities). The compiler enforces those declarations *before* the code runs, and the semantics
are **fail-closed**: if something is not explicitly permitted, it is denied. There are no
"beats-silicon"/O(1) magic claims here — the value is that the safety properties are checked at
compile time and recorded in a signed manifest.

A minimal, real flow (from `examples/foundations/validation-utils.fungi`):

```fungi
pure flow validateAge(age: Int) -> Bool
contract {
  intent "Check age is within acceptable range"
  effects {}
  invariant {
    ensure age >= 0
    ensure age <= 150
  }
}
{
  trap age < 0 : ERR_NEGATIVE_AGE
  trap age > 150 : ERR_UNREALISTIC_AGE
  return true
}
```

Read that top to bottom and you already see the shape of the language: a **qualifier** (`pure`),
the keyword `flow`, a signature with a `->` return type, an anonymous `contract { ... }` block that
declares intent/effects/invariants, and then a `{ body }` where `trap` clauses reject bad input
before anything else happens.

---

## Read this first: two dialects, one parser (KNOWN DRIFT)

The docs in this repository were written across several design phases, and **two syntactic styles
appear in the older material**. You will meet both, so learn to tell them apart:

| | **App-framework style** (used by the passing examples) | **Core style** (a design sketch) |
|---|---|---|
| Where it lives | `docs/AI/CANONICAL_SYNTAX.md`, and **every `.fungi` file under `examples/`** | KB `core-syntax-keywords.md` |
| Flow header | `secure\|guarded\|pure flow name(readonly request: T) -> R` then `contract { ... }` | `flow name(x: T) -> R uses cap.name { ... }` |
| Effects | `contract { effects { database.write } }` | `uses vault.payments.write` |
| Loops | `for` / `while` | `each` |
| Errors | `Result<T,E>` + `?` + `match` | `attempt ... else error`, `none` |
| Lambdas | not supported (named `fn`) | `item -> item.price` |

**Which one is real?** Check each keyword against the lexer's `V1_ACTIVE_KEYWORDS`
(`lexer.ts:131`). The verdict:

* The **app-framework style is the implemented one.** `secure`/`guarded`/`pure flow` + `contract {}`
  are exactly what the parser parses and what all ~52 example files use.
* The **`uses cap.name`** form *is also parsed* (`parser.ts:4722`) — it is a real, if less common,
  way to declare a capability on a flow. So `uses` is not fictional.
* But `each`, `attempt`, `none`, `task`, `wait`, `run worker`, and lambda arrows (`x -> expr`,
  `x => expr`) are **NOT keywords** and are **not in the parser**. They are aspirational. The real
  loop keywords are `for` and `while`; the real error type is `Result`; multi-way branching is
  `match`. See `03-effects-and-capabilities.md` and `07-control-flow.md` for the reconciliation, and
  `docs/AI/DO_NOT_USE_YET.md` for the canonical "don't use" list.

There is also drift *within* the app-framework docs themselves — e.g. `CANONICAL_SYNTAX.md` shows a
**named** `contract Name { version: ... }` block, but every real example uses an **anonymous**
`contract { ... }` block placed *after* the signature, with **no** `version:`/`description:` lines.
Again: the examples + parser win. See `02-contracts.md`.

---

## Guided learning path

Work through the pages in order. Each page explains a construct, shows **correct** syntax,
shows the **common mistake(s)**, and points at a **real example file** you can open.

1. **[Mental model & your first flow](01-flows-and-functions.md)** — `flow`, the three qualifiers
   `secure`/`guarded`/`pure`, `fn` helpers, `governed <floor> flow`, `route`, signatures, `uses`,
   the flow-comment rule. *Start here.* Companion: the **[parameter reference](parameters.md)**
   (`readonly`/`tainted`, type options, governed-type params).
2. **[Contracts](02-contracts.md)** — the anonymous `contract { ... }` block, its real sub-clauses
   (`intent`, `effects`, `events`, `audit`, `privacy`, `invariant`, `limits`, `types`, `request`,
   `response`, ...), and what each one is for. Resolves the named-vs-anonymous drift.
3. **[Effects & capabilities](03-effects-and-capabilities.md)** — the **real** effect vocabulary
   (verified against `effect-checker.ts`, *not* copied from the doc table), `effects {}`, `uses`,
   deny-by-default, `access { grant ... }`.
4. **[Types & values](04-types-and-values.md)** — `type`/`record`/`enum`, `Result`/`Option`/`Array`/
   `Map`, `Brand<String,"X">`, `Money`, `Decimal`, primitives, literals, and which fancy generics are
   real vs aspirational.
5. **[Bindings, taint & privacy](05-bindings-taint-privacy.md)** — `let`, `mut`, `unsafe let`,
   `readonly`, the `protected`/`redacted` value-state qualifiers, taint propagation, the validate/
   `?` untaint boundary, `redact()`, and the `privacy {}` clause.
6. **[Governance constructs](06-governance-constructs.md)** — `guard` domain ceilings,
   `gate(cond) {}` admission, `access {}`, `[conforms_to: G]` differential proof, `trap`,
   `bitfield`, `static`, `step`, `import plugin safe/assimilate`, and how the ALLOW/HOLD/DENY
   verdict model relates to source.
7. **[Control flow](07-control-flow.md)** — `if`/`else` (no `else if`!), `match` with patterns,
   `while`, `for`, `and`/`or`/`unless`/`is`, `?`, `return`, `emit`.
8. **[Worked examples](08-worked-examples.md)** — three real files read end-to-end (a healthcare
   read flow, a governance gate/guard file, and a piece of the self-hosted lexer), annotated line by
   line, plus a tour of the corpus.
9. **[Data-oblivious secrets](09-data-oblivious-secrets.md)** — constant-time compares and no
   secret-dependent branches (the timing / Spectre class): how to write it, and the `audit-oblivious`
   detector that flags violations. (RD-0258.)

---

## The non-negotiable honesty posture (owner rules)

These are not style preferences — they are how Galerina code is expected to be written:

* **Fail-closed.** The absence of a grant is a denial. You never write `deny` in an
  `access {}` block; you simply omit — everything not granted is refused.
* **No performance mythology.** Do not claim O(1)-beats-hardware or "faster than silicon."
  Galerina's selling point is *checked governance*, not magic speed. When a doc compares
  performance it also states the slowdown honestly.
* **Every flow gets a flow-comment.** A short comment (a `//` line or a `;;` govComment) saying what
  the flow does and why it is safe. See the comment rules in `01-flows-and-functions.md`.
* **Contracts declare intent + clauses.** Every governed flow has `contract { intent { ... } ... }`.
  A `secure`/`guarded` flow without `intent` is an error (`FUNGI-GOV-010`).
* **No AI-slop filler.** Names are full words (`request`, never `req`). Comments explain reasoning,
  not the obvious.

---

## The five-minute cheat sheet

| You want to... | Write... | Page |
|---|---|---|
| A pure computation | `pure flow f(x: Int) -> Int contract { intent "..." effects {} } { ... }` | 01 |
| A DB read | `guarded flow ... contract { effects { database.read } }` | 01, 03 |
| A write + audit | `secure flow ... contract { effects { database.write audit.write } }` | 01, 03 |
| Declare a result type | `type FooResult = Result<Foo, FooError>` (top level) | 04 |
| A record | `type T = record { a: String  b: Int }` or `record T { ... }` | 04 |
| An enum | `type E = enum { A B C }` | 04 |
| Bind validated input | `let x = validate.foo(raw)?` | 05 |
| Bind raw input | `unsafe let raw = request.body` | 05 |
| Protect a field | `let id: protected PatientId = ...` then `redact(id)` before audit | 05 |
| Reject bad input | `trap cond : ERR_CODE` | 06, 07 |
| Multi-way branch | `match x { A => ... _ => ... }` (never `else if`) | 07 |
| Loop | `for item in items { ... }` / `while cond { ... }` | 07 |
| Emit an event | `emit EventName { field: value }` (inside a body) | 07 |
| A capability ceiling | `guard G { permitted_effects { ... } }` | 06 |
| Admission gate | `gate(G) { <flows> }` | 06 |
| Prove ⊆ ceiling | `contract [conforms_to: G] { ... }` | 06 |

---

## How to verify anything here yourself

Don't trust — run. The repo ships a CLI (`galerina.mjs`) and a compiler. To check that a snippet
parses/passes, put it in a `.fungi` file and run the compiler over it (see `SETUP.md` and
`docs/LEARNING_MODE.md` for the exact commands in your checkout). If a snippet on these pages ever
disagrees with the compiler, **the compiler is right** — please fix the doc.

*Companion docs:* `docs/AI/CANONICAL_SYNTAX.md`, `docs/AI/GALERINA_5_MINUTE_PRIMER.md`,
`docs/AI/DO_NOT_USE_YET.md`, `docs/AI/COMMON_FIXES.md`, and the KB set under
`ZTF-Knowledge-Bases/` (`core-syntax-keywords.md`, `galerina-contract-clause-reference.md`,
`formal-type-system-spec.md`, ...).
