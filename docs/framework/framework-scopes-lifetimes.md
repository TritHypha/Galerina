# Framework: Scopes And Lifetimes

## Purpose

Scopes and lifetimes define where sensitive or resource-heavy values are allowed
to exist.

## Short Definition

A scope limits value lifetime, visibility and escape behaviour.

## Syntax Example

```galerina
scope payment_data {
  let token: SecureString = request.cardToken
  let result = try PaymentProvider.charge(token)

  return Ok(PaymentResponse.from(result))
}
```

## Security Rules

- Sensitive values must not escape their declared scope.
- Secrets, payment tokens, credentials and temporary keys require strict
  lifetimes.
- Native handles and external resources must be released or transferred
  explicitly.
- Scope exits must preserve redaction and audit rules.
- Vault scopes must not become global variables.

## Generated Reports

```text
scope-report.json
lifetime-report.json
secret-lifetime-report.json
memory-report.json
```

## v1 Scope

Secret and sensitive-value lifetime rules, plus scoped vault integration.
