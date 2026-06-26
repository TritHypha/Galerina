# Local Low-Bit AI Review

## Purpose

Galerina may use local low-bit AI, including BitNet-style CPU-friendly models, as
an advisory review and explanation layer.

This must not replace deterministic compiler, type, memory, policy or security
checks.

## Core Rule

```text
AI can advise.
Compiler enforces.
Reports prove.
```

## Short Definition

```text
local low-bit AI review = local advisory explanation over deterministic Galerina reports
```

## What Low-Bit AI Can Help With

Local low-bit AI can help:

- explain generated reports
- highlight suspicious policy patterns
- summarise model exposure
- prepare audit narratives
- guide developers through diagnostics
- review AI/tool boundary risks
- produce human-readable summaries from deterministic evidence

## What Low-Bit AI Must Not Claim

Local AI review must not claim:

- it proves memory safety
- it replaces the type checker
- it replaces policy/effect checks
- it is a source of authority
- its suggestions are compiler guarantees

## Deterministic Inputs

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

## Example Commands

```bash
galerina check
galerina reports
galerina ai-review --local
galerina explain flow getUser
```

## BitNet-Style Backend Position

BitNet-style low-bit inference is a possible backend for local AI review because
it can make local CPU-friendly model execution more practical.

Rules:

```text
BitNet is a backend option, not Galerina syntax.
Low-bit AI is advisory, not authoritative.
Local review reads reports before raw source where possible.
External transmission is denied unless explicitly permitted.
```

## Security Rules

- Run locally by default.
- Read only allowed project files.
- Use generated reports first.
- Do not send code or reports externally without explicit permission.
- Do not modify files unless the user asks.
- Mark suggestions as suggestions, not guarantees.
- Never expose secrets in AI prompts or outputs.

## Placement

Local low-bit AI review is a platform/tooling concept, not a non-negotiable
correctness rule.
