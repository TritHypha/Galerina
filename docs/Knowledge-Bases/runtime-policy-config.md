# Runtime Policy Config

## Definition

The Runtime Policy Config is the system-level configuration that defines default runtime behaviour, security limits, package rules, audit destinations, cache rules, and environment constraints before any Galerina code executes.

It is the runtime's **default governance contract**.

## Where it Sits (Load Order)

The Runtime Policy Config is loaded very early in the request/boot lifecycle:

```text
boot/main
 -> Runtime Policy Config
 -> Package Resolver
 -> Governance Checks
 -> Governed IR
 -> Runtime Execution
```

The runtime does not execute project code until the Runtime Policy Config is fully loaded and verified.

## What it Controls

- Deny-by-default mode
- Default view rules
- Audit settings
- Rate limits
- Runtime budgets
- Package registry rules
- Cache rules
- Vault backends
- Allowed compute targets
- Hardware trust levels
- Event rules
- Secret handling
- AI/tool permissions

## Example File (`galerina.runtime.policy` or `galerina.policy`)

```galerina
runtime policy {

  security {
    default deny
    require explicit permission
    deny dynamic package load
  }

  audit {
    default required
    sink "append_only_log"
    auto_include actor
    auto_include permission
    auto_include route
  }

  packages {
    require lockfile
    require signature
    allow registry "galerina-certified"
    deny uncertified production
  }

  cache {
    use VerifiedExecutionCache
    require context_tags
    invalidate on policy_change
  }

  limits {
    request_time 5s
    memory 128mb
    ai_calls 3
    db_reads 50
  }

  compute {
    allow target cpu
    allow target gpu when zone == trusted_hardware
    deny target tpu remote unless policy approved
  }
}
```

## Difference from PHP.ini

While `php.ini` configures basic runtime behaviour, the Galerina Runtime Policy Config configures:

```text
runtime behaviour + security governance + authority defaults
```

It acts as a governance and security authority baseline, not just operational settings.

## Relationship to Permissions

- **Runtime Policy Config** defines global defaults (the "rules of the world").
- **Permissions** define local authority inside that world.

```text
runtime policy says:
  default deny db access

permission says:
  allow db.read table: Profiles
```

> [!IMPORTANT]
> Local permission cannot exceed runtime policy. If runtime policy denies a target or resource, a local permission cannot override it unless explicitly permitted by deployment policy.

## boot/main vs Runtime Policy

- **boot/main** defines what the project boots with (startup wiring, module usage, route loading).
- **Runtime Policy Config** defines the rules of the world that govern the system.

### Example boot/main
```galerina
boot main {
  policy use RuntimePolicy

  use module Auth
  use module Profiles

  route load Auth.routes
  event load Auth.events
}
```

- **policy** = rules
- **boot/main** = startup wiring
