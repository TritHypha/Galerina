# Slices 47-49 Regex Boundary Adjudication

## Decision

Slices 47-49 are `BLOCKED`. No Fungi asset or candidate queue authority is
created.

| Slice | Exact symbol | Decisive boundary |
|---:|---|---|
| 47 | `galerina-tower-citizen/src/key-rotation.ts#isWellFormedCommit` | The source has an unbounded case-insensitive character predicate and a reachable non-String `false` path. The selected physical profile has no exact iteration, text-length or character boundary. |
| 48 | `galerina-governance-telemetry/src/exposition.ts#isSafeLabel` | TriRegex certifies the bounded alphabet pattern, but Fungi execution does not lower `matchesPattern`, and SLIDE has no regex or text-character iteration profile. Runtime coercion also widens the TypeScript domain beyond a typed String boundary. |
| 49 | `galerina-devtools-fungi-scan/src/inline-fixtures.ts#looksLikeFungi` | Two of the three JavaScript patterns require word-boundary semantics absent from TriRegex v0.1. Fungi and SLIDE also lack an executable regex boundary and the physical text domain is narrower. |

These decisions authorize documentation only. They do not authorize an asset,
host-side Boolean bridge, profile widening, consumer switch, TypeScript
deletion, retirement, production, signing, release or push.

## Independent owner evidence

The current graph proves each symbol's live callers and focused tests. The
owning package regression lanes pass:

- Tower-Citizen: **507/507**;
- governance telemetry: **21/21**;
- Fungi scan: **25/25**.

These counts prove package health, not conversion parity.

Direct TriRegex compilation proves that the Slice 47 hex pattern and Slice 48
safe-label pattern are within its bounded, non-backtracking subset. Slice 49's
header pattern compiles, while its flow and contract patterns refuse because
word-boundary support is not present in v0.1.

At the earlier adjudication head, an exact Fungi probe using
`String.matchesPattern` parsed and effect-checked, while runtime interpretation
returned an unresolved-call error and the WAT path had no admitted
`$matchesPattern` callee. The current bounded hardening instead makes the WAT
fallback explicit at
`packages-ts/galerina-core-compiler/src/wat-emitter.ts:2115-2122`: it emits a
fail-closed trap rather than an undefined call. Checker or standard-library
catalogue presence is therefore still not executable lowering evidence.

The current physical checked-Fungi surface admits exact equality, trim,
contains, prefix, suffix and fixed-index slice operations. It does not admit
regex, text length, code-unit/code-point projection, or a data-derived text
iteration profile. Its bounded well-formed text admission is also narrower
than the JavaScript String domains of all three sources.

## R&D trigger

Revisit these scopes only after a reviewed TriRegex-backed typed boundary can
prove all of the following:

1. compile-time constant pattern certification with a closed failure type;
2. exact JavaScript compatibility for the admitted pattern features, including
   explicit ASCII versus Unicode class and anchor semantics;
3. compiler interpretation, GIR and WAT lowering without an unresolved host
   call;
4. SLIDE/VOK admission with bounded subject and certified-work receipts;
5. a source-contract ruling for inputs outside the admitted physical text
   domain and for TypeScript runtime coercion;
6. TriRegex support or an explicit refusal for Slice 49 word boundaries.

Until those conditions hold, host-side precomputation is forbidden because it
would move the decision authority back into TypeScript.

## Skill-close review

`NO_SKILL_UPDATE` for both public Fungi skills. They already require live
execution evidence, full source-domain comparison, precise blockers, and
refusal when a checker-visible API lacks an executable physical boundary. The
specific `matchesPattern` lowering defect and current profile limits belong in
this build-point-bound adjudication rather than a public timeless rule.
