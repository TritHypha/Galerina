# LST — Architecture Issues / Deferred Seams

This package (`@galerina/core-sentinel-time`) is pure TypeScript with no node /
third-party dependencies. It provides the Tower's deterministic **Logical
Clock** — a monotonic integer counter that replaces wall-clock time so audit
trails and governance are replayable regardless of OS jitter. Two items are
deliberately out of scope for this build:

## (a) AuditLogger integration deferred

Stamping audit events with a `LogicalTick` (drawn from `LogicalClock.tick()`,
one tick per scheduled execution unit / audit event) is left to the integrating
session. The public surface here (`LogicalClock`, `SynchronizationGate`) is
shaped so that wiring is a mechanical change on the consumer side: the
AuditLogger holds a single `LogicalClock` and calls `tick()` as it records each
event, replacing any `Date.now()` timestamp with the returned tick.

## (b) RTC / hardware-clock drift source — documented host seam, NOT implemented

`SynchronizationGate` consumes a host physical timestamp (`physicalMs`) that it
is handed; it never reads a real clock itself. Sourcing that value from the host
RTC / monotonic hardware clock — and deciding the nominal `ticksPerMs` rate and
`StabilityEnvelope` for a given deployment — is a wider-project **host
function** living at the runtime boundary, not in this portable core. LST gives
the deterministic drift math (`expectedTicks`, `driftTicks`, `enforceDrift`); a
future host supplies the physical readings that feed it.
