# Galerina — Native Module System

## Overview

Galerina packages are currently distributed through npm. This is appropriate for bootstrapping,
but it permanently inherits npm's security model:

```text
install-time script execution (postinstall attacks)
no governance metadata in package structure
mutable registry / package lifecycle risks
no capability declarations before installation
versioning chaos in transitive dependencies
weak supply-chain attestation
```

A **Galerina-native module system** replaces npm as the long-term package trust boundary.

**Design principle**: package installation is a governance event, not just a download.

---

## What Changes

### No Install-Time Execution

Install-time scripts are unconditionally forbidden:

```text
no preinstall, install, postinstall, prepare scripts
no arbitrary shell execution at install time
```

If a package needs code generation, it declares an explicit build step with defined capabilities,
sandboxed execution and no network access by default.

### Governance Manifests Are Required

Every published package must include a governance manifest. Packages without manifests cannot
be accepted as stable:

```json
{
    "name": "@galerina/payments",
    "version": "1.4.0",
    "galerinaPackageVersion": "1",
    "exports": {
        "./types": {
            "effects": [],
            "capabilities": []
        },
        "./charge": {
            "effects": ["network.external", "secret.read"],
            "capabilities": ["payment.charge"],
            "resources": ["PaymentProvider"],
            "diagnostics": "SPORE-PAYMENTS-1000..1199"
        },
        "./webhook": {
            "effects": ["secret.read"],
            "capabilities": ["webhook.verify"]
        }
    },
    "supplyChain": {
        "integrity": "sha256:...",
        "signature": "sigstore:...",
        "provenance": "..."
    }
}
```

### Export-Level Authority

Package-level authority summaries are too coarse. Export-level authority shows that importing
`./types` carries no effects, while `./charge` requires `network.external` and `secret.read`.

This prevents importing type-only modules from triggering capability review.

---

## Install-Time Authority Review

```bash
galerina install @galerina/payments
```

```text
Package: @galerina/payments@1.4.0

Requested effects:
  network.external
  secret.read

Requested capabilities:
  payment.charge, payment.refund, webhook.verify

Resources:
  outbound HTTPS to api.stripe.com

Secrets:
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

Supply chain:
  content hash verified
  publisher signature verified
  provenance available

Accept package authority? [y/N]
```

Acceptance is recorded in the lockfile.

---

## Lockfile

The Galerina lockfile records accepted authority alongside content integrity:

```json
{
    "packages": {
        "@galerina/payments@1.4.0": {
            "integrity": "sha256:...",
            "manifestHash": "sha256:...",
            "acceptedEffects": ["network.external", "secret.read"],
            "acceptedCapabilities": ["payment.charge"],
            "acceptedResources": ["PaymentProvider"],
            "review": {
                "status": "accepted",
                "profile": "production"
            }
        }
    }
}
```

Production builds run in locked mode:

```bash
galerina build --locked
```

Locked mode: no new resolution, no lockfile rewrite, no authority changes, no hash drift.

---

## Package Store

Avoid `node_modules`-style duplication. Use a content-addressed store:

```text
.galerina/store/sha256/ab/cd/...
galerina.lock.json
```

Properties:

```text
content-addressed — identified by hash
immutable after publishing
deduplicated across projects
no package can mutate another
imports resolved by identity + hash
```

---

## Versioning

Development may use version ranges; production builds must use exact locked artefacts.

An update shows the governance diff before acceptance:

```text
@galerina/payments updated 1.4.0 -> 1.5.0

Added:
  payment.refund
  network.external api.refunds.stripe.com

Review required.
```

Authority-widening updates always require review.

---

## Registry Policy

The registry enforces:

```text
manifest schema validation
diagnostic range allocation
signature verification
immutability of published artefacts
content-addressed storage
publisher identity verification
known vulnerability metadata
governance manifest diffing
```

### Private Registries

Enterprise/private registries are fully supported:

```text
internal packages
audited partner packages
offline/air-gapped builds
regulated deployment environments
```

All registries — public, private, local path, vendor — use the same manifest/attestation rules.

---

## Supply-Chain Attestation

```text
content hashes (per-file + package)
manifest hashes
publisher signatures
registry signatures
provenance metadata (SLSA-style)
dependency graph hashes
reproducible build metadata where available
```

If downloaded package does not match lockfile hash → `SPORE-SUPPLY-001` → build fails.

---

## Migration from npm

npm is not removed immediately. Staged migration:

| Stage | State |
|---|---|
| 1 | npm remains bootstrap distribution |
| 2 | Galerina packages include governance manifests inside npm package |
| 3 | `galerina install` reads governance manifests and lockfile |
| 4 | Optional Galerina-native registry mirrors packages by content hash |
| 5 | Production builds use Galerina-native package store without npm |
| 6 | npm becomes only a compatibility/bootstrap channel |

---

## Build Modes

| Mode | Behavior |
|---|---|
| development | Can resolve packages; no install scripts |
| ci | Locked or review-required |
| production | Locked, hash-verified, no floating versions, no unreviewed authority |
| offline | Content-addressed local store only |

---

## CLI Commands

```bash
galerina package init
galerina package publish
galerina package verify
galerina install @galerina/payments
galerina update @galerina/payments --review
galerina package diff @galerina/payments@1.4.0 @galerina/payments@1.5.0
galerina package audit
galerina package vendor
galerina package explain @galerina/payments
galerina build --locked
```

`galerina package explain @galerina/payments` output:

```text
Exports:
  ./types:   no effects
  ./charge:  network.external, secret.read, payment.charge
  ./webhook: secret.read, webhook.verify
```

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-MODULE-001` | Package governance manifest missing |
| `SPORE-MODULE-002` | Package install scripts are forbidden |
| `SPORE-MODULE-003` | Package authority not accepted |
| `SPORE-MODULE-004` | Package manifest hash changed |
| `SPORE-MODULE-005` | Package requested undeclared capability |
| `SPORE-MODULE-006` | Package used effect not declared in manifest |
| `SPORE-MODULE-007` | Package signature verification failed |
| `SPORE-MODULE-008` | Package version is floating in production profile |
| `SPORE-MODULE-009` | Transitive dependency authority changed |
| `SPORE-MODULE-010` | Package export requires ungranted capability |

---

## Relationship to Other Features

| Feature | Connection |
|---|---|
| Supply-chain governance | Module system is the enforcement layer for attestation |
| Cross-package capability warnings | Enabled by export-level manifests in module system |
| Governance diff CI | Package updates surfaced as authority diffs in CI |
| Native runtime | Node/npm-free production builds require both module system + native runtime |
| Intent graph | Package exports feed the intent graph symbol index |
| Certified package registry | The Galerina registry enforces module system governance rules |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core-cli` | `galerina install`, `galerina package` commands, install-time authority review |
| `galerina-core-config` | Lockfile format, profile-specific build modes |
| `galerina-core-compiler` | Import-time capability resolution from package manifests |
| `galerina-core-reports` | Dependency graph reports, authority diff reports |
| `galerina-core-security` | Supply-chain attestation, hash verification |
| `galerina-certified-registry` | Registry enforcement, manifest validation, SBOM |
