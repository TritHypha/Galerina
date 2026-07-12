# Galerina Application Patterns — Handbook

These 12 patterns cover 80-90% of what most business systems actually do, and they align with Galerina's governance, effects, capabilities, and semantic graph vision.

---

## The 12 Patterns

| # | Pattern | When to use | Galerina features |
|---|---|---|---|
| 01 | CRUD Resource | Users, orders, patients | `resource {}`, effects, `response.denies` |
| 02 | Workflow / Process | Expense claims, approvals | `workflow {}`, transitions, events |
| 03 | Commands & Queries | Read/write separation | `query`/`command` keywords (future), effect inference |
| 04 | Domain Events | Distributed systems | `event {}`, `emit`, `contract.events` |
| 05 | Routes & APIs | HTTP endpoints | `route {}`, entry points, typed params |
| 06 | State Machines | Orders, loans, patients | `stateMachine {}`, transitions (future) |
| 07 | Validation | Email, postcode, NHS | `validate.*`, protected types, taint |
| 08 | Secrets | API keys, tokens | `SecureString`, `FUNGI-SECRET-*` |
| 09 | Background Jobs | Email, PDF, sync | `scheduled {}`, `worker {}`, job entry points |
| 10 | Microservices | Service separation | `service {}`, manifests, least privilege |
| 11 | Audit Trails | GDPR, healthcare, finance | `audit {}`, signed attestation, proof chain |
| 12 | Governed Identities | Entity IDs | `Brand<String,"X">`, `identity {}` (future) |

---

## Implementation Status

### Implemented now

| Pattern | Status |
|---|---|
| 04 — Domain Events | `event {}`, `emit`, `contract.events` implemented (Phase 9B) |
| 05 — Routes & APIs | `route {}`, typed params, entry points implemented |
| 07 — Validation | `validate.*`, taint propagation, protected types implemented (Phase 11B) |
| 08 — Secrets | `SecureString`, `FUNGI-SECRET-*`, redacted bindings implemented |
| 11 — Audit Trails | `audit {}`, Ed25519 signed attestation, proof chain implemented (Phase 10A) |
| 12 — Governed Identities (partial) | `Brand<String,"X">` typed IDs implemented (Phase 9A) |

### Phase 17

| Pattern | Planned feature |
|---|---|
| 01 — CRUD Resource | `resource {}` keyword |
| 03 — Commands & Queries | `command`/`query` annotations, effect inference |
| 06 — State Machines | `stateMachine {}`, guarded transitions |
| 10 — Microservices | `service {}` keyword, per-service manifests |

### Phase 17+

| Pattern | Planned feature |
|---|---|
| 02 — Workflow / Process | `workflow {}`, named transitions, approval gates |
| 09 — Background Jobs | `scheduled {}`, `worker {}`, job entry points |
| 12 — Governed Identities (full) | `identity {}`, cross-service identity proofs |

---

## See Also

- `../../../../ZTF-Knowledge-Bases/galerina-roadmap.md` — implementation phases
- `docs/AI/GALERINA_5_MINUTE_PRIMER.md` — syntax quick-start for AI code generators
- `../../../../ZTF-Knowledge-Bases/galerina-flow-contracts.md` — contract model reference
- `../../../../ZTF-Knowledge-Bases/multi-actor-audit-events.md` — audit trail internals
- `../../../../ZTF-Knowledge-Bases/governed-event-driven-execution.md` — event system
