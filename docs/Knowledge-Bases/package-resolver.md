# Package Resolver

## Purpose

Galerina should use a governed Package Resolver, not a PHP-style autoloader.

The Package Resolver is the governed system that finds, verifies, loads and
links Galerina packages or modules before execution.

## Core Principle

```text
Imports are not trust.
Packages must be resolved, verified and governed before use.
```

Galerina must not blindly load files because code references them.

## Resolver Responsibilities

The Package Resolver should:

1. find requested packages and modules
2. check package identity
3. check version and lockfile state
4. check hash or signature
5. check source registry policy
6. check allowed capabilities
7. check declared effects
8. check licence and project policy
9. check trusted status
10. check dependency graph and conflicts
11. load only approved modules
12. link approved modules into Governed IR
13. record audit and provenance

## Pipeline Position

Package resolution belongs before execution during boot, compile or planning.

The Certified Package Registry sits before the resolver and provides package
identity, publisher, signature, certification level, risk rating and policy
evidence.

```text
Certified Package Registry
  -> Project lockfile
  -> Package Resolver
  -> Parser
  -> Semantic Checks
  -> Governance Checks
  -> Governed IR
  -> Verified Execution Cache
  -> Runtime Execution
```

Internal resolver pipeline:

```text
boot/main
  -> Package Resolver
  -> Parser
  -> Semantic Checks
  -> Governance Checks
  -> Governed IR
  -> Verified Execution Cache
  -> Runtime Execution
```

Runtime dynamic loading, where allowed at all, must still go through Authority
Control and resolver policy.

## No Silent Loading

```text
No silent module loading.
No hidden authority through imports.
```

Importing or using a package must not grant capabilities, effects, filesystem
access, network access, shell access, database access or secret access.

## Syntax Direction

Simple source references may look like:

```galerina
use package Auth version "1.2.0"
use package Payments version "2.0.1"
use module Profiles
```

The preferred governed form is explicit:

```galerina
package use Auth {
  version "1.2.0"
  hash "sha256:..."
  allow capabilities [
    db.read,
    crypto.password.verify
  ]
}
```

## Resolver Policy

Example policy:

```galerina
resolver policy {
  registry allow "galerina-certified"
  registry deny "unknown"

  require lockfile
  require signature
  deny dynamic package load
}
```

Resolver policy should be profile-aware. Development may allow local packages
with explicit warnings. Production should prefer lockfile, signatures, hashes
and declared registries.

## Resolver Checks

The resolver should check:

- package name
- module name
- version
- lockfile entry
- hash
- signature
- source registry
- declared capabilities
- declared effects
- licence policy
- package trust status
- dependency graph
- transitive dependency permissions
- conflicts
- profile compatibility
- target compatibility
- provenance report output

## Runtime Reports

Resolver output should feed:

```text
package-resolution-report.json
package-provenance-report.json
package-permission-report.json
dependency-graph-report.json
governed-ir-package-map.json
```

Reports should identify what was requested, what was approved, what was denied,
which capabilities and effects were declared, which package version was loaded
and which hashes or signatures were verified.

## Dynamic Loading

Dynamic package or module loading should be denied by default in production.

If a profile allows dynamic loading, it must be:

- declared
- capability-gated
- effect-checked
- signature or hash verified
- lockfile or allowlist constrained
- audited
- source-mapped where possible
- denied in hardened mode unless explicitly reviewed

## Final Rule

```text
The Package Resolver loads only packages that have been resolved, verified,
permissioned, effect-checked and linked into Governed IR.
```
