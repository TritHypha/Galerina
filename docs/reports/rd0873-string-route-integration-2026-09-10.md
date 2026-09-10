# RD-0873 String route integration checkpoint — 2026-09-10

This is a bounded observation of the versioned String checked-snapshot/GIR
route. It does not author `.fungi`, switch a consumer, retire TypeScript, mint
authority, or replace the required owner and review gates. The previously
passed 2,720-file corpus assurance was not rerun.

## Exact inputs

| Input | Recorded value |
| --- | --- |
| Galerina worktree | `codex/rd0873-local-integration` at repaired head `3e5110dd3` |
| SLIDE checkout | owner-supplied external checkout at `2e8e41b` (parent `962f880`) |
| Lyth/Weaver checkout | owner-supplied external checkout at `a68eeb5ced8a522b3ab140422c1e7ce84ec887fa` |
| Galerina route | String checked snapshot/GIR v1, `authorityReleased: false` |
| TypeScript reference | `isEnvironmentMode` remains the executing reference |

## Fresh bounded runs

1. From the repaired Galerina head, with `GALERINA_SLIDE_REPO` set to the explicit
   SLIDE checkout, `scripts/tests/five-scalar-classifiers-fungi-slide.integration.test.mjs`
   passed **10/10**, with zero skips. The run covered the flat String boundary,
   `isEnvironmentMode`, `isTerminalScope`, `isTaskEffect`,
   `isResponseSafeClassification`, `isOmniUncertain`, the expected refusals for
   `isBuiltin` and `validateTransition`, a boundary-crossing refusal, and the
   documentation-path case.
2. In the Lyth/Weaver checkout, `npm test` passed **14 suites / 633 checks**
   with zero failures. `npm run typecheck` also passed.

The earlier Galerina route checks remain exact: compiler String route **4/4**,
checked-snapshot harness **2/2**, local source-origin suite **32/32**, and the
`environment-mode.fungi` differential **1/1** at `8f0539a5e`.

## Review and repair

The independent review exercised a source-substitution case: a parse result for
one literal set was paired with different source bytes. Before the repair the
seal accepted that pair, leaving the source digest and extracted arms
inconsistent. Commit `3e5110dd3` now re-parses the exact canonical source bytes,
compares the supplied and rebound String-match routes, and refuses
`PARSE_SOURCE_MISMATCH`. The focused compiler suite passes **5/5** after the
repair, including the regression case, and the physical SLIDE/VOK lane was
rerun at this repaired head with **10/10** passes and zero skips.

## Gate disposition

The fresh runs establish reproducible bounded integration against the explicit
SLIDE and Lyth checkouts. They are still non-authorizing observations. The
independent review receipt, exact continuity receipt, and owner-bound queue
decision required by the handoff are not present at this exact Galerina head;
therefore Task 6 remains `HOLD`, Task 7 and bulk `.fungi` authoring remain
closed, and the TypeScript shadow remains active.
