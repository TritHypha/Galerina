# Galerina Supply Chain Attestation and Package Governance

## Overview

Two closely related features protect the Galerina package ecosystem:

1. **Supply-chain attestation** — every resolved dependency is pinned by content
   hash; hash drift fails the build with `SPORE-SUPPLY-001`
2. **Package governance manifests** — every published package declares its
   effects, capabilities, resource requirements, secrets and diagnostic ranges
   before installation

Together, these turn dependency installation into a governed, auditable event
rather than a blind download.

---

## Part 1: Supply-Chain Attestation

### Why Hash Pinning

A package import is external authority entering the build. Content hashes
ensure that:

```text
name + version + source + resolved version + content hash + permissions
```

is the identity — not just `name + latest compatible version`.

Hash pinning prevents:
```text
registry substitution, tampered tarballs, compromised mirrors, unexpected
rebuild differences, mutable tags, dependency confusion, lockfile drift,
transitive dependency replacement, CI/local mismatch
```

### Lockfile Shape

```json
{
  "packages": {
    "galerina-http@1.4.2": {
      "source": "registry.galerina.dev",
      "integrity": "sha256-9b7a...",
      "signatures": [{ "issuer": "galerina-registry", "signature": "sigstore:..." }],
      "permissions": {
        "network.outbound": true,
        "file.write": false,
        "native": false,
        "unsafe": false
      }
    }
  }
}
```

### Build Behaviour

Production builds must run in locked mode:

```bash
galerina build --locked
```

```text
do not resolve new versions
do not rewrite the lockfile
fail on missing hash
fail on hash mismatch (SPORE-SUPPLY-001)
fail on unsigned package if policy requires signatures
fail on permission drift (SPORE-SUPPLY-002)
```

### Hash is Necessary but Not Sufficient

```text
content hash   = integrity (bytes did not change)
signatures     = identity (publisher is who we think)
provenance     = origin/build path
permissions    = authority
reports        = auditability
```

A hash tells you the bytes did not change. It does not prove the bytes are safe.

### Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-SUPPLY-001` | Dependency content hash mismatch |
| `SPORE-SUPPLY-002` | Dependency permission set changed since last lockfile update |

Example:

```text
SPORE-SUPPLY-001: dependency content hash mismatch

Import:      galerina-http@1.4.2
Expected:    sha256:9b7a...
Actual:      sha256:31fd...
Source:      registry.galerina.dev

Resolution:
  Build stopped. The dependency content changed without an approved lockfile update.
  Run `galerina package review galerina-http@1.4.2` and update the lockfile only after review.
```

---

## Part 2: Package Governance Manifests

### What a Governance Manifest Contains

```json
{
  "name": "@galerina/payments",
  "version": "1.4.0",
  "galerinaPackageVersion": "1",
  "exports": {
    "./charge": {
      "effects": ["network.external", "secret.read"],
      "capabilities": ["payment.charge"],
      "resources": ["PaymentProvider"],
      "diagnostics": "SPORE-PAYMENTS-1000..1199"
    },
    "./types": { "effects": [], "capabilities": [] }
  },
  "supplyChain": {
    "integrity": "sha256:...",
    "signature": "sigstore:...",
    "provenance": "..."
  }
}
```

### Install-Time Authority Review

```bash
galerina install @galerina/payments
```

Output:

```text
Package:     @galerina/payments@1.4.0

Requested effects:
  network.external
  secret.read

Requested capabilities:
  payment.charge
  payment.refund
  webhook.verify

Secrets:
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET

Supply chain:
  content hash verified
  publisher signature verified

Accept package authority? [y/N]
```

### Permission Diff on Update

If an update changes authority:

```text
SPORE-SUPPLY-002: dependency permission set changed

Package:    @galerina/payments@1.4.3
New effect: file.write

Resolution:
  Review required before lockfile update can be accepted.
```

### Diagnostic Code Ranges

Packages may reserve their own diagnostic range:

```text
SPORE-PAYMENTS-1000..1199
```

This avoids collision between packages and allows the LSP to route diagnostics
to package-specific documentation.

Suggested core ranges:

```text
SPORE-CORE-0000..0999      core language
SPORE-TYPE-1000..1999      type system
SPORE-EFFECT-2000..2999    effect checker
SPORE-SECURITY-3000..3999  security checker
SPORE-PACKAGE-4000..4999   package/supply-chain checker
```

### No Install-Time Execution

A Galerina-native module system prohibits executable install hooks:

```text
no preinstall
no install
no postinstall
no prepare scripts
no arbitrary shell execution
```

If code generation is needed, it must declare a sandboxed build step with
explicit capabilities and no network access by default.

---

## Part 3: Galerina-Native Module System (Long-Term)

npm is a reasonable bootstrap and development distribution channel. It is not
the final Galerina package trust model. The long-term module system will:

```text
Stage 1:  npm remains bootstrap distribution
Stage 2:  Galerina packages include governance manifests inside npm package
Stage 3:  galerina install reads governance manifests and validates lockfile
Stage 4:  optional Galerina-native registry mirrors packages by content hash
Stage 5:  production builds can use Galerina-native package store without npm
Stage 6:  npm becomes only a compatibility/bootstrap channel
```

The Galerina-native module system will be content-addressed:

```text
.galerina/store/sha256/ab/cd/...
galerina.lock.json
```

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Import syntax, dependency identity rules, governance manifest contract |
| `galerina-core-compiler` | Import resolution and hash checks before type checking/codegen |
| `galerina-core-config` | Dependency policy, production profile rules |
| `galerina-core-security` | Package permission model, unsafe/native policy |
| `galerina-core-reports` | Dependency graph reports, integrity reports, security reports |
| `galerina-core-cli` | Lockfile generation, verification, update, review commands |
| `galerina-devtools-project-graph` | Graph-level visibility for packages, reports and policies |

---

## CLI Commands

```bash
galerina package install @galerina/payments
galerina package verify
galerina package review @galerina/payments@1.4.2
galerina package update @galerina/payments --review
galerina package explain @galerina/payments
galerina package diff @galerina/payments@1.4.0 @galerina/payments@1.5.0
galerina package audit
galerina build --locked
```
