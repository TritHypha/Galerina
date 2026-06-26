# Documentation Layer Model

Galerina documentation is organised into layers so developers, reviewers and AI
tools can find the right kind of information without mixing framework behavior,
contract boundaries, policy rules and generated reports.

## Core Principle

```text
Framework docs explain concepts.
Contract docs explain boundary agreements.
Policy docs explain allowed behavior.
Report docs explain generated proof.
Rule docs explain what Galerina must never break.
Example docs show everything working together.
```

## Folder Pattern

```text
docs/framework/framework-*.md
docs/contracts/contracts-*.md
docs/policies/policies-*.md
docs/reports/reports-*.md
docs/rules/rules-*.md
docs/examples/example-*.md
```

The prefix is part of the indexing strategy. It keeps files sortable and avoids
near-duplicate names such as **model-contracts**, **contract-model** and
**framework_model_contract**.

## Framework Docs

Framework docs describe how a Galerina application is structured and operated.
They answer:

```text
What is this concept?
Where does it live?
How does it interact with other concepts?
What are the security rules?
What reports are generated?
```

Primary v1 framework docs:

```text
framework-overview.md
framework-project-structure.md
framework-secure-runtime.md
framework-models.md
framework-requests.md
framework-responses.md
framework-secure-flows.md
framework-policies.md
framework-contracts.md
framework-effects.md
framework-capabilities.md
framework-reports.md
```

## Contract Docs

Contract docs describe boundary agreements:

```text
request contracts
response contracts
model contracts
flow contracts
policy contracts
package contracts
storage contracts
external API contracts
event contracts
AI/tool contracts
compute contracts
```

Recommended order:

```text
request  = what enters
response = what leaves
model    = internal data
flow     = execution boundary
policy   = allowed behavior
package  = code boundary
storage  = data persistence boundary
external = outside-system boundary
event    = async boundary
AI/tool  = agent/tool boundary
compute  = future acceleration boundary
```

## Policy Docs

Policy docs explain how allowed behavior is declared, inherited, merged and
reported. They should cover app, route, flow, data, response, package, memory
and runtime policy.

## Report Docs

Report docs explain generated JSON proof. They define report purpose, producer,
consumer, data shape, redaction rules and AI-safe usage.

Important report families:

```text
policy reports
model reports
contract reports
security reports
AI context reports
```

## Rule Docs

Rule docs describe the non-negotiable Galerina constraints:

```text
Only Bool controls conditions.
No silent missing values.
No raw model returns from public routes.
No undeclared effects.
No monkey patching.
No silent target fallback.
Secrets redact by default.
Native interop is explicit and reportable.
```

## Document Template

Framework and contract docs should use a stable structure:

```text
Purpose
Short Definition
Why It Exists
Syntax Example
Where It Lives
How It Connects
Security Rules
Memory Safety Rules
AI-Friendly Output
Generated Reports
Good Example
Rejected Example
v1 Scope
Future Scope
```

This structure helps human readers and AI tools compare concepts consistently.

## AI Understandable Architecture Policy

Galerina documentation should form a knowledge map, not only a folder tree.

Architecture, definitions, package ownership, generated project graphs and
AI-readable context should use stable names and explicit links so tools can
read the architecture without guessing.

Core policy:

```text
AI should not infer the architecture.
AI should read the architecture.
```

Detailed policy lives in
[AI Understandable Architecture Policy](ai-understandable-architecture-policy.md).
