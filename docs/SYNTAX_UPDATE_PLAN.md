# Syntax/Logic Update → 100% Beta-Shippable — Implementation Plan

**Created:** 2026-07-08 · **Session:** main build session (full-auto, owner away)
**Live status ledger:** [SYNTAX_UPDATE_TRACKER.md](SYNTAX_UPDATE_TRACKER.md) — this file is the *plan*, the tracker is the *state*.

**Sources of truth (ZTF-Knowledge-Bases, private repo):**
- `PROMPT-syntax-update-beta-shippable-2026-07-08.md` — the work order (§8 = LOCKED owner decisions)
- `galerina-rd-0266c-zt-scorecard-and-20yr-legacy-checklist.md` — ZT scores, contract field defaults (§6), 20-yr checklist
- `galerina-rd-0266-syntax-security-review-2026-07-08.md` — findings A1–A27 (build requirements, not advice)
- `galerina-rd-0266-photonic-syntax-aop-cluster.md` — R&D origin (reference only)
- `galerina-fungi-gate-security-findings-register.md` — RD-0240 / BK-1..5 / C/H/M status

## 0. Binding rules for this work (non-negotiable)

1. **Fail-closed by construction** — never by warning or convention. Every denylist → safelist; unknown ⇒ deny (LN-048).
2. Every change ships a **mechanical detector** (lint/test) registered in `lint-conventions`/`run-phase-close`.
3. **Verify by RUNNING the dangerous path** (FO-VERIFY-BY-READING is itself a fail-open). Every conformance test is **anti-vacuous** (A27: neuter the guard ⇒ test goes RED).
4. **`.fungi` is the only runtime code language.** `.gate` stays supported (parsed, version-gated, checkable) but is **never wired as a runtime code file** (owner rule 2026-07-08; keeps the `FUNGI-GATELANG-002` fail-closed-OFF posture).
5. `galerina-tower-citizen` is **read-only**. The `ZT-tritsocket` repo is off-limits (read-only reference).
6. **No push. No history rewrite.** Work stays in the working tree for owner review (commits deferred to owner GO).
7. No new authority in sugar; crypto/admission stay bit-exact (`FUNGI-SUBSTRATE-001`); health ≠ admission (RD-0169).
8. Aliases/renames carry **no physics guarantee** — docs must say "sugar, not physics" (RD-0266 §2.7 refuted list stays refuted).

## 1. Verified baseline (checked in code 2026-07-08, this session — not assumed)

| Item | Status | Evidence |
|---|---|---|
| RD-0240 match→trap (WAT) | ✅ LANDED | `wat-emitter.ts:1793` + `:2314` emit `(unreachable)` on non-exhaustive fallthrough |
| RD-0240 `FUNGI-MATCH-001` severity | ❌ **still `warning`** | `governance-verifier.ts:3839` — escalate to **error** (T0.1b) |
| BK-1 unmapped effect → sentinel | ✅ LANDED | `UnmappedEffect = 1<<30` (effect-checker); 2 stale proofs fixed this session |
| BK-2 fail-closed unknown type | ✅ LANDED | `wat-emitter.ts:226-239` throws on malformed type name |
| BK-3 `?` silent drop | ✅ downgraded — not a fail-open | register §0 (WAT `default:(unreachable)`; feature-gap only) |
| BK-4 GIR version reject | ◐ PARTIAL | `wat-emitter.ts:3452` rejects **unknown**, but **absent** `schemaVersion` still accepted → close in W4 (A4) |
| BK-5/H1/M1 standalone gate | ✅ LANDED | `cli.ts:954-966` — checkTypes + `runProductionSecurityGate`, refuses emit on gate-fail |
| H3-safelist egress | ✅ LANDED | `value-state-checker.ts:342-379` `EGRESS_SAFE_RECEIVERS` safelist |
| H2-a taint untrusted-by-default | ❌ OWED | owner LOCKED: **flip now, lands with the Phase-3 codemod** |
| A23 parser drain→reject | ❌ OWED | `parser.ts` `skipBalancedBraces` now has **24 call sites** (was 18 at R&D baseline) |
| A20 resolve-authority-or-deny | ❌ OWED | name-based authority refs still unresolved |
| A18 tenant scope (BETA BLOCKER) | ❌ OWED | not built; graph-spine RD-0150; biggest single remaining item |
| `@version` headers | ❌ 0 of 409 `.fungi` / 0 of 5 `.gate` have one | all need stamping (codemod) + reject-gates |
| `and`/`or` keywords | ✅ already active | `lexer.ts:175` (Phase 9C) — semantics/overload work remains |
| `try`/`catch`/`elseif` | **never existed in the grammar** | "removal" is a no-op; the error-model work is additive (`check`/`fault`) |
| `vAnd`/`vOr`/`vNot` in `.fungi` corpus | 0 files | rename is additive at language level; TS internals keep their names |
| `&&`/`||` in `.fungi` corpus | 7 files | migrate to `and`/`or` via codemod; keep tokens Bool-only (A9) |
| Corpus size | 409 `.fungi` · 5 `.gate` | migration scope |

## 2. Work packages (ordered; security-first inside the owner's "syntax → rebuild → build in .fungi" focus)

### W1 — Planning + todo ledger *(this document)*
Plan + tracker written; harness task list updated. **Done when:** both docs exist, tasks registered.

### W2 — Dev tool: `packages-galerina/galerina-devtools-fungi-scan`
**Owner ask.** A corpus scanner that walks **every `.fungi` (and `.gate`) file in the repo** and reports syntax/logic-migration state **using the real compiler lexer — NOT regex/grep** (regex misses `@…`/`…/…` forms; the lexer tokenizes them correctly).
- Reports per file + rollup: `@version` header present/valid · old forms (`&&`/`||`, any `vAnd`/`vOr`/`vNot` identifiers) · `match` blocks without `_` arm · new-construct adoption (`check`/`fault`/`flip`/`all`/`any`/`sealed`/`schema`/`prefilter`/`secure flow`/`through`) · alias-keyword usage · unknown/malformed first-line headers.
- Output: console summary + `build/fungi-scan/FUNGI-SCAN.md` + `--json`; exit non-zero on `--strict` findings so it can gate.
- Package (not a loose script): tests, border-clean, registered in `galerina.workspace.json`; wired into `lint-conventions`/`run-phase-close` as `--soft` first, `--strict` once the corpus is migrated.
- **Baseline run BEFORE any compiler change** (the check-don't-assume instrument), re-run after every W-package.

### W3 — Phase-0 remainder (backend/verifier fail-closed stragglers)
- **T0.1b** `FUNGI-MATCH-001` warning → **error** (+ neg-tests; corpus fallout fixed via W6 codemod `_ :` audited arms). MUST: `_` routes to an **audited** sink, never a silent drop.
- **A23 (M4)** drain→reject: inside `contract`/`secrets`/`authority`/`policy`/`guard`/`gate`/flow-body governance blocks, an unrecognized `{…}` block ⇒ **compile ERROR**, not `skipBalancedBraces`. All 24 sites reviewed; governance-context sites flipped (fix-the-class + lint so new drains can't land).
- **A20** authority refs (`authorize:`/`permissions:`/guard names) must **resolve to a registered key/capability** else deny. (Underpins W5 contract defaults.)
- **A1** classification: every schema field carries/inherits a classification; **unknown ⇒ most-restrictive** (never public). Public is declared, never defaulted.
- *(H2-a taint flip is scheduled in W6 with the codemod — owner LOCKED pairing.)*

### W4 — Phase 1: versioning (BK-4 complete + A4)
- `@version 1` first line of every `.fungi`; `@version 1.0.0` for `.gate`. Codemod stamps (author-facing: vibe coder never hand-writes it).
- **Reject-on-unknown AND reject-on-absent AND reject-below-floor** at **every** read path: `.fungi` parser · `.gate` parser · GIR reader (close the `undefined`-accepted gap at `wat-emitter.ts:3452`) · `.lmanifest` reader · kernel loader — mirroring `.spore` `container.ts:109`.
- **A4:** the header sits **inside the signed region** (RD-0167 index-covers-signature) + minimum-supported floor (anti-downgrade).
- **Sequencing (green path):** parser *accepts+validates* header → codemod stamps all 409+5 → flip parser/readers to *require* → suite green. The flip lands the same session as the stamp; end-state is fail-closed.

### W5 — Phase 2: the new syntax (each construct ships with its A-item gates)
| # | Construct | MUSTs bound to it |
|---|---|---|
| T2.1 | `flip(x)` + `all{}`/`any{}` verdict folds; `and`/`or` Verdict∧Bool overloads | A9: mixed `Verdict and Bool` ⇒ compile error; `not`≠`flip` (Bool-only vs Verdict-only); **empty `all{}` ⇒ UNKNOWN(0)** (Q2 canonical name; overrides min's vacuous-ALLOW identity) and **empty `any{}` ⇒ DENY(−1)** (max's mathematical identity AND the stricter zero-trust choice — documented deviation from the uniform-UNKNOWN wording, machine-checked); A12: `any` feeding a governed allow with tainted operand ⇒ error; machine-checked truth tables on the lattice DENY(−1) < UNKNOWN(0) < ALLOW(+1) |
| T2.2 | `check(x){ if:/deny:/ambig: }` + `fault` audited channel | exhaustive ⇒ ERROR+TRAP (RD-0240); unhandled fault ⇒ **halt+audit+deny** (A10), no auto-retry; fault never collapses into `ambig`/`_` |
| T2.3 | `sealed auto schema` + co-located contract + desugar/inject pass | `authorize`(=permissions)+`intent`(→`destination`) REQUIRED (missing ⇒ compile error, never a default authorizer); defaults per RD-0266c §6 (all deny-side); inject = compile-time, immutable, **signed, dumpable** (`galerina explain`, A6); inject pass **exhaustive over flow/schema kinds** with assertNever (A7); schema-lock `through S` — governed flow with no `through` ⇒ error; classification per A1 |
| T2.4 | deny-only `prefilter` | **no allow branch** (Deny/Maybe only); compiler wiring guarantees `maybe → keyed check` always runs; **dominator check** — no governed sink reachable on the maybe-path before `authorize` (A8); conformance: forged mask-matching keyless input DENIED end-to-end |
| T2.5 | `unsecure` / `secure flow` / `purify` taint surface | untrusted-by-default (A11 — `unsecure` marks a boundary, is not the only taint path); **`purify` does NOT clear injection taint** (A2) — `INJECTION_SINKS` need parameterized/typed artifacts; storage/DB reads tainted (A17) |
| T2.6 | Lexer alias table (renames: `modulate`/`stream`/`each`/`prism`/`fuse`/`refract`/`crystallize`/`project`/`release`/`deflect`/`graft`/`purge`/`vacuum`/`tether`/`illuminate`/`drop`/`cast`) | pure desugar to the **identical** governed IR; desugar-identity lint (alias≡canonical); every pass handles canonical form only; docs say "sugar, not physics" |

`.gate` gets the same parser-level gates (version, A23 reject) but stays **non-runtime** (rule 0.4).

### W6 — Phase 3: migration (codemod, never hand-edit 409 files)
- `scripts/migrate-fungi.mjs`: stamp `@version` · `&&`/`||` → `and`/`or` (7 files) · add `_ : <audited>` arms where MATCH-001 now errors · **H2-a taint-default flip lands here** (checker flip + corpus fixes in the same change, per owner LOCK).
- Update all 5 `.gate` files + `@version 1.0.0`.
- Regenerate GIR/manifests; **rebuild kernel + GIR + compiler (tsc)**; local re-sign where dev-key scripts exist (custody ceremony #34 items stay owner-gated).
- Corpus conformance: W2 scanner `--strict` = 0 findings.

### W7 — Phase 4: conformance / the beta gate
- Every fail-open class → live detector wired into `lint-conventions`/`run-phase-close` (drain-in-governance-block · gate-uncalled · dispatch-missing-case · unresolved-authority · denylist-shape).
- `.gate`→GIR→WASM→run e2e conformance test (register §6 named gap) — proving the fail-closed backend, run as a *pipeline* test (not runtime enablement).
- Verify-by-running suite: forged-input / unclassified / raw-string / old-version / ungoverned-kind each **DENIED end-to-end**; anti-vacuous per A27.
- Full recursive suite green · `component-health.mjs` green · audits 0 findings.

### Deferred / next-up after this pass (tracked, not dropped)
- **A18 per-tenant/row scope** — owner-declared BETA BLOCKER; `FUNGI-TENANT-*` enforced on every build target. Large (graph-spine RD-0150); needs its own work package.
- A3/A16 `.hypha` parameterized query IR (no `.hypha` files exist in-repo yet — spec-level until the DB surface lands).
- A13/A14 graft isolate + hardened profile deny-set; A15 runtime-owned audit; A24 real origin/token intent; A25 FIPS allowlist; A26 enforce V_DPM/flux; A19 spore write ordering.
- RD-0238 P0 native-addon RCE + anchor-GCM LOW (pre-existing release blockers, separate track).
- C2 posture upgrade (warn → deny-by-default) — coordinate with `.gate` workspace owner posture.

## 3. Refuted list (§2.7 — do NOT build as guarantees, ever)
`Bypass mode:fail-open` / VIP-skip / untraceable · "compiler ignores hallucinated line" · physics-as-authority · O(0)/O(1)/infinite/zero-cost claims · Photonic PUF as a guarantee · "optical schema replaces contract" (schema = deny-only pre-filter; **the keyed contract stays the sole ALLOW**).

## 4. Risk register
| Risk | Mitigation |
|---|---|
| MATCH-001→error reddens corpus | W2 scanner baselines the blast radius **first**; W6 codemod adds audited `_` arms; escalation + fixes land together |
| Version-reject before stamping breaks all 409 files | strict sequencing in W4 (accept → stamp → require) — end-state fail-closed, path green |
| Taint flip reddens corpus | owner LOCKED pairing with codemod (W6); checker flip + corpus fix in one change |
| A23 reject breaks legit unknown-block usage | flip governance-context sites first; scanner reports any corpus construct that would now reject **before** the flip |
| Alias table drifts from canonical semantics | desugar-identity lint + exhaustiveness test over the keyword set (FO-DISPATCH) |
| New constructs parsed but not enforced (FO-GATE-INERT) | each construct lands **with** its detector + anti-vacuous verify-by-running test, or it doesn't land |
