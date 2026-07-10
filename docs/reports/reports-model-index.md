# Reports: Model Index

## Purpose

Model reports describe model declarations, field views, relationships,
mutations, exposure paths and AI-readable guidance.

## Contains

```text
model name
source file
fields
field views
memory rules
mutation rules
relationship rules
related request/response contracts
related flows/routes/policies
public exposure status
AI guidance
```

## Security Rules

- Secret and sensitive fields must be marked.
- Potential public exposure must be reported.
- Raw model returns from public routes must be diagnostic candidates.
- Production model fields must be classified.
- Model reports must not include secret values or raw private payloads.

## Report Files

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

## Report Roles

| Report | Purpose |
| --- | --- |
| `model-index.json` | Lists models, source files and usage by responses, flows, routes and policies |
| `model-definitions.json` | Lists fields, types, views, validation and memory metadata |
| `model-effective.json` | Shows final security meaning after model, response and policy rules apply |
| `model-exposure.json` | Shows which fields leave through responses, routes or exports |
| `model-relationships.json` | Shows declared model relationships and field compatibility |
| `model-mutation-report.json` | Shows declared mutation rules, required capabilities and audit requirements |
| `model-ai-summary.json` | Gives AI tools concise safe-use guidance |
| `model-human-summary.md` | Gives developers a readable model summary |

## v1 Scope

Typed record indexing, field views, model/response exposure
relationships and report names.

## Knowledge Base

See [Model Security Contracts](../../../ZTF-Knowledge-Bases/model-security-contracts.md).
