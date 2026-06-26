# Galerina Enterprise Objectives

## Purpose

This document defines the Galerina free/open versus enterprise split.

The default rule is:

```text
Enterprise packages stay locked down and must not be built, activated, shipped
or treated as part of the active build graph until the project owner explicitly
says to unlock them.
```

For this repository, "unlock" means a direct instruction from the project owner
to start planning, implementing, building or integrating a named enterprise
package or feature area.

## Product Strategy

Galerina should keep the basic developer platform free/open and reserve advanced
governance, compliance, automation and managed-control layers for enterprise.

The commercial goal is:

```text
Free Galerina gets adoption.
Enterprise Galerina sells governance, compliance, deployment safety and
operational control.
```

Do not make whole technical areas enterprise-only when a basic version can help
individual developers and small teams adopt Galerina.

## Locked-Down Enterprise Rule

Enterprise-only packages and features must remain documentation/planning items
unless explicitly unlocked.

Enterprise-only package **names** live in this document only — there is intentionally
**no `packages-galerina-enterprise/` scaffold directory** in the tree. The reserved names
(see "Enterprise-Only Scope" and the per-area "Reserved package names") are roadmap
placeholders, not on-disk packages.

An explicit owner unlock is what first creates a named enterprise package folder. When
unlocked, an enterprise package must live in its own clearly-marked location and must not
be placed under the active `packages-galerina/` collection until the owner explicitly moves
it into the active workspace.

AI coding tools must not:

- create enterprise package source code
- wire enterprise packages into builds
- add enterprise packages to production manifests
- add enterprise packages to default workspace profiles
- make free/open packages depend on enterprise packages
- implement enterprise-only runtime behavior under a free/open package name
- treat enterprise package names as active v1 build targets

AI coding tools may:

- document enterprise objectives
- document package names as reserved future enterprise names
- add TODOs or roadmap entries that clearly mark enterprise work as locked
- preserve basic/free equivalents where they are already in scope

## Recommended Split

| Feature area | Free/open | Enterprise-only |
| --- | --- | --- |
| Compiler core | Yes | No |
| Standard library | Yes | No |
| Local web app runtime | Yes | No |
| Local agent runtime | Yes | No |
| Small-team local agents | Yes | No |
| Basic deployment checks | Yes | No |
| Basic Docker output | Yes | No |
| Basic Kubernetes output | Maybe | No |
| Advanced Kubernetes/security policy packs | No | Yes |
| Enterprise agent orchestration | No | Yes |
| AI agent governance console | No | Yes |
| SSO/SAML | No | Yes |
| Advanced audit reports | No | Yes |
| Compliance reports | No | Yes |
| Certified package registry | No | Yes |
| Managed Galerina Cloud | No | Yes |
| Enterprise support | No | Yes |

## Free/Open Scope

Keep these free/open:

```text
galerina-core
galerina-std
galerina-compiler
galerina-runtime
galerina-security-basic
galerina-reports-basic
galerina-web
galerina-web-render
galerina-agent-local
galerina-deploy-basic
galerina-examples
galerina-docs
```

Free/open Galerina should support:

- individual developers
- small teams
- local development
- learning
- basic app building
- basic local agents
- basic security awareness
- basic compiler, security, dependency, deployment and agent-run reports
- basic Docker generation
- basic API and webhook examples

Do not make these enterprise-only:

```text
compiler core
standard library
basic local runtime
basic local agent runtime
basic docs
basic examples
basic security concepts
basic deployment reports
basic Docker generation
basic API/webhook examples
```

## Enterprise-Only Scope

Reserve these package names for enterprise-only work:

```text
galerina-agent-orchestrator-enterprise
galerina-agent-governance-enterprise
galerina-kubernetes-enterprise
galerina-security-policy-packs-enterprise
galerina-deploy-enterprise
galerina-audit-enterprise
galerina-compliance-enterprise
galerina-identity-enterprise
galerina-registry-enterprise
galerina-cloud-enterprise
galerina-support-enterprise
```

Make enterprise-only anything that involves:

```text
teams
governance
compliance
SSO
SAML
OIDC enterprise identity providers
SCIM user provisioning
audit evidence
production hardening
multi-cloud automation
central dashboards
certified packages
managed services
support contracts
```

## Enterprise Feature Areas

### Enterprise Agent Orchestration

Free/local scope:

```text
local agents
single-user workflows
small-team/local agent runs
basic agent permissions
basic local audit log
```

Enterprise-only scope:

```text
multi-team agent orchestration
central agent runner
agent scheduling
agent approval chains
role-based agent permissions
agent-to-agent visibility controls
agent activity dashboard
agent risk scoring
enterprise audit trail
```

Reserved package names:

```text
galerina-agent-enterprise
galerina-agent-orchestrator-enterprise
galerina-agent-governance-enterprise
```

### Kubernetes And Security Policy Packs

Free/basic scope may include:

```text
basic Deployment
basic Service
basic health checks
basic container config
```

Enterprise-only scope:

```text
hardened Kubernetes policy packs
NetworkPolicy generation
RBAC minimisation
Pod Security restricted profile checks
admission policy templates
secret-store integration templates
image signing checks
SBOM/provenance enforcement
multi-environment overlays
production readiness gates
rollback automation
```

Reserved package names:

```text
galerina-kubernetes-enterprise
galerina-security-policy-packs-enterprise
galerina-deploy-enterprise
```

### AI Agent Governance Console

Free/local scope:

```text
local JSON reports
CLI output
basic logs
```

Enterprise-only scope:

```text
web dashboard
team permissions
agent approval queues
agent action history
risk alerts
policy violation tracking
human approval workflow
compliance evidence export
```

Reserved package names:

```text
galerina-governance-console-enterprise
galerina-agent-dashboard-enterprise
```

### Identity And SSO

Free/local scope:

```text
local user config
single-user mode
basic local auth if needed
```

Enterprise-only scope:

```text
SSO
SAML
OIDC enterprise identity providers
SCIM user provisioning
role mapping
organisation policies
team permissions
```

Reserved package name:

```text
galerina-identity-enterprise
```

### Advanced Audit Reports

Free/basic scope:

```text
basic compiler report
basic security report
basic dependency report
basic deployment report
basic agent run log
```

Enterprise-only scope:

```text
signed audit reports
tamper-evident audit logs
cross-project audit dashboard
exportable evidence packs
long-term audit retention
policy exception reports
board/client-ready reports
```

Reserved package names:

```text
galerina-audit-enterprise
galerina-evidence-enterprise
```

### Compliance Reports

Free/basic scope:

```text
basic security warnings
basic best-practice checklist
```

Enterprise-only scope:

```text
ISO 27001 evidence packs
SOC 2 evidence packs
GDPR data-flow reports
HIPAA-style controls if applicable
PCI-style deployment checks if applicable
NIST/CIS style mapping
enterprise risk reports
```

Reserved package name:

```text
galerina-compliance-enterprise
```

### Certified Package Registry

Free/basic scope:

```text
public package registry
community packages
basic package lock
basic dependency permission report
```

Enterprise-only scope:

```text
certified package registry
private package registry
approved package lists
package signing
dependency approval workflows
security-scored packages
internal package mirrors
supply-chain reports
```

Reserved package names:

```text
galerina-registry-enterprise
galerina-certified-packages-enterprise
```

### Managed Galerina Cloud

Free/local scope:

```text
local Galerina CLI
local runtime
local agents
local reports
```

Paid managed scope:

```text
hosted agent orchestration
hosted project analysis
hosted deployment checks
hosted compliance dashboard
managed registry
team management
billing
SAML/SSO
support
```

Product name:

```text
Galerina Cloud
```

### Enterprise Support

Enterprise support is paid and may include:

```text
SLA
priority fixes
private support
architecture review
security review
deployment review
custom policy packs
training
consulting
```

## Unlock Process

Before any enterprise package or feature is built, the project owner must
explicitly unlock it by name.

An unlock instruction should identify:

- the package or feature area being unlocked
- whether the work is planning-only, prototype-only or implementation-ready
- whether the package may be added to workspace manifests or build profiles
- which docs must be updated with the new enterprise boundary

Until that instruction exists, enterprise packages remain reserved names and
locked roadmap items only.
