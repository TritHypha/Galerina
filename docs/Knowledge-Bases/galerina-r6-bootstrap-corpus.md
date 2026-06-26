# Galerina — R6 Bootstrap Conformance Corpus

**Created 2026-06-02.** The five-flow corpus that gates **R6 = 100% Axis B** (engine
self-hosting). When all five run **source → lex → parse → type/effect/govern → emit GIR →
execute** entirely in Galerina (Stage B) AND produce **full parity** with the Stage-A
TypeScript reference, Runtime-in-Galerina is complete for the supported subset.

Files: `packages-galerina/galerina-core-compiler/tests/r6-corpus/r6-00N-*.spore` (each carries
`// EXPECT: ACCEPT` and is verified Stage-A-clean: 0 error-severity diagnostics across
parse + type + value-state + effect + governance, `production` profile).

## Conformance definition (R6 gate)

For each corpus flow, the bootstrap test asserts **full parity** between Stage A and the
self-hosted Stage B pipeline:
1. **Diagnostics** — same accept/reject and same diagnostic code set.
2. **Value** — the executed return value is identical.
3. **Governance/effects** — declared effects + governance results agree.

Harness (to build): `tests/self-hosted-bootstrap.test.mjs` — runs each corpus flow through
both pipelines and diffs (1)–(3). This is the M-C / 100% marker.

## Coverage matrix

| Flow | File | R-phase(s) | Features exercised |
|---|---|---|---|
| **R6-001** `classify` | `r6-001-classify.spore` | **R1** | String literals; string-returning `Result<String,String>` (Ok/Err); `contract.types` alias (`Verdict`); Int param; `if`/comparison/`return` |
| **R6-002** `distanceSq` | `r6-002-distance.spore` | **R2** | `record` declaration; record **value** as a param; **field access** (`p.x`); arithmetic over fields |
| **R6-003** `listLen` | `r6-003-listlen.spore` | **R2** | `Array<Int>` **array literal** `[1,2,3,4]`; list method call `.count()`; typed `let` |
| **R6-004** `recordAmount` | `r6-004-record-amount.spore` | **R4** | `secure` flow; `effects { audit.write }` block; **member call** `AuditLog.write(...)`; `Result<Int,String>` return |
| **R6-005** `nameOf` | `r6-005-name-of.spore` | **R5** | `match` over integer patterns + `_`; **`Option<String>`** (`Some`/`None`); String payloads |

R3 (env O(n²) → scoped/map env) is a perf fix that folds in during R1–R2 (records/lists
make programs large enough to need it); it has no dedicated corpus flow.

## Notes / Stage-A constraints discovered while authoring (so the corpus stays ACCEPT)

- **Record literals don't unify with a nominal `record` type** in Stage A (`{x,y}` types as
  generic `Record`, not `Point` → SPORE-TYPE-002/008). The corpus therefore passes a record
  **value** in and reads fields (R6-002) rather than constructing one by literal. Record-literal
  nominal typing is a separate Stage-A gap, out of R6 scope.
- **`List<Int>` ≠ `Array<Int>`** — array literals infer as `Array`; use `Array<Int>` (R6-003).
- **`record` / `effects` etc. are reserved** — don't use as flow/param names.
- **`contract` section order**: `intent` before `effects` parses cleanly; `types{}`+`effects{}`
  together tripped a brace parse, so R6-004 declares `Result<...>` inline instead of via a
  `types` alias.

## Status

Corpus authored + Stage-A-verified (5/5 ACCEPT). Self-hosted execution: pending R1–R5
widening of the Stage-B pipeline (see `galerina-selfhosting-roadmap-axisB.md` → "Path to 100%").
