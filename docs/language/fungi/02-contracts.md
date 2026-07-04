# 02 — Contracts

> Grounded in: `parser.ts:3952-4200` (`parseContractDecl` + sub-block dispatch),
> `parser.ts:2578` / `parseIntentDecl`, `parser.ts:708-711` (contract attaches after the signature).
> Clause semantics cross-checked against KB `galerina-contract-clause-reference.md`. Real examples:
> `examples/healthcare/getPatient.fungi`, `examples/healthcare/classifyPrivateMedicalNote.fungi`,
> `examples/foundations/validation-utils.fungi`.

## What a contract is

A `contract { }` block is the flow's **compile-time governance declaration**. It states the flow's
`intent`, the `effects` it may perform, the `events` it emits, the `privacy` rules for its data, the
`invariant`s it upholds, and more. The compiler reads these and rejects the flow if the body violates
them. A `secure` or `guarded` flow essentially always has one; a `pure` helper often has a tiny one
(just `intent` + empty `effects`).

## The one structural rule: the contract is anonymous and comes AFTER the signature

This is the single most important correction to make against the older docs.

```fungi
<qualifier> flow name(params) -> ReturnType   // 1. signature
contract { ... }                              // 2. governance declaration  (anonymous!)
{                                             // 3. body
  ...
}
```

The parser consumes the contract as a clause that follows the signature (`parser.ts:708-711`), and it
begins the block by consuming the `contract` keyword and then expecting `{` (optionally preceded by a
`[conforms_to: G]` attribute) — `parser.ts:3952-3990`. There is **no contract name** and **no
`version:`/`description:` header**.

### Correct (what every real example does)

From `examples/healthcare/getPatient.fungi:8-22`:

```fungi
secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  intent { "Retrieve a patient summary for clinical display." }
  request {
    context { require actor require trace_id }
  }
  effects { database.read phi.read audit.write }
  privacy {
    phi name dob
    phi patientId masked_in_audit
    deny protected PatientId to response.body
    require redaction before audit.write
  }
  audit { require runtime report require actor }
}
{ ... }
```

### The drift to ignore

`docs/AI/CANONICAL_SYNTAX.md` §2 shows a **named** block with a version/description header:

```fungi
contract ExampleContract {      // ← named + version header
    version: "1.0"
    description: "..."
    types { ... }
    ...
}
```

**No example file uses this, and the parser attaches the contract to the flow by keyword, not by
name.** Treat the named/`version:` form as documentation drift; write the anonymous block. (If you
must record a version, put it in a `;;` govComment.)

## Clauses are space/newline-separated tokens, not `key: value` JSON

Inside a clause, items are bare tokens separated by whitespace or newlines — **not** comma-and-colon
object syntax. Compare:

```fungi
effects { database.read phi.read audit.write }     // ✅ real
effects: { "database.read", "audit.write" }        // ❌ not the grammar
```

```fungi
intent { "Retrieve a patient summary for clinical display." }   // ✅ string inside braces
intent "Validate payment amount in the Proof Zone"              // ✅ also accepted (bare string)
```

Both `intent { "..." }` and `intent "..."` appear in the corpus and both parse
(`parser.ts:2578` handles the `intent` declaration; the bare-string form appears in
`examples/foundations/comment-styles-example.fungi:30`).

Some clauses use `key value` pairs with an optional colon (e.g. `enforced_limits { max_memory_ceiling:
16MB }`), and some use `require X before Y` phrases (privacy/audit). The parser stores most clause
bodies as generic token lists; the *governance verifier* interprets them. So the exact inner phrasing
follows the examples, not a rigid schema.

## The clauses the parser actually recognises

Every `tok.value` below is dispatched by name in `parseContractDecl` (`parser.ts:3996-4200`). This is
the real, current set:

| Clause | Purpose | Parser line |
|---|---|---|
| `types { }` | local type aliases / records used by this flow | 3997 |
| `intent { "..." }` | one-line plain-prose statement of purpose (**required** on secure/guarded) | 4002 |
| `events { }` | event shapes this flow may `emit` | 4009 |
| `governance { }` | governance metadata block | 4014 |
| `rules { }` | declarative rule list | 4021 |
| `audit { }` | audit obligations (`require runtime report`, level, ...) | 4027 |
| `use SetName` | reference a named contract set | 4032 |
| `targets { }` | execution-placement preferences (`prefer [npu, gpu]  fallback cpu  deny [remote.execution]`) | 4044 |
| `examples { }` | worked examples metadata | 4050 |
| `request { }` | input shape for ingress flows (`context { require actor }`, `body { ... }`) | 4056 |
| `response { }` | output policy for egress flows | 4062 |
| `model { }` | model metadata | 4068 |
| `context { }` | context requirements | 4074 |
| `effects { }` | the capabilities the body may use (see [03](03-effects-and-capabilities.md)) | 4080 |
| `errors { }` | declared error variants | 4086 |
| `timeouts { }` | per-op timeouts (parsed; runtime enforcement later) | 4092 |
| `retries { }` | retry policy (parsed; runtime enforcement later) | 4098 |
| `limits { }` | resource limits (basic form parsed) | 4104 |
| `privacy { }` | PII/PHI handling rules | 4110 |
| `observability { }` | telemetry config (auto-by-default; don't put on `pure`) | 4116 |
| `resilience { }` | retry/fallback/quarantine (auto-by-default) | 4124 |
| `invariant { }` | `ensure <expr>` pre/post conditions | 4132 |
| `substrate { }` | execution-lane metadata (photonic/digital) | 4141 |
| `architecture { }` | volatility/decomposition metadata | 4151 |
| `memory { }` | memory-budget declaration | 4169 |
| `economics { }` | cost/scheduling budget | 4177 |
| `lineage { }` | data-lineage declaration (GDPR Art. 30) | 4185 |
| `ai { }` | AI-model governance (approved models, cost caps) | 4191 |
| `value { }` | value/liability classification | (nearby) |
| `hardware { }` | hardware target rules | (nearby) |
| `@experimental_profile(...) { }` | feature-gate wrapper for forward-looking syntax | 4159 |

You will not use most of these on any given flow. The **core four** you reach for constantly are
`intent`, `effects`, and (when relevant) `privacy` and `invariant`.

## The clauses you actually need

### `intent` — required, plain prose

A single descriptive string. **No logic, no URLs, no variable names, no function calls** — the
governance verifier rejects those (`FUNGI-GOV-010`). Missing `intent` on a `secure`/`guarded` flow is
also `FUNGI-GOV-010`.

```fungi
intent { "Record an encrypted billing event to the ledger and verify actor authorization." }
```

### `effects` — what the body may touch

```fungi
effects { database.write audit.write }
```

Deny-by-default: omitting `effects {}` (or writing `effects {}`) declares the flow strictly pure —
any effect in the body is then `FUNGI-EFFECT-001/003`. Full vocabulary and rules are in
[03 — Effects & capabilities](03-effects-and-capabilities.md).

### `invariant` — `ensure` guards

```fungi
invariant {
  ensure amount > 0
  ensure amount <= 1000000
}
```

Each `ensure` is a simple, directly-evaluable boolean expression checked around the body. Keep them
simple — complex theorem-prover style assertions are out of scope. `invariant {}` is a **sub-block of
`contract {}`** — never a top-level block, never a body statement (that is `FUNGI-INV-003`).

### `privacy` — PII/PHI handling

```fungi
privacy {
  phi name dob
  phi patientId masked_in_audit
  deny protected PatientId to response.body
  require redaction before audit.write
}
```

Covered in depth in [05 — Bindings, taint & privacy](05-bindings-taint-privacy.md).

### `request` / `response` — only for ingress/egress flows

```fungi
request {
  context { require actor require trace_id }
  body { text: unsafe String }
}
response { returns json }
```

`request {}`/`response {}` belong on API/route flows. Putting them on an internal/pure helper is a
compile error (`FUNGI-GOV-003`). They come in pairs.

### `audit` — audit obligations

```fungi
audit { require runtime report require actor }
```

Mandatory-and-detailed for regulated domains (healthcare/banking/gov); optional for plain web APIs.

## Clause ordering — what actually matters

The two app-framework docs disagree on a "canonical order" (`CANONICAL_SYNTAX.md` says
version→description→types→...; `COMMON_FIXES.md` says types→intent→request→...). **The parser's
`parseContractDecl` loop dispatches each clause by name regardless of order** (`parser.ts:3993-4200`
is a `while` loop over whatever token comes next). So order is **not** enforced by the compiler today.

For readability, follow the order the real examples use, which is roughly:

```
types → intent → request → response → effects → privacy → invariant → audit → (everything else)
```

Do not treat any stricter ordering rule as compiler-enforced — it is a style convention, not a parse
requirement.

## `[conforms_to: Guard]` — bind a contract to a ceiling

An optional attribute on the contract header that triggers a compile-time **Differential Proof**
(`contract.effects ⊆ guard.permitted_effects`). Real: `examples/foundations/guard-domain-ceiling.fungi:54`:

```fungi
secure flow processPayment(amount: Int) -> Result<Bool, Error>
contract [conforms_to: PaymentServiceGuard] {
  intent "Process a payment within the payment service ceiling"
  effects { database.write, audit.write }   // proven ⊆ PaymentServiceGuard.permitted_effects
}
{ ... }
```

Details and the `guard` declaration itself are in
[06 — Governance constructs](06-governance-constructs.md).

## Sub-blocks that PARSE but aren't fully enforced at runtime yet

Per `docs/AI/DO_NOT_USE_YET.md` §8 and the KB clause reference, these parse and are stored but their
*runtime* enforcement ships later — do not rely on them to actually gate execution today:

* `timeouts { }`, `retries { }`, `limits { }` — parsed; runtime enforcement is a later phase.
* `economics { }`, `resilience { }`, `observability { }`, `secrets { }` — auto-by-default; explicit
  overrides parse.
* `service ...` (service-level contracts) — **reserved, not implemented** (`DO_NOT_USE_YET.md` §9).

## Common mistakes (contracts)

| Mistake | Why wrong | Fix |
|---|---|---|
| `contract MyContract { version: "1.0" ... }` | named/`version:` form isn't what the parser attaches or examples use | anonymous `contract { ... }` after the signature |
| `contract { ... }` placed *inside* the body `{ }` | contract is a sibling of the body, not a statement in it | put it between signature and body |
| `intent { "transfer if amount > 0 and GET https://..." }` | logic/URLs in intent are rejected | plain declarative prose only (`FUNGI-GOV-010`) |
| omitting `intent` on a `secure` flow | required on secure/guarded | add `intent { "..." }` (`FUNGI-GOV-010`) |
| `invariant { ... }` as a top-level or body block | it's a `contract` sub-block | move it inside `contract { }` (`FUNGI-INV-003`) |
| `request { }` on an internal helper | ingress-only clause | remove it, or make it a real route (`FUNGI-GOV-003`) |
| effects as `effects: ["db.write"]` | not the token grammar | `effects { database.write }` |

## Real files to open

* `examples/healthcare/getPatient.fungi` — a rich contract: `intent`, `request.context`, `effects`,
  `privacy`, `audit`.
* `examples/healthcare/classifyPrivateMedicalNote.fungi` — many clauses: `intent`, `effects`, `value`,
  `privacy`, `hardware`, `ai`, `economics`, `audit`.
* `examples/ai-inference/classifyMessage.fungi` — `request.body`, `targets`, `hardware` on a guarded flow.

Next: **[03 — Effects & capabilities](03-effects-and-capabilities.md)**.
