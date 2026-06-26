# Dependencies

This document tracks dependency policy for Galerina.

## Current Prototype

The current prototype is a Node.js package with no declared runtime dependencies in `package.json`.

## Policy

Future dependencies should be recorded with:

```text
name
version range
purpose
licence
runtime or development use
security notes
replacement risk
```

Dependencies should not weaken Galerina's security, source-map, diagnostic or no-compiled-secrets requirements.

## Package Use Registry

Third-party package approval, package-level permissions, lock hashes, loading
modes and explicit file-level `use` statements are proposed in
`docs/package-use-registry.md`.

Recommended dependency rule:

```text
Import local files.
Use approved packages.
Register packages in boot.spore.
Report package permissions, hashes, usage and loading behaviour.
```
