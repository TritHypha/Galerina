# Independent audit — tri-regex `compile()` `maxNesting` work-budget

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `compile()` admits caller `budget.maxNesting` into the
work-budget. `{ maxNesting: 2 }` allows `((a))` and refuses `(((a)))`
with `TPRX-BUDGET`. `Infinity` `maxNesting` cannot raise the host
ceiling (32). Deep 40-group patterns still veto.

`parsePattern` called without `compile()` still uses `?? 32`. Direct
`parsePattern({ maxNesting: Infinity })` is not compile-validated and
accepts a 40-group pattern — residual, not a `compile()` bypass.
This is **not** 124-scan closure (`csf_e79c558f745535f0e23cab14` remains
`PARTIAL_THIS_TREE`). JSON-Decimal, OAuth, durable replay, signing, and
`.fungi` admission were not started.

Node v24.18.0, npm 12.0.2. Tests import `dist/` (gitignored).
`dist/index.js` / `dist/parser.js` mtimes are newer than the dirty
`src/index.ts` and contain the same `maxNesting` admission, safe-integer
check, host-ceiling 32, and parser `?? 32` nest cap. This reviewer did
not rebuild.

`src/parser.ts` is **identical to HEAD**. Dirty paths on this slice:
`M` `src/index.ts`; `M` `tests/refusals.test.mjs`. Passing tests here
are **not** production admission.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-tri-regex/src/index.ts` | `e66957b848a98edc903a6f6c85ba5a02d6f888ed38f015ec1c0e02e6e1c4207b` |
| `packages-ts/galerina-tri-regex/src/parser.ts` | `ec262ae07900de4b2a11a7032859ec83bc800d706b7a6c38b3f58dddbf183207` |
| `packages-ts/galerina-tri-regex/src/types.ts` | `22b41f07c358b83b8e0af9339e9b89b84b211988a5f606880324f0bfacf66be2` |
| `packages-ts/galerina-tri-regex/tests/refusals.test.mjs` | `f9d48df8d4474763d4cee7775d0563db9199ec3b34c9382d2099b6bfd610c2f5` |
| `packages-ts/galerina-tri-regex/dist/index.js` | `5b9822f0150482ed2c9a4b6deb75797788d9dc7b8ef736778a81c026d37d1bbe` |
| `packages-ts/galerina-tri-regex/dist/parser.js` | `839ad1e250069b69bf8e9fd3e50b45315b8671c722a7d9dc6bcc6b5ed86d827d` |
| `packages-ts/galerina-tri-regex/dist/types.js` | `453626edcbb87595b0c6aeb562ef3ba290f2cd2deff2f38c3e92f0b2fa9eba29` |

HEAD `compile()` (pre-dirty) constructed `budget` from
`maxInstructions` / `maxPatternLength` / `maxRepetition` only, so a
caller `maxNesting` was dropped and the parser always saw `?? 32`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `compile()` copies `supplied.maxNesting` into `budget` | source `index.ts` 90–97; dist `index.js` 28–35 |
| Invalid `maxNesting` (non-safe-integer, `< 1`) is `TPRX-BUDGET` | source 99–113; independent `NaN` / `0` / `Infinity` probes |
| Finite `maxNesting` `> 32` cannot raise the host ceiling | source 91, 114–121; independent `33` and `MAX_SAFE_INTEGER` |
| `{ maxNesting: 2 }` allows `((a))`, refuses `(((a)))` | executed hostile test + independent probe `at: 2` |
| Default / omitted `maxNesting` still caps at 32 (40-group veto) | parser `parser.ts` 168–170; executed deep-nest test; independent `depth40 default` |
| `Infinity` cannot compile a 40-group pattern via `compile()` | executed Infinity test; independent reason `finite safe integer >= 1` |
| `compileCapability` uses the same admission | source 137–142; independent capability depth-3 / max-2 veto |
| Public package export is `compile()`, not `parsePattern` | `package.json` `exports["."]`; `index.ts` does not re-export parser |
| `parsePattern` without `compile()` uses `?? 32` | source `parser.ts` 168; independent omitted-field depth-3 **ok:true** |
| Direct `parsePattern` + `Infinity` can accept 40 groups | independent probe **ok:true** — residual |
| 124-finding scan | **not this claim** (`csf_e79c558f745535f0e23cab14` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-tri-regex/tests/refusals.test.mjs`
   → **13/13 pass**, `fail 0`, `duration_ms 135.1558`.
   - deep group nesting is a budget veto — **red detector** (0.2059ms).
   - hostile: caller maxNesting is the work-budget, not a dropped field — **green/red pair** (0.5691ms).
   - hostile: Infinity maxNesting cannot disable the host nesting ceiling — **red detector** (0.1636ms).
2. `node --test --test-timeout=30000` on all six `packages-ts/galerina-tri-regex/tests/*.test.mjs`
   → **39/39 pass**, `fail 0`, `duration_ms 200.0346`. Optional full-package
   run; not a production-admission gate.

Independent extra probes (`<USER_HOME>/.grok\sessions\triregex-nest-probe.mjs`;
not production; imports this tree’s `dist/`):

- `compile("((a))", { budget: { maxNesting: 2 } })` → `ok: true`.
- `compile("(((a)))", { budget: { maxNesting: 2 } })` → `TPRX-BUDGET`
  `group nesting exceeds budget.maxNesting (2)` `at: 2`.
- `compile(40-group)` default → `TPRX-BUDGET` `maxNesting (32)` `at: 32`.
- `compile(40-group, Infinity)` → `TPRX-BUDGET`
  `budget.maxNesting must be a finite safe integer >= 1`.
- `compile("a", { maxNesting: 33 })` → `TPRX-BUDGET`
  `exceeds the host ceiling (32)`. Same for `Number.MAX_SAFE_INTEGER`.
- Default depth 32 → `ok: true`. Default depth 33 → `TPRX-BUDGET` `(32)`.
- Sequential `(a)(b)(c)` with `maxNesting: 1` → `ok: true` (depth, not count).
- Non-capturing `(?:(?:a))` with `maxNesting: 1` → `TPRX-BUDGET`.
- Character-class `[(a)]` with `maxNesting: 1` → `ok: true`.
- `parsePattern` omitting `maxNesting` on `(((a)))` → `ok: true` (the
  dropped-field detector can go red if `compile()` stops forwarding).
- `parsePattern` + `maxNesting: Infinity` on 40 groups → `ok: true`
  (parser does not re-validate; only `compile()` does).

## Challenge 1 — is caller `maxNesting` still a dropped field?

**No on `compile()`. CONFIRMED closed for the public compile path.**

Locators: dirty `index.ts` 90–97 (admit), 99–113 (safe integer `>= 1`),
122 (`parsePattern(pattern, budget)`). Parser `atom` `(` branch
`parser.ts` 168–170 compares `this.nest + 1` to `budget.maxNesting ?? 32`.
HEAD `compile()` omitted `maxNesting` from the constructed `budget`, so
the parser fallback always won. The hostile depth-2 vs depth-3 test
would have been green/green without the admission.

## Challenge 2 — can `Infinity` raise the host ceiling through `compile()`?

**No. CONFIRMED.** `Number.isSafeInteger(Infinity)` is false, so
admission refuses before parse. Independent `maxNesting: 33` hits the
separate `> hostNesting` branch. A 40-group pattern remains vetoed on
the default path (`at: 32`).

## Challenge 3 — does the nest detector go red?

**Yes. CONFIRMED.** Default 40-group compile is `TPRX-BUDGET`. Direct
`parsePattern` without `maxNesting` accepts depth 3 under the `?? 32`
fallback, proving the depth-3 / `maxNesting: 2` refusal is not vacuously
true of every 3-group pattern.

## Residuals (not findings against the named claim)

- `parsePattern` is still exported from `dist/parser.js`. In-package
  callers are only `compile()`. Package `exports` expose `"."` only.
  A filesystem import of `parser.js` with omitted `maxNesting` uses
  `?? 32`. The same import with `maxNesting: Infinity` accepts 40
  groups. That is not a `compile()` bypass.
- `hostNesting = 32` is a compile-local constant, duplicated as
  `DEFAULT_BUDGET.maxNesting` and the parser `?? 32` literal. They
  match on this tree; they are not a single binding.
- The Infinity suite test asserts `TPRX-BUDGET` only, not the
  host-ceiling reason string. The finite-`>32` ceiling branch is
  proven by independent probe, not by that test name.
- Scan `csf_e79c558f745535f0e23cab14` stays `PARTIAL_THIS_TREE`.
  Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid.
Evidence is sufficient for the `compile()` work-budget axis on this
dirty tree. Not production admission. Not Astra.
