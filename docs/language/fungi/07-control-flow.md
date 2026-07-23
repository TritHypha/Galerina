# 07 — Control Flow

> Grounded in: `parser.ts` — statement dispatch (1314-1348), `parseIfStmt` (1586-1618, **`else if`
> rejected** at 1601-1608), `parseMatchExpr`/`parseMatchArm` (1697-1810), `parseWhileStmt` (5171),
> `parseForEachStmt` (5179-5205), `parseUnlessStmt` (1673-1694), `parseTrapStmt` (1643), `?` in
> `parsePostfix` (2091), readable operators `and`/`or`/`is` (1880-1901), bitwise **rejected**
> (1906-1930), `parseReturnStmt` (1570), `parseEmitStmt` (5162). Real examples:
> `.../self-hosted/lexer.fungi`, `examples/foundations/*.fungi`.

Galerina's control flow is deliberately small and explicit. Two things surprise newcomers up front:
**there is no `else if`** (use `match`), and **bitwise operators are not part of the language** (they
live in the engine layer). Both are enforced by the parser.

## `if` / `else` — simple two-way branch only

```fungi
if isValid {
  return Ok(result)
}
else {
  return Err(ValidationError)
}
```

`else` appears **after the closing `}`** of the `if` block (`parser.ts:1586-1618`).

### There is no `else if`

Chaining `else if` is a hard rejection: `FUNGI-SYNTAX-010` ("ElseIfNotAllowed"), verified directly at
`parser.ts:1601-1608`. `else unless` is rejected the same way. The message tells you the fix: use
`match`.

```fungi
// ❌ rejected — FUNGI-SYNTAX-010
if a { ... } else if b { ... } else { ... }

// ✅ use match — exhaustive, no fallthrough
match someValue {
  CaseA => { ... }
  CaseB => { ... }
  _     => { ... }
}
```

The self-hosted lexer works around the absence of `else if` with sequential guarded `if`s and a
`handled` flag (see `.../self-hosted/lexer.fungi:427-627`) — a good pattern to study when a real
multi-branch dispatch can't be a clean `match`.

## `match` — exhaustive pattern matching

`match` is the primary multi-branch construct (`parser.ts:1697-1810`). Each arm is `pattern => body`;
`body` is a block `{ ... }` or a single statement. It supports several pattern shapes:

```fungi
// Constructor patterns with a binding (the most common use)
match opt {
  None       => { done = true }
  Some(nc)   => { word = word + nc.toString() }
  _          => { done = true }
}
```
(Real, from `.../self-hosted/lexer.fungi:88-105`.)

```fungi
// Result destructuring — the `_` arm is MANDATORY (FUNGI-MATCH-001), even for a 2-variant match
match decoded {
  Ok(input)  => { return Ok(process(input)) }
  Err(error) => { return Err(error) }
  _          => { /* unreachable for Ok/Err, but the checker requires it — audit + deny */ }
}
```

```fungi
// Value patterns (string / literal)
match status {
  "paid"    => { AuditLog.write(...) }
  "pending" => { retry() }
  _         => { error(...) }
}
```

```fungi
// Guard arms: `when <condition> => body`
match score {
  when score >= 90 => { return "critical" }
  when score >= 70 => { return "high" }
  _                => { return "low" }
}
```

```fungi
// Multi-variant arm: PatternA | PatternB => body
match token {
  Plus | Minus => { return applyAdditive(token) }
  _            => { return applyOther(token) }
}
```

Recognised pattern forms (from `parseMatchArm`):

| Pattern | Example |
|---|---|
| constructor + binding | `Some(x)`, `Ok(v)`, `Err(e)` |
| nullary constructor | `None` |
| literal value | `"paid"`, `42` |
| wildcard | `_` |
| guard arm | `when cond => …` |
| multi-variant | `A \| B => …` |

> Note: `>= 90` style **range patterns** (`match score { >= 90 => … }`) appear in the KB
> `core-syntax-keywords.md`, but the parser's real facility for numeric branching is the **`when`
> guard** (`when score >= 90 => …`). Prefer `when` guards; treat bare comparison-operator patterns as
> doc-only unless you've confirmed them against your compiler.

> ★ **Every `match` needs a wildcard `_` arm (`FUNGI-MATCH-001`).** A match with no `_` is a hard compile
> ERROR — even an "exhaustive" two-variant `Ok`/`Err` or `Some`/`None` match — because the WASM backend traps
> on the unmatched case (RD-0240), so the checker fails closed by construction, not with a warning. Add a `_`
> arm routed to an audited/deny sink: `_ => { /* audit + deny */ }`.

## `while` — condition loop

```fungi
mut i = 0
while i < srcLen and done == false {
  word = word + nc.toString()
  i = i + 1
}
```
(`parser.ts:5171`; real usage throughout `.../self-hosted/lexer.fungi`.) Note the readable operator
`and` inside the condition.

## `for … in …` — iteration (this is the loop keyword, not `each`)

```fungi
for item in items {
  process(item)
}

// optional `where` guard: body runs only for matching items
for x in xs where x > 0 {
  sum = sum + x
}
```

`parser.ts:5179-5205`. The iterator variable, `in`, the collection expression, and an optional
`where <guard>` are all parsed here.

> **Common mistake:** using `each item in items { … }`. `each` is **not** a keyword (it is not in
> `V1_ACTIVE_KEYWORDS`). The KB `core-syntax-keywords.md` prefers `each`, but the **parser only knows
> `for`**. Use `for`.

There is currently no `break` / `continue` (both are future-reserved in `lexer.ts:196`). Model early
exit with a `mut done` flag and a `while`/`for` condition, as the self-hosted lexer does.

## `unless` — negated `if`

`unless cond { … }` is sugar for `if !cond { … }` (`parser.ts:1673-1694`):

```fungi
unless isAuthorized {
  return Err(UnauthorizedError)
}
```

## `trap` — fail-closed guard (recap)

`trap COND : ERR_CODE` rejects execution **when COND is TRUE**, tagging the audit trail with the
error code (`parser.ts:1643`). See [06 — Governance constructs](06-governance-constructs.md).

```fungi
trap age < 0 : ERR_NEGATIVE_AGE          // fires WHEN age is negative
trap age > 150 : ERR_UNREALISTIC_AGE
```

## `return`

```fungi
return Ok(session)
return Err(SessionError.InvalidToken)
return true
return                                   // bare return
```
(`parser.ts:1570-1584`.)

## The `?` error-propagation operator

Postfix `?` on a `Result`/`Option` expression unwraps the success value or **early-returns** the
error/`None` (`parser.ts:2091`). It is how you thread fallible calls cleanly:

```fungi
let session   = Session.create(request.body.token)?          // Ok → session; Err → return Err
let patientId = validate.patientId(request.params.id)?
let patient   = PatientsDB.find(patientId)?
```

Equivalent explicit form (what `?` desugars to conceptually):

```fungi
match Session.create(request.body.token) {
  Ok(s)  => s
  Err(e) => { return Err(e) }
  _      => { /* FUNGI-MATCH-001 mandates a wildcard even here */ }
}
```

## Operators

### Logical / readable operators

Galerina promotes readable keyword operators (`parser.ts:1880-1901`):

| Operator | Meaning | Precedence |
|---|---|---|
| `and` | logical AND (lowers to `&&`) | 20 |
| `or` | logical OR (lowers to `\|\|`) | 10 |
| `is` | equality / readable comparison (lowers to `==`) | 30 |
| `!` | logical NOT (prefix) | unary |

`is` is used for value/pattern equality, e.g. `if nc is '"'` in the self-hosted lexer
(`.../self-hosted/lexer.fungi:227`), and it also supports readable phrasings (`a is not X`,
`a is greater than X`) via `parseIsForm`.

### Comparison & arithmetic

```
comparison:  ==  !=  <  >  <=  >=
arithmetic:  +   -   *   /   %
```

### Bitwise operators are NOT part of `.fungi`

`&`, `|`, `<<`, `>>` in value position are a hard error: `FUNGI-PARSE-001`, verified at
`parser.ts:1906-1930`. The message: *"bit-level operations (AND/OR/shift) live in the
engine/extension layer, not in `.fungi` (the crypto-on-core boundary)."*

```fungi
let mask = a & b        // ❌ FUNGI-PARSE-001
let x    = value << 3   // ❌ FUNGI-PARSE-001
```

Do bit-twiddling in a governed engine extension. (Caveat: `|` is still valid as a **match-arm**
separator `A | B => …`, and `<<`/`>>` are fine in **type** position for generics — those are parsed
by different code paths and never reach the value-operator check. If you need a capability mask, use a
`bitfield` — see [06](06-governance-constructs.md).)

## `emit` — event emission (inside a body)

`emit EventName { field: value }` records a governance event (`parser.ts:5162`). The event name should
be declared in `contract.events {}` (or a top-level `event` declaration) first. From
`examples/auth-service/createSession.fungi:18`:

```fungi
AuditLog.write({ event: "SessionCreated", sessionId: redact(session.sessionId) })
```

and the CANONICAL pattern (`docs/AI/CANONICAL_SYNTAX.md` §7):

```fungi
contract {
  events { OrderPlaced { orderId: String  actorId: String } }
}
...
{
  emit OrderPlaced { orderId: order.id, actorId: request.actorId }
}
```

> Maturity note: `emit`/`event` **parse** and are recorded in the AST, but full runtime event
> integration is a later phase. Emitting an event whose name isn't declared is `FUNGI-EVENT-001`.
> `emit` at top level is `FUNGI-SYNTAX-009` — it must be inside a flow body.

## Common mistakes (control flow)

| Mistake | Why wrong | Fix |
|---|---|---|
| `if a { } else if b { }` | `else if` rejected | `match` (`FUNGI-SYNTAX-010`) |
| `each x in xs { }` | `each` isn't a keyword | `for x in xs { }` |
| `break` / `continue` | future-reserved, not implemented | use a `mut done` flag + loop condition |
| `let m = a & b` | bitwise not in `.fungi` | engine extension, or a `bitfield` mask (`FUNGI-PARSE-001`) |
| `match score { >= 90 => … }` | range patterns are doc-only | `when score >= 90 => …` |
| `emit X` at top level | must be in a body | move inside a flow (`FUNGI-SYNTAX-009`) |
| ignoring a `Result` return | fallible result unhandled | `?` or `match` the `Result` |
| `match r { Ok(v) => … Err(e) => … }` (no `_`) | every match needs a wildcard (`FUNGI-MATCH-001`) | add `_ => { /* audit + deny */ }` |

## Real files to open

* `packages-galerina/galerina-core-compiler/src/self-hosted/lexer.fungi` — the richest real control
  flow: `while`, `match`/`Some`/`None`, `is`, sequential-`if` (no `else if`) dispatch.
* `examples/foundations/validation-utils.fungi` — `trap` + `return` in tiny pure flows.
* `examples/foundations/gate-access-example.fungi` — `trap` guards inside gated flows.

Next: **[08 — Worked examples](08-worked-examples.md)**.
