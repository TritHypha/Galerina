# Galerina — Docker Container Profile

**Status:** Phase 17 — Design Proposal
**Feature:** `galerina docker init` command
**Scope:** Capability-aware container generation
**Core principle:** "Docker should not be hand-written infrastructure"

---

## TL;DR

- `galerina docker init` generates `Dockerfile`, `.dockerignore`, and `compose.yaml` with secure defaults
- Galerina capabilities translate directly to container permissions (`database.read` requires network; filesystem writes are off by default)
- Only add permissions when effects require them — `read_only` and `cap_drop ALL` apply by default

---

## The Problem

Docker is boring infrastructure that developers copy-paste, often insecurely. A typical project accumulates a `Dockerfile` written once, rarely reviewed, and never updated to reflect what the service actually does. Ports are exposed speculatively. Filesystem access is unrestricted. Capabilities are never dropped. The result is containers that have more permission than they need and less observability than they should.

The problem is not Docker itself — it is that Docker configuration is written by hand, disconnected from the service contract it is supposed to reflect.

---

## The Galerina Way

Galerina services already declare what they do: which effects they perform, which capabilities they require, which routes they expose, and which data they touch. That information is sufficient to generate a correct and minimal container profile automatically.

`galerina docker init` compiles service contracts, effects, capabilities, routes, and health checks into a secure container profile. The developer does not write infrastructure — they declare service behaviour, and the container follows from it.

---

## `galerina docker init`

Running `galerina docker init` in a Galerina project generates the following files:

| File | Purpose |
|---|---|
| `Dockerfile` | Minimal Alpine image, production-only dependencies, non-root user |
| `.dockerignore` | Excludes `node_modules`, `.env`, `*.spore` source files, and `tests/` |
| `galerina.container.json` | Capability-to-container mapping derived from the service manifest |
| `compose.yaml` | Service definition with network isolation and secure defaults |

All generated files reflect the declared effects and capabilities of the service at generation time. Regenerating after a capability change updates the files to match.

---

## Minimal Runtime Dockerfile

The generated `Dockerfile` follows a fixed, minimal structure:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY build/ ./build/
USER node
CMD ["node", "build/runtime.js"]
```

No shell tools are installed. No development dependencies are included. The image runs as `node` (non-root) with no capability grants beyond what the host default provides, which are then selectively dropped via compose configuration.

---

## `galerina build --target docker`

Building with `--target docker` produces a structured output under `build/docker/`:

```
build/docker/
  Dockerfile
  service.manifest.json
  capabilities.json
  routes.json
  runtime.js
```

These artefacts are self-contained. `service.manifest.json` records the service identity and declared effects. `capabilities.json` records the resolved capability set. `routes.json` records exposed endpoints. Together they form the input to the container security policy and the attestation record.

---

## Capability-to-Container Policy

Container permissions are derived from declared capabilities. The mapping is:

| Declared Capability | Container Requirement |
|---|---|
| `database.read` | Network access required |
| `network.outbound` | Network access required |
| `filesystem.write` | Filesystem is not read-only |
| *(none declared)* | Read-only filesystem, no network access |

This mapping is computed at build time from `capabilities.json`. No capability grants are added speculatively. If the service does not declare `filesystem.write`, the container filesystem is read-only. If the service does not declare a network capability, it is placed on an isolated network with no outbound access.

---

## Secure Defaults

The following security settings are always generated and cannot be disabled through the container contract:

```yaml
read_only: true
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

Permissions are added only when declared effects require them. A service that reads from a database gets network access. A service that writes logs to disk gets a filesystem write mount scoped to the log directory. Nothing is granted by default.

---

## Health Check from Routes

If the service declares a route at `GET /health`, `galerina docker init` generates a corresponding `HEALTHCHECK` instruction automatically:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
```

The health check interval, timeout, and retry count are configurable in the `container {}` contract block. If no `/health` route is declared, no `HEALTHCHECK` is generated.

---

## Scale-to-Zero Friendly Defaults

Generated containers are optimised for scale-to-zero deployment by default:

- No background work runs unless a `job` is explicitly declared in the service
- No filesystem writes occur unless `filesystem.write` is declared as an effect
- The route manifest is loaded at startup from `routes.json` — no dynamic discovery at runtime
- Process startup is minimal: the runtime loads the manifest and begins accepting connections

This means containers stop cleanly, restart without state corruption, and start fast enough for cold-start environments.

---

## `container {}` Contract Block (Phase 17)

Phase 17 introduces a `container {}` block to the Galerina service definition syntax. This block declares container-level constraints that are enforced at both build time and runtime:

```spore
service UserService {

  container {
    port 3000
    readOnlyFilesystem true
    health "/health"
    memoryLimit "256Mi"
  }

}
```

The `container {}` block does not grant permissions — it constrains them. Declaring `readOnlyFilesystem true` when a `filesystem.write` capability is present is a compile-time error. The block provides explicit documentation of container expectations alongside the service definition.

---

## Commands

| Command | Purpose |
|---|---|
| `galerina docker init` | Generate `Dockerfile`, `.dockerignore`, `compose.yaml`, and `galerina.container.json` from the current service manifest |
| `galerina docker build` | Build the container image from the generated `Dockerfile` |
| `galerina docker run` | Run the container locally with the generated `compose.yaml` |
| `galerina build --target docker` | Compile the service and produce `build/docker/` artefacts for container deployment |

---

## Integration with Service Manifests

The three build artefacts map to three container concerns:

**`service.manifest.json` → Dockerfile labels**
Service identity, version, and declared effects are written as OCI image labels. This makes the image self-describing and queryable without running it.

**`capabilities.json` → Container security policy**
The resolved capability set determines which network access, filesystem access, and Linux capabilities are granted in `compose.yaml`. The policy is generated, not hand-written.

**`routes.json` → Health check and port exposure**
Declared routes determine which port is exposed and whether a `HEALTHCHECK` instruction is generated. A service that exposes no routes exposes no ports.

---

## Relationship to Governed Request Execution and Microservice Patterns

The container profile is the deployment boundary for a governed service. Every request entering the container passes through the governed request execution pipeline — effects are checked, capabilities are verified, and audit events are emitted. The container enforces the network and filesystem boundary; the Galerina runtime enforces the capability boundary inside it.

This means a container cannot escalate its own permissions at runtime. The capability set is fixed at build time, written to `capabilities.json`, embedded in the image labels, and verified by the runtime on startup. A service that was compiled without `network.outbound` cannot make outbound network calls even if the container network policy were loosened.

In a microservice architecture, each Galerina service produces its own container profile. Services communicate through declared network effects. No service has ambient access to another service's filesystem or capabilities.

---

## Rules at a Glance

- Secure defaults are generated automatically — the developer opts in to additional permissions, not out of restrictions
- Effects declare what network and filesystem access the container needs
- Health checks are generated from the `/health` route declaration — not written by hand
- No `process`, `globalThis`, or ambient runtime access is available inside the container runtime
- The container profile is part of the attestation chain: the `container_hash` field in `service.manifest.json` records the digest of the generated `Dockerfile` and `capabilities.json` at build time

---

## See Also

- `galerina-microservice-architecture`
- `galerina-governed-request-execution`
- `galerina-flow-entry-points`
