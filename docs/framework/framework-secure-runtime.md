# Framework: Secure Runtime

## Purpose

Define `galerina serve` as the main v1 framework milestone.

## Short Definition

The secure runtime checks typed application code, loads route and contract
manifests, applies policy before handler work starts and emits reports.

## Why It Exists

Secure web applications need fast request handling without losing explicit
security boundaries. Galerina should make these boundaries typed, reportable and
AI-readable.

The secure runtime implements the architecture charter at request execution
time: security first, code second, authority never implicit.

For AI work, the secure runtime must separate AI intent from authority. AI may
plan, generate code, request capabilities and propose policy, but the runtime
authority kernel decides whether scoped authority is granted.

## Runtime Path

```text
request
  -> route manifest
  -> typed request decode
  -> input size/depth/canonicalisation checks
  -> policy/effect/capability check
  -> resource budget assignment
  -> secure flow
  -> typed response contract
  -> reports
```

## AI Authority Runtime Path

```text
AI proposes action
  -> declared capability/effect request
  -> policy evaluation
  -> risk scoring
  -> sandbox/quarantine when code changes are involved
  -> approval gate
  -> scoped capability lease
  -> audited execution
  -> revocation or expiry
```

## Security Rules

- Inputs start untrusted.
- Data cannot grant authority to itself; role, permission and ownership claims
  from request data must be verified against runtime identity and policy.
- Requests, events, files, AI/tool results and hardware compute plans require
  bounded CPU, memory, time, recursion, task, tool-call and network budgets.
- Effects are denied until declared.
- Package authority is denied until approved.
- Response data must pass through response contracts.
- Fallback and adapter choices must be reported.
- AI-generated code starts in quarantine and cannot promote itself.
- AI actors cannot grant capabilities to themselves or edit their own boundary.
- Capability leases must be scoped, revocable, auditable and time-limited where
  practical.

## Memory Safety Rules

- Large request bodies should use streams or read-only views.
- Explicit clone is required for expensive copies.
- Secrets must remain scoped and redacted.

## Generated Reports

```text
runtime-report.json
route-report.json
effect-report.json
security-report.json
memory-report.json
malicious-data-report.json
exploit-resistance-report.json
resource-budget-report.json
hardware-risk-report.json
ai-authority-request-report.json
ai-code-quarantine-report.json
capability-lease-report.json
```

## v1 Scope

`galerina serve` and secure web runtime behavior are the main v1 milestone.

## Future Scope

Native executable output, WASM acceleration and advanced compute targets remain
future target planning.
