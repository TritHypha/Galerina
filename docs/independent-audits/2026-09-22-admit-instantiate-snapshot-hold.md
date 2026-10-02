# Independent audit — `admitAndInstantiate` exclusive snapshot

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: `admitAndInstantiate` verifies and instantiates a copied
exclusive `Uint8Array`, so mutating the caller buffer after the call
starts cannot instantiate different bytes. `Buffer` / SharedArrayBuffer
inputs refuse. Hash is re-checked after verify and before instantiate.

This is **one scan ID** (`csf_6ffbe767fb4a7baff5000c26`,
`PARTIAL_THIS_TREE`). It is **not** 124-scan closure and **not**
production admission. JSON-Decimal, OAuth, durable replay, signing, and
`.fungi` admission were not started.

Node v24.18.0, npm 12.0.2, Windows win32 x64. Tests import `dist/`.
`dist/wasm-runtime.js` mtime is newer than `src/wasm-runtime.ts` and
contains `snapshotWasmBytes`, exclusive-prototype/SAB refuse,
`Uint8Array.from`, and the post-verify hash re-check. This reviewer did
not rebuild.

The same dirty `wasm-runtime.ts` also contains `__range` fuel bounds and
secret-export wrapping (`wrapAdmittedExports` /
`finalizeSecretExportResult`). Those surfaces are **out of scope** for
this claim; the file hash binds them. `snapshotWasmBytes` is already on
HEAD `91b4dec0`; the dirty tree adds the hash re-check and the two
admit tests.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `1fa97cf9fbb7af62c5754fe64ca65199e52580d5431e37750a8b141d020d8bfa` |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | `b3004ecfda2a23e79c8c11d211f99ec10f1d403e520dd168ea305b3d84e0b586` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `04cafdbeb5642f650c04857a6b6e4edb7fe46a13f2c79f84dfafed00354b1cdd` |
| `packages-ts/galerina-core-runtime-wasm/dist/index.js` | `e1d1f81137dd402b6b4874f9d4807bfe7ad1dad51c770d770b938b30bb22997c` |

Dirty paths for this slice: `M`
`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`, `M`
`packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs`.
`dist/` is gitignored. Passing tests here are **not** production
admission.

Empty-module known-answer (8-byte `\0asm\x01\x00\x00\x00`) sha256:
`93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Snapshot is an exclusive `Uint8Array` copy before verify | source `snapshotWasmBytes` 784–793; first line of `admitAndInstantiate` 802; dist 662–671 / 671. `instanceof Uint8Array` **and** `getPrototypeOf === Uint8Array.prototype` **and** not SAB, then `Uint8Array.from`. Independent: `Uint8Array.from` does not alias (`sameBuffer=false`; mutating source leaves copy byte 0 unchanged) |
| Instantiate uses the copy, not `opts.wasm` | source 802 then 819 `WebAssembly.instantiate(wasm, …)` where `wasm` is the snapshot local; dist 688 |
| Mutating caller buffer after the call starts cannot instantiate different bytes | source: snapshot/verify/re-hash are synchronous before the first `await`. Independent: `wasm[0]=0xff` after calling `admitAndInstantiate`; `admitted.hash` still empty-module hash and instance exists; caller `[0]===255` |
| `Buffer` inputs refuse | source prototype check; suite Buffer test; independent `Buffer.from(EMPTY)` → `CRITICAL_SECURITY_VIOLATION: wasm bytes are not an exclusively owned Uint8Array` |
| SharedArrayBuffer inputs refuse | source `wasm.buffer instanceof SharedArrayBuffer`; independent SAB-backed `Uint8Array` refuse, same message. **No suite SAB test** |
| Hash re-checked after verify, before instantiate | source 809–811; dist 678–680. Dirty-tree addition (absent on HEAD `admitAndInstantiate`). No executed red path: exclusive copy is not shared, so the check cannot go red without a later mutation of the copy |
| Hostile suite: mutate `wasm[0]` after call; admitted hash matches empty-module hash | executed suite test; independent replica with known-answer `93a44bbb…` |
| Detector can go red on non-exclusive input | Buffer suite + independent SAB/subclass refuses. Suite post-await mutation test is **not** a discriminating snapshot detector (see residuals) |
| 124-finding scan | **not this claim** (`csf_6ffbe767fb4a7baff5000c26` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs`
   → **11/11 pass**, `fail 0`, `cancelled 0`, `skipped 0`,
   `duration_ms 139.7232`.
   Named-claim tests:
   - `admitAndInstantiate instantiates the snapshot, not a mutated caller buffer` — **green** (4.9796ms)
   - `FAIL-CLOSED: Buffer-backed wasm is not an exclusive Uint8Array snapshot` — **green** (0.654ms)
   The other 9 tests are hash/sign/`__range` coverage in the same file
   (sibling claim `csf_e3409dfe75ff7adda18f556a`); they ran, they are
   not this claim.

Independent extra probes (`%TEMP%\galerina-admit-instantiate-probe.mjs`;
not production): **8/8** recorded outcomes.

- Empty-module sha256 known-answer `93a44bbb…` matches `wasmHash(EMPTY)`.
- Mutate `wasm[0]` after `admitAndInstantiate` starts:
  `admitted.hash=93a44bbb…`, `caller[0]=255`, instance present.
- `Buffer.from` refuses exclusive-ownership violation.
- SharedArrayBuffer-backed `Uint8Array` refuses exclusive-ownership
  violation.
- `Uint8Array` subclass refuses exclusive-ownership violation.
- `WebAssembly.instantiate(wasm)` then `wasm[0]=0xff` on the same turn
  still succeeds — V8 already consumed the bytes before the caller
  mutation.
- No-snapshot replica of admit (verify + instantiate `opts.wasm`, same
  mutation timing) still returns the empty-module hash. **CONFIRMED:**
  the suite mutation test would stay green without `snapshotWasmBytes`.
- `Object.setPrototypeOf(Buffer.from(EMPTY), Uint8Array.prototype)`
  bypasses the Buffer refuse; snapshot copy still admits empty-module
  hash.

## Challenge 1 — can caller mutation after the call starts instantiate different bytes?

**No on this exclusive-copy path. CONFIRMED closed for `admitAndInstantiate`.**

Locators: `wasm-runtime.ts` 784–793 / 802 / 809–811 / 819; dist
`wasm-runtime.js` 662–671 / 678–680 / 688.

`snapshotWasmBytes` runs before `verifyWasm`. `Uint8Array.from` allocates
a new `ArrayBuffer` (`sameBuffer=false`). Later `instantiate` is passed
that local, not `opts.wasm`. Independent mutation of caller `[0]` to
`0xff` leaves `admitted.hash` equal to the empty-module known-answer.

The suite mutation test is **not** the discriminating instrument: Node
v24 `WebAssembly.instantiate` has already consumed the input before the
post-await `wasm[0]=0xff`. Property evidence is the synchronous
snapshot-before-await plus copy isolation, not that test going red.

## Challenge 2 — do `Buffer` / SharedArrayBuffer inputs refuse?

**Yes. CONFIRMED.** `Buffer.from` is a `Uint8Array` subclass
(`getPrototypeOf === Buffer.prototype`). SAB-backed views fail
`wasm.buffer instanceof SharedArrayBuffer`. Both throw
`CRITICAL_SECURITY_VIOLATION: wasm bytes are not an exclusively owned Uint8Array`.
Buffer is in the suite (detector red). SAB is source + independent
probe only.

## Challenge 3 — is the hash re-checked after verify and before instantiate?

**Yes in source/dist. CONFIRMED present.** Dirty-tree lines 809–811
compare `wasmHash(wasm)` to `verdict.hash` before `instantiate`.
No executed red: the snapshot is not aliased, so this branch is
defense-in-depth rather than a TOCTOU close of its own. The TOCTOU
close is the copy.

## Residuals (not findings against the named claim)

- Suite post-await mutation test is not a discriminating snapshot
  detector. A no-snapshot replica still passes that timing.
- No suite SharedArrayBuffer case; independent probe covered it.
- Hash re-check has no controlled-red test.
- `Object.setPrototypeOf(buffer, Uint8Array.prototype)` bypasses the
  Buffer prototype refuse; the copy still isolates bytes. Refuse is
  prototype-identity, not `Buffer.isBuffer`.
- `createLowLevelWasmExecutor` / `moduleDefinesExport` still compile
  caller `artifactBytes` without this snapshot. Out of named
  `admitAndInstantiate` claim.
- Same dirty file also carries `__range` and secret-export wrapping.
  Out of this claim.
- 124-finding scan remains a separate open programme. This is one ID
  (`csf_6ffbe767fb4a7baff5000c26`). Overall disposition stays
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. The suite mutation test is a
detector gap, not a product vulnerability. Buffer/SAB refuse detectors
can go red. Evidence is sufficient for `admitAndInstantiate` on this
dirty tree.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan
closure.
