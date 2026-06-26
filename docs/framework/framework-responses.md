# Framework: Responses

## Purpose

Response docs define what may leave a Galerina application.

## Short Definition

A response contract is a safe public output boundary.

Response contracts are part of Galerina encapsulation because they define what may
leave a model, flow or route boundary.

## Syntax Example

```galerina
type UserResponse {
  id: UserId
  email: Email
}
```

## Security Rules

- Public routes must use declared response contracts.
- Raw models must not be returned.
- Secrets must never be included.
- Sensitive fields require explicit capability and audit policy.
- Response contracts should use include/deny rules or equivalent views to make
  exposure explicit.

## Generated Reports

```text
response-contract-report.json
model-exposure-report.json
response-security-report.json
```

## AI Guidance

AI tools should use response contracts for public output examples and avoid raw
internal models.

## v1 Scope

Include/deny response shape direction, classification and response exposure
reports.
