# 05 — Bindings, Taint & Privacy

> Grounded in: `parser.ts:1471-1506` (`let`), `1508-1535` (`mut`), `1331-1346` (`unsafe`/`safe`
> prefix on `let`/`mut`), `512-525` (top-level `unsafe let` rejected, `FUNGI-SYNTAX-008`),
> `3917-3945` (`readonly` binding), `1030-1066` (`readonly`/`tainted` param qualifiers),
> `1134-1140` / `1551-1570` (value-state qualifiers on types), `parser.ts:4110` (`privacy` clause),
> lexer keyword set `lexer.ts:131-187`. Real examples: `examples/healthcare/getPatient.fungi`,
> `examples/healthcare/classifyPrivateMedicalNote.fungi`, `examples/auth-service/createSession.fungi`.

This page is where Galerina's governance model becomes concrete: **binding forms encode trust, and
the compiler tracks trust as values flow through a flow.**

## The binding forms

### `let` — immutable (the default)

```fungi
let patientId: protected PatientId = validate.patientId(request.params.id)?   // getPatient.fungi:24
let session = Session.create(request.body.token)?                              // createSession.fungi:17
```

Type annotation is **optional** (`parser.ts:1471-1506`): `let x = expr` or `let x: T = expr`.
Reassigning a `let` is an error (`FUNGI-BINDING-001`).

### `mut` — mutable (only when you must)

```fungi
mut i = startPos
mut word: String = ""
while i < srcLen and done == false {
  word = word + nc.toString()
  i = i + 1
}
```

(From `.../self-hosted/lexer.fungi` — a real hand-written mutable loop.) Use `mut` only for genuine
in-place accumulation like counters and loop indices. `mut` in a `pure`-context flow warns
(`FUNGI-BINDING-004`).

### `readonly` — immutable binding + read-only view (type required)

As a **binding**, `readonly` requires a type annotation (`parser.ts:3917-3945` expects the `:`):

```fungi
readonly appConfig: Config = loadEnvironmentConfig()
```

As a **parameter qualifier** it means the flow may not mutate the caller's value — this is why the
primary input is `readonly request: T` everywhere. Reassigning or mutating through a `readonly`
binding is `FUNGI-BINDING-002` / `FUNGI-BINDING-003`.

### `unsafe let` / `unsafe mut` — raw untrusted input

`unsafe` is a **prefix token** applied to `let` or `mut` (two tokens, not one keyword;
`parser.ts:1331-1346`). It binds data that has **not** been validated. The taint checker then refuses
to let that value reach a governed sink (database, audit, response) until it is validated.

```fungi
unsafe let rawBody: String = request.body
unsafe let decoded = json.decode<RawInput>(rawBody)
```

> **`unsafe let` is only allowed inside a flow.** At top level it is rejected with
> `FUNGI-SYNTAX-008` ("boundary data must be owned by a governed flow"; `parser.ts:512-525`).

`safe let` is the counterpart prefix that marks a value as trusted (typically after validation).

### `static NAME = EXPR` — compile-time constant

`static` binds a compile-time constant that the compiler substitutes at each use site (folded to a
literal in the emitted output); `parser.ts:3158-3180`. Unlike `let`/`mut`, `static` is allowed at top
level.

```fungi
static MAX_RETRIES = 3
static FLOOR_PROOF = 3
```

### `const` — a drift trap

The KB `galerina-core-syntax-bindings-pipeline.md` says `const` is **rejected**
(`FUNGI-SYNTAX-002`). But `const` **is** in the lexer's active keyword set (`lexer.ts:172`, commented
"Compile-time constants (allowed at top level; ordinary let/mut are not)"). This is genuine drift
between the KB and the lexer. To stay safe and unambiguous, **use `static` for compile-time constants
and `let`/`readonly` for everything else** — that is the form the examples use and it sidesteps the
disagreement entirely. (Flagged in the caveats of the [README](README.md).)

### Binding forms at a glance

| Form | Type annotation | Where allowed | Meaning |
|---|---|---|---|
| `let x = e` | optional | flow body | immutable |
| `mut x = e` | optional | flow body | mutable (counters/loops) |
| `readonly x: T = e` | **required** | flow body + params | immutable + read-only view |
| `unsafe let x = e` | optional | **flow body only** | raw untrusted input |
| `safe let x = e` | optional | flow body | explicitly trusted |
| `static NAME = e` | none | top level + body | compile-time constant |

## Value-state qualifiers: `protected`, `redacted`, `tainted`, `secret`

These four are real keywords (`lexer.ts` V1 set) that attach a governance state to a **value/type**,
not to a call site. They can appear:

* **as a prefix on a type** in a binding or field: `let id: protected PatientId = ...`,
  `patientId: redacted String` (`parser.ts:1134-1140`);
* **as a postfix on a type** (`let x: PatientId protected = ...`) — also consumed
  (`parser.ts:1551-1570`), for backward compatibility;
* **`tainted` also as a parameter qualifier**: `tainted data: RawPayload` (`parser.ts:1030-1066`).

| Qualifier | Meaning |
|---|---|
| `protected` | access-controlled; must be gated (or redacted) before it appears in a response |
| `redacted` | must never appear raw in logs/audit/serialized output; produce a safe token with `redact()` |
| `tainted` | untrusted; the governed-sink guards fire on it (like `unsafe`) |
| `secret` | secret material (e.g. `SecureString`); guarded like `redacted` toward sinks |

## Taint tracking — the core idea

The compiler tracks whether each value is trusted. Untrusted values (`unsafe let`, `tainted`
parameters, secret-derived values) **may not reach a governed sink** — a `database.write`,
`audit.write`, a network egress, or a serialized response — without first being validated or
redacted. Violations produce the value-state diagnostics:

* `FUNGI-VALUESTATE-003` — an unsafe/tainted value reached a governed sink.
* `FUNGI-SECRET-001/002/003` — a secret/PII value flowed to log/audit, to network, or to a
  serialized record without redaction.
* `FUNGI-GOV-003` — a `protected` value appears in a response without a gate.

The `tainted` parameter qualifier exists specifically to close a *fail-open*: without it, a bare
parameter used to be trusted by default; `tainted data: T` opts the parameter into the sink guards
(`parser.ts:1030-1034`).

## The untaint boundary: `validate.*` + `?`

An untrusted value becomes trusted by passing through a **validation call** that returns a `Result`,
and unwrapping it with `?`. This is the canonical promotion from `unsafe`→trusted:

```fungi
unsafe let rawId = request.params.id                    // untrusted
let patientId: protected PatientId = validate.patientId(rawId)?   // validated → trusted (and protected)
let patient = PatientsDB.find(patientId)?               // now safe to reach the DB
```

`validate.foo(...)` is not a special keyword — it is a call the type/value-state checker recognises as
a validation boundary that upgrades the value's state. The `?` operator unwraps the `Ok` (or
early-returns the `Err`). After this, `patientId` is safe to pass to `database.read`.

> **Common mistake (the classic one):** sending raw input straight to a sink.
> ```fungi
> unsafe let rawEmail = request.body.email
> UsersDB.insert({ email: rawEmail })    // ❌ FUNGI-VALUESTATE-003 — unsafe at a governed sink
> ```
> Fix: validate first.
> ```fungi
> unsafe let rawEmail = request.body.email
> let email = validate.email(rawEmail)?
> UsersDB.insert({ email: email })       // ✅
> ```

## `redact()` — the safe exit for protected/secret values

`redact(value)` produces an audit/response-safe token from a `protected`/`secret`/`redacted` value.
Use it right before the value would cross a boundary. From `examples/healthcare/getPatient.fungi:26-36`:

```fungi
let redactedPatientId: redacted String = redact(patientId)
AuditLog.write({
  event: "PatientAccessed",
  patient_ref: redactedPatientId,     // redacted — safe for audit
  actor: request.context.actor
})
return Ok({
  patientId: redact(patientId),       // redacted pseudonym, never the raw protected id
  name: redact(patient.name),
  dob: redact(patient.dob)
})
```

> **Common mistake:** logging a protected value directly.
> ```fungi
> AuditLog.write({ email: patient.email })          // ❌ protected → FUNGI-VALUESTATE-003/006
> AuditLog.write({ email: redact(patient.email) })  // ✅
> ```

`redact()` is a call-site exit, **not** a substitute for declaring the `privacy {}` clause — you
typically need both.

## The `privacy { }` contract clause

`privacy {}` declares, at the contract level, how PII/PHI is handled. It is parsed as a token list
(`parser.ts:4110`), and the value-state checker interprets the directives. The directive vocabulary
comes from the real examples:

```fungi
// getPatient.fungi:15-20
privacy {
  phi name dob                                 // tag these fields as PHI
  phi patientId masked_in_audit                // PHI field, masked in the audit trail
  deny protected PatientId to response.body    // this type may not appear in the response body
  require redaction before audit.write         // redact PHI before any audit.write
}
```

```fungi
// classifyPrivateMedicalNote.fungi:34-39
privacy {
  pii { patientId dateOfBirth diagnosis treatmentHistory }   // inline PII field list
  require protected_boundary before ai.inference             // wrap in a protected boundary first
  require redaction before audit.write
  require local_execution                                    // must run locally (no cloud)
}
```

```fungi
// createSession.fungi:13 (compact one-liner)
privacy { pii sessionId deny protected SessionId to response.body }
```

Observed directives (from the corpus):

| Directive | Meaning |
|---|---|
| `phi <fields>` / `pii <field>` / `pii { fields }` | tag fields as PHI/PII |
| `<field> masked_in_audit` | mask this field where it appears in audit |
| `deny protected T to response.body` | forbid a protected type from the response |
| `require redaction before audit.write` | gate audit output on redaction |
| `require protected_boundary before ai.inference` | require a protected wrapper before inference |
| `require local_execution` / `require local_only_execution` | no cloud |
| `mask <field>` + `strategy transform.crypto_pseudonymize` | apply a masking strategy |

`privacy {}` is optional in the grammar but **required in practice** whenever PII/PHI crosses a trust
boundary. Even without it, the value-state checker still fires on a `SecureString`/protected value
reaching a sink.

## Putting it together — the canonical secure-flow shape

```fungi
;; Handles PHI; validates input, protects the identifier, redacts before audit + response.
secure flow getPatient(readonly request: Request) -> GetPatientResult
contract {
  intent { "Retrieve a patient summary for clinical display." }
  effects { database.read phi.read audit.write }
  privacy {
    phi name dob
    deny protected PatientId to response.body
    require redaction before audit.write
  }
  audit { require runtime report }
}
{
  let patientId: protected PatientId = validate.patientId(request.params.id)?  // untaint boundary
  let patient   = PatientsDB.find(patientId)?                                  // safe to read
  AuditLog.write({ event: "PatientAccessed", patient_ref: redact(patientId) })  // redact before audit
  return Ok({ patientId: redact(patientId), name: redact(patient.name), dob: redact(patient.dob) })
}
```

Read top to bottom: raw id → `validate.*(...)?` (trusted + protected) → DB read → `redact()` before
audit → `redact()` before response. Remove any redaction and the value-state checker fails the build.

## Common mistakes (bindings/taint/privacy)

| Mistake | Why wrong | Fix |
|---|---|---|
| `unsafe let x = ...` at top level | boundary data must live inside a flow | move into a flow (`FUNGI-SYNTAX-008`) |
| `unsafe let raw = ...; DB.insert(raw)` | unsafe at a governed sink | validate first: `let v = validate.x(raw)?` |
| `AuditLog.write({ email: patient.email })` where email is protected | protected value in audit | `redact(patient.email)` |
| returning `protected` value directly | protected in response | gate it, or `redact()`, or omit (`FUNGI-GOV-003`) |
| `readonly x = expr` (no type) | `readonly` binding needs a type | `readonly x: T = expr` |
| relying on `Tainted<T>` type | not parser-backed | use `unsafe let` / `tainted` param |
| using `const` and expecting it to work like a constant | KB says rejected, lexer accepts — ambiguous | use `static` for constants |

## Real files to open

* `examples/healthcare/getPatient.fungi` — the full validate → protect → redact pipeline + `privacy`.
* `examples/healthcare/classifyPrivateMedicalNote.fungi` — a rich `privacy {}` with `pii {}` list and
  `require protected_boundary before ai.inference`.
* `examples/auth-service/createSession.fungi` — compact `privacy` + `redact()` before audit.

Next: **[06 — Governance constructs](06-governance-constructs.md)**.
