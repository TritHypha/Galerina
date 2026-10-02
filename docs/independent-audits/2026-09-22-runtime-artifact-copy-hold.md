# Independent audit — governed runtime copies artifact bytes before hash/verify/execute

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `createGovernedRuntimeExecutor` copies artifact bytes with
`Uint8Array.from(bytes)` into `ownedBytes` before `hashArtifact`,
`verifyAttestation`, and `instantiateAndCall`. Mutating the source
buffer after `artifactBytesFor` returns cannot change the hashed first
byte or the executed first byte. `verifyAttestation` also sees the
snapshot (first byte 7) while the leaked source is mutated to 99.

- Scan `0f24ca30` hashed / verified / executed the same `bytes` alias
  returned by `artifactBytesFor`.
- Current: `ownedBytes = Uint8Array.from(bytes)` then hash / verify /
  instantiate that snapshot.

Tests:
`packages-ts/galerina-core-runtime/tests/runtime-executor-composition.test.mjs`
`"hostile: mutating the source buffer after return cannot change hashed or executed bytes"`
plus the prior 12 composition cases. Import dist.

Scan `csf_620c9e3a9501ebf19273ddd7` is **PARTIAL_THIS_TREE**. Inventory
**77 OPEN / 43 PARTIAL / 4 PATCHED** was independently recounted from
this tree’s inventory JSON `disposition_counts` and from the 124-row
`findings` array (not the assigned guess of 78/42/4). This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which **defines**
`createGovernedRuntimeExecutor` (not a re-export). Dist `index.js` mtime
(`2026-09-22T12:53:04.304Z`) is newer than clean-vs-HEAD `src/index.ts`
(`2026-09-22T07:37:09.873Z`). Dist is **not stale** vs src for this
copy: both assign `ownedBytes = Uint8Array.from(bytes)` then pass
`ownedBytes` to `hashArtifact`, `verifyAttestation`, and
`instantiateAndCall`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-core-runtime/tests/runtime-executor-composition.test.mjs`
(+32 lines: the named hostile mutating-source case).
`src/index.ts` is **clean vs HEAD** (git blob
`3cb10004abf9e65b3cb30e770e434270724fb6b7`). Dist is untracked
(gitignored). Production `Uint8Array.from` copy is already in HEAD.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime/src/index.ts` | `d245f051f2d7a6ffc73086836433a7add3f3022577358f62eb73e9a49a2d28c8` |
| `packages-ts/galerina-core-runtime/dist/index.js` | `4ec062677da5c0ed1fe0e56bfa5189ff2a98454dbe481470584f172b061a44c1` |
| `packages-ts/galerina-core-runtime/tests/runtime-executor-composition.test.mjs` | `82606918f8e753978262282568c3173a81d2cacb08405cc24a58807fe8e92462` |

Dist is not in HEAD. HEAD test blob
`3f89ce7b87ac140d53c7e9db680a9c1ebc26b686` lacks the hostile mutating
case. Working-tree test blob
`7ff5ca2e85a0310562998146d2f99628adb51f45`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob of `src/index.ts` did
`const computed = hashArtifact(bytes)` and passed `bytes` into
`verifyAttestation` and `instantiateAndCall`. The `ownedBytes` copy
landed in `eb1645a4fd6aedec3fabb646ec5c84001aa30ff1`
(`fix(security): checkpoint runtime and tooling hardening`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Copy into `ownedBytes` before hash | src 410–411 / dist 155–156: `const ownedBytes = Uint8Array.from(bytes); const computed = hashArtifact(ownedBytes);` |
| `verifyAttestation` sees the snapshot | src 425 / dist 168: `artifactBytes: ownedBytes` |
| `instantiateAndCall` sees the snapshot | src 430–431 / dist 171–172: `artifactBytes: ownedBytes` |
| Mutating source after return cannot change hashed first byte | named hostile `hashedFirst === 7` while `leaked[0] === 99`; independent `current.hashedFirst=7` |
| Mutating source cannot change executed first byte | named hostile `executedFirst === 7`; independent `current.executedFirst=7` and `post_hash_mutate_current.executedFirst=7` |
| `verifyAttestation` sees first byte 7 while leaked is 99 | named hostile `calls.verifyArg.artifactBytes[0] === 7`; independent `current.verifyFirst=7` / `post_hash_mutate_current.verifyFirst=7` |
| Dist copy not stale vs src | **CONFIRMED** same `Uint8Array.from`, same three `ownedBytes` consumers, same integrity compare on `computed` |
| Scan-era alias would not isolate | reconstructed `0f24ca30`: mutate-inside-hash → `hashedFirst=99`, integrity fail; mutate-after-hash → `hashedFirst=7` but `verifyFirst=99` and `executedFirst=99` |
| Named node tests | **13/13 pass** including the hostile, `duration_ms 135.159` |
| 124-finding scan | **not this claim** (`csf_620c9e3a9501ebf19273ddd7` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-runtime/tests/runtime-executor-composition.test.mjs`
   → **13/13 pass**, 0 fail, `duration_ms 135.159`.
   - 12 prior composition cases — **green**
   - `hostile: mutating the source buffer after return cannot change hashed or executed bytes` — **green** (0.2048ms)

Independent extra probes (eval only; temp
`%TEMP%\runtime-artifact-copy-probe.mjs`, not production; imports the
same gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist (mutate leaked `[0]=99` inside `hashArtifact`, after
`Uint8Array.from`):

- `outcome=admit`, `leaked0=99`, `hashedFirst=7`, `verifyFirst=7`,
  `executedFirst=7`, `identityEqual=false`
- Same isolation if the mutation is after hash returns
  (`post_hash_mutate_current`)

Scan-shaped alias reconstruction of `0f24ca30` (no copy; hash / verify /
execute the `artifactBytesFor` return):

- mutate before hash → `hashedFirst=99`, `computed=h:3:99`,
  `integrityOk=false` (named hostile’s `admit` / `hashedFirst===7`
  would go red)
- mutate after hash → `hashedFirst=7`, `integrityOk=true`,
  `verifyFirst=99`, `executedFirst=99` (classic check-then-swap)

`Uint8Array.from` on an ordinary `Uint8Array([7,7,7])` copies:
`fromCopiesOrdinary=true` (new buffer; source `[0]=99` leaves copy at
7). A `SharedArrayBuffer` view is **not** the named test.

## Challenge 1 — does mutating the source change the hashed first byte?

**No. CONFIRMED isolated.** Named hostile `hashedFirst === 7` while
`leaked[0] === 99`. Independent `current.hashedFirst=7`. Copy happens
before `hashArtifact` is entered, so even a mutation at the start of
hash cannot retarget the digest input.

## Challenge 2 — does mutating the source change the executed first byte?

**No. CONFIRMED isolated.** Named hostile `executedFirst === 7` and
`assert.notEqual(artifactBytes, leaked)`. Independent
`current.executedFirst=7`, `identityEqual=false`, and
`post_hash_mutate_current.executedFirst=7`. Scan-shaped post-hash
mutation executes 99.

## Challenge 3 — does verifyAttestation see snapshot 7 while leaked is 99?

**Yes. CONFIRMED.** Named hostile `calls.verifyArg.artifactBytes[0]===7`.
Independent `current.verifyFirst=7`. Scan-shaped post-hash mutation
verifies 99 on the alias.

## Challenge 4 — is dist stale vs src for this copy?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist 155–172 and src 410–431 are the same copy-then-hash /
verify / instantiate sequence. Tests import that dist.

## Residuals (not findings against the named ordinary-Uint8Array copy claim)

- A `SharedArrayBuffer` view is **not this test**. Independent
  `Uint8Array.from(sabView)` still copies values into a non-shared
  buffer (`fromCopiesSabView=true`); wrapping `sabView.buffer`
  **would** alias (`wrapAliasesSab=true`). Production uses `from()`,
  not a buffer wrap. Concurrent mutation **during** the `from()`
  iteration is untested.
- Injected `hashArtifact` / `verifyAttestation` /
  `instantiateAndCall` still receive the same `ownedBytes` reference.
  A hostile injected hasher that mutates `ownedBytes` after hashing
  could still change later stages. That is injected-TCB behaviour, not
  source-buffer aliasing.
- Scan ID `csf_620c9e3a9501ebf19273ddd7`
  (`The governed runtime retains mutable artifact aliases across admission and execution`,
  medium, `packages-ts/galerina-core-runtime/src/index.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `b235866d1c82b630ddc05285395c86dc2841640d12a3896a50505ed7af855d77`
  `disposition_counts` are **77 OPEN / 43 PARTIAL / 4 PATCHED**
  (independently recounted; findings array 124). This review did not
  re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named copy-before-hash / verify / execute
claim. Detector is not invalid: the hostile assertions go red on the
scan-era alias. Evidence is sufficient for ordinary `Uint8Array`
source-buffer isolation; insufficient for SharedArrayBuffer concurrent
tear, injected-TCB mutation of `ownedBytes`, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
