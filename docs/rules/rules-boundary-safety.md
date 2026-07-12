# Rules: Boundary Safety

Galerina's first proof target is boundary safety.

## Core Statement

```text
A well-checked Galerina program preserves declared boundaries.
```

## Required Guarantees

If a program passes Galerina checks, the direction is that:

- public routes only return declared views/responses
- secret fields cannot appear in public output
- flows only perform declared effects
- required permissions are checked before protected data/action use
- `Option<T>` and `Result<T,E>` cannot be used without handling
- only `Bool` controls ordinary application flow
- target fallback is declared and reported

## Boundary Questions

- Did data cross a boundary without permission?
- Did code perform an action without permission?
- Did uncertainty become a decision without being resolved?
- Did a secret or denied field leave through public output?

## Knowledge Base

See [Boundary Safety Proof](../../../ZTF-Knowledge-Bases/boundary-safety-proof.md).
