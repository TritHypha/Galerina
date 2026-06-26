# @galerina/registry — Certified Package Registry

The Galerina certified package registry is the canonical source of governance-reviewed,
cryptographically-signed packages for the Galerina platform.

> **⚠️ Scaffold (Phase 28).** The package manifests here are **declarative stubs pending full
> resolver wiring** (see Status). The guarantees described below are the **intended design** — they
> are NOT yet actively enforced or signed, so do not treat them as live controls.

## Concept

Every package in this registry has been reviewed against the Galerina governance rules:

- All declared capabilities have been audited and approved.
- Each package manifest includes a `sha256:` content-addressable hash.
- Packages are signed by the Galerina governance authority.
- Install scripts are prohibited (SPORE-PKG-004).
- Untrusted registries are rejected (SPORE-PKG-002).

## Structure

```
packages/
  @galerina/
    auth/
      package.galerina.yaml     # certified auth package manifest
    healthcare/
      package.galerina.yaml     # certified healthcare package manifest
```

## Adding a Package

1. Create a `package.galerina.yaml` manifest under `packages/<scope>/<name>/`.
2. Declare capabilities, effects, and targets explicitly.
3. Run `galerina package hash` to generate the content hash.
4. Submit a pull request for governance review.
5. Once approved, the governance authority signs the manifest.

## Diagnostic Codes

| Code          | Meaning                                              |
|---------------|------------------------------------------------------|
| SPORE-PKG-001   | Package declares new capabilities not in lockfile    |
| SPORE-PKG-002   | Package from unregistered or unverified registry     |
| SPORE-PKG-003   | Package has no content-addressable hash              |
| SPORE-PKG-004   | Package declares an install script (denied)          |
| SPORE-PKG-005   | Package has no cryptographic signature               |

## Status

Phase 28 scaffold. Package manifests are declarative stubs pending full resolver wiring.
