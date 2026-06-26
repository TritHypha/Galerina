# 216 — Event declaration and emission

Events are declared globally before they can be emitted. This ensures that all events in a program
are visible to governance tools, audit systems, and documentation generators.

Rules:
- `event X` at program scope declares the event
- `emit X` inside a flow body fires the event
- SPORE-EVENT-001: emit without declaration → error
- SPORE-EVENT-002: declaration without any emit → warning

The contract.events block lists which events a flow intends to emit. This is the contract layer —
it does not replace the global `event X` declaration requirement.
