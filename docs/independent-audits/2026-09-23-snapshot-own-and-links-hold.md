# Independent audit — snapshot `#ownSnapshot` and planted `.snap` symlink refuse

**Verdict: PASS** (scoped to the two named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims:

- **A** `csf_44389b10328fc0b12408a84c`: `StateSerializer` `#ownSnapshot`
  copies `payloadJson`; `verify(swapped getter)` is true then
  `deserialize` throws `LSS-INTEGRITY-001` and does not parse `{a:9}`.
- **B** `csf_8b808c52eea585b85adaabc8`: `AtomicWriter` `write`/`read`/`scrub`
  refuse a planted `.snap` symlink with `LSS-LINK-001` and do not
  overwrite the outside target. `ColdBootOrchestrator.scrub` delegates
  to `writer.scrub`.

This reviewer independently re-read src+dist, hashed working-tree bytes,
ran the named suites, and executed extra probes from `%TEMP%` against
`dist/` (not by trusting the named tests alone).

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Tests
import gitignored `dist/`. This reviewer did not rebuild. Dist mtimes
are newer than the matching src files and contain the same
`#ownSnapshot` / `refuseSnapshotSpecialFile` / `this.#writer.scrub(name)`
logic.

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions`.

Dirty slice for these claims vs HEAD `91b4dec0`:

- Claim A source `state-serializer.ts` is **identical to HEAD** (blob
  `be7d532aff4aa992620d89450fe8e57c7e082c5c`). Dirty is the hostile
  getter test in `tests/serializer.test.mjs`.
- Claim B: `M` `atomic-writer.ts` (FIFO helper + `refuseSnapshotSpecialFile`
  extracted from HEAD’s inline `isSymbolicLink` refuse), `M`
  `tests/atomic-writer.test.mjs` (outside-body assert; skip instead of
  silent return; extra FIFO tests), `M` `src/index.ts` re-export.
  `cold-boot.ts` dirty also contains rollback-floor work **not** this
  claim; `scrub()` still only calls `this.#writer.scrub(name)`.

Scan revision `0f24ca30ef3f173c43a60c914c18b161327f2227` deserialized
`JSON.parse(snap.payloadJson)` with no `#ownSnapshot`, and its
`atomic-writer.ts` had **zero** `LSS-LINK-001` / `isSymbolicLink` hits.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH the named pins).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-sentinel-state/src/state-serializer.ts` | 8808 | `6e107f05fb544e88b3d4ae3def29f80043bd554a96d77e2eb315cbb0f19a69ff` |
| `packages-ts/galerina-core-sentinel-state/dist/state-serializer.js` | 7491 | `5d8cbbce8012e70342cc5eed38131a613de8fa053b87923c6dff7bb568027e53` |
| `packages-ts/galerina-core-sentinel-state/tests/serializer.test.mjs` | 3076 | `f57fa68425166dae9af12b68109f7d996b225355f8051a23e8808391bfd7a5b6` |
| `packages-ts/galerina-core-sentinel-state/src/atomic-writer.ts` | 7892 | `1f093d3e4ed2a207dcf0c61fa8a12c4018609de9e0e38394858b3a36e7c70dc8` |
| `packages-ts/galerina-core-sentinel-state/dist/atomic-writer.js` | 7949 | `6ae2732bd62d9bb4dab4f633f60902a41271f3cc338f842ee27a4215f24d191c` |
| `packages-ts/galerina-core-sentinel-state/tests/atomic-writer.test.mjs` | 3504 | `42a44c7189c8050cf8d9067ae78104558739f4678cbddcaa8fd64f2a8f2ddcb1` |
| `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | 7747 | `9498fc013b4fef33e21b3bf3f63b1441dc76108fde47d469ac8fd4a1f2607cd4` |
| `packages-ts/galerina-core-sentinel-state/dist/cold-boot.js` | 7107 | `f744e1aa09ee01adfb666c448b4dd10ca38344d0b3f8c7ad98d1c2f647e325f7` |

Git blobs (working tree): serializer src `be7d532a…` (= HEAD);
serializer test `00ceb027…` (HEAD `a045c4c9…`); atomic-writer src
`a502740d…` (HEAD `0c5977fa…`); atomic-writer test `fe8f81fd…` (HEAD
`ae542d0a…`); cold-boot src `dd943f6a…` (HEAD `d64c6494…`).
`dist/` is gitignored (`packages-ts/.gitignore` `dist/`).

Dist is **not stale** vs src for `#ownSnapshot`: both copy
`const payloadJson = snap.payloadJson` into a new object; `verify` MACs
`owned.payloadJson`; `deserialize` parses `owned.payloadJson` after
`verify(owned)`. Dist serializer mtime `2026-09-23T02:15:41Z` is newer
than src `2026-09-22T08:03:56Z`. Dist atomic-writer / cold-boot mtimes
are likewise newer than their src.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `#ownSnapshot` copies `payloadJson` once per call | src 216–238 / dist 123–143 |
| `verify` uses the owned copy | src 243–266 / dist 147–165 |
| `deserialize` parses the owned copy, not a later getter | src 279–286 / dist 177–181 `JSON.parse(owned.payloadJson)` |
| Named sequence: `verify(swapped)=true` then throw `LSS-INTEGRITY-001` | named test + independent Proxy/`defineProperty` probes; `{a:9}` never returned |
| Dist `#ownSnapshot` matches src | hashes + method bodies; tests import `../dist/index.js` |
| `write`/`read`/`scrub` lstat-refuse symlink `LSS-LINK-001` | src `refuseSnapshotSpecialFile` 45–47; `#refuseLink` / `read` / `scrub` call it before open |
| Planted `.snap` symlink does not overwrite outside | named test + independent probe `outsideBody==="secret-outside"` |
| `ColdBootOrchestrator.scrub` delegates | src 189–191 / dist 139–141 `this.#writer.scrub(name)`; live `orch.scrub` also `LSS-LINK-001` |
| Named node tests | serializer **6/6**; atomic-writer **6/6** including symlink **pass** (not skip) |
| Inventory 66/54/4 | independent recount of `scan-0f6063dd-inventory-2026-09-22.json` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-sentinel-state/tests/serializer.test.mjs packages-ts/galerina-core-sentinel-state/tests/atomic-writer.test.mjs`
   → **12/12 pass**, 0 fail, 0 skip, `duration_ms 3170.126`.
2. Serializer only → **6/6 pass**, `duration_ms 144.3334`.
   - `hostile: a getter cannot make deserialize parse a different payload than HMAC verified` — **green** (0.2865ms)
3. Atomic-writer only → **6/6 pass**, `duration_ms 3458.5177`.
   - `write and scrub refuse a planted snapshot symlink` — **green** (2.3525ms), **not skipped**
   - extra FIFO tests also green on this host (WSL live FIFO); **not** Claim B

Independent extra (`%TEMP%\zt-snapshot-own-links-probe.mjs` and
`zt-hardlink-scrub-probe.mjs`; stdin/eval not used; not production):

Claim A (dist `StateSerializer`):

| probe | result |
|---|---|
| Proxy first-good then `{"a":9}`: `verify` then `deserialize` | `verify===true`; throw `SecurityTrap` `LSS-INTEGRITY-001`; value null; `parsedA9===false`; 2 payload reads |
| same Proxy, `deserialize` only | ok `{a:1}`; `parsedA9===false` (owns the first/good read) |
| Proxy first-`{"a":9}` then good: `verify` then `deserialize` | `verify===false`; later deserialize `{a:1}`; `parsedA9===false` |
| `Object.defineProperty` getter, named sequence | same as Proxy named sequence |
| honest `{a:1}` | verify true; deserialize `{a:1}` |

Claim B (dist `AtomicWriter` + `ColdBootOrchestrator`):

| probe | result |
|---|---|
| `symlinkSync(outside, ckpt.snap)` | succeeded; `lstat.isSymbolicLink===true` |
| `write` / `read` / `scrub` / `orch.scrub` | all `LSS-LINK-001`; live still a link |
| outside file | still `secret-outside` |
| `fs.constants.O_NOFOLLOW` | **undefined** on this win32 Node |
| hardlink residual (not named) | `write` allowed (`isSymbolicLink===false`); `scrub` zeros the shared inode (outside 15 NUL bytes) |

## Challenge 1 — can a swapped getter make `deserialize` parse `{a:9}` after HMAC of `{a:1}`?

**No. CONFIRMED closed for the named getter.** `#ownSnapshot` copies
`payloadJson` by value. `deserialize` re-owns, `verify`s that owned
plain object, then `JSON.parse(owned.payloadJson)`. The unauthenticated
`{"a":9}` fails checksum/HMAC and throws `LSS-INTEGRITY-001`. Independent
Proxy and `defineProperty` probes never returned `{a:9}`.

Scan-era `0f24ca30` parsed live `snap.payloadJson` after verifying the
same object; that TOCTOU is the detector. HEAD already has `#ownSnapshot`;
the dirty test is the hostile oracle.

## Challenge 2 — is dist stale vs src for `#ownSnapshot`?

**No. CONFIRMED not stale.** Dist contains `#ownSnapshot`, copies
`payloadJson`, verifies `owned.*`, parses `owned.payloadJson`. Dist
mtime is newer. Named tests and extra probes imported `dist/index.js`
and observed the claimed throw.

## Challenge 3 — do `write`/`read`/`scrub` follow a planted `.snap` symlink and overwrite the outside target?

**No. CONFIRMED refused.** `refuseSnapshotSpecialFile` throws
`LSS-LINK-001` on `st.isSymbolicLink()` before open/rename/zero.
Independent planted file-symlink: all three ops trap; outside body
unchanged; link remains. Named suite **passed** (not skip) on this host.

## Challenge 4 — does `cold-boot.scrub` delegate?

**Yes. CONFIRMED.** src 189–191 / dist 139–141
`this.#writer.scrub(name)`. Live `orch.scrub("ckpt")` on the planted
symlink also threw `LSS-LINK-001` (same writer path).

## Challenge 5 — is this 124-scan closure or production admission?

**No.** Both IDs remain `PARTIAL_THIS_TREE` in the inventory JSON.
Independent recount of 124 findings: **4** `PATCHED_AUDIT_PENDING`,
**54** `PARTIAL_THIS_TREE`, **66** `OPEN_ON_SCAN_SNAPSHOT` (16 medium /
50 low). Matches the file’s `disposition_counts`. This review does not
recategorize them.

## Residuals (not findings against the named claims)

- Live getters can make a later `verify`/`deserialize` pair **disagree**
  (`verify true` then throw; or `verify false` then deserialize the next
  owned good copy). That is per-call own, not parse of `{a:9}`.
- Hard links are not `LSS-LINK-001` (`isSymbolicLink===false`,
  `isFile===true`). Independent `scrub` zero-overwrote the shared inode
  (outside became NULs). Inventory title said “storage links”; the
  **named** claim is planted symlink. Hardlink remains a PARTIAL residual.
- `O_NOFOLLOW` is absent on this win32 Node. TOCTOU between last `lstat`
  refuse and `renameSync`/`openSync` is not closed.
- Dirty `cold-boot.ts` rollback-floor work is **not** this claim.
- Extra FIFO tests in `atomic-writer.test.mjs` are not Claim B.
- This worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the two named claims. Detector is not invalid:
scan-rev still parses live `snap.payloadJson` and has no symlink refuse;
this dirty tree copies `payloadJson` before HMAC/parse and refuses a
planted `.snap` symlink without clobbering the outside target.

Evidence is sufficient for those bullets; insufficient for hardlink
closure, `O_NOFOLLOW`/TOCTOU, scan recategorization, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
