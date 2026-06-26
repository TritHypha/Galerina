# Trusted Boot Preload Graph

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Phase 17+

## Definition

The **Trusted Boot / Preload Graph** is a verified startup map of modules, policies, vaults, routes, events, profiles, and cached execution plans that are allowed to be loaded before normal request execution begins.

```text
Preloading may improve speed.
Preloading must not create trust.
```

## Correct Startup Order

Preloading must happen **after** security setup, not before:

```text
Runtime starts
 -> Load Runtime Policy Config
 -> Load active profiles
 -> Verify package registry / lockfile
 -> Resolve packages/modules
 -> Security/governance checks
 -> Build trusted boot/preload graph
 -> Verify preload graph
 -> Preload approved items
 -> Runtime ready
```

Preloading before security checks is unsafe.

## What Can Be Preloaded

Safe candidates:

```text
verified packages
Governed IR
route maps
event maps
view rules
permission maps
vault schemas
trusted metadata
verified execution plans
static docs/indexes for AI
```

Risky — not to be preloaded:

```text
actor-specific authority
user sessions
private data
secrets
unverified packages
runtime-loaded native modules
external network results
```

## Preload Graph Declaration

```galerina
preload graph BootPreload {
  node RuntimePolicy
  node ViewRules
  node ProfileRules
  node AuthModule
  node ProfileRoutes
  node SessionVaultSchema
  node VerifiedPlanCache

  depends AuthModule on RuntimePolicy
  depends ProfileRoutes on AuthModule
  depends VerifiedPlanCache on ViewRules
}
```

The graph records: what is loaded, why it is loaded, what it depends on, what policy approved it, what version/hash it has, what capabilities it requests, whether it is safe to preload, when it must be invalidated.

## Governed Lookahead Preloading

While one block is executing, the runtime can prepare the next approved block:

```text
Block A executing
 -> Runtime predicts next block
 -> Authority Control checks preload is allowed
 -> preload only verified metadata/code
 -> Block A completes
 -> Scheduler starts Block B
```

### What Can Be Lookahead Preloaded

```text
verified IR
route metadata
permission metadata
view rules
module code
schemas
read-only config
compute plan
hardware queue reservation
```

### What Must NOT Be Lookahead Preloaded

```text
secrets
private data
actor authority
DB rows
files
network results
AI outputs
USB/device contents
```

Unless the previous block has already approved that access.

## Chain Declaration Example

```galerina
chain LoginChain {
  block ValidateCredentials
  block CreateSession preload after ValidateCredentials starts
  block SetCookie preload after CreateSession approved
}
```

Runtime meaning:

```text
The runtime may prepare CreateSession while ValidateCredentials runs,
but cannot write SessionVault until ValidateCredentials returns Ok.
```

## Core Principle

```text
Preload only verified structure, never live authority.
```

```text
Look ahead for speed.
Wait for authority before action.
```
