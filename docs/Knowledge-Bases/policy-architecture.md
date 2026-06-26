# Policy Architecture

## Purpose

Galerina should treat policies as first-class source, not hidden framework config.

Policies define reusable, visible rules for routes, flows, data exposure,
packages, memory, runtime profiles and boundaries.

## Short Definition

```text
policy = source-visible rule set compiled into fast checks and reports
```

## Core Rule

```text
Put policy close to the thing it protects.
Reuse policy from /policies when it applies across the app.
Compile policy into fast checks.
Generate reports so humans and AI can understand it.
```

## Policy Placement

Reusable policy should live in:

```text
policies/
```

Local policy can be declared next to the route, model, response, package or
secure flow it protects.

Placement rule:

```text
If it protects one field, place it on the field.
If it protects one response, place it in the response.
If it protects one route, place it in the route.
If it protects one flow, place it in the secure flow.
If it applies across the app, place it in /policies.
```

## Layered Policy Model

Galerina should support layered policies:

| Layer | Meaning |
| --- | --- |
| app policy | global application defaults |
| package policy | package/module authority and exports |
| data policy | classification and exposure rules |
| route policy | public/API boundary rules |
| flow policy | effects, capabilities, memory and limits |
| response policy | what can leave the system |
| memory policy | memory and secret lifetime rules |
| runtime policy | dev/production safety rules |
| compute policy | target, fallback and accelerator rules |
| interop policy | native/foreign boundary rules |
| audit policy | required evidence and redaction rules |

## App Policy Example

```galerina
policy app SecurityDefaults {
  environment production_safe

  defaults {
    deny undeclared_effects
    deny raw_model_response
    deny secret_output
    deny silent_fallback
    deny truthy_falsy_conditions
    deny global_variables
  }

  reports {
    require security_report
    require data_classification_report
    require response_exposure_report
    require effect_report
  }
}
```

## Data Policy Example

```galerina
policy data DataClassificationRules {
  public_id {
    allow response.public
    allow logs
  }

  pii {
    deny logs
    require capability users.private.read
    require audit when exposed
  }

  secret {
    deny response
    deny logs
    deny reports.raw
    allow reports.redacted
  }

  internal {
    deny public_response
    require internal_flow
  }
}
```

## Response Policy Example

```galerina
policy response PublicApiResponsePolicy {
  deny view: secret
  deny view: internal unless capability internal.response
  require audit for view: private
  require explicit_deny_for_unmapped_fields
}
```

Rule:

```text
Public responses must include or deny every model field.
```

## Route Policy Example

```galerina
policy route PublicUserRoutePolicy {
  require auth.bearer
  require response.contract
  deny raw_model_response
  deny unknown_query_fields
  require audit event "user.read"
}
```

## Flow Policy Example

```galerina
policy flow UserReadFlowPolicy {
  capabilities {
    require users.read
    require users.private.read when exposing view: private
  }

  effects {
    allow db.read
    allow audit.write
    deny db.write
    deny network.external
    deny file.write
  }

  memory {
    allow ReadOnly<User>
    deny raw_pointer
    deny secret_escape
    avoid large_clone
  }

  audit {
    event "user.read"
    include ["requestId", "actorId", "userId"]
    redact ["email"]
  }
}
```

## Runtime Policy Example

```galerina
policy runtime ProductionPolicy {
  environment production

  require no_dev_packages
  require no_test_mocks
  require all_secrets_from_env
  require reports.generated
  require dependency_lock
  require package_permissions_checked

  deny debug_routes
  deny unsafe_interop
  deny silent_target_fallback
  deny missing_response_contracts
  deny missing_audit_for_pii
}
```

## Developer-Friendly Relationship

Developers should usually use `permission` as the simple flow-facing authority
surface.

Internally, permissions and policies compile into effective capability, effect,
data exposure, audit and report facts.

```text
permission = developer-facing authority block
policy = reusable source-visible rule set
effective policy = final merged enforcement
```

## Policy Reports

Galerina should generate:

```text
policy-index.json
policy-definitions.json
policy-effective.json
policy-conflicts.json
policy-ai-summary.json
policy-human-summary.md
```

## Report Roles

| Report | Purpose |
| --- | --- |
| `policy-index.json` | where policies are used |
| `policy-definitions.json` | what each policy means |
| `policy-effective.json` | final merged enforcement per route, flow, response, package or data target |
| `policy-conflicts.json` | conflicts and deny-wins decisions |
| `policy-ai-summary.json` | AI-readable security posture summary |
| **policy-human-summary** | human/auditor summary |

## Efficiency Rule

```text
Policy should be expensive at build/check time and cheap at runtime.
```

The compiler can turn policy into:

- static route guards
- precomputed capability checks
- compiled response projectors
- effect permission tables
- secret redaction rules
- memory escape checks
- audit event templates

## Best Short Statement

```text
Policy source is for developers.
Policy definitions JSON is for tools.
Policy index JSON is for navigation.
Effective policy JSON is for security proof.
AI summary JSON is for AI understanding.
```
