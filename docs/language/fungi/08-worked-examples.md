# 08 — Worked Examples

> Three real `.fungi` files read end-to-end, plus a tour of the corpus. Every line below is copied
> from a real file — no invented syntax. Files:
> `examples/auth-service/verifyPassword.fungi`, `examples/foundations/gate-access-example.fungi`,
> `packages-galerina/galerina-core-compiler/src/self-hosted/lexer.fungi`.

If you've read pages 01-07, this page ties the constructs together. Read the three files with the
annotations, then open a few more from the tour at the end.

---

## Example A — a full vertical governance slice (`verifyPassword.fungi`)

This is the single best example to internalise: it walks untrusted input all the way to a governed
response, touching almost every governance construct once. The file's own header says it covers
"unsafe boundary input → validate → protected type → Crypto.constantTimeEquals → AuditLog.write
(redacted) → governed response. No diagnostics expected."

```fungi
// Phase 25 example — demonstrates full vertical governance slice          // ← // line comment (discarded)

type VerifyPasswordResult = Result<AuthToken, AuthError>                    // named result alias (page 04)
type AuthToken = Brand<String, "AuthToken">                                // Brand: nominal identity
type AuthError = enum { InvalidCredentials InvalidInput AccountLocked }     // enum, space-separated variants

secure flow verifyPassword(readonly request: Request) -> VerifyPasswordResult   // secure + readonly request + named return (page 01)
contract {
  intent {
    "Verify user credentials and issue a short-lived authentication token."     // plain prose, no logic (page 02)
  }

  request {
    body {
      email: unsafe String                                                 // field marked unsafe at ingress
      password: unsafe String
    }
  }

  effects {
    database.read                                                          // real canonical effects (page 03)
    secret.read
    crypto.verify
    audit.write
  }

  privacy {
    pii email masked_in_audit                                             // tag PII, mask in audit (page 05)
    deny protected Email to response.body                                 // protected type may not leave in response
    require redaction before audit.write                                  // must redact before audit
  }

  audit {
    require runtime report
  }
}
{
  unsafe let rawEmail: String = request.body.email                        // raw untrusted input (page 05)
  unsafe let rawPass: String = request.body.password

  let email: protected Email = validate.email(rawEmail)?                  // UNTAINT boundary: validate + ? → trusted & protected
  let hash: SecureString = Secrets.get("user_password_hash")?             // Secrets.get → secret.read effect; SecureString is guarded

  let valid = Crypto.constantTimeEquals(rawPass, hash)                    // constant-time compare (a crypto stdlib call)

  let redactedEmail: redacted String = redact(email)                     // redact BEFORE audit
  AuditLog.write({                                                        // AuditLog.write → audit.write effect
    event: "AuthAttempt",
    user: redactedEmail,                                                 // safe: redacted
    success: valid
  })

  if valid {                                                             // simple two-way branch (no else-if needed) (page 07)
    let token: AuthToken = Auth.generateToken(email)
    return Ok(token)
  } else {
    return Err(AuthError.InvalidCredentials)
  }
}
```

**Why it type-checks / passes the governance checks:**

* Every effect the body performs is declared: `database.read` (implied by the lookup), `secret.read`
  (`Secrets.get`), `crypto.verify` (`Crypto.*`), `audit.write` (`AuditLog.write`). Drop one →
  `FUNGI-EFFECT-001`.
* `rawEmail` is `unsafe`; it becomes trusted only via `validate.email(...)?`. The result is
  `protected Email`, which the `privacy` clause forbids from the response body — and indeed the flow
  never returns it (it returns an `AuthToken`), and it `redact()`s it before audit.
* The `?` on `validate.email(...)` and `Secrets.get(...)` early-returns their `Err`, so the happy path
  only continues with trusted values.

This one file exercises pages 01-07 at once. If you can read it fluently, you can read the corpus.

---

## Example B — governance perimeter and ceiling (`gate-access-example.fungi`)

This file teaches the three governance boundaries side by side (page 06). Abbreviated with the
load-bearing lines:

```fungi
;; Domain ceiling: the capability a caller must hold to be admitted.               // ;; govComment → manifest
guard AdminOperationsGuard {
  permitted_effects {
    database.write
    audit.write
    secret.access                        // NOTE: broad alias → secret.read (+ FUNGI-EFFECT-005). Prefer secret.read.
  }
}

;; gate(...) — admission perimeter. Only callers holding AdminOperationsGuard get in.
gate(AdminOperationsGuard) {
  secure flow deleteRecord(recordId: String) -> Result<Bool, Error>
  contract {
    intent "Delete a record — admin-only, audit-required"
    effects { database.write, audit.write }
    invariant { ensure recordId != "" }                                    // ensure: asserts a condition holds
  }
  {
    trap recordId == "" : ERR_EMPTY_RECORD_ID                              // trap: fires WHEN condition is true
    return Ok(true)
  }
}

;; access {} with Default Deny — a flow open to callers generally, but only the two
;; listed capabilities may cross into it. You never write `deny`; you omit.
secure flow processRequest(payload: String) -> Result<Bool, Error>
contract {
  intent "Process an incoming request"
  effects { allow database.write, allow audit.write }
}
access {
  grant database.write
  grant audit.write
  ;; everything else is implicitly DENIED
}
{
  trap payload == "" : ERR_EMPTY_PAYLOAD
  return Ok(true)
}
```

**What to take away:**

* `guard` = the *ceiling* (max any conforming flow may do). `gate(G)` = the *perimeter* (who may
  reach the flows inside). `access { grant … }` = the *doorway* into one flow (Default-Deny).
* `ensure` (in `invariant`) and `trap` (in the body) express the same guarantee from opposite
  directions: `ensure recordId != ""` and `trap recordId == "" : ERR_...`.
* The sibling file `guard-domain-ceiling.fungi` adds `parent_policy:` (child ⊆ parent) and
  `contract [conforms_to: Guard]` (the compile-time Differential Proof). Read it next.

---

## Example C — advanced real syntax (`self-hosted/lexer.fungi`)

The self-hosted compiler is the best ground truth for *advanced* Galerina, because it is real,
compiled `.fungi` doing non-trivial work. A representative slice (`tokenize` and helpers):

```fungi
enum TokenKind {                          // top-level enum, newline-separated
  Identifier
  Keyword
  StringLiteral
  ...
}

record Token {                            // top-level record, newline-separated fields
  kind: TokenKind
  value: String
  line: Int
  column: Int
  ...
}

pure flow scanWord(source: String, startPos: Int, srcLen: Int) -> Array<String>
contract {
  intent { "Scan a word from source at startPos. Returns [word, endPos] as strings." }
}
{
  mut i = startPos                        // mut: genuine loop state
  mut word: String = ""
  mut done = false
  while i < srcLen and done == false {    // while + readable `and`
    let opt: Option<Char> = source.charAt(i)   // Option<Char>, Result-style stdlib
    match opt {                           // match with Some/None/_ (page 07)
      None => {
        done = true
      }
      Some(nc) => {
        if nc.isLetter() or nc.isDigit() {     // readable `or`
          word = word + nc.toString()
          i = i + 1
        }
        else {                            // two-way if/else — NO else-if
          done = true
        }
      }
      _ => {
        done = true
      }
    }
  }
  return [word, i.toString()]             // array literal
}
```

**What advanced ground truth teaches you:**

* `pure flow`s can be substantial. Note `mut` loop state, `while … and …`, `match` on `Option<Char>`,
  and `is` for character equality elsewhere in the file (`if nc is '"'`).
* Because there's no `else if`, multi-branch character dispatch uses sequential guarded `if`s with a
  `handled` flag (see the main `tokenize` loop, lines ~427-627) — study this pattern; it is the
  idiomatic workaround.
* `contract { intent { "..." } }` on a pure helper is minimal but present — every flow gets an intent.

The self-hosted set also includes `parser.fungi`, `type-checker.fungi`, `effect-checker.fungi`,
`governance-verifier.fungi`, `gir-emitter.fungi`, and `runtime.fungi` — read these when you want to
see a construct used in anger.

---

## A tour of the example corpus (`examples/**/*.fungi`)

There are ~52 example files. A representative spread, by what each teaches:

| File | Teaches |
|---|---|
| `foundations/validation-utils.fungi` | the smallest real `pure flow`s + `trap` |
| `foundations/comment-styles-example.fungi` | `//` vs `/* */` vs `;;`, and `governed floor_3 flow` |
| `foundations/gate-access-example.fungi` | `gate(...)`, `access { grant }` Default-Deny |
| `foundations/guard-domain-ceiling.fungi` | `guard`, `parent_policy`, `[conforms_to]` Differential Proof |
| `foundations/hardened-border-plugin.fungi` | `import plugin safe`, plugin `access`, `step` |
| `foundations/static-bitfield-example.fungi` | `static` constants, `bitfield` capability register |
| `foundations/multi-file-import.fungi` | importing another `.fungi` |
| `healthcare/getPatient.fungi` | `guarded` read + full `privacy` + validate/redact |
| `healthcare/classifyPrivateMedicalNote.fungi` | rich contract: `value`, `hardware`, `ai`, `economics`, `privacy` |
| `auth-service/verifyPassword.fungi` | the full vertical governance slice (Example A) |
| `auth-service/createSession.fungi` | compact `secure flow` with `Brand`, `enum`, redact-on-audit |
| `ai-inference/classifyMessage.fungi` | `request.body`, `targets { prefer [...] }`, `hardware` |
| `aerospace/processFlightTelemetry.fungi` | `telemetry.read` + domain governance |
| `gaming-substrate/02-anticheat-sign-digital.fungi` | crypto-sign on the deterministic core (and the paired `-WRONG` file shows what NOT to do) |

## How to keep yourself honest

* When you write a snippet, find the matching real file in the table above and diff your syntax
  against it.
* If your snippet uses a construct no example uses, check it against the parser
  (`packages-galerina/galerina-core-compiler/src/parser.ts`) and the keyword table
  (`lexer.ts:131-187`) before trusting it.
* Run the compiler over your file. If the compiler disagrees with anything on these pages, **the
  compiler is right** — please fix the doc.

Back to the **[index & learning path](README.md)**.
