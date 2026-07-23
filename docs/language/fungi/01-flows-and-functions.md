# 01 — Flows & Functions

> Grounded in: `parser.ts:597` (`parseFlowDecl`), `parser.ts:409-410` / `878-925` (qualifier
> dispatch), `parser.ts:931-972` (`governed`), lexer keyword table
> `lexer.ts:131-187`. Real examples: `examples/foundations/validation-utils.fungi`,
> `examples/healthcare/getPatient.fungi`, `examples/foundations/comment-styles-example.fungi`.

## The mental model

A **flow** is Galerina's unit of executable, governed code. Unlike a plain function, a flow carries
a *governance surface*: a qualifier that says how much power it has, an optional `contract { }` that
declares intent/effects/promises, and a body. The compiler reads the surface and enforces it.

A `.fungi` file is a sequence of **top-level declarations**: type declarations, flow declarations,
`guard`/`gate` governance blocks, imports, and `static`/`bitfield` constants. You **cannot** put a
bare `let`/`mut` at top level, and you cannot put `fn`/`emit` at top level — those live inside a flow
body (see the mistakes below and `docs/AI/DO_NOT_USE_YET.md`).

## The three flow qualifiers

The parser accepts exactly four flow-header forms: plain `flow`, and the three qualified forms
`pure flow`, `guarded flow`, `secure flow` (`parser.ts:597`, `878-925`). Choose by what the body
touches:

| Qualifier | Use when the flow… | Typical effects |
|---|---|---|
| `pure flow` | computes only from its arguments, no external reads/writes | `effects {}` (empty) |
| `guarded flow` | **reads** external state but writes nothing sensitive | `database.read`, `ai.inference` |
| `secure flow` | **writes** state, handles protected/redacted data, or does privileged work | `database.write`, `audit.write` |

### `pure flow` — correct

Every `.fungi` file's **first line** must be `@version <integer>` (a versionless file is rejected *before*
parsing — `FUNGI-SYNTAX-015`); it is shown as the literal first line here and applies to every file you
convert. From `examples/foundations/validation-utils.fungi:18-31`:

```fungi
@version 1
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

### `guarded flow` — correct

From `examples/healthcare/getPatient.fungi:8` (header) — a read flow:

```fungi
guarded flow getPatientSummary(readonly request: PatientSummaryRequest) -> PatientSummaryResult
contract {
  intent { "Retrieve a patient summary for clinical display." }
  effects { database.read }
}
{
  let record = database.read(request.patientId)
  return PatientSummaryResult { name: record.name, dob: record.dob }
}
```

### `secure flow` — correct

From `examples/auth-service/createSession.fungi:9-20`:

```fungi
secure flow createSession(readonly request: Request) -> CreateSessionResult
contract {
  intent { "Create a new session for a verified user." }
  effects { database.write audit.write }
  privacy { pii sessionId deny protected SessionId to response.body }
  audit { require runtime report }
}
{
  let session = Session.create(request.body.token)?
  AuditLog.write({ event: "SessionCreated", sessionId: redact(session.sessionId) })
  return Ok(session)
}
```

## Anatomy of a flow signature

```
<qualifier> flow <name>(<params>) -> <ReturnType>
```

* **Return type separator** is `->` (canonical). The parser *also* accepts `:` as a not-yet-blessed
  proposal form (`parser.ts:622-627`) — prefer `->` in real code.
* **Return type** is a type reference — most often a **named result type** you declared at the top of
  the file: `-> CreateSessionResult` where `type CreateSessionResult = Result<Session, SessionError>`.
  See [04 — Types & values](04-types-and-values.md).
* **Parameters** are `name: Type`, comma-separated, each optionally prefixed with the qualifiers
  `readonly` and/or `tainted` (`parser.ts:1030-1066`):
  * `readonly request: Request` — the caller's value is a read-only view; the flow may not mutate it.
  * `tainted data: RawPayload` — marks the parameter as untrusted so the taint/governed-sink checks
    fire on it (see [05 — Bindings, taint & privacy](05-bindings-taint-privacy.md)).
  * **Full parameter reference: [Parameters](parameters.md)** — type options, `readonly`/`tainted`,
    governed-type parameters, and what is not supported yet.
* An optional `decreases <metric>` termination annotation may follow the return type on the same line
  (`parser.ts:631-669`), e.g. `pure flow countdown(n: Int) -> Int decreases n { ... }`. It tells the
  compiler which quantity strictly decreases so a bounded loop provably terminates. Optional; omit
  unless you need it.

After the signature come optional clause blocks — `contract { }`, `access { }`,
`authority { }`, `compute … ` — then the `{ body }` (a `uses` clause on the header does **not** parse;
see the warning below). `contract { }` is by far the most common; see
[02 — Contracts](02-contracts.md).

## `fn` — local helper functions

`fn` declares a helper. **`fn` is not a top-level construct** — it lives inside a flow body. Use it
for small pure computations you want to name.

```fungi
guarded flow process(values: Array<Int>) -> Array<Int>
contract { intent "double every value" effects {} }
{
  fn double(x: Int) -> Int { return x * 2 }
  return values.map(double)
}
```

> **Common mistake — `fn` at top level.** A bare `fn helper(...) { }` at file scope emits
> `FUNGI-SYNTAX-005`. Move it inside a flow. (`docs/AI/DO_NOT_USE_YET.md` §6.)

Note the two dialects here: the KB `core-syntax-keywords.md` describes `fn` as a globally-visible
"pure helper that cannot cross trust boundaries." The **parser** treats `fn` as a flow-body-local
declaration. Follow the parser: define helpers inside the flow that uses them.

## `governed <floor> flow` — Tower floor qualifier

A fourth header form: `governed <floorLabel> flow` (`parser.ts:931-972`). It parses as a guarded
flow but tags the flow with a "Tower floor" used by the topology/admission check (`dag_edge_valid`).
From `examples/foundations/comment-styles-example.fungi:28`:

```fungi
governed floor_3 flow validatePaymentAmount(amount: Int, currency: String) -> Bool
contract {
  intent "Validate payment amount in the Proof Zone"
  effects { allow audit.write }
  invariant { ensure amount > 0  ensure amount < 10000000 }
}
{
  trap amount <= 0 : ERR_NEGATIVE_AMOUNT
  trap currency == "" : ERR_EMPTY_CURRENCY
  return true
}
```

The floor label (`floor_3`) is a plain identifier the parser records; it is not a fixed enum.

## `route` — external entry point

`route` is a real keyword (`lexer.ts` V1 set) for declaring an HTTP-style entry point. In practice
the corpus models endpoints as `secure`/`guarded flow`s that take `readonly request: Request` and
declare `request { }` / `response { }` clauses in the contract (see
`examples/ai-inference/classifyMessage.fungi`). Treat `route` as available but reach for a governed
`flow` + `request`/`response` clauses first.

## ⚠ `uses` — a Core-style sketch that does NOT parse on a flow header

The Core dialect *sketches* inline capability with `uses`, but **it does not parse on a flow header**:
`secure flow f() uses vault.secrets.read { … }` → **`FUNGI-PARSE-001: Expected "{", got "uses"`** (verified).
`uses` is a keyword only *inside* `model { }` blocks. Declare what a flow may do **exclusively** through the
`contract { effects { … } }` block (and the `access { grant … }` boundary). See
[03 — Effects & capabilities](03-effects-and-capabilities.md). This section is kept only as a warning so a
converter does not emit the non-compiling `uses`-header form.

## The flow-comment rule

Every flow gets a short comment saying what it does and, ideally, why it is safe. Galerina has three
comment forms (`examples/foundations/comment-styles-example.fungi`, and the lexer token kinds
`Comment`/`DocComment`/`GovComment`):

| Syntax | Token | Survives into manifest? | Use for |
|---|---|---|---|
| `// text` | line comment | no (discarded after parse) | how-it-works notes |
| `/* text */` | block comment | no | multi-line notes / file headers |
| `/// text` | doc comment | extracted by doc tooling | API documentation |
| `;; text` | **govComment** | **yes — written into the `.lmanifest`** | *why* the code is safe/permitted, proof obligations, capability reasoning |

Rule of thumb from the example file: **if the note explains WHY the code is safe/permitted, use
`;;`.** If it explains HOW it works, use `//` or a block comment.

### The GSCM annotation tags — `// @cause` · `// @effect` · `// @todo`

On top of the four forms, the house standard (the **Galerina Standard Comment Model**, agreed in
`notes/77-mesh-r-d-11.md`) adds three structured tags for every public/critical flow, written as **line
comments with an `@` tag** and placed between the `;;` govComment block and the flow keyword:

| Tag | States | Example |
|---|---|---|
| `// @cause  [Trigger] -> …` | the system event / hook / user interaction that **invokes** this flow | `// @cause  [HTTP route /login] -> user submits the login form.` |
| `// @effect [Target] -> …` | the mutations / outputs produced on a successful **ALLOW** | `// @effect [sessions DB] -> new session row; audit event appended.` |
| `// @todo   [Assignee] -> …` | genuinely unfinished work — **only when something IS unfinished; never fabricate** | `// @todo   [AI] -> reject payloads whose timestamp is older than 60s (replay prevention).` |

Why `// @` and not `;;` or `///`: the tags are **maintenance/AI-context metadata** — they must be
machine-greppable (the `@` prefix is what makes a future lint rule possible) but must **not** enter the
signed `.lmanifest` (a `@todo` in a signed governance record would be wrong) and not the extracted API
docs either. `//` is discarded at parse — exactly right. `@effect` narrates the **outcome**; it is *not*
the `effects {}` contract clause (which *grants capabilities* and is compiler-enforced) — don't confuse
the two, and never let an `@effect` comment claim something the contract doesn't permit.

The full stack above a flow:

```fungi
;; This flow handles payment validation for Floor 3 (Proof Zone)
;; V_DPM capability required: audit.write (bit 3)
;; Proof obligation: amount > 0 must be statically verified
// @cause  [Checkout pipeline] -> called before any charge is attempted.
// @effect [Verdict only] -> returns Bool; no state mutated on any path.
governed floor_3 flow validatePaymentAmount(amount: Int, currency: String) -> Bool
```

(`.gate` files have their own single comment form — `#`, which the spec strips before the verdict
("comments carry NO authority", m2). `# @todo …` is fine there; `@cause`/`@effect` are usually redundant
in `.gate` because the `INTENT`/`EFFECTS` clauses already state trigger and outcome declaratively.)

## Common mistakes (flows)

| Mistake | Why wrong | Fix |
|---|---|---|
| `secure flow getUser(readonly req: Request)` | `req` abbreviation; the primary input is always `request` | use `request` |
| `secure flow f(request: T) -> R` (no `readonly`) | request params should be `readonly` | `readonly request: T` |
| `-> Result<Response, ApiError>` in the signature | for contract flows, return a **named** result type | `-> GetUserResult`, declare `type GetUserResult = Result<...>` |
| `fn helper(...) { }` at top level | `fn` is flow-body-local | move inside a flow (`FUNGI-SYNTAX-005`) |
| `let counter = 0` at top level | no top-level `let`/`mut` | pass as a parameter or bind inside a flow (`FUNGI-SYNTAX-006`) |
| `with effects [database.write]` on the header | removed legacy syntax | `contract { effects { database.write } }` (`FUNGI-SYNTAX-LEGACY-001`) |

## Real files to open

* `examples/foundations/validation-utils.fungi` — two tiny `pure flow`s; the cleanest starting point.
* `examples/healthcare/getPatient.fungi` — a full `secure flow` with contract, privacy, and redaction.
* `examples/foundations/comment-styles-example.fungi` — the three comment forms + `governed floor_3 flow`.
* `examples/auth-service/createSession.fungi` — a compact `secure flow` end to end.

Next: **[02 — Contracts](02-contracts.md)**.
