# Package Resolver

Galerina should use a governed Package Resolver, not a PHP-style autoloader.

Definition:

```text
The Package Resolver is the governed system that finds, verifies, loads and
links Galerina packages or modules before execution.
```

## Core Rule

```text
Imports are not trust.
Packages must be resolved, verified and governed before use.
```

Galerina must not silently load files just because code references them.

## Responsibilities

The resolver should:

- find requested packages and modules
- check package identity
- check version and lockfile state
- check hash or signature
- check source registry policy
- check allowed capabilities
- check declared effects
- check licence and project policy
- check trusted status
- check dependency graph and conflicts
- load only approved modules
- link approved modules into Governed IR
- record audit and provenance

## Pipeline

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

Runtime dynamic loading, where allowed, must still go through Authority Control.

## Syntax Direction

Simple form:

```galerina
use package Auth version "1.2.0"
use module Profiles
```

Governed form:

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

Resolver policy:

```galerina
resolver policy {
  registry allow "galerina-certified"
  registry deny "unknown"

  require lockfile
  require signature
  deny dynamic package load
}
```

## Reports

Resolver output should feed package resolution, provenance, permission,
dependency graph and Governed IR package-map reports.

## Final Rule

```text
No silent module loading.
No hidden authority through imports.
```
