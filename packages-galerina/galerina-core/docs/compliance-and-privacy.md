# Galerina Compliance And Privacy Framework

## Purpose

This document defines the Galerina compliance and privacy framework direction.
It combines:

```text
Galerina Compliance
  -> privacy
  -> security
  -> data governance
  -> audit
  -> retention
  -> accessibility
  -> AI governance
  -> deployment policy
```

Galerina must not claim legal or regulatory compliance by default. Compliance
depends on laws, jurisdictions, contracts, organisational process, deployment
controls and human review. Galerina can help by making compliance-relevant
behavior typed, permissioned, reportable, auditable and easier to review before
deployment.

## Package Family

Compliance packages should use the lowercase Galerina package naming scheme and
live under `packages-galerina-enterprise/` unless explicitly unlocked into the
active workspace:

```text
galerina-compliance
galerina-compliance-privacy
galerina-compliance-security
galerina-compliance-data
galerina-compliance-audit
galerina-compliance-retention
galerina-compliance-ai
galerina-compliance-accessibility
galerina-compliance-deployment
galerina-compliance-reports
```

`galerina-compliance` is the umbrella package. The subpackages own focused policy
and report contracts.

## Umbrella Boundary

Use `galerina-compliance` for:

```text
compliance profile vocabulary
policy bundle references
cross-package compliance summaries
control mapping metadata
evidence manifest contracts
compliance report index contracts
```

Do not use it for:

```text
legal advice
regulatory certification claims
jurisdiction-specific legal conclusions
identity provider implementation
data warehouse implementation
audit storage backend implementation
```

## Privacy

`galerina-compliance-privacy` should define contracts for:

```text
personal data classification
data minimisation
purpose limitation
consent references
lawful-basis references where applicable
data subject request workflow references
privacy-safe logs and reports
cross-border data transfer metadata
```

Example:

```text
privacy {
    classify field user.email as personalData
    purpose "account_login"
    minimise true
    deny log user.email
    report privacy
}
```

## Security

`galerina-compliance-security` should map compliance controls to security
contracts already owned by `galerina-core-security`, `galerina-core-network` and the
Secure App Kernel.

It should define:

```text
required security controls
control evidence references
security exception workflow
policy attestation metadata
security report aggregation
```

It should not duplicate cryptographic primitives, permission decisions or
network policy engines.

## Data Governance

`galerina-compliance-data` should define:

```text
data owner metadata
data steward metadata
data classification
data lineage references
allowed processing purposes
data residency hints
dataset approval status
```

Example:

```text
dataGovernance CustomerRecord {
    owner: "customer-platform"
    classification: personalData
    residency: ["UK", "EU"]
    allowedPurposes: ["support", "billing", "account_security"]
}
```

## Audit

`galerina-compliance-audit` should define:

```text
audit event contracts
evidence references
hash-chain or append-only evidence metadata
review status
control owner
exception approval metadata
```

Audit packages should store references and report contracts. They should not
become an audit database.

## Retention

`galerina-compliance-retention` should define:

```text
retention classes
delete-after policy
legal hold references
archive policy
disposal evidence
backup retention metadata
```

Example:

```text
retention CustomerSupportTicket {
    keepFor: "7y"
    deleteAfter: "7y"
    legalHold: allowed
    report retention
}
```

## Accessibility

`galerina-compliance-accessibility` should define contracts for:

```text
accessibility requirement metadata
keyboard navigation checks
label and description requirements
contrast checks
screen-reader compatibility reports
accessibility exception workflow
```

This package should define report contracts and checks. It should not become a
frontend framework.

## AI Governance

`galerina-compliance-ai` should define contracts for:

```text
AI use case registration
model provenance references
training data provenance references
prompt and output logging policy
human review requirements
high-impact decision restrictions
bias and safety evaluation references
AI report aggregation
```

It should integrate with `galerina-ai`, `galerina-ai-agent` and
`galerina-core-security` instead of duplicating AI inference or security logic.

## Deployment Policy

`galerina-compliance-deployment` should define:

```text
environment approval gates
production exception policy
region and residency constraints
release attestation metadata
rollback evidence
runtime control checks
deployment compliance report contracts
```

## Reports

`galerina-compliance-reports` should define shared report shapes for:

```text
app.compliance-report.json
app.privacy-report.json
app.data-governance-report.json
app.audit-report.json
app.retention-report.json
app.accessibility-report.json
app.ai-governance-report.json
app.deployment-policy-report.json
```

Example summary:

```json
{
  "compliance": {
    "profile": "production",
    "privacy": "review_required",
    "security": "pass",
    "dataGovernance": "review_required",
    "audit": "pass",
    "retention": "review_required",
    "accessibility": "not_applicable",
    "aiGovernance": "not_applicable",
    "deploymentPolicy": "pass",
    "warnings": []
  }
}
```

## Final Rule

```text
Galerina does not grant compliance automatically.
Galerina makes compliance-relevant behavior explicit, typed, permissioned,
auditable, reportable and reviewable before deployment.
```
