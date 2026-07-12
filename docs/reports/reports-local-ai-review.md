# Reports: Local AI Review

## Purpose

Local AI review reports explain deterministic Galerina reports in human-readable
language and highlight possible risks.

## Core Rule

```text
AI can advise.
Compiler enforces.
Reports prove.
```

## Inputs

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
ai-review.md
audit-summary.md
report-explanation.md
```

## Security Rules

- Run locally by default.
- Use generated reports first.
- Do not send code or reports externally without explicit permission.
- Mark suggestions as suggestions, not guarantees.
- Never expose secrets in AI prompts or outputs.

## Knowledge Base

See [Local AI Review](../../../ZTF-Knowledge-Bases/local-ai-review.md).
