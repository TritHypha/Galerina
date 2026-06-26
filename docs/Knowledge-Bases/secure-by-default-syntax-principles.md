# Secure By Default Syntax Principles

## Purpose

Galerina should make security properties visible in syntax, not only enforced as
late runtime checks.

The core principle is:

```text
Make insecure behaviour impossible by default,
and privileged behaviour visible in syntax.
```

These principles support least privilege, deny-by-default policy, explicit
authority, input validation, output safety, resource control and auditability.

## 1. Deny By Default

Permissions deny everything unless explicitly allowed.

Example:

```galerina
permission profile_read {
  code {
    allow db.read
  }
}
```

Meaning:

```text
everything not allowed is denied
```

The absence of an allow rule is not neutral. It is a denial.

## 2. Explicit Authority

Risky actions must be declared before code can perform them.

Example:

```galerina
code {
  allow db.read
  allow audit.write
}
```

Risky action families include:

- database
- file
- network
- secret
- AI/tool
- compute
- shell
- external API

If a flow, package, tool or worker uses one of these authorities without a
matching declaration, the checker should reject it or require a gated unsafe
boundary.

## 3. Input Contracts

Requests should define shape, required fields, limits and allowed values.

Example:

```galerina
request getProfile {
  user_id: UserId required
}
```

Future direction:

```galerina
request searchUsers {
  name: String max 80
  page: Int min 1 max 100
}
```

Input contracts should be checked before business logic, database access,
AI/tool calls or external service calls.

## 4. Output View Rules

Field exposure should use `view`.

Example:

```galerina
email: String view: private
api_key: String view: secret
```

Permissions decide which views can leave a boundary:

```galerina
data {
  allow expose view: public
  allow expose view: private owner: actor
}
```

This makes output exposure visible and reportable.

## 5. Ownership Checks

Private or owner-scoped data must require explicit ownership rules.

Example:

```galerina
data {
  allow expose view: private owner: actor
}
```

The runtime must not trust user-supplied IDs as proof of ownership. Ownership
must be verified against runtime identity, policy and data relationships.

## 6. Safe Database Syntax

Raw SQL should not be allowed by default.

Prefer typed queries:

```galerina
db.read User where User.id == request.user_id
```

Raw SQL requires special authority:

```galerina
code {
  allow db.raw_sql
}
```

Raw SQL should produce a high-risk report entry and should be unavailable in
normal beginner or default production profiles unless explicitly approved.

## 6A. Field Read Rules

Database field reads should prefer explicit allow lists:

```galerina
allow read Profiles fields: [
  id,
  owner,
  name
]
```

Galerina may support broad read rules:

```galerina
allow read Profiles fields: all except [
  email
]
```

This must be treated as higher risk than an explicit allow list because new
fields may be added later. A safer broad-read form may use:

```galerina
allow read Profiles fields: all current except [
  email
]
```

Meaning current known fields are frozen and future fields remain denied until
review.

The detailed field-read model is documented in
[Field Read Rules](field-read-rules.md).

## 7. Encoding By Target

Output should declare or inherit its target.

Example:

```galerina
response Profile.response target: json
```

Future targets may include:

```text
html
json
log
ai_prompt
shell
sql
url
csv
```

Each target has different escaping, encoding, redaction and injection rules.
Galerina should not treat all output as plain text.

## 8. Secret-Safe Syntax

Secrets should be impossible to expose unless explicitly allowed by a narrow,
audited boundary.

Example:

```galerina
api_key: String view: secret
```

Default secret rules:

```text
secret cannot be returned
secret cannot be logged
secret cannot be sent to AI
secret cannot be serialized into normal reports
secret cannot be cached by default
```

Secret exposure requires explicit authority, a safe sink and an audit trail.

## 9. Resource Budgets

Every flow should have default budgets. Security-sensitive or expensive flows
may declare explicit budgets.

Example:

```galerina
budget {
  cpu: small
  memory: small
  time: 100ms
}
```

Budgets may cover:

- CPU time
- wall time
- memory
- request body size
- loop or recursion limits
- spawned tasks
- network calls
- AI/tool calls
- hardware accelerator work

Resource budgets protect against endless loops, unbounded parsing, expensive
queries, AI prompt abuse and memory exhaustion.

## 10. Audit Declarations

Security-relevant flows should declare audit requirements.

Example:

```galerina
audit required event "profile.read"
```

Audit declarations should identify:

- event name
- actor
- permission used
- data view exposed
- object or resource ID
- decision result
- denied action where relevant
- correlation ID

Reports must redact secrets and sensitive payloads.

## 11. Context Only When Authority-Sensitive

Simple flows may omit explicit context.

Authority-sensitive work should require explicit context or an inherited
governed context.

Context-sensitive families include:

- auth
- admin
- database
- file
- network
- secret
- AI/tool
- compute
- elevated audit

The purpose is to keep simple code readable while ensuring privileged code has
identity, policy, permission and audit context.

## 12. Safe Defaults By Language

Galerina should disallow or restrict features that commonly hide authority,
execution, mutation or unsafe data movement.

Restricted or denied by default:

- eval
- raw shell
- monkey patching
- global mutable variables
- inheritance
- unsafe reflection
- raw pointers
- silent network access
- raw SQL
- generic direct vault access

Where any of these exist at all, they must be visible, permissioned, effect
checked, profile gated and reported.

## Syntax-Level Security Reports

These principles should feed reports such as:

```text
permission-effective-report.json
input-contract-report.json
output-view-report.json
ownership-check-report.json
database-query-safety-report.json
encoding-target-report.json
secret-flow-report.json
resource-budget-report.json
audit-declaration-report.json
unsupported-feature-report.json
```

## Relationship To Other Concepts

This concept connects:

- [Developer-Friendly Permission Model](developer-friendly-permission-model.md)
- [Permission, Capability And Actor Model](permission-capability-actor-model.md)
- [Data Visibility View Terminology](data-visibility-view-terminology.md)
- [Deny By Default Risk Features](deny-by-default-risk-features.md)
- [Malicious Data And Exploit Resistance](malicious-data-and-exploit-resistance.md)
- [Memory Pressure Security](memory-pressure-security.md)
- [Explicit Mutation And Vault Writes](explicit-mutation-and-vault-writes.md)

## Final Principle

```text
Security should not be hidden in framework behaviour.

Galerina syntax should expose authority, input shape, output visibility,
ownership, risky effects, resource cost and audit requirements before code runs.
```
