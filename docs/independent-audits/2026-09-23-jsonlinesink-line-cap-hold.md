# Independent audit — JsonLineSink whole-line bound HOLD

**Verdict: PASS** (named whole-line bound slice). Finding
`csf_fd74b2a34bfe325906af1691` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d061-70c5` (did not author these
changes). Not Astra.

Named claim: `JsonLineSink.write` never emits a serialized line longer
than `MAX_LOG_LINE_CHARS` (4096); oversize lines become a bounded JSON
overflow marker; small records still serialize as JSON under the cap.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Emitted line never longer than 4096 chars | **CONFIRMED** |
| Oversize replaced with complete JSON marker, not sliced JSON | **CONFIRMED** |
| Small records still parse as original JSON | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Finding stays PARTIAL (MemoryLogSink still retains large fields) | **CONFIRMED** |
| Production admission | **NOT VERIFIABLE** |

## Locators

- `packages-ts/galerina-observability/src/logger.ts` `JsonLineSink.write`
  108–120; `MAX_LOG_LINE_CHARS` 136; `LOG_LINE_OVERFLOW` 137.
- Tests: `tests/logger.test.mjs` 223–243.

## RED / GREEN actually run

Observability `tsc -p tsconfig.json` → exit 0.

`node --test tests/logger.test.mjs` → **27/27**, 0 skip.

Independent probe: raw stringify 8245 → emitted 69 overflow marker;
small record length 53 parses; exact 4096 kept; 4097 replaced.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/logger.ts` | 14753 | `cd7980241065ecbc3fb199afd54fcbb23c7e0cac6f6ea4e3a67bcafe4803ed76` |
| `dist/logger.js` | 12731 | `2f5dc12c535e62a40b7461912411daae9535b7f1788002d221b886e9048da3ef` |
| `tests/logger.test.mjs` | 12184 | `4d64848bcf6601b3ae9af5ca12495eebea2b8c3f3eec06b57e84c35b0ed8f205` |

## Remaining risk

Dirty tree. MemoryLogSink still retains large field JSON. `safeStringify`
still allocates the oversize string before the length check. Bound is
UTF-16 `.length`, not UTF-8 bytes. `JsonLineSink` does not append `\n`.
Overflow marker drops the original record. Not production admission.
