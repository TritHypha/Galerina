# A fail-open defect taxonomy for governance-first language toolchains: "signed and green" is not "safe"

**Disclosure ID:** DP-RD-0269 · **Date:** 2026-07-08 · **Type:** Prior-art disclosure (defensive) — NOT a patent claim · **Provenance:** the fail-open retrospective + canonical taxonomy (`galerina-fail-open-taxonomy.md` (internal engineering KB); in-repo registration `docs/Knowledge-Bases/galerina-fail-open-taxonomy.md`), the syntax security review (`galerina-rd-0266-syntax-security-review-2026-07-08.md` (internal engineering KB)), and the live findings register (RD-0240, BK-1..5, C1/H1–H5/M4). Detector evidence in-repo (§8).

**Purpose.** This is a defensive publication placing an engineering *classification* and its verification discipline in the public domain as timestamped prior art. **Novelty is explicitly disclaimed** (§3): fail-safe defaults, exhaustiveness checking, missing/incorrect-authorization defects, and mutation testing are all established. The contribution recorded here is the *named, detector-paired taxonomy* — nine defect classes by which a deny-by-default ("governance-first") compiler/runtime silently becomes permissive — together with the meta-lesson each class re-confirmed: **a cryptographically signed artifact with a fully green test suite can still be fail-open unless fail-closed behaviour is established *by construction and by execution*, not by reading.** Every class is grounded in a real, reproduced defect in one codebase; none is hypothetical.

---

## 1. Technical field

Construction and verification of compilers, static checkers, and runtimes for security-governance languages (deny-by-default authorization, effect systems, taint tracking, policy blocks); zero-trust build pipelines in which artifacts are signed and admission is gated; defect classification for the toolchain itself.

## 2. Background & problem

A governance-first language enforces its guarantees through toolchain passes (parser, effect checker, verifier, emitter, signer). Each pass is itself a program, and each can fail in a specific, recurring direction: **downgrading to a permissive result instead of denying or trapping**. Because the artifact still builds, still signs, and the suite stays green, these defects are invisible to the usual quality signals. The problem this disclosure addresses is the absence of a *named* classification that (a) makes each failure shape recognisable at review time and (b) pairs each shape with a mechanical detector, so that "fail-closed" is a property enforced by tooling rather than asserted in prose. The documented trigger case: an inline WAT comment (`;;`) swallowed a closing parenthesis, the assembler rejected the module, a `valid:true` stub was substituted, and a flow that *must* trap instead returned an ordinary value — signed, green, and wrong.

## 3. Prior art (stated honestly — novelty disclaimed over each)

- **J. H. Saltzer & M. D. Schroeder, "The Protection of Information in Computer Systems," *Proceedings of the IEEE* 63(9):1278–1308, 1975.** Fail-safe defaults and complete mediation. The taxonomy is an itemisation of ways real toolchains violate these two principles; the principles themselves are 50 years old and not claimed.
- **MITRE CWE.** CWE-636 (*Not Failing Securely — 'Failing Open'*), CWE-478 (*Missing Default Case in Multiple Condition Expression*), CWE-862/CWE-863 (*Missing / Incorrect Authorization*). Several classes below are language-toolchain instances of these entries and are cross-referenced to them.
- **R. A. DeMillo, R. J. Lipton, F. G. Sayward, "Hints on Test Data Selection: Help for the Practicing Programmer," *IEEE Computer* 11(4):34–41, 1978.** Mutation testing — the "delete the gate, assert the suite goes red" discipline used here as the strongest per-class detector. Not claimed.
- **Rust `match` exhaustiveness / ML totality checking.** The dispatch-completeness classes are compiler-lint restatements of totality; not claimed (see also the sibling note DP-RD-0227, which records the same principle for a graph-authoring syntax).
- **Sibling in-folder disclosures.** DP-RD-0247 (*authenticated bytes = executed bytes*) and DP-RD-0129 (*integrity ≠ fidelity*) record adjacent single classes; this note records the umbrella classification.

**What is therefore NOT claimed as novel:** fail-safe defaults, totality checking, authorization-defect CWEs, mutation testing. **What this document places on record** is the specific nine-class, detector-paired taxonomy for governance-language toolchains, each class witnessed by a reproduced defect, and the verification discipline ("verify fail-closed by running, fix the class not the instance, declared ⊇ inferred on every load-bearing axis, exercise the dangerous branch, flip trusted-by-default polarity").

## 4. Summary of the disclosed subject matter

A defect taxonomy of **nine named classes** for deny-by-default language toolchains, each defined by (i) the invariant broken, (ii) a witnessed instance, and (iii) a mechanical detector, such that a build pipeline can require — per class — a lint, a static scan, a conformance test, or a mutation kill before any "fail-closed" claim is accepted; together with the pipeline rule that **no fail-closed claim is accepted on the basis of reading source text** (class FO-VERIFY-BY-READING makes that failure itself a named defect).

## 5. Detailed description — the nine classes

| class-id | invariant broken | witnessed instance (real, reproduced) | detector status |
|---|---|---|---|
| **FO-EMIT-INLINE-COMMENT** | a trap must trap; a malformed artifact must abort, not downgrade | emitted WAT `(unreachable) ;; reason` — the inline `;;` swallowed the closing `)`; assembler rejected; a `valid:true` stub ran and returned `5` instead of trapping | lint SHIPPED (`lint-wat-inline-comments.mjs`); residual: end-to-end trace test |
| **FO-DISPATCH-MISSING-CASE** | a dispatch over a closed kind-set must handle every member | value-state walker omitted `guardedFlowDecl` — the entire guarded tier skipped taint analysis with zero diagnostics; second instance: effect gate enumerated `secure`/`guarded` but omitted plain `flow` | behavioural exhaustiveness test SHIPPED; cross-pass static scan planned |
| **FO-GATE-UNCALLED** | the gate must run on every path reaching the protected sink (CWE-862) | `canCommit()` defined and documented as the commit gate; the native execute path never called it | fixed at site; call-graph scan (gate-named fn with zero call sites) specified |
| **FO-GATE-INERT-PREDICATE** | the gate must be able to deny under the default policy (CWE-863) | `canCommit()` OR-chained a transition check that is unconditionally allowed — the gate could never return false | deny-under-empty-policy conformance test (the failing test is the forcing function) |
| **FO-TIER-UNDERDECLARE** | declared ⊇ inferred on every obligation-gating axis, not just effects | a `guarded flow` performing `http.post` silently skipped every secure-tier obligation | floor pass SHIPPED (FUNGI-TIER-001) on the production build path |
| **FO-TRUSTED-BY-DEFAULT-BOUNDARY** | unknown provenance crossing a boundary defaults to UNTRUSTED | bare parameters were trusted unless explicitly marked tainted — unmarked untrusted input treated as clean | polarity flip scheduled with codemod; conformance corpus specified |
| **FO-DANGEROUS-PATH-UNEXERCISED** | the suite must execute every security-critical branch, incl. optional-artifact paths | the native branch never runs on a clean checkout (no addon), so the two gate defects above passed a fully green suite | inject a test double so the branch runs; then mutation-kill the gate |
| **FO-CONCURRENT-WRITE-COLLISION** | concurrent writers need isolated trees (process class) | parallel worker sessions shared one git index; a broad `git add -A` swept foreign files into commits | command-lint: explicit pathspecs only; per-worker worktrees |
| **FO-VERIFY-BY-READING** (meta) | verify fail-closed by observing behaviour on the dangerous path | a review concluded "already traps" by *reading* `(unreachable)` text, missing that the inline `;;` defeated it | process rule + mutation testing; "verified by reading" is an explicit REJECT for fail-closed claims |

Corroborating register (same classes, independent finds): a non-exhaustive backend match lowered to `i32.const 0` (a permissive constant) instead of a trap (RD-0240); five backend fail-opens of the emit/verify family (BK-1..5, including a version field *written but never read*); and — decisive for the taxonomy's value — converting parser silent-drain to reject-then-recover (14 sites) immediately **exposed two latent real defects**: a `policy {}` block nested where it was silently drained (and therefore never verified), and fixtures using a wrong block name (`target` for `targets`) that had been swallowed for weeks. The drain had been *hiding* fail-opens; the class-level fix surfaced them.

**The disclosed discipline** (each rule is the countermeasure to ≥1 class): (1) **verify-by-running** — a fail-closed claim requires an executed trace or a killed mutant, never source reading alone; (2) **fix-the-class** — on any instance, grep all siblings and land a mechanical gate registered in the lint harness; (3) **declared ⊇ inferred** on every load-bearing declaration axis (effects, tier, capabilities, version); (4) **exercise the dangerous branch** — CI must stub optional preconditions (native addon, key, hardware) so the guarded branch actually runs, in both deny and allow directions; (5) **untrusted-until-marked** default polarity at boundaries; (6) a **per-component health pivot** so a fail-open lint count is a first-class per-component signal.

## 6. Honest limitations & scope

- **One codebase.** All nine classes were witnessed in a single governance-language toolchain (Galerina). The classification is plausibly general — the CWE cross-references suggest so — but no cross-project survey is claimed.
- **Descriptive, not complete.** Nine classes is what was *found*, not a proof of exhaustiveness. The taxonomy is expected to grow; its value is the class-plus-detector pairing, not closure.
- **Detector coverage is partial and stated per-class** (§5 last column). Classes marked "specified"/"planned" have no shipped mechanical gate yet; asserting otherwise would itself be FO-VERIFY-BY-READING.
- **Not a crypto result.** Nothing here weakens or replaces signing; the point is the converse — a valid signature attests bytes, not fail-closed behaviour (see DP-RD-0129 for the integrity-vs-fidelity separation).
- **Process classes are not code-lintable.** FO-CONCURRENT-WRITE-COLLISION and FO-VERIFY-BY-READING live in orchestration/review discipline; the disclosed countermeasures there are procedural with partial tooling.

## 7. Illustrative disclosure claims (prior-art disclosures, not patent claims)

1. **A method** of gating "fail-closed" assertions in a build pipeline wherein each assertion must be paired with a mechanical detector drawn from a named defect-class taxonomy (lint, dispatch-exhaustiveness scan, gate-call-graph scan, deny-under-empty-policy conformance test, dangerous-branch execution with a stubbed precondition, or a killed mutant), and wherein an assertion supported only by source-text reading is rejected.
2. **A method** as in claim 1 wherein, for every obligation-gating declaration axis (effects, privilege tier, capabilities, artifact version), the toolchain enforces *declared ⊇ inferred-minimum*, rejecting under-declaration as privilege-escalation-by-omission.
3. **A method** as in claims 1–2 wherein values crossing a trust boundary default to UNTRUSTED until explicitly marked, the permissive default polarity being treated as a named defect class.
4. **A method** as in claims 1–3 wherein parser error-recovery is *reject-then-recover* rather than silent-drain, so that unrecognised or misplaced governance blocks are surfaced as errors instead of being silently discarded from the AST.
5. **A system** applying claims 1–4 with a per-component roll-up in which fail-open lint counts, dangerous-path mutation coverage, and provenance freshness are per-component verdict columns, the build failing on any red component.

## 8. Machine-checkable evidence (in-repo, re-runnable)

- `packages-galerina/galerina-core-compiler/scripts/lint-wat-inline-comments.mjs` — the FO-EMIT-INLINE-COMMENT lint (shipped; the template detector).
- `tests/governance/match-exhaustiveness.test.mjs` — 6 negative tests; non-exhaustive `match` is a structural ERROR (the RD-0240 class kill).
- `tests/governance/access-grant-resolution.test.mjs` — 7 tests; authority references resolve against the capability/effect registries or deny (name-based-authority kill).
- `tests/effect-checker.test.mjs` › "EFFECT-001 covers every effectful flow kind" — the FO-DISPATCH-MISSING-CASE behavioural exhaustiveness pattern.
- `tests/tier-floor-fungi-tier-001.test.mjs` — the FO-TIER-UNDERDECLARE floor.
- `scripts/audit-mutation.mjs` (SEC-002) — mutation harness; the verify-by-running mechanism.
Classes without a shipped detector are listed as gaps in §5 — that honesty is part of the record.

---

### Declarations

- **Type / tier:** defensive-pub (engineering classification + verification discipline; prior-art record). Not a flagship, not a novelty claim.
- **Authorship & AI assistance:** drafted with AI assistance under human direction (owner: Phillip Booth). Grounding: the cited retrospective/taxonomy documents, the findings register, and the in-repo detectors listed in §8. Prior-art triage is informed by training knowledge, **not** a filed legal search.
- **Funding:** none. · **Competing interests:** none.
- **Data / artifact availability:** all referenced documents, lints, and tests are in-repo at the stated paths; detectors are re-runnable with Node built-ins.
- **Licence:** Apache-2.0.
