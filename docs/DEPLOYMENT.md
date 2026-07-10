# Deployment

## Summary

Galerina deployment should be predictable, typed, checked, reported and automated.

The deployment goal is:

```text
fewer failed deployments
fewer missing environment variables
fewer unsafe configs
fewer manual DevOps mistakes
faster movement from code to running app
```

Deployment auto-configuration, target detection, deployment gates and runtime
capability profiles are documented in `DEPLOYMENT_AUTOCONFIG.md`.

## Environments

| Environment | Purpose |
| --- | --- |
| Local | Developer machine only; not production truth |
| Staging | Production-like validation before release |
| Production | Live app, final target detection and readiness gating |

## Required Environment Variables

See `.env.example`.

Secret values must not be compiled into app output, committed to Git, written to
deployment reports or included in AI-readable deployment context.

Deployment reports may include secret names and availability metadata:

```json
{
  "requiredSecrets": [
    "PAYMENT_API_KEY",
    "WEBHOOK_SECRET",
    "DATABASE_URL"
  ],
  "includedSecretValues": false
}
```

## Git Boundary

Git should contain portable deployment intent:

```text
boot.fungi
main.fungi
galerina.deploy.fungi
galerina.lock.json
galerina.security-policy.fungi
galerina.memory-policy.fungi
galerina.compute-policy.fungi
```

Git should not contain local/runtime machine facts:

```text
.env
.env.*
.galerina/cache/
.galerina/runtime/
.galerina/local/
.galerina/machine-profile.json
.galerina/runtime-profile.json
.galerina/deploy-secrets.json
*.secret.json
```

## Build And Deploy Flow

Recommended production command flow:

```bash
galerina check --profile production
galerina test --profile production
galerina build --profile production --target auto
galerina deploy-check --profile production
galerina generate deploy --target docker
galerina deploy --profile production
galerina verify-deploy --profile production
```

For Git-based platforms, this may be wrapped as:

```bash
galerina deploy-pipeline --profile production
```

## Deployment Gates

Production deploys should require:

```text
compiler check passed
tests passed
security report passed
dependency report passed
secret report passed
memory report passed
deployment report passed
health endpoint declared
readiness endpoint declared
crash policy declared
smoke tests passed
```

Production deploys should block on:

```text
hardcoded secret detected
missing required secret
unsigned dependency where signing is required
unknown package permission
debug mode enabled
dev package included
unsafe network rule
missing health endpoint
missing crash policy
target mismatch
failed smoke test
```

## Runtime Configuration

Production must detect production capability at first boot rather than inheriting
developer-machine assumptions.

Runtime-generated files such as capability profiles, tuning profiles and
deploy-check output belong under `.galerina/runtime/` or another untracked runtime
location. They must contain metadata only and must not include secret values.

## Health, Readiness And Rollback

Galerina should distinguish:

| Check | Meaning |
| --- | --- |
| Health | Process is alive |
| Readiness | App can safely receive traffic |
| Smoke test | Deployed app actually works |
| Stability watch | App keeps running after release |

Traffic should be enabled only after readiness and required smoke tests pass.

Every deployment should emit rollback metadata that records the previous
deployment, artifact hash, migration compatibility and rollback safety.

## Generated Files

Galerina may generate deployment files such as Dockerfiles, platform YAML,
Kubernetes manifests, systemd units, reverse-proxy config and CI workflow
snippets.

Generated files must remain inspectable and overrideable. Galerina should show
which profile or policy caused each important setting.

Kubernetes is a deployment target, not a mandatory runtime requirement. Basic
Kubernetes output may include Deployment, Service, health/readiness/startup
probes, resource limits, secret references and deployment reports. Hardened
Kubernetes policy packs, advanced NetworkPolicy generation, RBAC minimisation,
admission policy templates and multi-environment production overlays are
reserved enterprise areas unless explicitly unlocked. See
`KUBERNETES_DEPLOYMENT.md` and `ENTERPRISE.md`.

Nginx, Apache and Caddy are reverse-proxy deployment targets, not Galerina
language features. Galerina may generate inspectable configs for TLS, proxying,
body limits, rate limits, hidden-file denial, security headers and health
checks from route and deployment policy. See `SERVER_PLATFORM_SUPPORT.md`.
