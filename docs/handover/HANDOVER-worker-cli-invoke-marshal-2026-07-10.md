# HANDOVER — worker session: cli-invoke-marshal @version fixtures (2026-07-10)

**From:** worker session (single task: un-red the phase-close step `tests:cli-invoke-marshal`).
**To:** the main Galerina session.
**Protocol:** per `HANDOVER-rd-session-2026-07-09.md` §6 — dated, claim-tiered, verification transcript, not-verified list. House rules ZT-01..ZT-51 applied (commit-only, explicit pathspecs, fail-closed, ZT-51 verify+re-read).

---

## 1 · What landed (CONFIRMED)

| Item | Value |
|---|---|
| Commit | `77f95616` — `test(cli-invoke-marshal): add @version 1 headers to inline fixtures` |
| Diff | 1 file, +4/−4: `tests/cli-invoke-marshal/cli-invoke-marshal.test.mjs` only |
| Change | `@version 1\n` prepended to all 4 inline `.fungi` fixture strings: `__cli_marshal_test` (before-hook), `__cli_marshal_secure`, `__g_clean`, `__g_violation` |
| Read-gate | **UNTOUCHED** — `galerina.mjs:1057` still parses `run` input with `{ requireVersionHeader: true }`; zero product-source lines in the diff |
| Branch | `refactor/tmf-format-to-spore`, now ahead of origin `e906ae56` (push remains owner-gate #1; NOT pushed) |

## 2 · Root cause (CONFIRMED, pre-existing)

This was work-state **finding (iii)**, not a fresh regression: the BK-4 fail-open hardening made `run` require the `@version` header, so the four headerless inline fixtures died at parse with `FUNGI-SYNTAX-015` before any runtime assert. Proven pre-existing by stash-and-rerun on the pristine file (done at discovery time, before this fix). The test is NOT in the 4396 suite (`run-all-tests.cjs` skips root `tests/`) but IS the phase-close gate step `tests:cli-invoke-marshal` (`scripts/run-phase-close.mjs:347-348`) — that step was the red.

## 3 · Verification transcript (ZT-51)

Command, from repo root:

```
node --test tests/cli-invoke-marshal/cli-invoke-marshal.test.mjs
```

Observed output (2026-07-10, at `77f95616`):

```
✔ Bool literals marshal distinctly (true→1→777, false→0→333), not silently to one value
✔ an un-parseable invoke arg fails LOUDLY (exit 2 + clear message), never silently to 0
✔ a secure/effectful flow gives a CLEAR 'not in the WASM surface' diagnostic, not 'not found'
✔ --governed runs a flow through the governed runtime and prints its value (exit 0)
✔ --governed is FAIL-CLOSED: a governance violation refuses to run (exit 1 + FUNGI diagnostic)
ℹ tests 5  ℹ pass 5  ℹ fail 0
```

Whole file re-read post-edit as reviewer (ZT-51): diff is exactly the four prepends; no assertion, structure, or cleanup-path drift. Semantics note worth having: the FAIL-CLOSED test now exercises the **real** `FUNGI-NAME-001` governed refusal (`console.log` without import) instead of coincidentally matching the parse error — the test tests what it claims again.

The phase-close step runs this exact invocation (`scripts/run-phase-close.mjs:347-348`), so the step is un-redded at the step level (CONFIRMED by running the identical command).

## 4 · NOT verified (honest gaps)

- **Full `run-phase-close.mjs` end-to-end** — only the exact `tests:cli-invoke-marshal` step command was run. Other steps untouched by this diff → full-script green is PLAUSIBLE, not CONFIRMED.
- **4396 suite / 25-gate matrix** — not re-run. Test-only diff with zero product-source lines → unaffected by construction, but unverified this session.
- **`FUNGI-SYNTAX-015` negative coverage elsewhere** — I did not audit where the missing-header path is pinned by tests; the gate's behavior is unchanged by construction (no product code in the diff), but I make no coverage claim.

## 5 · Fail-closed analysis

The fix was on the fixtures' side (make test inputs valid), never the gate's: `requireVersionHeader` stays enforcing on the hostile/missing-header path. No skip, no loosening, no conditional. The alternative (weakening the read-gate for test convenience) was the refusal case and was not taken.

## 6 · Ledger deltas for your state

| Ledger item | Delta |
|---|---|
| Work-state memory | finding (iii) → **CLOSED `77f95616`**; MEMORY.md index line updated to match |
| Owner-gates table | gate #1 push list now includes `77f95616` (+ this handover doc's commit) |
| Task chip `task_9d31fc81` | stale — predates an app restart, could not be withdrawn programmatically; dismiss by hand if still shown |
| Remaining known red | finding (ii) check↔governed corpus divergence — untouched, still the next self-hosting floor |
| Working tree (observed, not mine) | pre-existing uncommitted modifications left alone per explicit-pathspec discipline: `.claude/settings.json`, `scripts/run-phase-close.mjs`, `scripts/graph-all.mjs`, `scripts/`-generated dev-tool-index + graph outputs under `build/`, 3 × `.graph/BOUNDARY.md` |

*— worker session, 2026-07-10*
