# No Inheritance And Explicit Security

## Purpose

Galerina should avoid inheritance-based design because inherited behaviour can
hide authority, effects, data exposure and security rules.

The core rule:

```text
Inheritance is disallowed in normal Galerina application code.
```

The companion rule:

```text
Assume everything is unsafe until declared safe.
```

## Short Definition

Galerina does not use inheritance to share behaviour or authority. It uses
composition, contracts, explicit views, explicit permissions, explicit
boundaries, secure flows and effective reports.

## Disallowed Forms

Normal Galerina source should not use:

```text
extends
inherits
super
abstract class
virtual method
implicit override
inherited permissions
inherited effects
inherited responses
inherited routes
inherited package authority
```

These constructs make security harder to audit because the real behaviour may
live in a parent type or parent package.

## Why Inheritance Is Disallowed

Inheritance can hide:

- parent behaviour
- parent data exposure
- parent permissions
- parent effects
- parent route handling
- parent response fields
- parent mutation rules
- parent storage access
- parent audit requirements

This is risky for humans, AI tools, compilers and reviewers because the visible
code may not show the actual authority being used.

## Rejected Example

```galerina
class AdminUser extends User {
  override canAccess() -> Bool {
    return true
  }
}
```

Why this is rejected:

- access behaviour is hidden behind overriding
- authority may be inherited accidentally
- AI tools must chase parent chains
- security reviewers must inspect every ancestor
- audit reports become harder to explain

## Safer Alternatives

Use composition:

```galerina
model AdminProfile {
  userId: UUID view: public
  roles: List<Role> view: restricted
}
```

Use explicit contracts:

```galerina
contract PaymentProvider {
  flow charge(
    request: PaymentRequest,
    ctx: RequestContext
  ) -> Result<PaymentResponse, PaymentError>
}
```

Use explicit adapters:

```galerina
adapter StripeProvider implements PaymentProvider {
  boundary external StripeApi
  permission use payment_provider_access

  effects {
    allow network.external
    allow audit.write
  }
}
```

Use explicit views:

```galerina
response UserAdminResponse from User {
  include id
  include email requires capability users.private.read
  include internalRiskScore requires capability users.security.read
  deny passwordHash
}
```

Use secure flows:

```galerina
secure flow grantRole(
  request: GrantRoleRequest,
  ctx: RequestContext
) -> GrantRoleResult
  capabilities {
    require users.role.grant
    require audit.write
  }
  effects {
    allow db.read
    allow db.write
    allow audit.write
  }
contract {
  types {
    type GrantRoleResult = Result<UserAdminResponse, ApiError>
  }
}
{
  let user = try UsersRepository.findRequired(request.userId)
  let updated = try UserRoles.grant(user, request.role)

  return Ok(UserAdminResponse.from(updated))
}
```

## Explicit Security By Default

Galerina should assume a thing is unsafe until it is declared safe.

Examples:

- data is untrusted until validated and typed
- a field is not public until a response/view includes it
- an action is not allowed until permission grants it
- an effect is denied until declared
- a package has no authority until its manifest grants it
- a route is not public-safe until contracts and policies prove it
- an AI-generated change is untrusted until checked, tested and approved

## Replacement Pattern

| Avoid | Use instead |
| --- | --- |
| inheritance | composition |
| inherited permissions | explicit capabilities |
| inherited effects | explicit effects |
| inherited response fields | response/view contracts |
| inherited behaviour | secure flows |
| parent-chain authority | package manifests and permissions |
| runtime override | adapter or contract implementation |
| hidden dispatch | effective reports |

## Compiler And Checker Direction

Galerina should reject normal source that uses inheritance keywords or semantics.

Diagnostics should be safe to show:

```json
{
  "code": "SPORE-INHERIT-001",
  "severity": "error",
  "message": "Inheritance is not supported in normal Galerina source. Use composition, contracts or adapters.",
  "safeToShow": true
}
```

Galerina should also reject inherited authority:

```json
{
  "code": "SPORE-AUTH-003",
  "severity": "error",
  "message": "Permissions and effects must be declared on the effective flow or adapter. Inherited authority is not allowed.",
  "safeToShow": true
}
```

## Reports

Generated reports should show explicit effective authority:

```text
effective-permission-report.json
effect-report.json
contract-implementation-report.json
package-authority-report.json
response-exposure-report.json
```

Reports should not rely on parent-chain inference to explain what happened.

## Structural Hierarchy Is Allowed

Galerina does allow **containment hierarchy** — hierarchy used for organisation, not authority transfer.

Allowed:

```text
Package -> Module -> Data -> View -> Field
Permission -> Capability -> Effect -> Audit rule
```

Example:

```galerina
package Auth {
  module Login {
    flow login(...)
  }
}
```

Dot-path access is also fine as organisation:

```galerina
Runtime.Hardware.USB
Runtime.Context.Auth
SessionVault.write(...)
```

This is containment — a naming and scoping structure — not inheritance.

**The rule:**

```text
Hierarchy may organise.
Hierarchy must not transfer authority.
```

## Core Principle

```text
No inherited authority.
No hidden parent behaviour.
No assumed safety.
```

Galerina should be explicit enough that a developer, AI tool, compiler and auditor
can see the effective behaviour without chasing inheritance chains.
