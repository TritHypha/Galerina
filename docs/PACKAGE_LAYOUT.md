# Package Layout

## Purpose

This document describes the proposed split between normal app/vendor packages
and reusable Galerina packages.

The current beta workspace has moved Galerina packages under `packages-galerina/`. The
`packages/` directory is reserved for normal app/vendor package space.

## Proposed App Layout

```text
my-galerina-app/
|-- package.json
|-- package-galerina.json
|-- galerina.lock.json
|-- boot.spore
|-- main.spore
|-- packages/
|   `-- normal app/vendor packages
`-- packages-galerina/
    |-- .git
    |-- galerina-core/
    |-- galerina-core-compiler/
    |-- galerina-core-runtime/
    |-- galerina-core-security/
    `-- galerina-framework-example-app/
```

## Package Responsibilities

`package.json` remains the host ecosystem manifest. In a Node-hosted app, it
should describe normal npm dependencies, scripts and app tooling.

It must not become the Galerina package graph. Do not put Galerina package selection,
profiles, target selection, production package overrides or Galerina lock metadata in
`package.json`. Those fields belong in `package-galerina.json`, `galerina.lock.json` or
Galerina runtime/config files once their schemas exist.

Allowed `package.json` responsibilities during the beta:

```text
host scripts
JavaScript/TypeScript prototype tooling
normal npm dependencies for host adapters
test runners for the current JS-hosted scaffolds
generated JavaScript/TypeScript interop packaging
```

Disallowed `package.json` responsibilities:

```text
Galerina package graph resolution
Galerina runtime profile selection
Galerina production package overrides
Galerina compiler target policy
Galerina lockfile metadata
```

`package-galerina.json` should become the Galerina package manifest. It should describe Galerina
language, runtime, compiler, security and app-kernel dependencies. It should
support explicit profiles such as:

```text
runtime
development
staging
low_latency
benchmark
```

Finance, electrical and OT profiles are archived post-v2 planning and must not
be active v1 package profiles.

`galerina.lock.json` should lock Galerina package versions, source refs, checksums, selected
profiles and dependency graph metadata. It should be deterministic and safe to
commit when it contains no secrets.

When packages come from a Certified Package Registry, the lockfile should also
record publisher, source registry, signature, capabilities, effects,
certification level, selected profile and approved runtime targets.

`packages/` should be for normal app/vendor packages used by the host
ecosystem.

`packages-galerina/` is for Galerina packages. It may later be a Git submodule or
standalone nested repository, but that must be intentional. In this beta repo it
also contains `galerina-framework-example-app/`, a clearly named example/template app package.

## Production Resolution Rule

Production installs must not fetch every Galerina package by default.

The resolver should install only packages required by the selected profile:

```text
runtime       minimal runtime/compiler/app-kernel requirements
development   graph, diagnostics, generators and test helpers
benchmark     benchmark packages, never implicit in production
```

Project-type installer presets are defined in `docs/PROFILE_INSTALLERS.md`.
Those presets may provide friendly commands for web apps, servers, agents and
systems services, but they must all use the same Galerina package resolver,
profile checker and lockfile rules.

The Galerina package resolver is governed, not an autoloader. Imports and package
references do not create trust. The resolver must verify package identity,
version, lockfile, hash/signature, registry, capabilities, effects, licence,
trusted status, dependency graph and conflicts before a package is linked into
Governed IR.

The Certified Package Registry sits before the resolver. It verifies, signs,
versions, capability-declares and policy-rates packages before projects lock and
resolve them. Certified does not mean unrestricted; project permissions still
decide what an installed package may do.

Development and staging packages should be excluded unless explicitly selected.

Production boot/profile defaults must disable development-only and benchmark
packages. This is a rule, not only a resolver optimisation.

Default-disabled production package families include:

```text
galerina-tools-benchmark
galerina-devtools-*
```

If a production build includes a default-disabled package, `boot.spore` or
`package-galerina.json` must declare an explicit production package override with a
reason, and preferably an expiry. The override must be reported. Without the
override, startup/build validation must fail.

Example object-shaped policy:

```json
{
  "production": {
    "packageOverrides": [
      {
        "path": "packages-galerina/galerina-tools-benchmark",
        "reason": "One-off production hardware validation before launch.",
        "expires": "2026-06-01"
      }
    ]
  }
}
```

## Migration Rule

Do not add root `package-galerina.json` or `galerina.lock.json` as decorative files. Add
them only when their schemas and resolver behaviour are documented and tested.

Current beta work may add new experimental Galerina packages under `packages-galerina/` as
long as documentation states their status clearly.
