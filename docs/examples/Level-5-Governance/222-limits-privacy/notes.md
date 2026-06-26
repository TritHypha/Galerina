# 222 — Limits and privacy

## What this example shows

A flow with `limits {}` and `privacy {}` contract blocks, demonstrating how to
declare resource caps and PII handling policy in a single, reviewable contract.

## limits block

| Clause | Meaning |
|--------|---------|
| `max request size N MB` | Rejects requests larger than N megabytes |
| `max batch size N` | Caps how many items can be processed in one call |
| `max memory N MB` | Caps heap allocation during flow execution |

The runtime enforces these limits before the flow body executes.

## privacy block

| Clause | Meaning |
|--------|---------|
| `contains PII` | Marks this flow as handling personally identifiable information |
| `retention N years` | Data written by this flow must be deleted after N years |
| `deny protected Email to response` | Protected email fields must not appear in responses |
| `require redaction before audit.write` | PII must be redacted before writing audit records |

## Why declare limits and privacy in the contract?

- Limits prevent denial-of-service via oversized payloads — enforced without application code.
- The privacy block is a machine-readable GDPR/HIPAA annotation for compliance auditors.
- Retention policies can be enforced by a data lifecycle tool that reads the contract.
- Redaction requirements are checkable by the governance verifier (SPORE-GOV-003).
