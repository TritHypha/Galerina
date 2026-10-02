# Independent audit — verify success banner is after signature / revocation

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `galerina.mjs` `verify` prints `✅ … manifest verified` only
AFTER `requireSigned` / signature / revocation handling. Scan-era printed
the banner before `Signature verification (#109)`. Hostile source-shape:
banner index > `requireSigned` and > `FUNGI-MANIFEST-TAMPER: Signature
verification FAILED` and > `FUNGI-MANIFEST-REVOKED-KEY`; the slice from
`command === "verify"` to `requireSigned` must not contain
`manifest verified`.

This reviewer independently re-measured those indices on the working-tree
bytes (not by trusting the named test’s result). Working-tree `verify`
is a single `if (command === "verify")` at line 1705. The success
`console.log(\`✅ ${fungiFile}: manifest verified\`)` is the only
`manifest verified` string in `galerina.mjs` (line 1981). It sits after
the `#109` signature block closes (line 1979) and before the verify
`return` (line 1992). Execution is sequential in that `try`: fail paths
`process.exit(1)` and do not reach the banner.

HEAD `galerina.mjs` still has the scan-era order: banner line 1805,
`Signature verification (#109)` line 1813, `requireSigned` line 1823.
Dirty vs HEAD `galerina.mjs` also includes earlier CBOR-subject work
(`selectManifestAuthSubject`). That rewrite is **not** this claim and
was not audited here.

Tests: `tests/verify-success-banner.test.mjs` (untracked). One
`node:test` that `readFileSync`s `galerina.mjs` and asserts the hostile
source-shape. It does not spawn `galerina.mjs verify`.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). This
reviewer did not rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M` `galerina.mjs`
(+39 / −63: banner block moved from before `#109` to after the
signature/revocation/unsigned gates; plus CBOR-subject rewrite).
`??` `tests/verify-success-banner.test.mjs`. Unrelated dirty on this
worktree was not this claim.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions`.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (Get-FileHash and
`crypto.createHash('sha256')` MATCH).

| path | bytes | sha256 |
|---|---|---|
| `galerina.mjs` | 188257 | `a21e6d07ef66718ebd74e959a1c91856fa849c001780318e35a571568d2641a5` |
| `tests/verify-success-banner.test.mjs` | 1109 | `8db6f90e5c9aa75e27ad4692973cab0cee9ccc2e9b94b1e2abfbdd9a1ab28410` |

Git blobs (working tree): `galerina.mjs`
`a580e097b6894084bbb696d89f4698942b260c17`; test
`eb06edddb337a5e4db02c51449fa18ce7086c7df`. HEAD `galerina.mjs` blob
`e5bbafe90182130bf49a07f3193d3ce5632b179e` (sha256
`cf0828045fc843bc1ad8d6337495d38877bd95a49d7b1461aa59eca51868614b`,
187392 bytes). Working-tree `galerina.mjs` is CRLF on disk; HEAD blob
is LF. Index math used the on-disk working-tree bytes.

## Hostile source-shape (independent)

Working tree (`galerina.mjs` sha256 `a21e6d07…`):

| needle | index | line |
|---|---|---|
| `if (command === "verify")` | 99600 | 1705 |
| `const requireSigned = resolveSigningProfileWarned()` | 107218 | 1816 |
| `FUNGI-MANIFEST-REVOKED-KEY` (first after verify) | 110487 | 1867 |
| `FUNGI-MANIFEST-TAMPER: Signature verification FAILED` | 117250 | 1953 |
| `manifest verified` (only occurrence) | 119163 | 1981 |

- `banner > requireSigned` — **CONFIRMED** (119163 > 107218)
- first `FUNGI-MANIFEST-TAMPER: Signature verification FAILED` after
  verify is `> requireSigned` and `< banner` — **CONFIRMED**
- first `FUNGI-MANIFEST-REVOKED-KEY` after verify is `> requireSigned`
  and `< banner` — **CONFIRMED** (hybrid path 1867; classical path 1924
  also before the banner)
- `src.slice(verify, requireSigned)` does not contain
  `manifest verified` — **CONFIRMED** (`sliceHasBanner=false`)

HEAD (scan-era order, blob `e5bbafe9…`):

| needle | index | line |
|---|---|---|
| `if (command === "verify")` | 97896 | 1705 |
| `manifest verified` | 104527 | 1805 |
| `Signature verification (#109)` | 104987 | 1813 |
| `const requireSigned = resolveSigningProfileWarned()` | 105885 | 1823 |

HEAD `sliceHasBanner=true`; `bannerAfterRequire=false`; banner is before
`#109`. That is the scan-era print-before-gate shape. Working tree
inverts it.

`FUNGI-MANIFEST-REVOKED-KEY` also appears at working-tree lines 2102 and
2141 inside `if (command === "run")` after verify’s `return`. Those
strings are not the verify success banner and are not this claim.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Verify success banner is `✅ ${fungiFile}: manifest verified` | working-tree line 1981; only `manifest verified` in the file |
| Banner is after `requireSigned` | 1981 > 1816; independent indices; named test |
| Banner is after `FUNGI-MANIFEST-TAMPER: Signature verification FAILED` | 1953 < 1981; `process.exit(1)` on that path |
| Banner is after `FUNGI-MANIFEST-REVOKED-KEY` in verify | 1867 and 1924 < 1981; both `process.exit(1)` |
| Slice `verify`…`requireSigned` has no `manifest verified` | independent `sliceHasBanner=false`; named `assert.doesNotMatch` |
| Scan-era printed banner before `#109` | HEAD lines 1805 then 1813 then 1823 |
| Unsigned-dev still reports verified after the unsigned notice | line 1841 notice, then fall-through to 1981 — **allowed residual** |
| Production unsigned `process.exit(1)` before the banner | lines 1837–1839 `FUNGI-MANIFEST-UNSIGNED` then `process.exit(1)` — **allowed residual** |
| Named node test | **1/1 pass**, 0 fail, `duration_ms 124.5198` |
| Live `galerina.mjs verify` of tamper/revoked | **not this claim** (source-shape only) |
| CBOR-subject rewrite / production admission / 124-scan | **not this claim** |

## Command receipts

1. `node --test --test-timeout=60000 tests/verify-success-banner.test.mjs`
   → **1/1 pass**, 0 fail, `duration_ms 124.5198`.
   - `verify success banner is after the signature and revocation gate` — **green** (1.5815ms)

Independent extra measurement (eval only; stdin to `node`; not
production): working-tree indices and HEAD indices above. Printed
`bannerAfterRequire=true` / HEAD `bannerAfterRequire=false`.

## Challenge 1 — is the success banner still before `#109` / `requireSigned`?

**No. CONFIRMED moved.** HEAD prints at 1805 before `#109` (1813) and
`requireSigned` (1823). Working tree prints at 1981 after `requireSigned`
(1816) and after the signature/revocation block (1806–1979). Detector
can go red on HEAD bytes and green on working-tree bytes.

## Challenge 2 — does `verify`…`requireSigned` still contain `manifest verified`?

**No. CONFIRMED absent** in the working-tree slice. HEAD slice contains
it. Named test `assert.doesNotMatch(src.slice(verify, requireSigned),
/manifest verified/)`.

## Challenge 3 — can tamper / revoked-key still reach the banner?

**Not on the named verify fail strings.** Classical
`FUNGI-MANIFEST-TAMPER: Signature verification FAILED` (1953) and both
verify `FUNGI-MANIFEST-REVOKED-KEY` sites (1867, 1924) `process.exit(1)`
before line 1981. This is source-shape plus control-flow read, not a
spawned CLI against a hostile `.lmanifest`.

## Challenge 4 — does unsigned-dev still print verified?

**Yes. Allowed residual.** `subject.unsigned` + non-production
`requireSigned` logs the unsigned notice (1841) and does not return, so
line 1981 still runs. Production unsigned `process.exit(1)` at 1839
before the banner.

## Challenge 5 — is this live signature-gate evidence or 124-scan closure?

**No.** Named test is `readFileSync` source-shape. Dirty `galerina.mjs`
also contains CBOR-subject work that this review did not admit. This is
**not** production admission and **not** 124-scan closure.

## Residuals (not findings against the named source-shape claim)

- Unsigned-dev still reports `manifest verified` after the unsigned
  notice (1841 then 1981). Named allowed residual.
- Production unsigned still `process.exit(1)` before the banner (1837–
  1839). Named allowed residual.
- Incomplete signature object in dev warns (1977) and then falls through
  to the same banner; production incomplete-sig `process.exit(1)` at
  1974–1975. Same residual family as unsigned-dev.
- Named test does not spawn `galerina.mjs verify`, does not feed a
  tampered/revoked manifest, and does not assert stdout order at
  runtime. Claim is hostile source-shape.
- Dirty `galerina.mjs` also rewrites JSON-sidecar / CBOR-subject
  authentication (`selectManifestAuthSubject`). Not audited here.
- `FUNGI-MANIFEST-REVOKED-KEY` in the `run` command (2102, 2141) is
  after verify’s `return`. Not this claim.
- This worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the named verify-banner source-shape. Detector
is not invalid: HEAD bytes still print before `#109`; working-tree bytes
print after `requireSigned`, tamper-FAILED, and verify revoked-key.
Evidence is sufficient for those bullets; insufficient for live CLI
tamper/revoked stdout, CBOR-subject correctness, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
