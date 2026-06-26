# Boundary Safety Proof

Galerina's first proof target should be boundary safety.

## Short Definition

```text
A well-checked Galerina program preserves declared boundaries.
```

This means protected data stays protected, denied fields stay denied,
undeclared effects do not happen, missing/error values are handled and only
`Bool` controls ordinary flow.

## First Safety Goal

Galerina is not initially trying to prove all software correctness.

Galerina is trying to prove/check:

```text
Data cannot move where it should not move.
Code cannot do things it was not allowed to do.
Missing/error/uncertain values cannot be ignored.
Secrets and sensitive data cannot accidentally escape.
Program structure is understandable to humans, AI and tools.
```

## Core Safety Promises

If a program passes Galerina check, then:

```text
public routes only return declared views/responses
secret fields cannot appear in public output
flows only perform declared effects
required permissions are checked before protected data/action use
Option<T> and Result<T,E> cannot be used without handling
only Bool can control application flow
target fallback is declared and reported
```

## Boundary Questions

The safety question becomes:

```text
Did data cross a boundary without permission?
Did code perform an action without permission?
Did uncertainty become a decision without being resolved?
Did a secret or denied field leave through public output?
```

## Phased Proof Direction

```text
Phase 1: Boundary safety
Phase 2: Type safety
Phase 3: Memory/reference safety
Phase 4: Concurrency safety
Phase 5: Native/interop safety
```

Galerina should start with boundary safety before attempting a Rust-style full
memory proof. The first useful claim is that a checked program preserves
declared application boundaries.

## Reports

Boundary safety should be evidenced through:

```text
data-view-report.json
model-exposure-report.json
permission-effective-report.json
effect-report.json
boundary-report.json
security-report.json
```

## Positioning

Galerina makes application boundaries explicit and checks that code cannot cross
them accidentally.
