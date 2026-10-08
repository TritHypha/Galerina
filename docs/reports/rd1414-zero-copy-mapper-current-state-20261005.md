# RD-1414 adjacent ZeroCopyMapper current-state check

**Result:** the current Galerina branch has useful local staging/cleanup
behavior in `ZeroCopyMapper`, newer than the older private RD-1414 source
snapshot, but it is not a Fungi secret-memory runtime and is not wired into
the app-kernel protected path. This evidence does not close RD-1414 or any
coupled RD.

## Exact source and execution

- Galerina branch: `codex/rd1413-1415-coupled-route-20261004`.
- Current Galerina HEAD: `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; the inspected
  mapper and test paths were not dirty.
- Mapper: `packages-ts/galerina-core-sentinel-io/src/zero-copy-mapper.ts`,
  SHA-256 `4176C253BCE7BE488CB74091A67F3F2EE02DBFF660C093F880C1D38C76E721E6`.
- Tests: `packages-ts/galerina-core-sentinel-io/tests/zero-copy-mapper.test.mjs`,
  SHA-256 `01D396FA403DDED70BDADAED1CC3ECCF823396873CADAD126C300A30D6186EFC`.
- Fresh command: `npm test` from `packages-ts/galerina-core-sentinel-io`.
- Result: TypeScript build passed; **48/48** package tests passed, 0 failed,
  0 skipped. The suite includes private source-snapshot wipe on success,
  verification refusal, and allocation refusal; previous-backing zeroing on
  remap; `dispose()` zeroing and stale/future handle refusal; and
  `CLEANUP_FAILED` refusal after a detached backing buffer.
- **2026-10-06 pin correction and rerun:** after Astra identified a malformed
  63-character source digest in the initial report, Codex recalculated the
  mapper hash as
  `4176C253BCE7BE488CB74091A67F3F2EE02DBFF660C093F880C1D38C76E721E6`,
  reran `npm test` (build plus 48/48, 0 failed, 0 skipped), then recalculated
  both mapper and test hashes; both matched the corrected recorded pins.

## Confirmed local behavior and limits

The mapper copies an input snapshot, verifies and stages from that snapshot,
and attempts to zero the private snapshot on both success and refusal. It
tracks `EMPTY`, `ACTIVE`, `DISPOSED`, and `CLEANUP_FAILED`; `dispose()` attempts
to fill the mapper's current backing store with zero before replacing it with
an empty buffer and invalidating generation-bound block handles. Failure to
zero is reported and prevents subsequent mapping. These are local JavaScript
object-level behaviors demonstrated by the named tests, not an assurance of
physical erasure.

The caller can obtain the backing buffer through `mapper.buffer`, and each
block returns mutable typed-array views. A caller can therefore copy bytes
before disposal; disposal cannot erase that independent copy. A bounded
in-process check against the just-built package confirmed:

```json
{"originalAfterDispose":[0,0,0],"copiedAfterDispose":[65,66,67],"status":"DISPOSED"}
```

This demonstrates only ordinary JavaScript buffer behavior in this candidate,
not a production secret leak. The
`shared: true` option creates a `SharedArrayBuffer`, but this class exposes no
borrower registration, reader/writer quiescence, or synchronization protocol
that would establish an exclusive wipe boundary against concurrent users.
Those are remaining alias/lifecycle proof gaps, not proof of an exploit in a
loaded Galerina protected operation.

A bounded search of `packages-ts` TypeScript and JavaScript module sources
found the mapper's implementation/export and references in Tower-citizen test
and benchmark files; it found no call from the framework app-kernel runtime
source. This is source-search evidence for that stated scope only, not a
graph-freshness or whole-repository absence claim.

## Coupled-RD disposition

The mapper is a useful candidate for ordinary integrity-checked staging and
local cleanup demonstrations. Its mutable views/backing getter, possible
copied bytes, lack of shared-user quiescence, TypeScript/ordinary
`ArrayBuffer` or `SharedArrayBuffer` backing, and lack of app-kernel runtime
wiring mean it cannot satisfy protected Fungi custody, complete mediated
cleanup/reuse, or RD-1414. It supplies no `/secure` grant, Signet authority,
provider/key-owner binding, recipient-bound release, or RD-1413/RD-1415
evidence. Preserve RD-1413, RD-1414, and RD-1415 as HOLD / NON_AUTHORIZING.
