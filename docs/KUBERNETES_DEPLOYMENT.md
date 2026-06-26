# Kubernetes Deployment Target

Galerina should support Kubernetes as a deployment target, not as something every
Galerina app must use.

Kubernetes is a container orchestration system for deploying, scaling and
managing containerized applications. A Kubernetes Deployment manages Pods and
ReplicaSets, supports rolling updates and can roll back to earlier revisions.
Galerina should use that model as one possible deployment output, not as the
default application architecture.

Enterprise boundary:

```text
Basic Kubernetes output may be free/open.
Hardened Kubernetes policy packs remain enterprise-only.
Do not create or activate galerina-kubernetes-enterprise unless explicitly unlocked.
```

`docs/ENTERPRISE.md` reserves `galerina-kubernetes-enterprise`,
`galerina-security-policy-packs-enterprise` and `galerina-deploy-enterprise` for
advanced production hardening, policy packs, multi-environment overlays and
managed deployment control. This document records product direction only; it
does not create a Kubernetes package.

## Core Rule

```text
Galerina does not trust Kubernetes YAML written by hand.
Galerina generates secure YAML from policy.
Galerina validates the generated YAML.
Galerina blocks unsafe deployment.
Kubernetes enforces the runtime state.
Galerina verifies the rollout after deployment.
```

The broader deployment model is:

```text
Galerina describes the app deployment requirements once.
Galerina translates them to the selected deployment target.
```

Possible targets:

```text
docker
podman
oci
kubernetes
helm-style package
kustomize-style overlays
digitalocean app platform
google cloud run
aws ecs
linux vps / systemd
bare metal
```

## Deployment Intent

Developers should not start with raw Kubernetes YAML. Galerina should let the app
declare deployment intent:

```Galerina
deploy_profile production {
  target kubernetes

  app {
    name "orders-api"
    replicas 3
    port 8080
  }

  image {
    name "registry.example.com/orders-api"
    tag git_commit
    platforms [linux_amd64, linux_arm64]
    require_signed true
    require_sbom true
  }

  runtime {
    health "/health"
    readiness "/ready"
    startup "/startup"
  }

  resources {
    cpu_request "250m"
    cpu_limit "1"
    memory_request "256Mi"
    memory_limit "512Mi"
  }

  secrets required [
    PAYMENT_API_KEY,
    WEBHOOK_SECRET,
    DATABASE_URL
  ]

  security {
    run_as_non_root true
    readonly_root_filesystem true
    allow_privilege_escalation false
    drop_linux_capabilities all
    seccomp runtime_default
  }

  network {
    inbound allow [8080]
    outbound allow [
      "database.internal",
      "api.payment-provider.com"
    ]
    default deny
  }

  rollout {
    strategy rolling
    max_unavailable 0
    max_surge 1
    rollback_on_failed_readiness true
  }
}
```

This is design-direction syntax. It must not be treated as frozen Galerina syntax
until the language docs and compiler agree.

## Generated Kubernetes Objects

For Kubernetes, Galerina may generate:

```text
Deployment
Service
Ingress or Gateway
ConfigMap
Secret references
ServiceAccount
Role / RoleBinding
NetworkPolicy
HorizontalPodAutoscaler
PodDisruptionBudget
Job for migrations
CronJob for scheduled tasks
Namespace
ResourceQuota / LimitRange
```

Example output layout:

```text
k8s/
|-- namespace.yaml
|-- deployment.yaml
|-- service.yaml
|-- ingress.yaml
|-- configmap.yaml
|-- secret-refs.yaml
|-- serviceaccount.yaml
|-- rbac.yaml
|-- networkpolicy.yaml
|-- hpa.yaml
|-- pdb.yaml
`-- deploy-report.json
```

Generated files must be inspectable. Galerina should show which policy caused each
important manifest setting.

## Generated Deployment Shape

Galerina security policy:

```Galerina
security {
  run_as_non_root true
  readonly_root_filesystem true
  allow_privilege_escalation false
  drop_linux_capabilities all
}
```

Generated Kubernetes-style output:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
  labels:
    app: orders-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orders-api
  template:
    metadata:
      labels:
        app: orders-api
    spec:
      serviceAccountName: orders-api
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: orders-api
          image: registry.example.com/orders-api:abc123
          ports:
            - containerPort: 8080
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
          startupProbe:
            httpGet:
              path: /startup
              port: 8080
```

Kubernetes security contexts cover Pod and container access-control settings
such as non-root execution, capabilities, seccomp, privilege escalation and
read-only root filesystems. Galerina should generate these from explicit policy
instead of relying on defaults.

## Health, Readiness And Startup

Galerina should generate Kubernetes probes from app declarations:

```Galerina
health {
  live "/health"
  ready "/ready"
  startup "/startup"

  ready_checks [
    database reachable,
    required_secrets present,
    migrations current,
    outbound_payment_provider reachable
  ]
}
```

Kubernetes liveness, readiness and startup probes serve different purposes:
startup probes protect slow-starting containers, liveness probes can restart
unhealthy containers, and readiness probes control whether traffic should be
sent to a Pod. Galerina should map these carefully and avoid treating "container
started" as "deployment succeeded".

Galerina should verify:

```text
container started
startup probe passed
health endpoint passed
readiness endpoint passed
smoke tests passed
no crash loop detected
traffic only enabled after readiness passed
```

## Secrets

Galerina must be stricter than basic Kubernetes secret usage.

Never generate this:

```yaml
env:
  - name: PAYMENT_API_KEY
    value: "sk_live_123"
```

Prefer secret references or external secret stores:

```yaml
env:
  - name: PAYMENT_API_KEY
    valueFrom:
      secretKeyRef:
        name: orders-api-secrets
        key: PAYMENT_API_KEY
```

Production model:

```Galerina
secrets {
  mode external_secret_store

  required [
    PAYMENT_API_KEY,
    WEBHOOK_SECRET,
    DATABASE_URL
  ]

  deny_plain_yaml_values true
  deny_env_file_mount true
  require_rbac_least_privilege true
  require_encryption_at_rest true
}
```

Kubernetes Secrets still require careful cluster configuration. Galerina should
warn when production deployments depend on Kubernetes Secrets without evidence
of encryption at rest, least-privilege RBAC and restricted container access.

Example warning:

```json
{
  "severity": "warning",
  "code": "GALERINA-K8S-SECRET-002",
  "message": "Kubernetes Secrets require encryption at rest and least-privilege RBAC for production."
}
```

## NetworkPolicy

Galerina network policy:

```Galerina
network {
  inbound allow [8080]

  outbound allow [
    "database.internal",
    "api.payment-provider.com"
  ]

  default deny
}
```

Kubernetes target output should produce NetworkPolicy where supported:

```text
Pods cannot talk to everything by default.
Only declared network paths are allowed.
Unexpected outbound access is blocked.
```

This is important for supply-chain and agent safety. If a dependency or
compromised app tries to call an unknown external host, the deployment target
should block it where the platform supports that control.

Advanced NetworkPolicy generation and hardened policy packs are enterprise-only
unless explicitly unlocked.

## RBAC And ServiceAccounts

Galerina should not let every app run with broad Kubernetes permissions.

Example:

```Galerina
kubernetes {
  service_account orders_api {
    permissions [
      read_own_config,
      read_required_secrets
    ]

    deny [
      list_all_secrets,
      create_pods,
      exec_into_pods,
      access_kubernetes_api
    ]
  }
}
```

Generated baseline:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: orders-api
```

Galerina should generate Role and RoleBinding only when needed and should block
dangerous defaults:

```text
default service account with broad permissions
cluster-admin role
ability to list all secrets
ability to exec into other pods
ability to create privileged pods
```

RBAC minimisation beyond basic safe defaults belongs to the reserved enterprise
Kubernetes policy area.

## Admission And Policy Enforcement

For high-security deployments, Galerina can generate policy checks that Kubernetes
or an admission-policy system enforces before workloads are admitted. Kubernetes
admission controllers intercept API server requests after authentication and
authorization but before persistence, and can validate, mutate or reject
objects.

Possible checks:

```text
reject pods running as root
reject images without signatures
reject containers with privilege escalation
reject missing resource limits
reject missing readiness probes
reject images tagged latest
reject containers mounting .env
reject workloads without NetworkPolicy
```

Admission templates and security policy packs are enterprise-only unless
explicitly unlocked.

## GitOps

Galerina should support GitOps-style output for Kubernetes:

```text
k8s/generated/
|-- base/
|-- overlays/
|   |-- staging/
|   `-- production/
`-- reports/
```

Galerina's job:

```text
generate manifests
validate manifests
sign or hash manifests
write deployment report
block insecure output
```

Cluster or GitOps system job:

```text
pull approved manifests
apply to cluster
roll out changes
report status
rollback if needed
```

Multi-environment overlays and production readiness automation are enterprise
areas unless explicitly unlocked.

## Commands

Target generation should use the generic deployment command shape:

```bash
galerina generate deploy --target kubernetes
galerina generate deploy --target docker
galerina generate deploy --target linux-vps
```

A Kubernetes-specific check may be added later:

```bash
galerina k8s check --profile production
```

Example output:

```text
Galerina Kubernetes Deployment Check

Target: kubernetes
Image: registry.example.com/orders-api:abc123

Passed:
- Deployment generated
- Service generated
- Readiness probe present
- Liveness probe present
- Startup probe present
- Non-root container
- readOnlyRootFilesystem enabled
- allowPrivilegeEscalation disabled
- Linux capabilities dropped
- Resource limits set
- Secret values not included
- .env not mounted
- ServiceAccount generated
- Rollback enabled

Warnings:
- Confirm cluster has secret encryption at rest enabled
- Confirm production namespace enforces restricted pod security
- NetworkPolicy and RBAC minimisation require enterprise policy packs

Deployment allowed: yes
```

## Report Fields

Kubernetes deployment reports should include:

```text
target
namespace
image name and digest
image signature status
SBOM status
generated object list
probe status
resource request and limit status
securityContext status
secret exposure status
external secret store status
service account status
RBAC risk status
NetworkPolicy status
admission policy status
rollout strategy
rollback metadata
GitOps output paths
enterprise policy pack required or not
```

Reports must not include secret values, raw environment values, private cluster
credentials, kubeconfig contents or bearer tokens.

## References

- Kubernetes documentation: <https://kubernetes.io/docs/home/>
- Kubernetes Deployments: <https://kubernetes.io/docs/concepts/workloads/controllers/deployment/>
- Kubernetes rolling updates and rollback: <https://kubernetes.io/docs/tasks/run-application/update-deployment-rolling/>
- Kubernetes security context: <https://kubernetes.io/docs/tasks/configure-pod-container/security-context/>
- Kubernetes liveness, readiness and startup probes: <https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/>
- Kubernetes Secrets: <https://kubernetes.io/docs/concepts/configuration/secret/>
- Kubernetes Secrets good practices: <https://kubernetes.io/docs/concepts/security/secrets-good-practices/>
- Kubernetes admission controllers: <https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/>
