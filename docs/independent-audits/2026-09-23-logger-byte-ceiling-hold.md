# Independent audit — logger byte ceiling / message truncation

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

Finding `csf_fd74b2a34bfe325906af1691` stays **PARTIAL_THIS_TREE**. This
reviewer does **not** promote it to PATCHED.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This receipt
is not the author’s packet and is not GPT Astra. Passing tests here are
**not** production admission. Finding inventory was **not** promoted.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `MemoryLogSink` now has `DEFAULT_MAX_MEMORY_LOG_BYTES` 1 MiB drop-oldest
  in addition to `maxRecords` 4096.
- `Logger` truncates `msg` at `MAX_LOG_MESSAGE_CHARS` 4096 (never throws).
- Hostile tests: oversize message truncated; byte ceiling drops oldest.
- Positive: short message retained in full.
- Tests `logger.test.mjs` **25/25**.
- Finding `csf_fd74b2a34bfe325906af1691` stays **PARTIAL_THIS_TREE**. Do
  **not** promote PATCHED.
- Residual: `JsonLineSink` host writer is still unbounded per truncated
  line; field JSON can still be large within redaction node cap.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read
`packages-ts/galerina-observability/src/logger.ts` and
`packages-ts/galerina-observability/tests/logger.test.mjs`, hashed
working-tree bytes, rebuilt gitignored `dist/` with `npx tsc -p tsconfig.json`,
re-ran `node --test tests/logger.test.mjs`, and executed an extra probe of
the named residual (not by trusting the named tests alone). Author-named
hashes were **not** supplied. Independent `crypto.createHash('sha256')` and
`Get-FileHash` **MATCH** each other on every hashed row
(`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-observability/src/logger.ts` | **M** HEAD blob `63d5107488` → WT blob `676ece4089` (+49 / −4). THIS TURN: `admitLogMessage` truncates at `MAX_LOG_MESSAGE_CHARS` 4096; `MemoryLogSink` constructor `(maxRecords = 4096, maxBytes = DEFAULT_MAX_MEMORY_LOG_BYTES)` with `#byteSizes` / `#totalBytes`; drop-oldest while record count or byte budget would overflow; single-record `size > #maxBytes` refused. |
| `packages-ts/galerina-observability/tests/logger.test.mjs` | **M** HEAD blob `ed9920e756` → WT blob `a378a1467e` (+29 / −1). THIS TURN: import `MAX_LOG_MESSAGE_CHARS`; positive short `"ok"` retained in full; hostile oversize truncated to 4096; hostile `MemoryLogSink(100, 200)` drop-oldest under byte ceiling. |
| `packages-ts/galerina-observability/src/index.ts` | **clean** HEAD = WT. Barrel `export * from "./logger.js"`. |
| `packages-ts/galerina-observability/dist/logger.js` | gitignored; rebuilt this turn (`npx tsc -p tsconfig.json`, exit 0). Carries the named controls. |

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other).

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-observability/src/logger.ts` | 14399 | `b95a38427448ecdd934af2711707d27b9946d016c1389f2a8a2d68f90acd564b` | 2026-09-23T17:30:46.337Z |
| `packages-ts/galerina-observability/tests/logger.test.mjs` | 11172 | `87e9a6e52c663897ff0a80b233ea41967805aa40d17ce5009298ccfcf29175eb` | 2026-09-23T17:30:46.333Z |
| `packages-ts/galerina-observability/src/index.ts` | 847 | `8ed659ba06963f1f52b5a8366506615017f24e6b7b17fe43fc74384a4515ba54` | 2026-09-08T20:31:57.564Z |
| `packages-ts/galerina-observability/dist/logger.js` | 12358 | `dbdda2a529bdbe5555f4354f68d5f3ad580a4ce1ff9a189c6eeecfee482604d2` | 2026-09-23T17:32:21.563Z |
| `packages-ts/galerina-observability/dist/index.js` | 832 | `35347d188bd4a1fb4cc19c22ff30e991774b88aa7346222655f43e09052c0c6b` | 2026-09-23T17:32:21.578Z |

Hash comparison: **MATCH** on all five rows. **MISMATCH_COUNT=0**.

## Named controls independently read

`MemoryLogSink` (src lines 62–96, dist 39–74):

- Default `maxRecords = 4096`.
- Default `maxBytes = DEFAULT_MAX_MEMORY_LOG_BYTES` (`1_048_576` = 1 MiB).
- `write` computes `recordStoredBytes` (UTF-8 of `msg` + optional `logger` +
  JSON of `fields` + `RECORD_BYTE_OVERHEAD` 64).
- If `size > #maxBytes`, the record is refused (not retained).
- Else drop-oldest via `#records.shift()` / `#byteSizes.shift()` while
  `length >= #maxRecords` **or** `#totalBytes + size > #maxBytes`.
- Then a second refuse if the empty sink still cannot admit the record.

`Logger.#emit` (src 266–289) sets `msg: admitLogMessage(msg)`.
`admitLogMessage` (src 55–59) coerces non-strings and `slice`s to
`MAX_LOG_MESSAGE_CHARS` (4096). It does not throw. The outer `#emit`
`try/catch` still isolates construction failures.

Exported constants (src 129–132):

- `MAX_LOG_MESSAGE_CHARS = 4096`
- `DEFAULT_MAX_MEMORY_LOG_BYTES = 1_048_576`

## Tests independently re-run

Cwd: `packages-ts/galerina-observability`.

| command | result |
|---|---|
| `npx tsc -p tsconfig.json` | exit **0** |
| `node --test tests/logger.test.mjs` | **25/25 pass**, fail 0, cancelled 0, skipped 0, todo 0, duration_ms 140.3592, exit **0** |

Named tests present in `logger.test.mjs`:

- `positive: a short message is retained in full` — `"ok"` length 2.
- `hostile: oversize messages are truncated to MAX_LOG_MESSAGE_CHARS` —
  `"x".repeat(MAX_LOG_MESSAGE_CHARS + 50)` → length 4096.
- `hostile: MemoryLogSink drops oldest records to stay under the byte ceiling`
  — `new MemoryLogSink(100, 200)` with three 80-char writes; oldest `"a"` gone;
  last retained starts with `"c"`.
- Existing record-count ceiling: 4097 writes → 4096 retained (`n1`…`n4096`).

Independent extra probe (not the named suite):

- `MAX_LOG_MESSAGE_CHARS === 4096`, `DEFAULT_MAX_MEMORY_LOG_BYTES === 1048576`.
- Short `"ok"` retained in full; oversize truncated to 4096.
- Byte-ceiling probe: 3×80-char writes into 200-byte cap → 1 retained (`c`),
  `"a"` dropped.
- `JsonLineSink` residual probe: truncated 4096-char `msg` plus an 8000-char
  field produced **one** host line of **12168** characters
  (`jsonLineUnboundedVsMsg=true`). A 256-key field object (redaction node cap)
  produced a **12753**-character line. `JsonLineSink.write` still calls
  `this.#writeLine(safeStringify(record))` with **no** per-line byte ceiling.

## Finding status — do not promote PATCHED

Independent read of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`:

- `finding_id`: `csf_fd74b2a34bfe325906af1691`
- `disposition`: **PARTIAL_THIS_TREE**
- `severity`: low
- `path`: `packages-ts/galerina-observability/src/logger.ts`
- Inventory still binds `worktree_head`
  `91b4dec08fe4376febc9494a8023bd02912b8695` (not this live HEAD).
- Inventory counts: **0 OPEN / 120 PARTIAL / 4 PATCHED** (`n` 124).
- `overall`: `INCOMPLETE_NON_AUTHORITATIVE`.

This review does **not** rewrite that JSON and does **not** promote the
row to `PATCHED_AUDIT_PENDING` or PATCHED.

## Residuals (named residual independently confirmed)

1. **`JsonLineSink` host writer is still unbounded per truncated line.**
   `write` forwards `safeStringify(record)` to the caller-supplied writer
   with no max-bytes / max-records gate. Independent probe: 12168-character
   line after `msg` truncation.
2. **Field JSON can still be large within the redaction node cap.**
   `MAX_REDACTION_NODES = 256`, `MAX_REDACTION_DEPTH = 8`. Independent
   probe: 256 string fields of 40 chars → 12753-character JSON line.
3. Default 1 MiB aggregate is exported and wired as the constructor
   default; the named hostile test exercises a **200-byte** override, not
   the live 1 MiB default. Record-count 4096 remains separately tested.
4. `admitLogMessage` truncates on JS string length (UTF-16 code units),
   not UTF-8 bytes. `MemoryLogSink` charges UTF-8. Direct
   `MemoryLogSink.write` / `JsonLineSink.write` bypass Logger truncation.
5. Scan inventory remains bound to candidate `91b4dec0`. This dirty HEAD
   `e8f1b682` is **not** production admission and **not** 124-scan closure.

## Non-actions

No commit. No merge. No push. No signing. `.fungi` not touched. Production
`src/` and tests not edited by this reviewer. Dist rebuild was gitignored
`tsc` output required by the named test import of `../dist/index.js`.
This receipt is not a PATCHED promotion.
