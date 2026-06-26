# Galerina Package Manifest Specification

## Status

```text
Package manifest loading: specified - implementation Phase 8+
Schema identifier:         spore.package.manifest.v1
```

This document defines `galerina-package.json`, the governed package manifest that
declares package authority, effects, capabilities, boundaries, exports, and
signature evidence.

---

## Rules at a Glance

- Packages are governed authority requests, not passive code bundles.
- Every effect used by a package must be declared in its manifest.
- Transitive effects from dependencies must be visible to the installer.
- Package installs fail closed on signature, hash, manifest, or authority errors.
- Exports must declare the effects callers inherit.
- Production profiles must reject floating or unsigned packages unless policy
  explicitly allows them.

---

## Why Packages Declare Capabilities

In Galerina, packages are governed authority requests. A package that uses
`database.write` must declare it so the installer can show:

```text
This package requests database.write authority. Allow?
```

The manifest lets the compiler, installer, registry, and runtime verify that
package code does not gain hidden effects or capabilities.

## `galerina-package.json` Format

```json
{
  "name": "galerina-db-postgres",
  "version": "1.0.0",
  "schemaVersion": "spore.package.manifest.v1",
  "effects": {
    "declares": ["database.read", "database.write"],
    "transitive": []
  },
  "capabilities": ["database.postgres"],
  "boundaries": ["network.internal"],
  "exports": [
    { "flow": "PostgresDB.query", "effects": ["database.read"] },
    { "flow": "PostgresDB.insert", "effects": ["database.write"] }
  ],
  "governance": {
    "requiresAudit": false,
    "allowedProfiles": ["development", "production"]
  },
  "signature": {
    "publisher": "galerina-certified",
    "hash": "sha256:..."
  }
}
```

## Field Semantics

| Field | Meaning |
|---|---|
| `name` | Package name following `galerina-package-naming.md`. |
| `version` | Exact package version. |
| `schemaVersion` | Must be `spore.package.manifest.v1`. |
| `effects.declares` | Direct effects used by the package. |
| `effects.transitive` | Effects inherited from dependencies. |
| `capabilities` | Named runtime capabilities requested by the package. |
| `boundaries` | Boundary categories the package crosses. |
| `exports` | Public flows/functions and the effects they require. |
| `governance.requiresAudit` | Whether package operations require audit by default. |
| `governance.allowedProfiles` | Deployment profiles where the package may run. |
| `signature` | Publisher and content hash evidence. |

## Effect Declaration Rules

- Every effect the package uses must be listed in `effects.declares`.
- Transitive effects from package dependencies are listed in
  `effects.transitive`.
- Every exported flow lists the effects callers inherit.
- The installer rejects packages whose observed effects exceed the manifest.
- The compiler rejects imports that would introduce undeclared or unaccepted
  capability requirements.

## SPORE-MODULE Diagnostics in Context

| Code | Install or resolution condition |
|---|---|
| `SPORE-MODULE-001` | Package governance manifest is missing. |
| `SPORE-MODULE-002` | Package contains install scripts or forbidden lifecycle hooks. |
| `SPORE-MODULE-003` | User or profile rejects requested package authority. |
| `SPORE-MODULE-004` | Package manifest hash differs from registry metadata. |
| `SPORE-MODULE-005` | Package requests a capability not declared or not known. |
| `SPORE-MODULE-006` | Package source uses an effect not declared in the manifest. |
| `SPORE-MODULE-007` | Package signature verification fails. |
| `SPORE-MODULE-008` | Package version is floating in a production profile. |
| `SPORE-MODULE-009` | Transitive dependency authority changed since approval. |
| `SPORE-MODULE-010` | Imported package export requires ungranted capability. |

`compiler-diagnostics.md` owns the canonical diagnostic index.

## Package Install Governance

Install sequence:

1. Verify package signature. On failure, emit `SPORE-MODULE-007`.
2. Check manifest hash against registry metadata. On mismatch, emit
   `SPORE-MODULE-004`.
3. Compare declared effects with observed effects in source. On mismatch, emit
   `SPORE-MODULE-006`.
4. Check no install scripts or forbidden lifecycle hooks exist. On violation,
   emit `SPORE-MODULE-002`.
5. Present requested authority to the user or policy engine.
6. Accept authority and lock it, or reject with `SPORE-MODULE-003`.

Installed does not mean trusted. Certified does not mean unrestricted. Runtime
policy still decides whether a package export may execute in a profile.

## Compiler Status

```text
Package manifest loading: specified - implementation Phase 8+
Registry integration:       specified - implementation Phase 8+
Import-time enforcement:    specified - implementation Phase 8+
```

## See Also

- `docs/Knowledge-Bases/certified-package-registry.md`
- `docs/Knowledge-Bases/galerina-package-naming.md`
- `docs/Knowledge-Bases/compiler-diagnostics.md`
- `docs/Knowledge-Bases/galerina-core-compiler-manifest-generation-pass-14.md`
- `docs/Knowledge-Bases/galerina-core-manifest-generation-v02.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
