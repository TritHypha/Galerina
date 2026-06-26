# Boot/Main Startup Defaults

## Definition

**Boot/main policy defaults** are the project-level startup rules that select profiles, apply default runtime policy, load modules, register vaults, configure audit, and define safe defaults before any flow executes.

```text
boot/main policy defaults =
the governed startup map for a Galerina application,
operating within the constraints set by the Runtime Policy Config.
```

This replaces PHP-style `php.ini` and `.fpm` configuration patterns.

## Distinction from Runtime Policy Config

```text
Runtime Policy Config = the world rules the runtime enforces globally
boot/main defaults    = project startup choices within those rules
```

The project's boot/main block may restrict or select behaviour. It may not weaken Runtime Policy Config.

## Startup Order

```text
Runtime starts
 -> Runtime Policy Config loads
 -> boot/main loads
 -> profiles selected
 -> packages/modules resolved
 -> vaults/routes/events registered
 -> preload graph verified
 -> runtime ready
```

## Boot Block Example

```galerina
boot main {

  profile use strict

  policy defaults {
    audit required
    deny dynamic_package_load
    cache use VerifiedExecutionCache
    context auto safe_only
  }

  use module Auth
  use module Profiles

  register vault SessionVault

  route load Auth.routes
  route load Profiles.routes
}
```

## What Boot/Main Defaults May Control

```text
active profiles
audit default
cache default
context behaviour
rate limit defaults
route loading
event loading
vault registration
package/module loading
preload graph
worker pool defaults
```

## What Boot/Main Must Not Do

Boot/main cannot override or weaken Runtime Policy Config. If Runtime Policy Config says:

```text
deny dynamic_package_load
```

Then boot/main cannot enable it.

```text
boot/main may restrict or select.
boot/main may not weaken runtime policy.
```

## Why This Is Useful

The boot/main block gives Galerina a clear, auditable startup map:

```text
what starts
what rules apply
what modules exist
what defaults are active
```

This supports:

```text
AI understanding of application scope
security auditing
test reproducibility
runtime reproducibility
security review of startup surface
```

## Core Principle

```text
boot/main is the governed startup map.
Runtime Policy Config is the world it must obey.
```
