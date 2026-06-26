# 468 — Full Contract Model

Demonstrates every contract section in a single realistic flow.

Contract section order (canonical):
  types → intent → request → response → context → model → effects → rules → events → audit

Separation of concerns:
  contract = what the flow is allowed, expected, and required to do
  body     = how it executes

Key governance points:
  - response.denies prevents email, nhsNumber, dateOfBirth from leaking (SPORE-GOV-003)
  - context.require declares that actor, trace_id, deadline must be read first
  - audit.require signed attestation enables Ed25519 artifact signing
  - The 'with effects [...]' form and 'effects {}' inside contract are both valid
