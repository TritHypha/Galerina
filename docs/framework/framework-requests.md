# Framework: Requests

## Purpose

Request docs define how data enters a Galerina application.

## Short Definition

A request contract is the typed input boundary for routes, webhooks, workers and
tool calls.

## Syntax Example

```galerina
type CreateUserRequest {
  email: Email
  displayName: String
}
```

## Security Rules

- External input starts untrusted.
- Unknown fields must be rejected or reported.
- Request bodies must have size limits.
- Parsed data must become typed before flow logic uses it.

## Generated Reports

```text
request-contract-report.json
route-input-report.json
validation-report.json
```

## v1 Scope

Typed request records, strict JSON decoding and route input reports.
