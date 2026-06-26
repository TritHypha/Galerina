# Galerina — Natural-Language Governance Summary

## Overview

Every Galerina build emits a plain-English governance summary generated from the project
manifest, package governance manifests, effect graph, capability graph and resource policy.

Example:

> For the production profile, this application may read and write order data in the database,
> call api.stripe.com over HTTPS to process payments, write audit events, and read payment
> secrets from the production vault. It cannot access arbitrary filesystem paths, spawn
> subprocesses, use native bindings, or make outbound network calls to domains outside the
> configured allowlist.

This summary is intended for:

```text
non-technical reviewers
security reviewers
compliance reviewers
product owners
AI tools
release notes
CI pull request summaries
deployment approval pages
```

---

## Rule: Deterministic, Not Hand-Written

The summary must be generated from structured facts — not hand-written marketing prose
and not inferred by an LLM without validation.

```text
manifest + package manifests + compiler analysis
  -> intent graph / governance report
  -> natural-language governance summary
```

Each sentence is traceable to a structured fact.

---

## Source Facts

The summary is generated from:

```text
project manifest
package governance manifests
effect graph
capability graph
resource policy
secret source policy
network allowlist
runtime target policy
intent graph
governance report
```

Each sentence links to facts:

```json
{
  "sentence": "This application may call Stripe's API over HTTPS.",
  "facts": [
    "effect:network.external",
    "network.allowlist:api.stripe.com",
    "capability:payment.charge"
  ],
  "sources": [
    "galerina.manifest:network.allowlist",
    "flow:createOrder"
  ]
}
```

This makes the output auditable. Compliance reviewers can trace every claim to source.

---

## What the Summary Covers

A good summary mentions:

```text
database access (read / write)
network access (hosts, protocols)
secret access (vault, HSM, env)
filesystem access
subprocess / native / unsafe access
payment and refund authority
audit logging
external services
allowed and denied domains
resource limits
production profile restrictions
package authority contributions
target fallback policy
data sensitivity if known
```

It also states what the application **cannot** do when deny rules are explicit.

---

## Profile Context

The summary always specifies which profile it describes:

```text
Profile: production
Build:   2026-05-27T14:30:00Z
```

Local and staging profiles may differ:

```text
For the local profile, this application may read secrets from .env and use mock
payment providers.
```

---

## Avoid Overclaiming

Good:

```text
This application is configured not to access the filesystem.
This build does not declare subprocess access.
```

Bad:

```text
This application is safe from filesystem attacks.
This build can never execute subprocesses.
```

The latter may be too strong unless runtime enforcement is proven. The summary describes
declared authority — it does not prove security properties.

---

## Uncertainty and Incompleteness

If a fact is unknown, the summary must say so:

```text
One imported package does not provide a governance manifest, so its effects are unknown.
Native binding access is denied by project policy, but one dependency requested it and was blocked.
Network hosts are partially dynamic and require runtime allowlist enforcement.
```

A falsely confident summary is worse than an honest incomplete one.

---

## Output Formats

### Plain text

```text
build/governance-summary.txt
```

### Markdown

```markdown
## Governance Summary

For the production profile, this application may read and write order data in the
database, call `api.stripe.com` over HTTPS to process payments, write audit events,
and read payment secrets from the production vault. It cannot access arbitrary
filesystem paths, spawn subprocesses, use native bindings, or make outbound network
calls to domains outside the configured allowlist.
```

### JSON (with fact links)

```json
{
  "profile": "production",
  "summary": "For the production profile, this application may ...",
  "allowed": {
    "database": ["read", "write"],
    "network": ["api.stripe.com"],
    "secrets": ["production vault"],
    "audit": ["write"]
  },
  "denied": {
    "filesystem": ["arbitrary paths"],
    "process": ["spawn"],
    "native": ["bindings"],
    "network": ["unlisted domains"]
  },
  "sentences": [
    {
      "sentence": "This application may call Stripe's API over HTTPS.",
      "facts": ["effect:network.external", "network.allowlist:api.stripe.com"]
    }
  ]
}
```

---

## CI and Pull Request Integration

In CI, the summary can be posted to PRs alongside governance diff:

```text
Governance summary changed:

Before:
  This application may read the database and write audit logs.

After:
  This application may read the database, write audit logs, and call api.stripe.com
  over HTTPS.

Review required:
  New external network access.
```

---

## Template-Driven Generation

The canonical build artefact must use deterministic templates:

```text
For the {profile} profile, this application may {allowed_actions}. It cannot {denied_actions}.
```

This avoids hallucinated claims. An LLM may optionally rewrite the summary for a specific
audience (e.g., a non-technical board report), but that rewritten version is clearly marked
as AI-assisted and is not the canonical artefact.

---

## Review Classification Checklist

The JSON output can include a reviewer checklist:

```text
External network access:  allowed, restricted to api.stripe.com
Secret access:            allowed, production vault only
Filesystem access:        denied
Native bindings:          denied
Subprocesses:             denied
```

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-GOV-SUMMARY-001` | Governance summary emitted |
| `SPORE-GOV-SUMMARY-002` | Summary contains unknown package authority |
| `SPORE-GOV-SUMMARY-003` | Summary omitted secret values |
| `SPORE-GOV-SUMMARY-004` | Summary profile differs from build profile |
| `SPORE-GOV-SUMMARY-005` | Summary cannot be generated because governance report is incomplete |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core-reports` | Summary schema and build artefact writer |
| `galerina-core-security` | Safe wording, secret redaction, authority categories |
| `galerina-core-config` | Profile-specific policy data |
| `galerina-devtools-project-graph` | Intent graph source facts |
| `galerina-core-cli` | Build output, summary command, CI integration |
| Package tooling | Package authority contribution summaries |
| `galerina-ai-context` | AI-friendly summary bundle |
