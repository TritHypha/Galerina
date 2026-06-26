# Galerina V1 Reserved Keyword Table

## Purpose

This document is the authoritative source for keyword reservation in the Galerina
v1 language. The Phase 4 lexer must keep its keyword sets in sync with this
file. Active keywords are emitted as `keyword` tokens and cannot be used as
identifiers.

Do not add `None`, `Some`, `Ok`, or `Err` to the keyword set. They are
constructor identifiers used by `Option` and `Result`.

## V1 Active Keywords

These words are active in the v1 grammar and must match
`V1_ACTIVE_KEYWORDS` in `packages-galerina/galerina-core-compiler/src/lexer.ts`.

| Keyword | Category | Description |
|---|---|---|
| `flow` | Flow declaration | Governed execution unit |
| `secure` | Flow qualifier | Secure trust-boundary flow |
| `pure` | Flow qualifier | Deterministic flow with no effects |
| `guarded` | Flow qualifier | Effectful flow with declared effects |
| `privileged` | Flow qualifier | Flow requiring elevated authority |
| `unsafe` | Flow/value-state/safety | Unsafe code or boundary-origin value marker |
| `experimental` | Flow qualifier | Non-production or feature-flagged code |
| `fn` | Local helper | Helper function inside a flow body only |
| `route` | Entry point | External entry point declaration |
| `effects` | Flow clause | Effect declaration list |
| `with` | Flow clause | Alternate syntax in `with effects [...]` |
| `intent` | Flow clause | Governed intent declaration |
| `governance` | Governance | Governance declaration block |
| `api` | Declaration | API surface declaration |
| `package` | Declaration | Package declaration |
| `authority` | Governance | Authority declaration block |
| `policy` | Governance | Policy declaration block |
| `let` | Binding | Immutable binding |
| `mut` | Binding | Mutable binding |
| `readonly` | Binding | Read-only binding or parameter |
| `match` | Control flow | Exhaustive pattern match |
| `if` | Control flow | Conditional branch |
| `else` | Control flow | Alternate branch |
| `return` | Control flow | Return from flow or fn |
| `type` | Declaration | Type declaration |
| `record` | Declaration | Record type declaration |
| `enum` | Declaration | Enum declaration |
| `import` | Declaration | Module import |
| `use` | Declaration | Capability or module use |
| `true` | Literal | Boolean literal |
| `false` | Literal | Boolean literal |
| `borrow` | Memory | Immutable or mutable temporary access |
| `move` | Memory | Explicit ownership transfer |
| `pinned` | Memory | Memory locked for DMA or accelerator transfer |
| `block` | Safety | Part of `unsafe block` |
| `fallback` | Safety | Required unsafe-block fallback declaration |
| `reason` | Safety | Required unsafe-block justification |
| `safe` | Value-state | Value has passed a recognised gate or safe source |
| `validated` | Value-state | Value has passed explicit validation |
| `unvalidated` | Value-state | Value has not yet been validated |
| `tainted` | Value-state | Value is derived from unsafe input |
| `secret` | Value-state | Secret value with restricted operations |
| `protected` | Type governance/value-state | Validated but sensitivity-restricted value |
| `redacted` | Type governance | Masked safe-output representation |
| `compute` | Compute planning | Compute target block opener |
| `target` | Compute planning | Reserved word in `compute target` blocks |
| `contract` | Flow Contract | Flow-local metadata block (types, intent, events) |
| `emit` | Flow Contract | Emit an event inside a flow body: `emit EventName` |
| `emits` | Flow Contract | Declare an event in contract.events: `emits EventName` |
| `event` | Flow Contract | Declare a global event: `event EventName` |
| `types` | Flow Contract | Sub-block for flow-local type aliases inside contract |
| `and` | Readable Logic Forms | Alias for `&&` — `a and b` → `a && b` |
| `or` | Readable Logic Forms | Alias for `\|\|` — `a or b` → `a \|\| b` |
| `unless` | Readable Logic Forms | Negated if — `unless COND {}` → `if !COND {}` |
| `is` | Readable Logic Forms | Equality/comparison alias — `a is b` → `a == b`; `a is greater than b` → `a > b` |

Note: `and`, `or`, `unless`, `is` were previously in V1_FUTURE_RESERVED.
Moved to V1_ACTIVE_KEYWORDS in Phase 9C (Readable Logic Forms implementation).

## V1 Future-Reserved Keywords

These words are reserved for planned grammar and must match
`V1_FUTURE_RESERVED` in `packages-galerina/galerina-core-compiler/src/lexer.ts`.
They must not overlap with `V1_ACTIVE_KEYWORDS`.

| Keyword | Intended future use |
|---|---|
| `shared` | Shared memory allocation across compute targets |
| `transfer` | Explicit ownership transfer across memory domains |
| `remote` | Remote borrow across distributed nodes |
| `atomic` | Atomic memory operation |
| `barrier` | Synchronisation barrier |
| `async` | Async flow syntax |
| `await` | Async expression syntax |
| `yield` | Generator or stream yield |
| `comptime` | Compile-time evaluation |
| `macro` | Macro definition, if adopted |
| `trait` | Trait or protocol type system feature |
| `impl` | Trait implementation |
| `where` | Generic constraint clause |
| `for` | Iteration syntax, if adopted |
| `while` | Loop syntax, if adopted |
| `loop` | Unconditional loop syntax, if adopted |
| `break` | Loop exit |
| `continue` | Loop iteration skip |

## Lexer Rule

```text
For each identifier-shaped token:
  1. Check V1_ACTIVE_KEYWORDS -> emit TokenKind.keyword
  2. Check V1_FUTURE_RESERVED -> emit SPORE-SYNTAX-003 and TokenKind.keyword
  3. Otherwise -> emit TokenKind.identifier
```

## Diagnostic Codes

| Code | Meaning |
|---|---|
| `SPORE-SYNTAX-001` | `var` used; not a valid Galerina binding keyword |
| `SPORE-SYNTAX-002` | `const` used; use `let` or `readonly` |
| `SPORE-SYNTAX-003` | Future-reserved keyword used as identifier |
| `SPORE-SYNTAX-004` | Active keyword used as identifier |

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `docs/Knowledge-Bases/v1-reserved-keywords.md` | Human-readable keyword source of truth |
| `packages-galerina/galerina-core-compiler/src/lexer.ts` | Runtime keyword sets used by lexer |
| `packages-galerina/galerina-core/src/index.ts` | Shared token and AST contracts |

