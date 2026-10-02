# Independent audit — cold-boot restore applies a durable HMAC rollback floor

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra.

Named claim: cold-boot restore applies a durable HMAC rollback floor, not
only an in-memory constructor tick.

- Scan `0f24ca30` restore verified integrity and restored any authentic
  snapshot (no floor).
- Committed HEAD later added in-memory `#minLogicalTick`; a fresh
  orchestrator default `0` still restored an older authentic snapshot
  after a later checkpoint.
- This dirty slice: checkpoint writes reserved snapshot name
  `rollback-floor` (HMAC via `StateSerializer`) **before** the user
  snapshot. Restore of a user snapshot requires that floor, then refuses
  `logicalTick < floor` as `LSS-ROLLBACK-001`.
- Checkpoint/restore of name `rollback-floor` is refused.
- Hostile: checkpoint tick 5, copy `engine.snap`, checkpoint tick 20,
  restore the old bytes with a new orchestrator → `LSS-ROLLBACK-001`.

Tests:
`packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs`
import `../dist/index.js`.

This is **not** 124-scan closure. Scan finding
`csf_aee31b6185becb47f883b0d7` (`Cold boot verifies snapshot integrity
without a rollback floor`, medium) is `PARTIAL_THIS_TREE`. Inventory
after this slice (file
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`, not re-scanned
here): 92 `OPEN_ON_SCAN_SNAPSHOT` / 28 `PARTIAL_THIS_TREE` /
4 `PATCHED_AUDIT_PENDING` (124 IDs). Not production admission.

Node v24.18.0, Windows win32. This reviewer did not rebuild. Dist is
gitignored. `dist/cold-boot.js` mtime (`2026-09-23T02:15:41.359Z`) is
newer than dirty `src/cold-boot.ts` (`2026-09-23T02:15:34.045Z`).
`dist/index.js` mtime (`2026-09-23T02:15:41.363Z`) is newer than dirty
`src/index.ts` (`2026-09-23T02:15:25.643Z`). Dist is not stale vs src:
both carry `ROLLBACK_FLOOR_NAME` (src 7 / dist 7),
`#persistRollbackFloor` (2 / 2), `#durableRollbackFloor` (2 / 2).
Committed HEAD `src/cold-boot.ts` has **0** of those three markers and
7 `#minLogicalTick` references (in-memory only).

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-sentinel-state/src/cold-boot.ts`; `M`
`packages-ts/galerina-core-sentinel-state/src/index.ts` (adds
`ROLLBACK_FLOOR_NAME`; also re-exports `refuseSnapshotSpecialFile`,
unrelated to this claim); `M`
`packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs`.
Gitignored dist rebuilt for those sources. Unrelated dirty on this
worktree was not this claim. Passing tests here are **not** production
admission.

## Source hashes on this tree

Author-named hashes MATCH all five listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-sentinel-state/src/cold-boot.ts` | `9498fc013b4fef33e21b3bf3f63b1441dc76108fde47d469ac8fd4a1f2607cd4` |
| `packages-ts/galerina-core-sentinel-state/src/index.ts` | `f0b184f60a6b93ad18b0f54e6145d21a71dfa0e3078f7149b63e1cfea222d57f` |
| `packages-ts/galerina-core-sentinel-state/dist/cold-boot.js` | `f744e1aa09ee01adfb666c448b4dd10ca38344d0b3f8c7ad98d1c2f647e325f7` |
| `packages-ts/galerina-core-sentinel-state/dist/index.js` | `d31a1f619bd529bd44227a174478d0bc72642469dfe9ffe1fb26d2c06df18322` |
| `packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs` | `c9d42c4b4b44e047ede5b49e97c946440624466ddac7943a3fd9694bba631a3d` |

HEAD (pre-dirty) SHA-256 of the same src/tests:

| path | HEAD sha256 |
|---|---|
| `src/cold-boot.ts` | `111054daeb33c7d5f65d21d2349a7885aa1bb1a96d9f388db867408b589d4860` |
| `src/index.ts` | `564257f5802038fd7bc231e206dcb1cc6279f01b7ffc53bc9b3f6d1e8234e712` |
| `tests/cold-boot.test.mjs` | `15a8af9b5035f01ba69c18e06711ff430dd3dbf705d48a822b7d3245dce5285f` |

HEAD `src/index.ts` does not export `ROLLBACK_FLOOR_NAME`. HEAD tests
have neither the hostile fresh-orchestrator case nor reserved-name
coverage.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| checkpoint writes HMAC `rollback-floor` **before** the user snapshot | src `checkpoint` 77–80 / dist 47–49: `#persistRollbackFloor(logicalTick)` then `serialize` + `writer.write(name, snap)`. Independent probe `writeOrder: ["rollback-floor","engine"]`. Floor JSON has `hmac` and payload `{minLogicalTick:314}` bound to `logicalTick` 314 |
| restore of a user snapshot requires the durable floor | src `#durableRollbackFloor` 163–168 throws `LSS-ROLLBACK-001` `"durable rollback floor is missing"` when `#readPersistedFloor()` is null. Independent missing-floor probe: engine.snap present, floor unlinked → that code/message |
| restore refuses `logicalTick < floor` as `LSS-ROLLBACK-001` | src restore 106–112. Named hostile test green. Independent probe: engine tick 5, floor tick 20 → `snapshot logicalTick 5 is below the rollback floor 20` |
| checkpoint of reserved name `rollback-floor` refused | src checkpoint 65–70. Named test green. Independent probe `LSS-ROLLBACK-001` reserved message |
| restore of reserved name `rollback-floor` refused | src restore 90–94 (before `writer.read`). Independent probes empty dir and after a real checkpoint both `LSS-ROLLBACK-001` reserved message |
| hostile older authentic after later checkpoint, **new** orchestrator (constructor 0) | named test `"hostile: a fresh orchestrator refuses..."`. Independent probe same sequence → `LSS-ROLLBACK-001` (floor 20 survives on disk) |
| happy checkpoint/restore still returns payload+tick | named first test green. Independent probe `{a:1,b:[1,2,3],nested:{ok:true}}` tick 314 |
| HEAD-shaped in-memory-only floor (constructor 0, no durable file) would ALLOW the hostile | reconstructed HEAD `checkpoint`/`restore` (no `#persistRollbackFloor`, compare only `#minLogicalTick` default 0). Same hostile sequence → ALLOW `{gen:"old", logicalTick:5}`; no `rollback-floor.snap` created |
| floor HMAC is `StateSerializer`, not a raw JSON stamp | `#persistRollbackFloor` writes `this.#serializer.serialize({ minLogicalTick: next }, next)`. Tampered floor `payloadJson` → `SecurityTrap` `LSS-INTEGRITY-001` (serializer owns the trap; the follow-on `#rollbackRefuse` is unreached) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-sentinel-state/tests/cold-boot.test.mjs packages-ts/galerina-core-sentinel-state/tests/restore-authority.test.mjs`
   → **13/13 pass**, 0 fail, `duration_ms 180.0154`.
   - `checkpoint → restore returns the same payload + logicalTick` — **green**
   - `restore of a byte-tampered .snap throws SecurityTrap` — **green**
   - `restore of a missing name throws HardenedBorderViolation LSS-NOSNAP-001` — **green**
   - `restore refuses a snapshot below the rollback floor` — **green**
   - `hostile: a fresh orchestrator refuses an older authentic snapshot after a later checkpoint` — **green**
   - `checkpoint refuses the reserved rollback-floor snapshot name` — **green**
   - `scrub hard-erases the snapshot; no throw when absent` — **green**
   - restore-authority suite (6 tests: exact authority once, missing identity, exception / K3 / non-integer / disagreement) — **green**

2. Independent extra probes (eval only; import
   `packages-ts/galerina-core-sentinel-state/dist/index.js`; dummy
   in-process HMAC key `Uint8Array.from({length:32}, (_,i)=>i+1)`; not
   production):

   - happy checkpoint/restore → payload equal, `logicalTick=314`,
     write order `rollback-floor` then `engine`, floor HMAC present
   - hostile older-authentic-after-later-checkpoint, new orchestrator →
     `HardenedBorderViolation` `LSS-ROLLBACK-001`
     (`logicalTick 5` below floor `20`)
   - reserved name checkpoint → `LSS-ROLLBACK-001`
   - reserved name restore (empty dir and after checkpoint) →
     `LSS-ROLLBACK-001`
   - HEAD-shaped in-memory-only orchestrator, same hostile sequence →
     **ALLOW** `{payload:{gen:"old"}, logicalTick:5}`;
     `floorFileCreated=false`
   - HEAD-shaped restore against a dir that **does** have durable floor
     20 and replaced `engine.snap` tick 5 → **ALLOW** (proves the
     in-memory constructor-0 path does not consult the durable file)
   - missing floor + existing `engine.snap` → `LSS-ROLLBACK-001`
     `"durable rollback floor is missing"`
   - full-directory rewind (replace **both** `engine.snap` and
     `rollback-floor.snap` with the tick-5 authentic pair) → **ALLOW**
     `{gen:"old", logicalTick:5}`
   - tampered floor HMAC → `SecurityTrap` `LSS-INTEGRITY-001`
   - same-instance hostile (copy `engine.snap` after tick 20 on the
     writer that checkpointed) → `LSS-ROLLBACK-001`
   - `ROLLBACK_FLOOR_NAME` export === `"rollback-floor"`

## Challenge 1 — does checkpoint persist HMAC floor before the user snapshot?

**Yes. CONFIRMED.** Locator: `cold-boot.ts` 77–80 /
`dist/cold-boot.js` 47–49. Wrapped `AtomicWriter.write` saw
`["rollback-floor","engine"]`. Floor bytes are a `StateSerializer`
snapshot (`version`/`hmac`/`logicalTick` + payload
`{minLogicalTick}` bound to that tick).

## Challenge 2 — hostile older authentic snapshot after later checkpoint, new orchestrator still ALLOW?

**No. CONFIRMED refused** as `LSS-ROLLBACK-001`. Named hostile test
and independent probe both refused `logicalTick 5` below durable floor
`20`. Detector can go red: those tests
`assert.equal(err.code, "LSS-ROLLBACK-001")`.

## Challenge 3 — reserved name `rollback-floor` still writable / restorable?

**No. CONFIRMED refused** on both checkpoint and restore
(`LSS-ROLLBACK-001`, reserved-name message). Restore refuses the name
before `writer.read`. Named suite covers checkpoint only; restore
refuse is independent-probe evidence.

## Challenge 4 — would HEAD-shaped in-memory-only floor ALLOW the hostile?

**Yes. CONFIRMED ALLOW.** Reconstructed committed-HEAD
`checkpoint`/`restore` (constructor `minLogicalTick=0`, no durable
file, compare only in-memory floor). Checkpoint tick 5, copy
`engine.snap`, checkpoint tick 20, restore old bytes with a **new**
HEAD-shaped orchestrator → `{gen:"old", logicalTick:5}`. No
`rollback-floor.snap` was created. The same sequence against current
dist refuses.

## Challenge 5 — happy checkpoint/restore still returns payload+tick?

**Yes. CONFIRMED.** Named first test and independent probe both
returned the original payload and tick.

## Residuals (not findings against the named durable-floor restore claim)

- Replacing **both** `engine.snap` and `rollback-floor.snap` with a
  consistent older authentic pair still rolls back (full directory
  rewind). Independent probe ALLOW `{gen:"old", logicalTick:5}`. The
  floor is a second HMAC file in the same directory, not a monotonic
  secret outside attacker write reach.
- Missing floor + existing user snapshot refuses (`LSS-ROLLBACK-001`
  `"durable rollback floor is missing"`). Fail-closed for restore; an
  operator who loses only the floor file cannot boot the still-authentic
  user snapshot.
- Checkpoint’s pre-write gate compares `logicalTick` to **in-memory**
  `#minLogicalTick` only. A fresh orchestrator (constructor 0) can
  still `checkpoint` a user snapshot **below** the durable floor
  (probe: persisted floor 20, checkpoint tick 7 succeeded and overwrote
  `engine.snap`; restore then refused `7 < 20`). After that write,
  `checkpoint` also assigns `#minLogicalTick = logicalTick` (7), which
  can lower the in-memory floor below the just-persisted durable max.
  Restore still consults `#durableRollbackFloor()`. Not the named
  hostile (copy of an older authentic file after a later checkpoint).
- Floor write and user-snapshot write are two `AtomicWriter` renames,
  not one atomic pair. A crash after floor persist and before user
  persist can leave a higher floor than the live user snapshot
  (restore of the previous good user tick then refuses).
- Tampered floor surfaces as `SecurityTrap` `LSS-INTEGRITY-001` because
  `#readPersistedFloor` calls `deserialize` on verify failure (serializer
  owns the integrity trap). Fail-closed; not `LSS-ROLLBACK-001`.
- Named suite does not restore the reserved name; independent probes
  do refuse it.
- Scan ID `csf_aee31b6185becb47f883b0d7` stays `PARTIAL_THIS_TREE`
  (durable HMAC floor closed for the named hostile; full-directory
  rewind and the two-file non-atomic pair remain).
- Inventory `findings_json_sha256`
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Inventory file sha256
  `166eb4aeb31f1544491554c7ca54d1ab92baace1c30eb44a49da9139740f5e59`.
  Not 124-scan closure. Not Astra.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.
