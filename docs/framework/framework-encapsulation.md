# Framework: Encapsulation

## Purpose

Encapsulation in Galerina protects internal state and sensitive data by controlling
data movement across secure flows, response contracts, package exports and
classified boundaries.

## Short Definition

Galerina encapsulation controls:

```text
what enters
what leaves
who has capability
what effects are allowed
where sensitive values may live
what package exports
what reports prove the boundary
```

## Model

Galerina should not rely mainly on `public` and `private` field visibility.

It should use:

- secure flow boundaries
- explicit inputs and outputs
- data classification
- response/view contracts
- capabilities
- effects
- scoped lifetimes
- package exports
- safe mutation rules
- audit reports

## Security Rules

- Public routes must not return raw internal models.
- Classified fields must follow exposure policy.
- Secret and credential values must not be printed, returned or exposed in
  reports.
- Secure flows must declare inputs, outputs, effects and required capabilities.
- Sensitive values must not escape declared scopes or lifetimes.
- Package internals must not be accessed outside declared exports.
- Mutation of classified fields must go through safe mutation policy or
  controlled update flows.

## Generated Reports

```text
encapsulation-report.json
data-view-report.json
response-exposure-report.json
secret-scope-report.json
package-authority-report.json
```

## Knowledge Base

See [Encapsulation Model](../../../ZTF-Knowledge-Bases/encapsulation-model.md).
