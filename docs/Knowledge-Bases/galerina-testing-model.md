# Galerina — Testing Model

## Status

```
Phase 17+ — Comprehensive testing model
Core principle: Galerina tests prove behaviour AND governance
Current: 1978 tests across 48 test files (flat structure)
```

## Core Principle

```
Normal tests prove behaviour.
Galerina tests prove behaviour plus governance.
```

## The 13 Test Categories

| # | Category | What it proves | Status |
|---|---|---|---|
| 1 | Lexer | Source to correct tokens | Done |
| 2 | Parser | Valid syntax to correct AST | Done |
| 3 | Contract order | Sections in canonical order | Done |
| 4 | Type checker | SPORE-TYPE-001..022 | Done |
| 5 | Value-state | unsafe/protected/redacted movement | Done |
| 6 | Capability/Effect | Declared effects only | Done |
| 7 | Negative governance | Illegal code rejected | Done |
| 8 | Runtime enforcement | timeouts/retries/limits real | Done |
| 9 | Audit proof | Signed artifacts produced | Done |
| 10 | CEC | 191/222 stable examples pass | Done |
| 11 | Bootstrap determinism | Self-hosted output stable | Partial |
| 12 | AI contract invariants | Property-style testing | Planned |
| 13 | IDE quick-fix | Fix suggestions correct | Planned |

## Final Principle

```
Galerina tests prove behaviour, safety, governance, and evidence.
```
