# CI/CD Integration and Provenance

## Definition

The Galerina platform integrates with modern secure CI/CD practices. The goal is
to eliminate long-lived credentials, produce verifiable provenance, ensure
artifact integrity, and support auditable deployments.

## Status

```text
Planned / Partially implemented.
The provenance and attestation workflow is the intended build security model.
Full pipeline integration is not yet available.
```

## Core Objectives

```text
Eliminate long-lived credentials
Produce verifiable SLSA provenance
Ensure artifact integrity
Support build-once deploy-many
Auditable deployment chain
```

## OIDC Workload Identity

CI/CD systems authenticate using OpenID Connect (OIDC) short-lived identity
tokens rather than static secrets.

Supported providers:

```text
GitHub Actions
GitLab CI
Google Cloud Build
CircleCI
```

## Build Pipeline Flow

```text
CI Pipeline
  → OIDC identity token
  → deterministic build
  → artifact signing
  → SLSA provenance generation
  → SBOM generation
  → attestation attachment
  → deployment authorisation
```

## Deterministic Builds

The build system must produce identical output from identical input.

Requirements:

```text
Locked dependency versions
No host-machine-state dependencies
Reproducible compile-time evaluation
Content-addressed output artifacts
Timestamp-independent where possible
```

## SLSA Provenance

The build system generates SLSA-compatible provenance metadata.

Provenance includes:

```text
Source repository
Commit SHA
Builder identity
Build parameters
Artifact digests
Dependency references
```

Example:

```json
{
  "builder": "galerina-build@v1",
  "source": "github.com/org/project",
  "commit": "abc123",
  "artifact": "sha256:...",
  "dependencies": [...]
}
```

## SBOM Generation

The build produces a Software Bill of Materials (SBOM) in SPDX or CycloneDX format.

The SBOM records:

```text
All direct dependencies
Transitive dependencies
Package versions
Dependency digests
License metadata
```

## Artifact Signing

Build outputs are signed using short-lived signing keys tied to the OIDC
identity.

Signing prevents:

```text
Artifact substitution
Untrusted build execution
Supply chain tampering
```

## Attestation Workflow

Attestations provide signed claims about artifacts.

Attestation types:

```text
Provenance attestation
SBOM attestation
Security scan attestation
Policy compliance attestation
Vulnerability scan attestation
```

All attestations are cryptographically signed and attached to deployment
artifacts.

## Deployment Policy Gates

Before deployment, the runtime verifies:

```text
Artifact signature validity
Provenance chain integrity
Required attestations present
Trusted builder identity
Policy compliance
Environment-specific approvals
```

```bash
galerina verify artifact.bundle
```

## Build-Once Deploy-Many Architecture

The same immutable artifact is promoted across environments:

```text
build → staging → preprod → production
```

No environment-specific recompilation occurs.

Environment-specific behaviour is configured through:

```text
Runtime configuration
Secret injection
Capability policies
Infrastructure bindings
```

Not through recompilation.

## Promotion Workflow

```bash
galerina build --release
galerina attest
galerina deploy --env staging
galerina verify staging
galerina promote staging production
```

Promotion references the existing artifact digest, not a rebuild.

## Immutable Artifacts

Build outputs are content-addressed and immutable.

```text
sha256:7f83b1657ff1fc53...
```

Any modification changes the artifact identity and invalidates signatures.

## Build Outputs

```text
/dist
  app.bundle             — compiled runtime artifact
  manifest.json          — dependency and build metadata
  provenance.json        — SLSA provenance
  sbom.spdx.json         — SBOM
  attestations/          — signed attestation files
```

## Security Objectives

This architecture reduces:

```text
Supply chain tampering
Secret leakage through build systems
Artifact substitution attacks
Untrusted build execution
Configuration drift between environments
```

## Recommended Error Scenarios

```text
Signature verification failure → deployment blocked
Provenance not present         → deployment blocked
Required attestation missing   → deployment blocked
Builder identity untrusted     → deployment blocked
Policy compliance failed       → deployment blocked
```
