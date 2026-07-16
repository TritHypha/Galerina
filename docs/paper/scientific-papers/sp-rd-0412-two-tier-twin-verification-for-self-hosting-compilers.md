# Two-tier twin verification for self-hosting compilers: differential testing + real-parser pipelines + emit-set/name parity gates

**Disclosure ID:** SP-RD-0412 · **Date:** 2026-07-16 · **Type:** methodology paper (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0412 §4 + the Tranche B/C execution record (coordination ACKs, 2026-07-16); gates `scripts/audit-twin-emit-parity.mjs` (self-test green; fail-closed, wired into phase-close); twin suites re-run green by a second, independent session at each increment.

## Purpose
When a compiler is being re-implemented in its own language (a "twin" of a reference checker), the standard differential test — *run both on the same inputs, compare diagnostics* — gives **false confidence**, in ways we can name precisely because our method caught each one before it shipped. This paper publishes the methodology as prior art: the failure modes, the three verification legs plus a pre-gate, and the two structural gates that make parity an *enforced invariant* rather than a claim. Every defect described below was **caught and fixed by the method itself**; that is the point of publishing it.

## The failure modes of the naive differential (each observed, caught, fixed)
1. **The hand-built-node fiction.** Differential tests construct AST nodes by hand; the real parser may represent the same construct differently (an absent field where the test sets one; an identifier node where the test builds a literal). A check gated on the hand-built shape passes the differential and silently misroutes or stays quiet on real input.
2. **The untested-position blind spot.** The differential proves the twin emits the right code for cases it tests — it cannot prove the twin doesn't emit a *valid-but-wrong* code at an untested position (e.g. a general "unknown" code where the reference emits a specific "deferred" code). A code-set comparison cannot see this.
3. **The semantic squat.** The twin can emit a code the reference also emits — with a *different meaning*. The code sets match; the meanings diverge.
4. **The un-twinnable construct.** If the self-hosted parser has no grammar for a construct, a twin check for it can only ever be exercised by hand-built nodes — the differential becomes pure fiction.

## The method
- **Leg 0 — parser-coverage pre-gate:** before designing any twin check, probe the self-hosted parser: does it *produce* the node the check triggers on? If not, the check is un-twinnable until the parser grows (refuse the fiction).
- **Leg 1 — the differential:** twin ≡ reference on hand-built cases (necessary, not sufficient).
- **Leg 2 — the real-parser pipeline:** the same assertion driven end-to-end (lexer → parser → checker) on real source, so absent-field routing and representation mismatches surface.
- **Leg 3 — raw-diagnostic grounding per position:** for every code whose *absence* at a position matters, a fixture asserting the exact code (not just "some diagnostic") — closing the untested-position blind spot.
- **Gate A — emit-set parity, source-scanned:** the twin's emitted code set must be a subset of the reference's *actual emit call-sites* (scanned from source, not from a registry or comments), scoped per reference pass/file, fail-closed at phase-close. Dead codes and other-pass codes are reported in honest separate buckets, never silently dropped.
- **Gate B — name parity:** the taxonomy law *one code = one name* becomes a check: for every code emitted by both, the twin's diagnostic `name` must equal the reference's (captured at the emit sites). This catches the semantic squat **by construction**. (The same law extends to severity once severities are sourced from spread-free definitions.)

## Result (the existence proof)
Under this method a reference type-checker's full mirrorable diagnostic surface was twinned to **0 false differentials** with a fail-closed parity gate holding it permanently — and the gate's first act was to catch its own team's overclaim (the reference file also hosted other subsystems' codes), which is the method behaving as designed.

## Prior art (novelty disclaimed)
Differential testing (McKeeman), compiler fuzzing harnesses (Csmith and successors), translation validation, and N-version programming are established; self-hosting bootstrap verification is as old as compilers. The disclosed contribution is the *composition* — the two-tier test pairing, the per-position absence fixtures, the parser-coverage pre-gate, and the source-scanned emit-set + name parity gates as fail-closed CI invariants — published as prior art, not claimed as invention.

## Honest bound
The method proves parity **for the mirrored scope only**: documented gaps (constructs the twin cannot decide) are reported as gaps, never inferred as passes; a twin under this method under-reports rather than false-positives. It does not prove semantic equivalence of *execution* — that is a separate (differential-execution) concern.

*Contact hello@trithypha.dev.*
