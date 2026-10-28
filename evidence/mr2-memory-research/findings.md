# MEM-R2 memory research: concurrency, length equality, generic errors

Branch `grok/mem-r2-memory-research-20261028` from Galerina main `bad441e9c`.
Tests: `packages/fungi/memory/tests/mr2-memory-research/` (7 files). They drive
the compiled frozen TS reference provider
(`packages-ts/galerina-framework-app-kernel/dist/secret-arena-provider.js`)
against a synthetic custodian, `mr2-fake-custodian.mjs`. The fake custodian
misbehaves on reply length and status for has, status, put, epoch and get.
Synthetic data only: canary `MR1-CANARY-7f3a9c-SYNTHETIC`, name `Zq7xVk3Jw9pL`.
Linux only. The frozen TS source is never edited. Mutants patch a scratch copy
of the dist file.

Block pass (WSL node v24.20.0): 37 tests, 30 pass, 0 fail, 7 todo. The todo
tests are the .fungi targets that the TS reference does not meet, listed below.

## Gap-map items covered

| Gap | Covered here | Still open |
| --- | --- | --- |
| 1.6 concurrent getSecret | A nested lease on the same name gets its own buffer, and the inner lease is wiped while the outer lease is still live. Calling dispose, put, has or revocationEpoch from inside a callback is safe. 8 racing async tasks never overlap a lease (max active is 1). Two providers never share a store. | "Exactly one live lease per name" is a todo, because TS allows nested same-name leases. |
| H1 concurrency | Same as 1.6. A throwing callback propagates its own error, wipes, and the provider stays active. | DENY receipt (VOK side). |
| H4 generic errors | Census of 26 fault modes (9 MEM-R1 and 17 MEM-R2) through a fixed script. Every error is SecretArenaUnavailable or SecretArenaQuarantined, its message is one of 19 fixed strings, its code matches its class, its own keys are exactly code and name, and no message, stack or property carries a 4-character window of the secret name or value. | The .fungi kernel uses numeric finish codes. A host-side message census for the .fungi port is still to do. |
| 1.4 record schema | Every status() record has exactly the key `state`, set to active or quarantined, and a disposed provider reports quarantined. | The receipt/audit object schema (ids, hashes, verdicts, epoch) lives in VOK/SLIDE and is not covered here. |
| H11 length equality | A has() reply of byte 2, an empty reply or an unlisted status is never read as present. An unlisted status() status quarantines. An epoch frame of 9 bytes, 0 bytes or an unlisted status is refused. An epoch above MAX_SAFE_INTEGER is refused and quarantines. An unlisted get status never reaches the callback. Unlisted and echoing put replies are refused without leaking. | 6 todo divergences, listed below. |

## TS reference divergences from the .fungi zero-trust target (todo tests)

1. A `has-long` reply (OK, then [1, 0xAA]) reads as present, because trailing bytes are ignored.
2. A `status-empty` reply (OK with no data byte) reads as active, because `data[0] === 1` is false for undefined.
3. A `status-long` reply (OK, then [0, 0xAA]) reads as active.
4. A `status-two` reply (OK, then [2]) reads as active. Only byte 1 means quarantined, so any other byte reads as clean.
5. A `put-extra` reply (OK plus data) is accepted.
6. An `epoch-long` reply is refused but does not quarantine; the MEM-R1 epoch-short observation is the same. In .fungi, arenaEpoch's wrong-dataLen path is finish(40), so the .fungi port needs to decide whether 40 also quarantines.
7. Nested same-name leases are allowed (1.6 above).

The .fungi target is that any reply whose length is not exactly the expected
length is UNKNOWN, which fails closed and quarantines (secret-arena.fungi has
code 106 and epoch code 140 FRAME_INVALID). None of the divergences leaks a
secret; they are laxness on custodian-controlled bytes.

## Code-read observations (no test can see these from outside)

- `put()` destructures only `status` from the rpc result, so the copied reply
  `data` is never passed to `wipeOrQuarantine`. A hostile custodian's echoed
  bytes (mode `put-echo`) stay in an unwiped Uint8Array until garbage
  collection. The .fungi port should wipe every reply buffer on every path.
- Entering quarantine bumps the provider's local epoch once (`markQuarantined`),
  so quarantine is itself a revocation. After that, revocationEpoch is frozen
  and never follows the custodian.

## Killing mutants (7 of 7 killed)

| Id | Mutation | Killed by |
| --- | --- | --- |
| MR2-M1 | has reads any non-zero byte as present | has byte 2 never present |
| MR2-M2 | epoch accepts frames of 8 or more bytes | epoch-long refused |
| MR2-M3 | epoch drops the safe-integer check | epoch-huge quarantines |
| MR2-M4 | status ignores the reply status | unlisted status quarantines |
| MR2-M5 | get decoder treats status 9 as OK | unlisted get never calls back |
| MR2-M6 | lease slot never wiped on return | nested leases wiped independently |
| MR2-M7 | escape refusal names the secret | escape refusal is generic |
