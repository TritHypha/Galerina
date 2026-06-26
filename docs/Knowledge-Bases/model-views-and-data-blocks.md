# Model Views And Data Blocks

## Status

```
Status: Active — data modelling and output safety pattern
Scope:  data block, model, request, view; view-level field exposure; PII protection
See also: data-visibility-view-terminology.md, builtin-view-levels.md, field-read-rules.md, model-security-contracts.md
```

## Purpose

Galerina can simplify the developer surface by grouping models, requests and
responses under `data`, while preserving the security separation between
internal data and public output.

## Short Definition

```text
data = model + request + response/view
```

## Core Rule

```text
Do not fully merge model and response.
Use model views for safe output.
```

The model remains internal truth. A view or response defines what may leave.

## Data Block Pattern

```galerina
data User {
  model {
    id: UUID view: public
    email: Email view: private
    passwordHash: SecureString view: secret
    internalRiskScore: RiskScore view: internal
  }

  request get {
    userId: UUID view: public
  }

  view public {
    include id
    deny email
    deny passwordHash
    deny internalRiskScore
  }

  view authorised {
    include id
    include email requires permission users.private.read
    deny passwordHash
    deny internalRiskScore
  }
}
```

## Why Views Are Safer

Rejected:

```galerina
return Ok(user)
```

Accepted:

```galerina
return Ok(User.authorised.from(user))
```

This keeps the key distinction:

```text
User = internal model
User.authorised = safe output view
```

## Naming Guidance

Prefer descriptive view names:

```text
public
self
authorised
admin
audit
```

Avoid vague names where possible:

```text
safe
normal
default
```

## Security Rules

- Public routes must not return raw internal models.
- Views must explicitly include or deny sensitive fields.
- PII exposure must require permission.
- Secret and credential fields must not be exposed.
- Model views should generate fast projection and exposure reports.
- Field exposure metadata should use `view`, not `classify`.

## Reports

```text
model-exposure.json
response-exposure-report.json
data-view-report.json
model-ai-summary.json
```

## Best Short Statement

```text
Keep model and response separate in meaning.
Let views make that separation easier to write.
```
