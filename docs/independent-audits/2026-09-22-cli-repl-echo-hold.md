# Independent audit — secrets-spore REPL no-echo (`promptNoEchoExclusive`)

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: REPL `set` / passphrase no longer echoes dummy secret bytes
through an attached readline interface. `promptNoEcho` detaches both `data`
and `keypress` listeners; `promptNoEchoExclusive` pauses the line reader and
mutes `_ttyWrite` for the prompt lifetime including Ctrl-C abort. Non-TTY
still refuses.

Hardware TTY is **NOT VERIFIABLE**. This is **not** 124-scan closure.
JSON-Decimal, OAuth, durable replay, signing, and `.fungi` admission were
not started. Dummy secret bytes only (`dummy-secret-value`).

Node v24.18.0, npm 12.0.2, Windows 11. Tests import `dist/` (gitignored).
`dist/io.js` / `dist/cli.js` mtimes are newer than the dirty sources and
contain the same listener-steal, exclusive mute, and `runShell` `rl` wiring.
This reviewer did not rebuild.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-ext-secrets-spore/src/io.ts` | `f90713783af4b3b7ecdb0416ea1c2c8070fb9997403768613b7edfc56fe97ff5` |
| `packages-ts/galerina-ext-secrets-spore/src/cli.ts` | `e7b32bda2db31404d785a9632602c1d4f1dc8e47af3c944bcced19eb095ab6f5` |
| `packages-ts/galerina-ext-secrets-spore/dist/io.js` | `15c2d8049eea6052c335091fc589e98ce6bc161415a04f2e4d6ab2302d420ca2` |
| `packages-ts/galerina-ext-secrets-spore/dist/cli.js` | `0cb90d3311e57d81dd0d965e7e6e72fa3adb97caa2366ab19fde071ec4fb5bd9` |
| `packages-ts/galerina-ext-secrets-spore/tests/cli-repl-echo.test.mjs` | `33906ce4ff84ddfac1a77ab8a1d9c4508f761af3d3fe931c1f6822f4d9f077bd` |
| `packages-ts/galerina-ext-secrets-spore/tests/io-prompt.test.mjs` | `3cfa81b23e6bcedbf8e776d875067e90d95b2079e200c6522f32afe488328ae1` |
| `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `caa56ee4e80d255f7d2b916364c130fe254b9075fe5b5098f1edfdf2cec44426` |

Author hashes **matched** this tree for `io.ts` and `cli.ts`. Dirty paths:
`M` `src/io.ts`, `M` `src/cli.ts`; untracked `tests/cli-repl-echo.test.mjs`
and `tests/io-prompt.test.mjs`. Passing tests here are **not** production
admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `promptNoEcho` refuses non-TTY (no echo fallback) | source `io.ts` 51; executed `io-prompt.test.mjs` |
| `promptNoEcho` detaches `data` **and** `keypress`, restores both | source `io.ts` 56–59 / 90–93; dist `io.js` 61–64 / 97–102 |
| `promptNoEchoExclusive` pauses, mutes `_ttyWrite`, restores on abort | source `io.ts` 120–137; executed exclusive + Ctrl-C tests |
| REPL `set` / passphrase / `list` / `rm` pass `rl` into exclusive | source `cli.ts` `withRecipientSecret` 90–92, `runShell` 250–272; dist `cli.js` 82–84 / 235–264. **Inspected, not process-executed.** |
| Dummy bytes must not appear on readline output | executed `cli-repl-echo.test.mjs`; independent probe that the same fixture **does** echo without the control |
| Hostile `_ttyWrite` detector can go red | executed first test (assert includes dummy) |
| Hardware TTY / kernel echo / `setRawMode` on a real fd | **NOT VERIFIABLE** |
| 124-finding scan | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-ext-secrets-spore/tests/io-prompt.test.mjs packages-ts/galerina-ext-secrets-spore/tests/cli-repl-echo.test.mjs` → **7/7 pass**, `duration_ms 138.5158`.
   - hostile control: live `_ttyWrite` still echoes dummy secret bytes — **red** (assert includes dummy).
   - `promptNoEchoExclusive` mutes readline `_ttyWrite` for dummy secret bytes — **green**.
   - `promptNoEchoExclusive` restores `_ttyWrite` after Ctrl-C — **green**.
   - `promptNoEcho` with attached readline does not echo dummy secret bytes — **green**.
   - `promptNoEcho` refuses non-TTY stdin instead of falling back to echo — **green**.
   - raw-mode restore after success and after Ctrl-C — **green**.
   Runner stderr showed only the prompt strings `value: ` / `secret: `, not dummy secret bytes.
2. `node --test --test-timeout=120000 --test-name-pattern="nested secret call|sentinel above" packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` → **2/2 pass**, `duration_ms 385.4387`. Nested `outer(7)===14`. Sentinel `0x11111111` above live heap survived. Phase B oracles were **not** changed by this review.

Independent extra probes (eval only; not production, dummy bytes only):

- Same fake-TTY `EventEmitter` + `createInterface({ terminal: true })` **without** `promptNoEcho`: `data` emit of `dummy-secret-value\n` **does** appear on the readline output stream. The attached-readline green test is not vacuous on this fixture.
- Node v24.18.0 keypress handler is `self[kTtyWrite](s, key)`. Assigning `rl._ttyWrite = () => undefined` intercepts that path on this fixture (live `data` emit hits the mute, not the secret bytes).
- Node `Interface.pause()` does **not** gate `[kTtyWrite]`; it pauses `input`. On the fake stdin, `pause` is a no-op, so this review’s mute/detach evidence does not prove real-stream pause.

## Challenge 1 — does attached readline still echo dummy bytes?

**No on the synthetic fixture. CONFIRMED closed for that fixture. Hardware TTY NOT VERIFIABLE.**

Locators: `io.ts` 56–59 (steal `data` + `keypress`); `io.ts` 120–137
(exclusive pause + `_ttyWrite` no-op + `finally` restore); `cli.ts` 255
(`set` value) and 92 / 250–272 (passphrase / list / rm pass `rl`).

Without the control, the same `createInterface` fixture writes
`dummy-secret-value` to output (independent probe). With
`promptNoEcho` / `promptNoEchoExclusive`, the suite asserts those bytes are
absent. Listener detach is the primary control (readline never sees the
keys). Exclusive mute is defense-in-depth and is exercised by a direct
`rl._ttyWrite(DUMMY)` call after mute.

## Challenge 2 — can the `_ttyWrite` echo detector go red?

**Yes. CONFIRMED.** The hostile control constructs a live `_ttyWrite` that
writes dummy bytes and asserts `Buffer.concat(chunks).includes(DUMMY)`.
That test passed (detector red). A happy-path-only mute test would not
satisfy this axis.

## Challenge 3 — non-TTY refuse?

**Yes on the fake non-TTY stdin. CONFIRMED for that path.**
`promptNoEcho` throws `/TTY/` before writing a prompt. No echo fallback.

## Residuals (not findings against the named claim)

- Hardware TTY, kernel/conhost echo, and real `setRawMode` on fd 0 are
  **NOT VERIFIABLE** from fake-stdin unit tests.
- Full `galerina-secrets-spore shell` process was not executed; `runShell`
  wiring is source/dist inspection only.
- Fake `pause()` is a no-op; real-stream pause is unproven here.
- `_ttyWrite` mute is coupled to Node’s readline private API. Proven on
  Node v24.18.0 in this session; other Node versions are untested.
- Non-REPL `set` still calls `promptNoEcho` (no attached `rl`). Out of
  named REPL claim.
- 124-finding scan remains a separate open programme.
  Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid.
Evidence is sufficient for the synthetic readline fixture and the inspected
CLI wiring; insufficient for hardware TTY and scan closure.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
