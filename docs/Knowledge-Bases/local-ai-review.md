# Local AI Review

Galerina may support local AI review as an advisory development and audit aid.

## Core Rule

```text
AI can advise.
Compiler enforces.
Reports prove.
```

Local AI review must not replace deterministic compiler, type, policy, memory
or security checks.

## Purpose

Local AI review can explain checked reports, highlight suspicious patterns and
prepare audit narratives without sending code or sensitive project data to
external services.

Low-bit local models, including BitNet-style backends, may be useful for this
work because they can make local CPU-friendly review more practical. They remain
advisory backends, not sources of proof.

## Inputs

The reviewer should read deterministic reports first:

```text
policy-effective.json
model-exposure.json
contract-effective.json
flow-report.json
security-report.json
boundary-report.json
vault-report.json
```

## Outputs

```text
build/reports/ai-review.md
build/reports/audit-summary.md
build/reports/report-explanation.md
```

## Deterministic Checks

These remain compiler/runtime responsibilities:

```text
Only Bool in conditions.
No raw model returned from public route.
No secret field in response.
No undeclared effect.
No missing Option<T> handling.
No ignored Result<T,E>.
No unclassified model field in production.
```

## AI-Assisted Suggestions

AI may suggest:

```text
This policy may be too broad.
This flow name does not match its permissions.
This route probably should audit PII access.
This boundary looks under-specified.
This model may need a retention rule.
```

These are suggestions, not proof.

## Commands

Possible future commands:

```bash
galerina ai-review --local
galerina explain flow getUser
galerina explain build/reports/model-exposure.json
galerina audit --env production
```

## Security Rules

```text
Run locally by default.
Read only allowed project files.
Use generated reports first.
Do not send code or reports externally without explicit permission.
Do not modify files unless the user asks.
Mark suggestions as suggestions, not guarantees.
Never expose secrets in AI prompts or outputs.
```

## Placement

Local AI review belongs under future tooling/platform concepts. It is not a
non-negotiable correctness rule.

See [Local Low-Bit AI Review](local-low-bit-ai-review.md).
