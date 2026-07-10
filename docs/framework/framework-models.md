# Framework: Models

## Purpose

Models define internal data shapes used by application flows, storage adapters
and domain logic.

## Short Definition

A model is a view-governed internal data contract. It is not automatically safe for
public output and must not behave like an active-record database object.

## Syntax Example

```galerina
model User {
  id: UUID view: public
  email: Email view: private
  passwordHash: SecureString view: secret
  internalRiskScore: RiskScore view: internal
  createdAt: DateTime view: public
  updatedAt: DateTime view: internal
}
```

## How It Connects

```text
request contract -> flow -> model -> response contract
```

Models connect to:

- view rules
- response/view contracts
- secure flows
- repositories/storage boundaries
- relationship maps
- mutation rules
- model reports

## Security Rules

- Raw models must not be returned by public routes.
- Production model fields must declare a view.
- Secret, internal, hidden and sensitive fields must follow exposure policy.
- Public output must use response contracts.
- Storage models and response models must stay separate.
- Models must not own hidden database effects such as `save()` or `findById()`.
- Model relationships must be explicit and must not trigger hidden lazy loading.
- Model mutation must be explicit, policy-controlled and auditable.
- Large model copies should require explicit clone or read-only handling.
- Database field-read permissions should prefer explicit field allow lists.
- Broad field-read permissions such as `fields: all except [...]` must be
  visible, reportable and reviewed for future-field leakage.

## Generated Reports

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

## Rejected Example

```galerina
return Response.ok(user)
```

Public routes should return a declared response contract, not a raw model.

## v1 Scope

Typed records, field views, model/response separation, basic exposure
reporting and report names. Relationship, mutation and storage-provider
implementations may remain later work until the parser/checker is mature.

## Knowledge Base

See [Model Security Contracts](../../../ZTF-Knowledge-Bases/model-security-contracts.md).
See also [Field Read Rules](../../../ZTF-Knowledge-Bases/field-read-rules.md).
