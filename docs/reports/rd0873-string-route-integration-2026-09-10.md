# RD-0873 String route integration checkpoint — 2026-09-10

This is a bounded observation of the versioned String checked-snapshot/GIR
route. It does not author `.fungi`, switch a consumer, retire TypeScript, mint
authority, or replace the required owner and review gates. The previously
passed 2,720-file corpus assurance was not rerun.

## Exact inputs

| Input | Recorded value |
| --- | --- |
| Galerina worktree | `codex/rd0873-local-integration` at `c39ad1fc01128a5936e5444ae3fae6a0ef27b418` |
| SLIDE checkout | owner-supplied external checkout at `2e8e41b` (parent `962f880`) |
| Lyth/Weaver checkout | owner-supplied external checkout at `a68eeb5ced8a522b3ab140422c1e7ce84ec887fa` |
| Galerina route | String checked snapshot/GIR v1, `authorityReleased: false` |
| TypeScript reference | `isEnvironmentMode` remains the executing reference |

## Fresh bounded runs

1. From the Galerina worktree, with `GALERINA_SLIDE_REPO` set to the explicit
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

## Gate disposition

The fresh runs establish reproducible bounded integration against the explicit
SLIDE and Lyth checkouts. They are still non-authorizing observations. The
independent review receipt, exact continuity receipt, and owner-bound queue
decision required by the handoff are not present at this exact Galerina head;
therefore Task 6 remains `HOLD`, Task 7 and bulk `.fungi` authoring remain
closed, and the TypeScript shadow remains active.
