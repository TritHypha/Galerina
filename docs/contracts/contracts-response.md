# Contracts: Response

## Purpose

A response contract defines what data may leave the application.

## Short Definition

Response contracts are safe public output boundaries.

## Syntax

```galerina
type UserResponse {
  id: UserId
  email: Email
}
```

## Security Rules

- Public routes must use declared responses.
- Raw models must not be returned.
- Secret fields must never be included.
- Sensitive fields require policy, capability and audit reporting.

## Generated Reports

```text
response-exposure-report.json
model-exposure-report.json
contract-effective-report.json
ai-context-report.json
```

## AI Guidance

AI should use response contracts for public output, not internal storage models.

## v1 Scope

Response include/deny direction, classification and capability requirements.
