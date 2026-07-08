# Syntax Update — Live Tracker

**Owner decisions LOCKED 2026-07-08 (mid-session Q&A):**
1. **Keywords: HARD-RESERVE + codemod** — new construct keywords AND the rename aliases become real reserved keywords; the codemod renames the ~19 colliding identifiers (check 6f/13× · project 4f · any 1f · authorize 1f; aliases have zero corpus collisions).
2. **`destination` only in the NEW schema construct** — existing contract `intent {}` blocks keep their name/meaning (prose intent ≠ routing); no corpus churn.
3. **A18 tenant scope stays sequenced AFTER W5–W7** (rides the new schema/taint surface), then its own focused package.
4. **Commit at milestones** — LOCAL commits with explicit pathspecs at each green gate; push stays HELD for explicit owner GO.

**R&D-session decisions LOCKED 2026-07-08 (KB `f233723`), implemented here:**
- **Q1: `@version 1.0.0` REPLACES `#gate`** — gate-parser reads+gates it (closed {1.0.0}; retired `#gate` rejected with a migration pointer); 5 corpus `.gate` migrated via codemod `--gate-stamp`; RULES.md R1 + AI-AUTHORING-GUIDE updated; 14/14 gate tests. Corpus now **413/414 headers valid** (the 1 absent = the ceremony-frozen greeting source, by design).
- **Q2: `UNKNOWN` is the canonical K3 middle state** (DENY(−1) < UNKNOWN(0) < ALLOW(+1)); HOLD/INDETERMINATE = eradicate-aliases; `ambig:` keyword unchanged. W5a implements on this naming.
- **Q3 (was open) — RECONCILED, maths checked:** 409 `.fungi` = 407 in the stamps commit + example-465 in the compiler commit + api-protocol-rest… all 408 stampable stamped + 1 ceremony-frozen (greeting) = 409 ✓; +5 `.gate` = 413/414 present ✓. The R&D session's "275" was a mid-migration observation.

**Plan:** [SYNTAX_UPDATE_PLAN.md](SYNTAX_UPDATE_PLAN.md) · **Legend:** ☐ not started · ◐ in progress/partial · ☑ done+verified (evidence required) · ✖ blocked/deferred
**Updated:** 2026-07-08 (session start — baseline)

| ID | Item | Status | Evidence / note |
|---|---|---|---|
| W1 | Plan + tracker + todo ledger | ☑ | docs exist; harness tasks #7–#13 registered |
| W2 | `galerina-devtools-fungi-scan` package (lexer-based corpus scanner) | ☑ | 17/17 tests; in workspace.json; `build/fungi-scan/` |
| W2.b | Baseline scan of 409 `.fungi` + 5 `.gate` (pre-change snapshot) | ☑ | **414 files · @version 0/414 · &&/\|\| 5 files (11×) · vAnd/vOr/vNot 0 · match-without-`_` 0/213 (!) · collisions: check 6f, project 4f, any 1f, authorize 1f · 2 pre-existing lex-error example files · strict=373 (=366 no-header +5 legacy +2 lex)** |
| T0.1b | `FUNGI-MATCH-001` warning→error (+neg-tests) | ☑ | **ERROR + STRUCTURAL** (name-heuristic + arm-count gate removed — they were themselves fail-opens); 6 neg-tests `tests/governance/match-exhaustiveness.test.mjs`; corpus fallout 0 (baseline predicted it) |
| A23 | drain→reject at governance-context `skipBalancedBraces` sites + lint | ☑ | **FUNGI-SYNTAX-011** reject-then-recover at 14 sites (contract/secrets×3/authority/policy/guard/access/gate/emergency/contract-set/import); **collect-don't-drop** inside KNOWN contract sub-blocks (`retries { network.outbound {…} }` etc. now VISIBLE in AST); **FUNGI-SYNTAX-013** rejects inert top-level `governance {}` (zero consumers). **Caught 2 real latent bugs:** example 465 had `policy {}` nested in contract (drained ⇒ never verified — moved to flow level like 462/463) + PCI fixtures used `target {}` (wrong name, s/b `targets`). Desync-recovery property preserved (updated test). Lint = W7 |
| A20 | authority refs resolve-or-deny | ☑ | **FUNGI-ACCESS-001** now resolves grants against ADMISSION_CAPABILITIES ∪ CANONICAL_EFFECTS (alias-aware, single-sourced); dotted-name bypass REMOVED (`totally.fake.capability` admitted silently before); error in production/deterministic, warning in dev (GOV-004 house pattern); 7 tests `tests/governance/access-grant-resolution.test.mjs`. `conforms_to`→GOV-004 + `parent_policy`→INHERIT-001 already fail closed. PROMPT §8 "checkTransition 0 callers" = STALE (wired in RD-0236: bitnet bridges + tpl-simulator) |
| A1 | classification: unknown ⇒ most-restrictive, never public | ➡ | moved into W5b — applies to the `schema` construct that lands there |
| T1.1 | `@version` header grammar (`.fungi`) | ☑ | `parseProgram` pre-lex gate: FUNGI-SYNTAX-014 (malformed/below-floor/above-current) + 015 (absent on disk paths); header BLANKED not stripped (line numbers exact); BOM-tolerant; `FUNGI_MIN_SUPPORTED_VERSION=1`/`FUNGI_CURRENT_VERSION=1` exported; 9 tests `tests/version-header.test.mjs`; codes registered in KB `compiler-diagnostics.md` |
| T1.1b | corpus stamped | ☑ | codemod `--stamp --apply`: **409/409 .fungi** (incl. api-protocol-rest — its manifest is UNTRACKED dev output, so stampable); `greeting` = the one genuinely ceremony-frozen pkg (git-tracked signed manifest) — frozen, ceremony-owed |
| T1.2 | reject unknown+absent+below-floor at read paths | ◐ | DONE: `.fungi` parser (both CLIs — 5 cli.ts + 3 galerina.mjs sites `requireVersionHeader:true`; git-diff sites exempt) · GIR reader **absent now rejected too** (`wat-emitter` — the "internal partial-GIR" tolerance was an unauthenticated bypass) · fuse-loader (closed set {fungi.fuse.v1, **lln.fuse.v1**=pre-rename alias for the signed greeting fixture, ceremony-owed}). DONE ALSO: **`.gate` pragma version gate** — gate-parser now READS `#gate <int>.<int>` (spec RULES.md R1) with closed set {0.3}; bare/`0.4`/foreign ⇒ GATELANG-001 refuse; the 5 corpus files already carried `#gate 0.3`; TS fixtures' non-spec `v0.4` fixed to spec form; +2 neg-tests (13/13). REMAINING: `.lmanifest` CBOR reader version check (legacy lln.manifest.v1 ceremony-coupled) |
| A4 | version header inside signed region + floor | ◐ | floor ✓ (SYNTAX-014 below-floor reject); signed-region: `.fungi` header is part of source ⇒ covered by sourceHash — assert in W7 conformance |
| — | **Learned-class hardening (owner rule: encode checks into tools)** | ☑ | codemod: **signed-frozen guard** (skips signed+git-tracked-manifest pkgs; caught by `audit-signed-fixture-drift` when my stamp dirtied 2 signed pkgs) · fungi-scan: `signed-frozen` corpus class (strict-exempt, loudly counted) + test · drift auditor now prints **old-brand schema spellings per signed pkg** (ceremony scope visible: greeting = lln.manifest.v1 + lln.fuse.v1) · test-authored fixtures stamped at their writers (5 test files) |
| T2.1 | `flip` + `all{}`/`any{}` + Verdict/Bool overload rules (A9/A12) + truth-table tests | ☐ | `and`/`or` keywords already active (`lexer.ts:175`) |
| T2.2 | `check` + `fault` audited channel (A10) | ☐ | try/catch/elseif never existed — additive |
| T2.3 | `sealed auto schema` + inject pass (A6/A7) + `through S` schema-lock + §6 defaults | ☐ | |
| T2.4 | deny-only `prefilter` + dominator check (A8) | ☐ | |
| T2.5 | `unsecure`/`secure flow`/`purify` (A2/A11/A17) | ☐ | |
| T2.6 | lexer alias table + desugar-identity lint | ☐ | |
| T3.1 | `scripts/migrate-fungi.mjs` codemod | ☐ | |
| T3.1b | H2-a taint-default flip (lands WITH codemod — owner LOCK) | ☐ | |
| T3.2 | migrate all `.fungi` (409) + `.gate` (5) + `@version` | ☐ | |
| T3.3 | regenerate GIR/manifests · rebuild kernel+GIR+compiler · local re-sign | ☐ | |
| T4.1 | detectors wired into lint-conventions/run-phase-close | ☐ | |
| T4.2 | `.gate`→GIR→WASM→run e2e conformance (pipeline test, non-runtime) | ☐ | |
| T4.3 | verify-by-running deny suite (forged/unclassified/raw/old-version/ungoverned — anti-vacuous A27) | ☐ | |
| T4.4 | full recursive suite + component-health + audits green | ☐ | baseline today: 61/61 · 6,086 |
| — | **Verified already landed (2026-07-04 set, re-checked in code this session)** | ☑ | RD-0240-WAT · BK-1 · BK-2 · BK-3(downgraded) · BK-5/H1/M1 · H3-safelist — see plan §1 |
| ✖ | A18 tenant scope (BETA BLOCKER — next work package) · A3/A16 `.hypha` · A13/A14/A15/A24/A25/A26/A19 · RD-0238 P0 · C2 upgrade | ✖ | tracked in plan §2 "Deferred" — not dropped |
