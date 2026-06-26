# Galerina Compiler Pipeline

## Status

```text
Authoritative compiler pass order
Applies to: Galerina v1 / Phase 7A+
```

This document defines the ordered Galerina compiler pipeline, including pass
inputs, outputs, diagnostic ownership, stopping rules, and execution modes.

---

## Rules at a Glance

- Lexer and parser always complete and return recoverable output where possible.
- Checker passes collect all diagnostics and continue; they do not stop at the
  first error.
- GIR emission runs only when checker passes produce zero errors.
- Backend lowering runs only from clean GIR.
- Runtime execution runs only from clean backend IR and emits an audit record.
- Individual pass functions are exposed today; a unified `compile()` entry point
  is planned.

---

## TL;DR
- Passes 1–7 collect diagnostics and continue — they do not stop on first error
- GIR emission (Pass 8) runs only when all checker passes produce zero errors
- Passes 7–10 are prototype-implemented: governance-verifier.ts, gir-emitter.ts, wat-emitter.ts, runtime/
- The current compiler exposes individual pass functions — a unified `compile()` is planned

---

## Overview

```text
Source (.spore file)
  |
  v
Pass 1: Lexer
  -> Token stream
  |
  v
Pass 2: Parser
  -> AST + FlowMeta + ParseDiagnostics
  |
  v
Pass 3: Symbol Resolver
  -> Resolved AST + SymbolDiagnostics
  |
  v
Pass 4: Type Checker
  -> Type-annotated AST + TypeDiagnostics
  |
  v
Pass 5: Value-State Checker
  -> ValueStateDiagnostics
  |
  v
Pass 6: Effect Checker
  -> EffectDiagnostics
  |
  v
Pass 7: Governance Verifier
  -> GovernanceDiagnostics
  |
  v
Pass 8: GIR Emitter
  -> Governed IR (YAML/JSON)
  |
  v
Pass 9: Backend Lowering
  -> Backend IR (TypeScript / WASM / GPU kernel / etc.)
  |
  v
Pass 10: Runtime Execution
  -> Result + Audit Record
```

---

## Pass Table

| Pass | Name | Input | Output | Diagnostics | Status | Source file |
|---|---|---|---|---|---|---|
| 1 | Lexer | source text + file path | token stream + lexer diagnostics | `SPORE-SYNTAX-*`, `SPORE-CHAR-*`, parse-adjacent lexical diagnostics | implemented | `packages-galerina/galerina-core-compiler/src/lexer.ts` |
| 2 | Parser | token stream | `AstNode`, `FlowMeta[]`, `ParseDiagnostic[]` | `SPORE-PARSE-*`, `SPORE-SYNTAX-*` | implemented | `packages-galerina/galerina-core-compiler/src/parser.ts` |
| 3 | Symbol Resolver | AST | resolved AST metadata + `SymbolDiagnostic[]` | `SPORE-NAME-*` | Phase 7A | `packages-galerina/galerina-core-compiler/src/symbol-resolver.ts` |
| 4 | Type Checker | AST | type-annotated AST metadata + `TypeDiagnostic[]` | `SPORE-TYPE-*`, `SPORE-MATCH-*` aliases where applicable | Phase 7A | `packages-galerina/galerina-core-compiler/src/type-checker.ts` |
| 5 | Value-State Checker | AST | value-state diagnostics and binding-state evidence | `SPORE-VALUESTATE-*`, `SPORE-SECRET-*`, `SPORE-SAFETY-*` | Phase 7A | `packages-galerina/galerina-core-compiler/src/value-state-checker.ts` |
| 6 | Effect Checker | `FlowMeta[]` + AST | `EffectCheckResult[]` | `SPORE-EFFECT-*` | Phase 7A | `packages-galerina/galerina-core-compiler/src/effect-checker.ts` |
| 7 | Governance Verifier | checked AST + checker evidence | governance diagnostics and proof obligations | `SPORE-INTENT-*`, `SPORE-GOV-*`, `SPORE-PII-*`, `SPORE-PHI-*`, `SPORE-AUDIT-*` | prototype implemented | `packages-galerina/galerina-core-compiler/src/governance-verifier.ts` |
| 8 | GIR Emitter | clean checked AST + checker evidence | Governed IR YAML/JSON | emitter/report diagnostics only | prototype implemented | `packages-galerina/galerina-core-compiler/src/gir-emitter.ts` |
| 9 | Backend Lowering (WAT) | GIR | WAT text + assembled WASM bytes | `SPORE-BACKEND-*`, `SPORE-TARGET-*`, `SPORE-NPU-*`, `SPORE-PHOTONIC-*` | prototype implemented | `packages-galerina/galerina-core-compiler/src/wat-emitter.ts`, `packages-galerina/galerina-core-compiler/src/wat-assembler.ts` |
| 10 | Runtime Execution | backend IR + runtime manifest | execution result + audit/proof record | `SPORE-RUNTIME-*` | prototype implemented | `packages-galerina/galerina-core-compiler/src/runtime/index.ts` |

---

## Pass Details

## Pass 1: Lexer

Input:

```text
source: string
file: string
```

Output:

```text
Token[]
lexical diagnostics
```

Diagnostic series:

```text
SPORE-SYNTAX-*
SPORE-CHAR-*
SPORE-PARSE-* for scanner-level parse-adjacent errors
```

Status:

```text
implemented
```

Source:

```text
packages-galerina/galerina-core-compiler/src/lexer.ts
```

The lexer classifies keywords, identifiers, literals, comments, operators, and
symbols. It records source locations and continues after recoverable lexical
diagnostics where possible.

## Pass 2: Parser

Input:

```text
Token[]
```

Output:

```typescript
interface ParseResult {
  ast: AstNode;
  flows: readonly FlowMeta[];
  diagnostics: readonly ParseDiagnostic[];
}
```

Diagnostic series:

```text
SPORE-PARSE-*
SPORE-SYNTAX-*
```

Status:

```text
implemented
```

Source:

```text
packages-galerina/galerina-core-compiler/src/parser.ts
```

The parser emits an AST and extracts `FlowMeta` for downstream checkers. It
recovers from malformed declarations and returns a partial AST when possible.

## Pass 3: Symbol Resolver

Input:

```text
AstNode
```

Output:

```typescript
interface SymbolResolveResult {
  diagnostics: readonly SymbolDiagnostic[];
}
```

Diagnostic series:

```text
SPORE-NAME-*
```

Status:

```text
Phase 7A
```

Source:

```text
packages-galerina/galerina-core-compiler/src/symbol-resolver.ts
```

The symbol resolver checks expression-position identifiers against lexical
scopes and the standard prelude. It does not validate type names.

## Pass 4: Type Checker

Input:

```text
AstNode
```

Output:

```typescript
interface TypeCheckResult {
  diagnostics: readonly TypeDiagnostic[];
}
```

Diagnostic series:

```text
SPORE-TYPE-*
SPORE-MATCH-* where surfaced as match aliases
```

Status:

```text
Phase 7A
```

Source:

```text
packages-galerina/galerina-core-compiler/src/type-checker.ts
```

The type checker validates type references, generic arity, invalid null and
undefined usage, binding shadowing warnings, and basic match exhaustiveness.

## Pass 5: Value-State Checker

Input:

```text
AstNode
```

Output:

```typescript
interface ValueStateCheckResult {
  diagnostics: readonly ValueStateDiagnostic[];
}
```

Diagnostic series:

```text
SPORE-VALUESTATE-*
SPORE-SECRET-*
SPORE-SAFETY-*
```

Status:

```text
Phase 7A
```

Source:

```text
packages-galerina/galerina-core-compiler/src/value-state-checker.ts
```

The value-state checker verifies unsafe-to-safe transitions, governed sinks,
secret logging restrictions, and secret equality restrictions.

## Pass 6: Effect Checker

Input:

```text
FlowMeta[]
AstNode
```

Output:

```typescript
readonly EffectCheckResult[]
```

Diagnostic series:

```text
SPORE-EFFECT-*
```

Status:

```text
Phase 7A
```

Source:

```text
packages-galerina/galerina-core-compiler/src/effect-checker.ts
```

The effect checker validates direct effects, transitive effects, pure-flow
boundaries, canonical effect names, and guarded/secure flow declarations.

## Pass 7: Governance Verifier

Input:

```text
checked AST
symbol, type, value-state, and effect evidence
```

Output:

```text
GovernanceDiagnostics
proof obligations
intent and policy status
```

Diagnostic series:

```text
SPORE-INTENT-*
SPORE-GOV-*
SPORE-PII-*
SPORE-PHI-*
SPORE-AUDIT-*
```

Status:

```text
prototype implemented
```

Source:

```text
packages-galerina/galerina-core-compiler/src/governance-verifier.ts
```

The governance verifier checks intent, policy blocks, authority declarations,
protected data sharing, audit proof requirements, and target governance rules.

## Pass 8: GIR Emitter

Input:

```text
clean checked AST
checker evidence
governance proof results
```

Output:

```text
Governed IR (YAML/JSON)
```

Diagnostic series:

```text
emitter/report diagnostics only
```

Status:

```text
prototype implemented
```

Source:

```text
packages-galerina/galerina-core-compiler/src/gir-emitter.ts
```

The GIR emitter serializes the verified governance contract. It must not run
when checker errors remain.

## Pass 9: Backend Lowering

Input:

```text
Governed IR
```

Output:

```text
Backend IR or target package input
```

Diagnostic series:

```text
SPORE-BACKEND-*
SPORE-TARGET-*
SPORE-NPU-*
SPORE-PHOTONIC-*
SPORE-TENSOR-*
SPORE-QUANT-*
```

Status:

```text
prototype implemented (WAT/WASM path)
```

Source:

```text
packages-galerina/galerina-core-compiler/src/wat-emitter.ts   (WAT text emission)
packages-galerina/galerina-core-compiler/src/wat-assembler.ts (WAT → WASM assembly)
packages-galerina/galerina-core-compiler/src/lowering-plan.ts (lowering plan)
```

Backend lowering translates GIR into target-specific representations such as
TypeScript, WASM, GPU kernels, NPU plans, photonic bridge IR, or future quantum
bridge IR. The WAT/WASM path is prototype-implemented; GPU, NPU, and photonic
paths remain planned.

## Pass 10: Runtime Execution

Input:

```text
backend IR
runtime manifest
approved execution plan
```

Output:

```text
Result
Audit Record
Runtime Proof
```

Diagnostic series:

```text
SPORE-RUNTIME-*
```

Status:

```text
prototype implemented
```

Source:

```text
packages-galerina/galerina-core-compiler/src/runtime/index.ts
packages-galerina/galerina-core-compiler/src/runtime/runtimeContext.ts
packages-galerina/galerina-core-compiler/src/runtime/contractEnforcer.ts
packages-galerina/galerina-core-compiler/src/runtime/executionPlan.ts
packages-galerina/galerina-core-compiler/src/runtime/capabilityHost.ts
```

Runtime execution is coordinated by the Governed Execution Director. The runtime
may optimise scheduling, batching, memory layout, and approved target selection;
it may not change security, effects, validation, redaction, authority, or program
meaning.

---

## Error Stopping Rules

Passes 1-2 always complete:

```text
Lexer and parser return diagnostics plus the best recoverable token stream or
partial AST.
```

Passes 3-7 collect diagnostics:

```text
Symbol resolver, type checker, value-state checker, effect checker, and
governance verifier continue after recoverable errors. They do not stop at the
first error.
```

Pass 8 requires zero checker errors:

```text
GIR emission runs only when passes 3-7 produce zero errors.
Warnings may be included in the compile report, but successful GIR cannot encode
known semantic violations.
```

Pass 9 requires clean GIR:

```text
Backend lowering only runs when GIR is structurally valid and all proof
obligations required for lowering are satisfied.
```

Pass 10 requires clean backend IR:

```text
Runtime execution only runs from approved backend IR and emits an audit record.
```

---

## Pipeline Entry Points

The current compiler exposes individual pass functions:

```typescript
parseProgram(source, file) -> ParseResult
resolveSymbols(ast) -> SymbolResolveResult
checkTypes(ast) -> TypeCheckResult
checkValueStates(ast) -> ValueStateCheckResult
checkEffects(flows, ast) -> EffectCheckResult[]
```

Future unified entry point:

```typescript
interface CompileResult {
  ast: AstNode;
  gir?: GIR;
  diagnostics: AllDiagnostics;
  status: "ok" | "warnings" | "errors";
}

function compile(source: string, file: string): CompileResult;
```

`status` semantics:

| Status | Meaning |
|---|---|
| `ok` | No diagnostics with severity `error` or `warning`; GIR may be emitted. |
| `warnings` | No errors, but warnings or info diagnostics exist; GIR may be emitted if warnings are policy-allowed. |
| `errors` | One or more errors exist; GIR and backend IR must not be emitted. |

---

## Runtime Mode vs. Check-Only Mode

### check-only

```text
runs passes 1-7
returns diagnostics
does not emit GIR
does not lower
does not execute
```

Use this mode for editors, CI validation, and AI repair loops.

### compile

```text
runs passes 1-9
returns diagnostics
emits GIR
emits backend IR
does not execute
```

Use this mode for builds, deployment preparation, manifest generation, and
target package validation.

### run

```text
runs passes 1-10
returns diagnostics
emits GIR and backend IR
executes the program
emits result and audit proof
```

Use this mode for governed runtime execution.

---

## Relationship to Manifest Generation

`galerina-core-manifest-generation-v02.md` specifies a later manifest aggregation
step. The manifest is derived from clean GIR, routes, functions, effect graph,
and boundaries. It is a runtime deployment artifact, not a replacement for GIR.

---

## See Also

- `docs/Knowledge-Bases/neutral-governed-ir.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/galerina-ast-to-gir.md`
- `docs/Knowledge-Bases/galerina-symbol-resolver-spec.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/effect-checker-and-boundary-checker.md`
- `docs/Knowledge-Bases/governed-execution-director.md`
- `docs/Knowledge-Bases/galerina-core-manifest-generation-v02.md`
