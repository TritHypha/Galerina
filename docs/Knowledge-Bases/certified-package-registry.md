# Certified Package Registry

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Phase 17+

## Purpose

Galerina should not model package management as "Composer for Galerina".

The Galerina Certified Package Registry is a governed package source where
packages are published, verified, signed, versioned, capability-declared and
policy-rated before use.

## Core Principle

```text
Packages are not just dependencies.
Packages are governed authority requests.
```

Normal package systems mostly ask:

```text
Can I download this dependency?
```

Galerina should also ask:

```text
Should this dependency be allowed authority in this runtime context?
```

## Registry Questions

The registry should provide evidence for:

- what package this is
- who published it
- what version is approved
- what the package can do
- what capabilities it requests
- what effects it requires
- what runtime targets it supports
- what audit requirements it declares
- what risk rating applies
- what security review status applies
- whether it is safe for the selected runtime context

## Pipeline Position

The certified registry sits before the Package Resolver.

```text
Developer publishes package
  -> Certified Package Registry verifies it
  -> Project lockfile records it
  -> Package Resolver loads it
  -> Governance Checks validate it
  -> Governed IR links it
  -> Runtime executes approved parts only
```

Short form:

```text
Certified Package Registry
  -> Package Resolver
  -> Parser / IR / Governance Checks
  -> Runtime
```

## Package Declarations

Each package should declare:

- name
- version
- publisher
- license
- hash/signature
- dependencies
- capabilities requested
- effects used
- runtime targets
- audit requirements
- risk rating
- security review status
- certification level

Example:

```galerina
package Auth.Standard {
  version "1.2.0"
  license "MIT"
  publisher "galerina-certified"

  capabilities {
    allow crypto.password.verify
    allow vault.write SessionVault
  }

  effects {
    uses db.read
    uses audit.write
  }

  targets {
    cpu
    wasm
  }

  audit required
}
```

## Certification Levels

Certification levels may include:

```text
uncertified
community
verified
certified
enterprise
regulated
```

Example policy:

```galerina
registry policy {
  allow level certified
  allow level verified

  deny level uncertified for production
  require signature
  require lockfile
}
```

## Lockfile Role

Galerina should use `galerina.lock.json` or an equivalent lockfile to prevent
dependency drift.

The lockfile should record:

- exact version
- hash
- signature
- publisher
- source registry
- capabilities
- effects
- certification level
- dependency graph
- selected profile
- approved runtime targets

## Runtime Rule

Even if a package is installed, it cannot do anything unless project policy and
runtime permission allow it.

```text
installed does not mean trusted
certified does not mean unrestricted
```

Certification is evidence for the resolver and governance checks. It is not
ambient authority.

## Registry Reports

Registry and resolver output should feed:

```text
package-certification-report.json
package-provenance-report.json
package-risk-report.json
package-permission-report.json
dependency-graph-report.json
galerina-lock-report.json
```

Reports should be machine-readable, source-linked and safe for AI/reviewer use.

## Final Rule

```text
Packages enter Galerina as declared, verified and policy-rated authority requests,
not as passive downloaded code.
```
