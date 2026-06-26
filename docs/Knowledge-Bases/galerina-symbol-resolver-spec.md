# Galerina Symbol Resolver Specification

## Status

```text
Symbol resolver: specified - implementation Phase 7A
Implementation:   packages-galerina/galerina-core-compiler/src/symbol-resolver.ts
Export:           resolveSymbols(ast: AstNode): SymbolResolveResult
```

This document defines the Galerina symbol resolver pass and the `SPORE-NAME-*`
diagnostics emitted for name resolution failures.

---

## TL;DR
- Runs before the type checker — checks names in expression position
- Flow names are program-scope (hoisted); binding names are block-scope (sequential)
- Capital-letter identifiers are suppressed from SPORE-NAME-001 (stdlib modules)

---

## Rules at a Glance

- Symbol resolver runs before the type checker.
- It checks names in expression position; the type checker checks names in type
  position.
- Flow names are program-scope and hoisted; binding names are block-scope and
  sequential.
- Standard prelude names are always in scope and never emit `SPORE-NAME-001`.
- Shadowing an outer scope is `SPORE-TYPE-020` warning; duplicate declaration in
  the same scope is `SPORE-NAME-002` error.
- `fn` exists only inside flow bodies; top-level `fn` is `SPORE-SYNTAX-005`, not a
  name error.

---

## Purpose

The symbol resolver answers one question for every identifier in expression
position:

```text
Is this name defined in the current scope?
```

It runs after parsing and before type checking. Its job is existence and scope,
not type compatibility, value-state, effects, imports, or governance policy.

The symbol resolver produces a resolved name environment for later passes and
emits `SPORE-NAME-*` diagnostics for undeclared names, duplicate names, and related
module-resolution errors.

## Pipeline Position

```text
Source
  |
  v
Parser
  |
  v
AST
  |
  v
Symbol Resolver
  |
  v
Resolved AST
  |
  v
Type Checker
  |
  v
Value-State Checker
  |
  v
Effect Checker
  |
  v
GIR Emission
```

The resolver operates on the full AST produced by the parser. It must not emit
type diagnostics for `typeRef` nodes; those belong to the type checker.

---

## Scope Model

The resolver uses a stack of maps:

```typescript
Array<Map<string, SymbolEntry>>
```

Each map represents one lexical scope:

```text
name -> SymbolEntry
```

The stack grows on scope entry and shrinks on scope exit.

Scope boundaries:

| Boundary | Action |
|---|---|
| `flowDecl` | push on entry, pop on exit |
| `secureFlowDecl` | push on entry, pop on exit |
| `pureFlowDecl` | push on entry, pop on exit |
| `guardedFlowDecl` | push on entry, pop on exit |
| `block` | push on entry, pop on exit |
| `fnDecl` | push on entry, pop on exit |

Flow parameters are registered in the flow's own scope, not in program scope.
Local bindings are registered in the current block scope. A local `fn` name is
registered in the enclosing flow scope so it can be called from that flow body.

### SymbolEntry

```typescript
interface SymbolEntry {
  name: string;
  kind: "flow" | "type" | "enum" | "record" | "binding" | "parameter" | "fn";
  location: SourceLocation;
  safetyPrefix?: "unsafe" | "safe";
  typeName?: string;
}
```

`safetyPrefix` and `typeName` are captured for later tooling, but the symbol
resolver only decides whether the name exists and whether it is duplicated in the
same scope.

---

## Registered Symbols

### First Pass: Program Declarations

The first pass collects declarations that are visible from program scope:

| AST node | Registered kind |
|---|---|
| `flowDecl` | `flow` |
| `secureFlowDecl` | `flow` |
| `pureFlowDecl` | `flow` |
| `guardedFlowDecl` | `flow` |
| `typeDecl` | `type` |
| `enumDecl` | `enum` |
| `recordDecl` | `record` |

Flow and type declarations are hoisted for name resolution. A flow can call
another flow before its textual declaration without triggering
`SPORE-NAME-003`.

### Second Pass: Body Walk

The second pass walks into flow bodies and nested blocks:

| AST node | Registered kind | Scope |
|---|---|---|
| `paramDecl` | `parameter` | current flow or fn scope |
| `letDecl` | `binding` | current block scope |
| `mutDecl` | `binding` | current block scope |
| `readonlyDecl` | `binding` | current block scope |
| `fnDecl` | `fn` | enclosing flow scope |

Binding declarations are sequential. A binding is available only after its
declaration point in the current block.

---

## Standard Prelude

The Galerina standard prelude provides names that are always available. These names
must not trigger `SPORE-NAME-001`.

### Constructor Values

```text
None
Some
Ok
Err
```

### Boolean Literals

`true` and `false` are lexer keywords, but they are included here for
completeness.

### Value-State Gate Functions

From `stdlib-gates.yaml`:

```text
validate
sanitize
json
toml
parse
redact
constantTimeEquals
declassify
```

### Standard Library Modules

```text
http
https
fs
File
FileSystem
AuditLog
Env
env
shell
DB
Logger
log
console
print
```

`DB` is a generic database prefix. Any identifier matching `*DB` is treated as a
predeclared standard-library reference during Phase 7A.

### Type Constructors

```text
Money
Tensor
Brand
Option
Result
Array
Set
Map
Channel
```

### Standard Error Constructors and Helpers

```text
Error
ApiError
ValidationError
EmailError
PaymentError
WebhookError
DecodeError
```

### Numeric Constructors

```text
Decimal
Int
Float
```

### Format and String Helpers

```text
format
toString
```

### Phase 7A Suppressions

Until the standard library is formally declared, the resolver suppresses
`SPORE-NAME-001` for capitalized identifiers matching these suffixes:

```text
*DB
*Model
*Service
*Client
*Adapter
*Provider
```

Examples:

```galerina
OrdersDB.insert(order)
FraudModel.run(input)
EmailService.send(email)
PaymentClient.charge(amount)
LedgerAdapter.write(entry)
RatesProvider.lookup("GBP")
```

These are Phase 7A suppressions to reduce diagnostic noise. They should be
tightened when the stdlib and module import system are formalised.

---

## Diagnostics

## SPORE-NAME-001: UNDECLARED_NAME

Trigger:

An `identifier` node in expression position has a `.value` that is not present
in any enclosing scope and is not part of the standard prelude.

Do not trigger for:

- `typeRef` nodes; unknown types are `SPORE-TYPE-001`.
- Names in the standard prelude.
- Constructor values: `None`, `Some`, `Ok`, `Err`.
- Flow names collected in program scope.
- Phase 7A prelude suppressions such as `OrdersDB`, `FraudModel`, and
  `EmailService`.

Valid:

```galerina
flow findUser(userId: UserId) -> Option<User> {
  return UsersDB.find(userId)
}

pure flow labelUser(userId: UserId) -> String {
  let user = findUser(userId)
  return format("user: " + toString(user))
}
```

`findUser` is a declared flow. `format` and `toString` are prelude helpers.

Invalid:

```galerina
pure flow calculate() -> Int {
  let x = undeclaredHelper(42)
  return x
}
```

Diagnostic:

```text
SPORE-NAME-001 UNDECLARED_NAME
'undeclaredHelper' is not declared in the current scope.
```

Suggested fix:

```text
Declare 'undeclaredHelper' in scope, import it when modules are available, or
replace it with a declared flow, fn, or binding.
```

## SPORE-NAME-002: DUPLICATE_NAME

Trigger:

A `letDecl`, `mutDecl`, or `readonlyDecl` declares a name already present in the
same scope level.

Do not trigger for:

- A binding in an inner block that shadows an outer binding. That is
  `SPORE-TYPE-020` warning.
- Flow declarations with the same name; duplicate top-level declarations are
  parser or declaration-collection errors.
- Type names in type position.

Invalid:

```galerina
pure flow duplicateLocal() -> Int {
  let x: Int = 1
  let x: String = "hello"
  return 1
}
```

Diagnostic:

```text
SPORE-NAME-002 DUPLICATE_NAME
'x' is already declared in this scope.
```

Valid shadowing case:

```galerina
pure flow shadowOuter() -> Int {
  let x: Int = 1
  {
    let x: Int = 2
    return x
  }
}
```

This is not `SPORE-NAME-002`; it is handled by `SPORE-TYPE-020` as a warning.

Suggested fix:

```text
Rename one binding or move the second declaration into a narrower block when
shadowing is intentional.
```

CEC mapping: `docs/Examples/Level-1-Basics/006-mut-binding` is the valid base
form. An invalid extension is:

```galerina
mut count: Int = 0
let count: String = "zero"  // SPORE-NAME-002 in the same scope
```

## SPORE-NAME-003: USE_BEFORE_DECLARATION

Trigger:

An identifier is referenced before its `letDecl` or `mutDecl` declaration point
in the same sequential block.

Do not trigger for:

- Flow names; flows are hoisted at program scope.
- Type names; type resolution belongs to the type checker.
- Bindings from enclosing scopes that are already declared before the current
  block begins.
- Standard prelude names.

Invalid:

```galerina
pure flow beforeDecl() -> Int {
  let y = x + 1
  let x: Int = 5
  return y
}
```

Diagnostic:

```text
SPORE-NAME-003 USE_BEFORE_DECLARATION
'x' is used before its declaration.
```

Valid flow hoisting:

```galerina
pure flow caller(value: Int) -> Int {
  return addOne(value)
}

pure flow addOne(value: Int) -> Int {
  return value + 1
}
```

Suggested fix:

```text
Move the binding declaration before its first use, or pass the value as a
parameter.
```

## SPORE-NAME-004: PRIVATE_ACCESS

Trigger:

A name from another module is accessed without an import or is not exported from
its defining module.

Phase 7A status:

```text
Deferred - module imports and export visibility are not implemented yet.
```

Do not trigger for:

- Names in the current file.
- Standard prelude names.
- Phase 7A standard-library suppressions.

Invalid future form:

```galerina
flow loadOrder(id: OrderId) -> Result<Order, ApiError> {
  return internalOrders.load(id)
}
```

If `internalOrders` belongs to another module and was not imported or exported,
this becomes `SPORE-NAME-004`.

Suggested fix:

```text
Import the module and access an exported name, or make the declaration public in
the defining module.
```

## SPORE-NAME-005: AMBIGUOUS_NAME

Trigger:

Two declarations with the same name are visible through separate import paths and
the compiler cannot determine which one is intended.

Phase 7A status:

```text
Deferred - module imports and aliasing are not implemented yet.
```

Do not trigger for:

- Same-scope duplicate local bindings; those are `SPORE-NAME-002`.
- Outer-scope shadowing; that is `SPORE-TYPE-020`.
- Overloaded constructors in the standard prelude until overload resolution is
  formalised.

Invalid future form:

```galerina
import Email from "crm"
import Email from "notifications"

flow send(input: Email) -> Result<Unit, EmailError> {
  return EmailService.send(input)
}
```

Suggested fix:

```text
Use an explicit import alias or qualify the name with its module path.
```

---

## Interaction with Other Checkers

### Symbol Resolver vs. Type Checker

The symbol resolver checks identifier existence in expression position.

The type checker checks type names in type position:

```text
typeRef -> SPORE-TYPE-001 when unknown
identifier expression -> SPORE-NAME-001 when unknown
```

The two passes must not double-fire on the same source token. For example,
`let x: UnknownType = 1` is a type-checker error, not a symbol-resolver error.

### Symbol Resolver vs. Value-State Checker

The value-state checker tracks binding state such as `unsafe let` and
`safe mut`. The symbol resolver tracks whether the binding exists and whether it
is duplicated in the same scope.

Both passes use scope stacks, but they are separate passes with separate
responsibilities.

### Symbol Resolver vs. Effect Checker

The effect checker works from `FlowMeta` plus the full AST to infer direct and
transitive effects. The symbol resolver does not decide whether calls are
effectful.

There is no diagnostic overlap:

```text
undeclared call target -> SPORE-NAME-001
declared effectful call in pure flow -> SPORE-EFFECT-003
missing declared effect -> SPORE-EFFECT-001 / SPORE-EFFECT-002
```

---

## Compiler Status

```text
Symbol resolver: specified - implementation Phase 7A
Implementation:   packages-galerina/galerina-core-compiler/src/symbol-resolver.ts
Export:           resolveSymbols(ast: AstNode): SymbolResolveResult
```

Public interface:

```typescript
export interface SymbolDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  readonly suggestedCode?: string;
}

export interface SymbolResolveResult {
  readonly diagnostics: readonly SymbolDiagnostic[];
}

export function resolveSymbols(ast: AstNode): SymbolResolveResult;
```

---

## CEC Example Mapping

| Diagnostic | CEC mapping |
|---|---|
| `SPORE-NAME-001` | Custom example: identifier used but never declared, such as `undeclaredHelper(42)` |
| `SPORE-NAME-002` | `docs/Examples/Level-1-Basics/006-mut-binding`, extended with a duplicate `count` declaration |
| `SPORE-NAME-003` | Custom example: `let y = x + 1` before `let x: Int = 5` |
| `SPORE-NAME-004` | Pending module-system example; imports not implemented in Phase 7A |
| `SPORE-NAME-005` | Pending module-system example; ambiguous imports not implemented in Phase 7A |

Related Level 1 examples:

- `docs/Examples/Level-1-Basics/004-local-fn-helper` demonstrates valid local
  `fn` scope inside a flow.
- `docs/Examples/Level-1-Basics/006-mut-binding` demonstrates valid mutable
  binding declaration and later use.
- `docs/Examples/Level-1-Basics/020-invalid-fn-top-level` demonstrates that a
  top-level `fn` is syntax invalid (`SPORE-SYNTAX-005`), not a name-resolution
  failure.

---

## See Also

- `docs/Knowledge-Bases/compiler-diagnostics.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/ast-value-encoding.md`
- `docs/Knowledge-Bases/flow-vs-fn-security-model.md`
- `docs/Knowledge-Bases/value-state-annotations.md`
- `docs/Knowledge-Bases/effect-checker-and-boundary-checker.md`
- `docs/Knowledge-Bases/galerina-glossary.md`
- `packages-galerina/galerina-core-compiler/src/symbol-resolver.ts`
