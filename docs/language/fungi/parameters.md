# Parameters — reference

> Grounded in: `parser.ts:1033` (`parseParamList`), `parser.ts:1030-1066` (the `readonly`/`tainted`
> qualifiers), `parser.fungi:27-31` (`record FlowParam { name, typeName, isReadonly }`). Real examples:
> `examples/foundations/validation-utils.fungi`, `examples/healthcare/getPatient.fungi`,
> `examples/auth-service/createSession.fungi`, `examples/foundations/comment-styles-example.fungi`.
>
> This is the focused reference for flow **parameters**. For the whole signature see
> [01 — Flows & Functions](01-flows-and-functions.md); for the type language see
> [04 — Types & values](04-types-and-values.md).

## The shape

A parameter list sits between the parentheses of a flow header, comma-separated:

```
<qualifier> flow <name>( <param>, <param>, … ) -> <ReturnType>
```

Each parameter is:

```
[readonly] [tainted] name: Type
```

* **`name`** — a plain identifier. Convention: the primary input to a request-shaped flow is always
  `request` (not `req`) — see the mistakes table.
* **`: Type`** — the type is mandatory. There is no untyped parameter form. `Type` is any type
  reference the type language accepts (below).
* **`readonly`** and **`tainted`** — optional governance qualifiers, in any order, before the name.

The parser reads parameters left to right, tracking `<>` depth in its error recovery so a comma inside
a generic type (`Result<A, B>`) does **not** end the parameter early (`parser.ts:1063-1073`).

## Type options

| Kind | Example parameter | Notes |
|---|---|---|
| Primitive | `age: Int`, `currency: String`, `ok: Bool` | the built-in scalar types |
| Named record / nominal | `readonly request: Request`, `readonly mission: MissionPlan` | a `type`/`record` you declared at the top of the file |
| Generic | `values: Array<Int>`, `pair: Result<Session, SessionError>` | type constructors with arguments; commas inside `<…>` are safe |
| Governed nominal | `secret: SecureString`, `amount: Money<GBP>` | a nominal type that carries governance (unit, secrecy) into the parameter — see [Governed-type parameters](#governed-type-parameters) |

From `examples/foundations/validation-utils.fungi` — a primitive parameter:

```fungi
pure flow validateAge(age: Int) -> Bool
contract { intent "Check age is within acceptable range" effects {} }
{
  trap age < 0 : ERR_NEGATIVE_AGE
  return true
}
```

From `examples/foundations/comment-styles-example.fungi:45` — two primitives:

```fungi
governed floor_3 flow validatePaymentAmount(amount: Int, currency: String) -> Bool
```

## `readonly` — a read-only view

`readonly` marks the parameter as a value the flow **may not mutate** — the caller keeps ownership and
the flow gets a read-only view (`parser.ts:1030-1066`; captured as `FlowParam.isReadonly = true`,
`parser.fungi:469`). Use it for every request/input object a flow only inspects. It is the default
posture for request parameters:

```fungi
guarded flow getPatientSummary(readonly request: PatientSummaryRequest) -> PatientSummaryResult
```

Omitting `readonly` on a request-shaped input is a common lint miss — prefer `readonly request: T`.

## `tainted` — untrusted input

`tainted` marks the parameter as **untrusted** so the taint / governed-sink checks fire on any value
derived from it: a tainted value cannot reach a protected sink until it has passed a recognized gate
(see [05 — Bindings, taint & privacy](05-bindings-taint-privacy.md)).

```fungi
secure flow handleWebhook(tainted data: RawPayload) -> Result<Ack, WebhookError>
```

`readonly` and `tainted` are independent and may combine (`readonly tainted body: RawPayload`) — the
value is both un-mutable by the flow and tracked as untrusted.

## Governed-type parameters

A parameter's *type* can carry governance, which then applies at the boundary — the zero-trust payoff
of typed parameters:

* **`SecureString` / `Secret`** — the value is secrecy-tracked; it cannot be logged or returned in the
  clear, only `redact`-ed or passed to a permitted sink.
* **`Money<GBP>`** and other value-unit types — the unit is part of the type, so `Money<GBP>` and
  `Money<USD>` are distinct and cannot be added or silently coerced (value conservation at the type
  level).
* A `tainted` primitive plus a governed sink gives input-validation-at-the-type-level: the compiler,
  not a runtime check, refuses the unvalidated path.

Because the type does the enforcing, a governed parameter needs no extra annotation beyond its type —
declare `amount: Money<GBP>` and the unit rules follow.

## Not supported yet

These parameter features are **absent** from the current parser — do not reach for them; they parse as
errors, not silently:

| Feature | Status |
|---|---|
| Default values (`age: Int = 0`) | not supported |
| Named / keyword call-arguments | not supported (arguments are positional) |
| Optional parameters (`name?: Type`) | not supported |
| Variadic (`…rest: Array<T>`) | not supported |

A parameter constraint form (`amount: Int where <expr>`, evaluated as a three-valued admission that
fails closed on INDETERMINATE) is a proposed enhancement, not current syntax.

## Common mistakes

| Mistake | Why wrong | Fix |
|---|---|---|
| `getUser(req: Request)` | `req` abbreviation | use `request` |
| `f(request: T)` on an input a flow only reads | request inputs should be read-only | `readonly request: T` |
| `f(name)` (no type) | every parameter needs a type | `f(name: String)` |
| `f(amount: Int = 0)` | defaults are not supported | drop the default; pass the value explicitly |
| `f(data: Money<GBP>)` then `data + otherUsd` | units don't mix | keep one unit, or convert through an explicit flow |

## Real files to open

* `examples/foundations/validation-utils.fungi` — primitive parameters, the cleanest start.
* `examples/healthcare/getPatient.fungi` — a `readonly` request parameter end to end.
* `examples/auth-service/createSession.fungi` — a `readonly request: Request` on a `secure flow`.
* `examples/foundations/comment-styles-example.fungi` — two primitives on a `governed` flow.

Next: **[02 — Contracts](02-contracts.md)**.
