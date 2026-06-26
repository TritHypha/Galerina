# LSEG — Architecture Issues / Deferred Seams

`@galerina/core-sentinel-egress` (LSEG) is the governed write path for the audit
ledger: a fixed-capacity ring buffer feeding a batched, HMAC-chained,
tamper-evident flush. It replaces ad-hoc `fs.appendFileSync` per event (a
Hardened-Border leak and a ~1000x perf sink) with ONE disk write per batch.

Four items are deliberately out of scope for this build and belong to the
integrating session.

## (a) Memory-mapped ring (mmap) — documented host seam, NOT implemented

The portable `RingBuffer<T>` here stages records on the JS heap. A true
zero-copy / crash-survivable ring backed by a memory-mapped file (`mmap` + a
header cursor, so staged-but-unflushed records survive a process kill) requires
privileged, OS-specific syscalls and belongs at the runtime **host boundary**,
not in this portable core. The `push` / `drain` surface is shaped so swapping in
an mmap-backed store is a mechanical change with no consumer-side impact.

## (b) LogicalTick (LST) injection into batch metadata — deferred

Stamping each `AuditBatch` with the Sentinel-Time LogicalTick (LST) so batches
carry a monotone logical clock alongside `seq` is left to the integrating
session, which owns the LST source. The `AuditBatch` shape is additive — a
`tick` field can be threaded through `flush()` without changing the chain hash
contract (it would be folded into the HMAC input at that time).

## (c) Pointing the `AuditLogger` at this sink — deferred

Re-wiring the runtime's existing `AuditLogger` (today doing per-event
`appendFileSync`) to call `AuditEgress.push` is done by the integrating session.
The public surface (`push` / `flush` / `chainHead` / `readEgressLedger` /
`verifyChain`) is shaped so that wiring is a mechanical change on the consumer
side.

## (d) "Only egress may write to the ledger dir" package-graph rule — later

The governance policy that *only* this package may write to the ledger directory
(making the egress sink the sole Hardened-Border egress seam) is a wider-project
package-graph rule to add later, not enforced from within this package.

## Note: `typeRoots` for `node:crypto` / `node:fs`

LSEG compiles with the shared compiler at `../galerina-core-compiler` (there is no
local `tsc`). That compiler package does not ship an `@types` directory, so
`tsconfig.json` points `typeRoots` at
`../galerina-tower-citizen/node_modules/@types`, which carries the exact pinned
`@types/node@25.9.1` (the sibling Tower-citizen peer). This is what lets
TypeScript resolve `node:crypto` and `node:fs` at build time.
