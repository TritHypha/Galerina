# Encapsulation Model

## Purpose

Galerina should protect internal state, secrets and sensitive data without relying
mainly on traditional `public` and `private` field visibility.

Galerina encapsulation is based on controlled data movement:

```text
secure flow boundaries
explicit inputs and outputs
data classification
response contracts
capabilities
effects
scoped lifetimes
package exports
safe mutation rules
audit reports
```

## Short Definition

Encapsulation in Galerina means controlling how data moves, what can leave, who
has capability, what effects are allowed and what reports prove the boundary was
checked.

## Core Idea

Traditional encapsulation asks:

```text
Is this field public or private?
```

Galerina asks stronger questions:

```text
What type of data is this?
Where is it allowed to flow?
Which secure flow may use it?
Which response or view may expose it?
Which capability is required?
Which effects are allowed?
Is access audited?
Can the value escape its scope?
```

## Preferred Classification Style

Use first-class view metadata for field exposure:

```galerina
model User {
  id: UUID view: public
  email: Email view: private
  passwordHash: SecureString view: secret
  internalRiskScore: RiskScore view: internal
}
```

This is preferred over annotation-style metadata because classification is a
security rule, not decorative syntax.

## Recommended Classification Values

Initial classification values:

```text
public_id
public
internal
confidential
pii
secret
credential
security_sensitive
financial
health
audit_only
never_expose
```

## Classification Rules

| Classification | Meaning | Default behaviour |
| --- | --- | --- |
| `public_id` | Safe public identifier | Can appear in public responses |
| `public` | Safe public value | Can appear in public responses |
| `internal` | Internal application data | Cannot leave public routes by default |
| `confidential` | Sensitive business data | Requires policy and audit |
| `pii` | Personal identifiable information | Requires response policy and audit consideration |
| `secret` | Secret value | Cannot be printed or returned |
| `credential` | Token, key or password credential | Cannot be printed, returned or stored unsafely |
| `security_sensitive` | Risk or security decision data | Requires policy and audit |
| `financial` | Payment or accounting data | Requires policy and audit |
| `health` | Health-related data | Requires strict policy and audit |
| `audit_only` | Used for audit/reporting only | Cannot be public response data |
| `never_expose` | Must never leave trusted boundary | Compiler should reject exposure |

## Secure Flow Encapsulation

A `secure flow` is the main execution boundary.

It declares:

- what enters
- what leaves
- what errors may happen
- what effects are allowed
- what capabilities are required
- what data may be exposed
- what reports should be generated

```galerina
secure flow getUser(
  userId: UUID,
  ctx: RequestContext
) -> Result<UserResponse, ApiError>
  capabilities {
    require users.read
  }
  effects {
    allow db.read
    allow audit.write
    deny network.external
  }
{
  let user = try UsersRepository.findRequired(userId)

  return Ok(UserResponse.from(user))
}
```

The caller receives the declared result, not database internals, secret fields,
hidden mutable state or the raw internal model.

## Model Versus Response

Core rule:

```text
model = internal data
response/view = safe output
```

Rejected:

```galerina
return Ok(user)
```

Accepted:

```galerina
return Ok(UserResponse.from(user))
```

Response contracts are encapsulation boundaries because they define exactly what
may leave the application.

## Capabilities And Effects

Capabilities answer:

```text
Who may access this?
For what purpose?
Under which policy?
With which audit requirement?
```

Effects answer:

```text
What may this flow technically do?
```

Both are required because encapsulation must cover data access and behaviour,
not only field visibility.

## Scoped Lifetimes

Sensitive values should have limited lifetimes.

```galerina
scope payment_data {
  let cardToken: SecureString = request.cardToken
  let result = try PaymentProvider.charge(cardToken)

  return Ok(PaymentResponse.from(result))
}
```

Secret or scoped values must not be returned, logged, stored or captured outside
their allowed scope.

## Package Exports

Packages encapsulate code and authority.

```galerina
package users {
  export secure flow getUser
  export secure flow updateUserEmail

  internal flow calculateRisk
  internal model User
  internal repository UsersRepository
}
```

Other packages may call exported flows, but must not access internal flows,
repositories or models by accident.

## Safe Mutation

Galerina should avoid uncontrolled direct mutation of classified fields.

Rejected:

```galerina
user.email = newEmail
user.role = Admin
user.internalRiskScore = RiskScore.zero
```

Preferred:

```galerina
let updated = User.changeEmail(user, newEmail)
```

or:

```galerina
let updatedUser = user with {
  email: newEmail
}
```

when allowed by mutation policy.

Safe mutation supports immutability by default, auditability, clear data changes
and AI-readable state transitions.

## Compiler Checks

Galerina should reject:

- public routes returning raw internal models
- secret fields in public responses
- PII fields without policy
- view-governed internal fields leaving public boundaries
- undeclared effects
- unsafe mutation of classified fields
- secret values escaping scope
- responses that omit required deny/include rules
- package internals accessed from outside

Example diagnostic:

```json
{
  "code": "SPORE-ENCAP-001",
  "severity": "error",
  "message": "Public route cannot return model User directly. Return a declared response or view contract.",
  "safeToShow": true
}
```

## Reports

Suggested reports:

```text
encapsulation-report.json
data-view-report.json
response-exposure-report.json
effect-report.json
capability-report.json
secret-scope-report.json
```

## Priority Category Placement

Non-negotiable rules:

- no global variables
- sensitive data must not escape secure boundaries
- secrets must never be printed or returned directly
- public routes must not return raw internal models
- classified fields must follow exposure policy
- undeclared effects are forbidden

Core language rules:

- `secure flow` is a protected execution boundary
- flows must declare inputs and outputs
- effects must be declared
- capabilities may be required for sensitive access
- models may contain classified fields
- responses define safe public output
- scoped sensitive values cannot escape their scope

Recommended design rules:

- prefer secure flows over OOP-style service classes
- prefer explicit context passing over hidden global state
- prefer response contracts over direct model exposure
- prefer data classification over public/private-only design
- prefer capability-based access over direct field access
- prefer flow reports over hidden framework behaviour

## Core Principle

```text
Do not just hide data.
Control how data flows.
```
