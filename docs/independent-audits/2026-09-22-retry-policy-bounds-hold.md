# Independent audit — `withRetry` attempt and delay bounds

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `withRetry` cannot loop indefinitely. Declared attempts are
clamped to `MAX_RETRY_ATTEMPTS` (8). Infinity and non-positive collapse
to one try. Delay is capped at `MAX_RETRY_DELAY_MS`.

This is **not** 124-scan closure and **not** production admission.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission
were not started.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Tests import `dist/`.
`dist/runtime/retryPolicy.js` mtime is newer than `src/runtime/retryPolicy.ts`
and contains the attempt clamp, exported ceilings, and `computeDelay`
cap. This reviewer did not rebuild.

HEAD already clamped `withRetry` attempts and skipped over-ceiling
parse decls. The dirty tree **exports** `MAX_RETRY_ATTEMPTS` /
`MAX_RETRY_DELAY_MS` and **caps** `computeDelay` (HEAD returned
uncapped `delayMs * 2^(attempt-1)` for exponential). Untracked
`retry-policy-bounds.test.mjs` is the hostile attempt detector.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/runtime/retryPolicy.ts` | `17171aa7a5c6f22ed6b27e42170e3cb3d3f693952104360abda99c91a2932176` |
| `packages-ts/galerina-core-compiler/tests/retry-policy-bounds.test.mjs` | `344ecbd41c283cf7cec52b0a5f8b53efe01fcaac94b88615cf94055385e56d56` |
| `packages-ts/galerina-core-compiler/dist/runtime/retryPolicy.js` | `ea880036b1bb884ca0406fc4fd2736d07a61833f44de7072fdce9e95181d0e79` |

Dirty paths for this slice: `M`
`packages-ts/galerina-core-compiler/src/runtime/retryPolicy.ts`, `??`
`packages-ts/galerina-core-compiler/tests/retry-policy-bounds.test.mjs`.
`dist/` is gitignored (`packages-ts/.gitignore:5`). Passing tests here
are **not** production admission.

Production call path (out of detector scope, in bound scope):
`contractEnforcer.ts` 242–243 delegates to `withRetry`;
`capabilityHost.ts` 277 uses `enforcer.withRetry`. No second retry loop.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Declared attempts clamped to `MAX_RETRY_ATTEMPTS` (8) | source `withRetry` 110–113; dist 76. `Number.isSafeInteger && >= 1` else 1, then `Math.min(..., 8)`. Suite 1e9 test; independent `1e9→8`, `9→8` |
| Infinity collapses to one try | `Number.isSafeInteger(Infinity)===false` → 1, not the 8-clamp. Suite + independent `infinityCalls=1` |
| Non-positive collapses to one try | `config.maxAttempts >= 1` false → 1. Suite `0`; independent `0` and `-5` → 1. `NaN` → 1 |
| Cannot loop indefinitely | local `maxAttempts` is 1..8 before the `for` loop; mutating the policy map after entry cannot extend the loop. Independent 1e9 still 8 calls |
| Delay capped at `MAX_RETRY_DELAY_MS` (30000) | dirty `computeDelay` 137–143; dist 95–102. Independent setTimeout intercept: linear `delayMs=1e12` → `[30000,30000]`; exponential `20000` → `[20000,30000]`; `Infinity` delay → `[0,0]` (non-finite base). **No suite delay test** |
| Hostile: 1e9 attempts → 8 calls | suite + independent |
| Hostile: Infinity → 1 call | suite + independent |
| `parseRetryPolicy` over-ceiling decls | parse skip (not throw) at 78–80 / 89–91. Independent synthetic AST: attempts 9, delay 40000, attempts 0 all absent; valid `net` kept. Fail-safe default is 1 attempt via missing map entry |
| 124-finding scan | **not this claim** |

## Command receipts

1. `node --test --test-timeout=15000 packages-ts/galerina-core-compiler/tests/retry-policy-bounds.test.mjs`
   → **4/4 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 149.2902`.
   - `withRetry succeeds on the first attempt without extra calls` — **green** (0.8723ms)
   - `hostile: Infinity attempts collapse to one try, not an unbounded loop` — **green** (0.4866ms)
   - `hostile: 1e9 declared attempts still stop at MAX_RETRY_ATTEMPTS` — **green** (1.0736ms)
   - `non-positive attempts collapse to one try` — **green** (0.2283ms)

Independent extra probe (`%TEMP%\galerina-retry-policy-probe.mjs`; not
production; `setTimeout` intercepted to fire at 0 while recording `ms`):

- `MAX_RETRY_ATTEMPTS=8`, `MAX_RETRY_DELAY_MS=30000`
- `Number.isSafeInteger(1e9)=true`, `Number.isSafeInteger(Infinity)=false`
- 1e9 calls **8**; Infinity **1**; 0 **1**; -5 **1**; 9 **8**; NaN **1**
- linear delay `1e12`, 3 attempts: calls 3, delays `[30000,30000]`
- exponential `20000`, 3 attempts: delays `[20000,30000]`
- Infinity delay, 3 attempts: delays `[0,0]`
- synthetic parse: keys `["net"]` only (9 / 40000ms / 0 skipped)

The 1e9 suite case is the discriminating clamp detector. Infinity would
still collapse to 1 from `Number.isSafeInteger` even without `Math.min`.

## Challenge 1 — can `1e9` declared attempts loop past 8?

**No. CONFIRMED.** `1_000_000_000` is a safe integer `>= 1`, so the
host ceiling is the only bound: `Math.min(1e9, 8)=8`. Suite and
independent both recorded 8 calls then throw.

Locators: `retryPolicy.ts` 110–117; dist `retryPolicy.js` 76–78.

## Challenge 2 — do Infinity and non-positive collapse to one try?

**Yes. CONFIRMED.** Infinity is not a safe integer. `0` / `-5` fail
`>= 1`. Both paths select `1`, then `Math.min(1, 8)`. Suite covers
Infinity and `0`. Independent also covers `-5` and `NaN`.

## Challenge 3 — is delay capped at `MAX_RETRY_DELAY_MS`?

**Yes on this dirty dist. CONFIRMED.** HEAD `computeDelay` returned
uncapped exponential `delayMs * 2^(attempt-1)`. Dirty + dist
`Math.min(raw, 30000)` after a finite-positive base check. Independent
`1e12` linear sleeps were 30s each, not `1e12`; exponential 20s then
30s, not 40s. Infinity delay does not hang (`sleep(0)`).

No suite test on this axis. Detector gap, not a product miss on the
inspected tree.

## Residuals (not findings against the named claim)

- `parseRetryPolicy` still silently `continue`s invalid decls (attempts
  `> 8`, delay `> 30000`, attempts `< 1`). Fail-safe is default 1
  attempt via missing map entry, not a diagnostic refuse. Comment
  “refuse rather than loop” overstates parse behaviour; execution
  clamps.
- Named suite does not cover delay cap, negative attempts, or parse
  skip. Delay and extra attempt cases were independent-only.
- Per-sleep cap is 30s; worst-case wait is 7 sleeps (210s) plus 8
  calls. Bounded, not a total wall-time budget.
- `strategy: "none"` still retries up to the clamped attempt count; it
  only skips delay.
- 124-finding scan remains a separate open programme. Overall
  disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for production
  admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Attempt detectors can go
red (1e9 without the `Math.min` would not stop at 8). Delay has
source/dist/independent evidence and a suite gap. Evidence is
sufficient for `withRetry` on this dirty tree.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan
closure.
