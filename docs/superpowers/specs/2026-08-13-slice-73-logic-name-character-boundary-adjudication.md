# Slice 73 Logic Name Character Boundary Adjudication

## Decision

`packages-galerina/galerina-core-logic/src/index.ts#isSafeGalerinaame` is
`BLOCKED_BY_REGEX_TEXT_CHARACTER_ABI`.

No `.fungi` candidate, bridge, test fixture or authority switch is created.
The TypeScript implementation and all callers remain active.

## Pinned scope

- Galerina build point: `c6cd48c46a8ba1c2a9a517735a10ba55e02f9b18`.
- Source SHA-256: `2bdc2a8f8743da317fa769aebb056317622839da018c0a4897765bce8402e91a`.
- Exact symbol: `isSafeGalerinaame` at `src/index.ts`.
- Retirement row: `T2-runtime-core`, replacement absent, no declared floor.
- Existing governed assets: `omni-uncertain.fungi` and `tri-ops.fungi`; neither
  implements or supersedes this identifier decision.
- Reconciled physical capability point: SLIDE `99a75a6`; later CI-only path
  handling changes do not widen the admitted text or regex profile.

## Source contract

The source evaluates:

```text
/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
```

It returns `true` only when the first UTF-16 code unit is an ASCII letter or
underscore and every remaining code unit is an ASCII letter, digit or
underscore. Empty Strings, leading digits, punctuation, whitespace,
non-ASCII text and malformed surrogate-containing Strings return `false`.
There is no source length ceiling.

The direct caller `validateLogicDefinition` applies the decision to the logic
definition name and to every state name, emitting `FUNGI-LOGIC-001` or
`FUNGI-LOGIC-004` on rejection. The inbound graph continues through logic
definition/state construction, Omni validation and truth-table validation.

## Decision and effect ledger

| Source operation | Proven type | Result | Effect | Required Fungi/physical operation | Exit |
|---|---|---|---|---|---|
| anchored first-code-unit class | JavaScript `String` | `Bool` | none | exact text length and code-unit access, or admitted regex | `false` for empty or invalid first unit |
| repeated remaining-code-unit class | unbounded JavaScript `String` | `Bool` | none | terminating code-unit traversal with identical UTF-16 semantics | `false` on first invalid unit |
| successful exhaustion | complete input consumed | `Bool` | none | exact end-of-text observation | `true` |

Threadability is `PARALLEL_PURE` for the leaf decision. Construction,
validation, diagnostic aggregation and any later admission do not inherit that
classification automatically.

## Capability comparison

The frontend standard library recognizes `String.matchesPattern`, and its
host standard-library path is guarded by TriRegex work certification. That is
not physical execution evidence: the current interpreter path is bounded, but
the WAT method map has no admitted regex operation and the emitter explicitly
traps unsupported methods; SLIDE still has no regex opcode/profile.

The alternative explicit implementation is also unavailable. The selected
physical surface has no source-equivalent text length, character/code-unit
access or bounded Boolean traversal for this open String domain. Its bounded,
well-formed text admission would also change malformed and oversized source
inputs from `false` results into boundary refusals.

## Rejected substitutions

- Host-side regex evaluation or a precomputed Boolean retains the decision in
  TypeScript and proves no conversion.
- ASCII-only or bounded input admission narrows the source domain.
- `String.contains`, prefix checks or a finite `match` table do not express
  the complete anchored regular language.
- Byte iteration is not UTF-16 code-unit parity and cannot represent lone
  surrogates.
- A checker-clean `matchesPattern` call is not GIR, WAT, physical SLIDE or VOK
  evidence.

## R&D trigger

Revisit only after one of these complete contracts exists:

1. an admitted, work-certified regex operation preserved through GIR, physical
   `.slide`, independent re-admission and VOK; or
2. a versioned UTF-16 code-unit text ABI with exact length/index/traversal,
   explicit work ceilings and source-equivalent treatment of malformed and
   oversized inputs; or
3. an owner-approved source redesign that makes bounded canonical text the
   public contract and migrates every caller and diagnostic expectation.

This adjudication grants no conversion, retirement, production, signing,
release or push authority. Aggregate closure remains deferred to Slice 87.
