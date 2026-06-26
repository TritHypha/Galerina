# Reports: Overview

## Purpose

Reports are generated proof that Galerina source, packages, policies and runtime
plans were checked.

## Short Definition

A report is a machine-readable summary of source-declared facts, derived facts,
diagnostics and safety decisions.

## Report Families

```text
policy reports
model reports
contract reports
security reports
crypto inventory reports
memory reports
malicious data reports
exploit resistance reports
resource budget reports
hardware risk reports
specialist hardware reports
accelerator fallback reports
route reports
AI context reports
MCP reports
runtime bridge reports
```

## Security Rules

- Reports must redact secrets.
- Reports must avoid private payload dumps.
- Reports must distinguish declared facts from inferred facts.
- Reports must be safe for AI tooling unless explicitly marked private.

## v1 Scope

Define stable report names and safety rules for policies, contracts, models,
security, malicious data handling, exploit resistance, resource budgets,
hardware risk, specialist compute hardware, accelerator fallback, crypto
inventory, AI context and platform-level AI/tool boundaries such as MCP.

## Model Report Family

Model reports should include:

```text
model-index.json
model-definitions.json
model-effective.json
model-exposure.json
model-relationships.json
model-mutation-report.json
model-ai-summary.json
model-human-summary.md
```
