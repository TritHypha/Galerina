# Framework: Tests

## Purpose

Tests verify that Galerina security and boundary rules remain true.

## Short Definition

Galerina tests should understand routes, responses/views, models, permissions,
effects, classifications and error handling.

## Syntax Examples

```galerina
test flow getUser denies raw_model_return
test response User.authorised excludes passwordHash
test permission user_read denies network.external
test model User requires all_fields_classified
```

## Security Test Targets

- Raw models are not returned from public routes.
- Secret fields are excluded from responses/views.
- PII exposure requires permission.
- Undeclared effects are denied.
- `Result<T, E>` and `Option<T>` are handled.
- Route request bodies are typed and bounded.

## Generated Reports

```text
test-report.json
security-test-report.json
coverage-boundary-report.json
```

## v1 Scope

Security-focused tests for core boundary rules and generated test reports.
