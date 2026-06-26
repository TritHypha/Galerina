# Certified Package Registry

The Galerina Certified Package Registry is a governed package source where
packages are published, verified, signed, versioned, capability-declared and
policy-rated before use.

Core principle:

```text
Packages are not just dependencies.
Packages are governed authority requests.
```

## Pipeline

```text
Developer publishes package
  -> Certified Package Registry verifies it
  -> Project lockfile records it
  -> Package Resolver loads it
  -> Governance Checks validate it
  -> Governed IR links it
  -> Runtime executes approved parts only
```

## Package Metadata

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

## Certification Levels

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

## Lockfile

`galerina.lock.json` should record exact version, hash, signature, publisher,
source registry, capabilities, effects, certification level, dependency graph,
selected profile and approved runtime targets.

## Runtime Rule

```text
installed does not mean trusted
certified does not mean unrestricted
```

Certification is evidence for Package Resolver and Governance Checks. It is not
ambient authority.
