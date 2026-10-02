# Independent audit — StateSerializer refuses a public all-zero HMAC default

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `StateSerializer` does not authenticate snapshots with a
public all-zero HMAC default.

- Missing `hmacKey` / `keyProvider` throws `LSS-KEY-001`
- `hmacKey` of 32 zero bytes throws `LSS-KEY-001`
- `hmacKey` shorter than 32 bytes throws `LSS-KEY-001`
- A 32-byte key with a non-zero byte is admitted

Tests: `packages-ts/galerina-core-sentinel-state/tests/strict-key.test.mjs`
import `../dist/index.js`. Tests import dist. Dist `isWeakKey` /
constructor match src.

Scan `csf_44ad57ee61239f80ba431e63` is **PARTIAL_THIS_TREE**. Inventory
**88 OPEN / 32 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and was **not** independently re-counted here. This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32. This reviewer did not rebuild. Dist is
gitignored (`packages-ts/.gitignore` `dist/`). `dist/state-serializer.js`
mtime (`2026-09-23T03:15:41.345Z`) is newer than clean-vs-HEAD
`src/state-serializer.ts` (`2026-09-22T09:03:56.160Z`). Dist is not
stale vs src: both carry the same `isWeakKey` (absent / `< 32` /
all-zero → true) and the same constructor refuses (no default key;
`LSS-KEY-001` before any MAC). `isWeakKey` is module-private in both
(not exported from `dist/index.js`); constructor behavior is the
observable.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-sentinel-state/tests/strict-key.test.mjs`
(+9 lines: hostile 31-byte refuse / last-byte-`1` admit).
`src/state-serializer.ts` is **clean vs HEAD** (git blob
`be7d532aff4aa992620d89450fe8e57c7e082c5c`). Unrelated dirty on this
worktree was not this claim.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-sentinel-state/src/state-serializer.ts` | `6e107f05fb544e88b3d4ae3def29f80043bd554a96d77e2eb315cbb0f19a69ff` |
| `packages-ts/galerina-core-sentinel-state/dist/state-serializer.js` | `5d8cbbce8012e70342cc5eed38131a613de8fa053b87923c6dff7bb568027e53` |
| `packages-ts/galerina-core-sentinel-state/tests/strict-key.test.mjs` | `72d11f0e12413510d8c8634df93069c39bad2d725fe963b364a91c896b2eef08` |

`dist/index.js` (re-export only; sha256
`d31a1f619bd529bd44227a174478d0bc72642469dfe9ffe1fb26d2c06df18322`)
exports `StateSerializer` from `./state-serializer.js`. Dist is untracked
(not in HEAD). HEAD test blob `941ef69ad73ea28a17afd53f6619e8556cd3f824`
lacks the hostile 31-byte case.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| No public all-zero HMAC default | src constructor 96–100 / dist 57–58: missing both `hmacKey` and `keyProvider` throws `LSS-KEY-001` `"the all-zero development key is not an authorizing default"`. No `new Uint8Array(32)` default assignment in src or dist. |
| Missing `hmacKey`/`keyProvider` → `LSS-KEY-001` | src 96–100; dist 57–58; named tests `"strictKey rejects a missing/all-zero key"` and `"construction refuses a missing or all-zero key"`; independent `no_arg` / `empty_opts` |
| 32 zero bytes → `LSS-KEY-001` | `isWeakKey` src 52–56 / dist 20–27; constructor src 118–122 / dist 72–73; named zeros cases; independent `zeros32` / `zeros_buffer32` / `keyProvider_zeros32` |
| `< 32` bytes → `LSS-KEY-001` | `isWeakKey` `key.length < 32`; named hostile 31-byte case; independent `short31_nonzero` / `empty_hmacKey` |
| 32-byte key with a non-zero byte admitted | `isWeakKey` returns false on first non-zero; named hostile last-byte-`1`; independent `last_byte_1` / `first_byte_1` admit |
| Dist `isWeakKey` / constructor match src | **CONFIRMED** same predicates, same `LSS-KEY-001` codes, same no-default control flow |
| Named node test | **4/4 pass**, `duration_ms 126.841` |
| 124-finding scan | **not this claim** (`csf_44ad57ee61239f80ba431e63` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-sentinel-state/tests/strict-key.test.mjs`
   → **4/4 pass**, 0 fail, `duration_ms 126.841`.
   - `StateSerializer strictKey rejects a missing/all-zero key` — **green**
   - `StateSerializer strictKey accepts a real key` — **green**
   - `construction refuses a missing or all-zero key` — **green**
   - `hostile: a 31-byte key is refused; a 32-byte non-zero key is admitted` — **green**

Independent extra probes (eval only; temp
`%TEMP%\hmac-all-zero-key-probe.mjs`, not production; imports the same
gitignored `dist/index.js`):

- `new StateSerializer()` → `SecurityTrap` `LSS-KEY-001` (no-default message)
- `new StateSerializer({})` → same `LSS-KEY-001`
- `hmacKey: new Uint8Array(32)` → `LSS-KEY-001` (non-zero / 256-bit message)
- `hmacKey: Buffer.alloc(32)` → `LSS-KEY-001`
- 31-byte non-zero `hmacKey` → `LSS-KEY-001`
- `hmacKey: new Uint8Array(0)` → `LSS-KEY-001`
- `keyProvider` whose `active()` returns 32 zeros → `LSS-KEY-001`
- `keyProvider` whose `active()` returns `null` → `LSS-KEY-001`
- 32-byte key with last byte `1` → **admitted**; `serialize`/`verify`/`deserialize` succeed (`last_byte_1_verify=true`, payload `{"a":1}`)
- 32-byte key with first byte `1` → **admitted**
- 32-byte attacker key `0x41`×32 → **admitted** and `verify=true`
- Cross-key verify of last-byte-`1` snapshot under the `0x41` key → `false`
- Probe printed `PROBE_OK`. Node v24.18.0.

## Challenge 1 — does construction still default to a public all-zero HMAC key?

**No. CONFIRMED refused.** Locator: src 96–100 / dist 57–58. There is no
fallback `hmacKey`. No-arg and `{}` both throw `LSS-KEY-001` with
`"the all-zero development key is not an authorizing default"`. Named
suite and independent `no_arg` agree.

## Challenge 2 — is a 32-byte all-zero `hmacKey` still admitted?

**No. CONFIRMED refused.** `isWeakKey` treats all-zero as weak.
Constructor src 118–122 always calls `isWeakKey(active.key)` (not gated
on `strictKey`). Named zeros cases and independent `zeros32` /
`zeros_buffer32` / `keyProvider_zeros32` all throw `LSS-KEY-001`.

## Challenge 3 — is a 31-byte non-zero key still admitted?

**No. CONFIRMED refused.** `isWeakKey` is true when `length < 32`.
Named hostile test and independent `short31_nonzero` throw
`LSS-KEY-001`. Detector can go red.

## Challenge 4 — is a 32-byte key with a non-zero byte admitted?

**Yes. CONFIRMED.** Named hostile last-byte-`1` `doesNotThrow`.
Independent last-byte-`1` and first-byte-`1` admit. That admitted key
then authenticates snapshots (see residuals).

## Residuals (not findings against the named no-default / zeros / short-key claim)

- Callers that pass a 32-byte **non-zero but attacker-controlled** key
  still authenticate. Independent last-byte-`1` and `0x41`×32 keys both
  `serialize`/`verify` successfully. The named claim admits that 32-byte
  non-zero case; it does not prove key custody.
- `serialize` / `verify` re-check `isWeakKey` only when `strictKey === true`
  (src 175, 254 / dist 96, 160). Construction always refuses a weak
  *active* key, but a mutable `keyProvider` that later returns 32 zeros
  can still `serialize` without `strictKey` (independent
  `mutable_provider_zeros_serialize_no_strict threw=false`). That is not
  the public constructor default.
- `isWeakKey` is not exported; tests and probes observe it only through
  the constructor / `strictKey` paths.
- Scan ID `csf_44ad57ee61239f80ba431e63`
  (`Default snapshot authentication uses a public all-zero HMAC key`,
  medium, `packages-ts/galerina-core-sentinel-state/src/state-serializer.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `20f47f519b37e12f66eb1f11cf5edf96a7c01162d9be42976b4c5f03aa22875e`
  is unchanged by this review. Assigned inventory totals **88 OPEN /
  32 PARTIAL / 4 PATCHED** were not re-counted. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named no-default / 32-zero / short-key /
32-byte non-zero admit claim. Detector is not invalid. Evidence is
sufficient for those four construction bullets; insufficient for key
custody, `strictKey`-gated serialize/verify persistence, scan closure,
and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
