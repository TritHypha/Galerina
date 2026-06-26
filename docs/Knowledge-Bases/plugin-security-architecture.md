# Plugin Security Architecture

## Definition

Galerina is designed around a **small secure core with optional extension packages**. Extensions are untrusted by default. Every plugin must explicitly request permissions and the application must explicitly grant them.

```text
Small language core
Strong security boundaries
Domain-specific extensibility
Controlled runtime permissions
```

## Core Principle

```text
Extensions are untrusted by default.
No implicit access.
No hidden capabilities.
No automatic filesystem access.
No automatic network access.
No unrestricted vault access.
```

## Why Plugin Isolation Matters

Without isolation, domain extensions create direct security risk:

```text
AI package executes arbitrary tools
Medical package leaks patient records
Finance package performs unauthorised transactions
Robotics package controls physical hardware
Web package performs malicious network requests
```

Secure plugin architecture prevents:

```text
data leakage
remote code execution
supply-chain attacks
unsafe hardware control
unauthorised vault access
privilege escalation
```

## Security Philosophy

```text
Zero trust plugin model
Capability-based permissions
Sandboxed execution
Explicit runtime grants
Audit-first design
```

## Plugin Risk Levels

### Low Risk

Pure computation or symbolic systems.

```text
Examples: Galerina.Math, Galerina.Science
Primary risks: resource exhaustion, large memory use, cryptographic misuse
Protections: CPU limits, memory quotas, execution timeouts
```

### Medium Risk

Can influence real-world systems or calculations.

```text
Examples: Galerina.Engineering, Galerina.Chemistry
Primary risks: unsafe simulations, incorrect assumptions, hazardous modelling
Protections: validation rules, safety assertions, unit checking, simulation isolation, review workflows
```

### High Risk

Can access sensitive data, external systems, or physical systems.

```text
Examples: Galerina.AI, Galerina.Medical, Galerina.Finance, Galerina.Robotics, Galerina.Web, Galerina.Database, Galerina.Hardware
Primary risks: prompt injection, data exposure, financial fraud, unsafe automation, physical harm
Protections: strict sandboxing, audit logging, permission gating, manual approval, tool allowlists, network restrictions, vault isolation, human confirmation
```

## Permission Categories

Every plugin starts with no permissions.

| Permission | Allows | Requires |
| --- | --- | --- |
| `safe` | Pure computation, local type definitions, local symbolic processing | Nothing |
| `read` | Read approved resources, datasets, vault values | — |
| `write` | Modify files, update databases, persist state | Audit logging, scoped resource limits |
| `network` | HTTP requests, API calls, remote services, cloud inference | Domain allowlists, rate limits, request auditing, TLS enforcement |
| `execute` | Tool invocation, agent execution, subprocess execution | Tool allowlists, sandboxed runtime, execution quotas, audit trails |
| `physical` | Motor control, device communication, industrial automation, robot movement | Emergency stop support, hardware sandboxing, human override, simulation testing |
| `regulated` | Medical, financial, legal, identity systems | Encryption, audit logging, consent enforcement, data retention policies, role-based permissions |

## Plugin Declaration Syntax

```galerina
plugin Galerina.AI {
  permissions {
    deny filesystem
    deny vault
    require network
    require execute
    require audit_logging
    require tool_allowlist
  }
}

plugin Galerina.Medical {
  permissions {
    require regulated
    require encryption
    require consent_tracking
    require audit_logging
  }
}

plugin Galerina.Robotics {
  permissions {
    require physical
    require emergency_stop
    require simulation_mode
    require audit_logging
  }
}
```

## Plugin Manifest

Every plugin must declare:

```galerina
plugin Galerina.AI {
  version "0.1"

  permissions {
    require network
    require execute
  }

  dependencies {
    Galerina.Science >= 0.1
  }
}
```

## Capability Token Grant

Applications grant scoped capabilities at runtime:

```galerina
grant Galerina.AI {
  network to "api.openai.com"
  execute tools ["search", "summarise"]
}
```

## Runtime Security Architecture

```text
Application
    ↓
Galerina Runtime
    ↓
Permission Manager
    ↓
Sandbox Layer
    ↓
Plugin Runtime
```

## Four Security Layers

### 1. Compiler Validation

```text
permission declarations
unsafe API usage
capability violations
type safety
```

### 2. Runtime Sandbox

Each plugin executes in an isolated runtime:

```text
memory isolation
filesystem isolation
process isolation
network isolation
GPU isolation
```

Technologies:

```text
WASM sandboxing
container runtimes
capability-based VMs
restricted interpreters
```

### 3. Capability Tokens

Plugins receive temporary scoped capabilities — not permanent access.

### 4. Audit Logging

All sensitive plugin actions are logged automatically:

```text
vault access
network calls
medical data access
financial operations
hardware control
tool execution
```

## AI-Specific Risks and Protections

Main AI threats:

```text
prompt injection
tool misuse
sensitive data leakage
hallucinated automation
recursive agent loops
autonomous unsafe actions
```

Protections:

```text
tool allowlists — agents can only call approved tools
human approval — high-risk actions require confirmation
execution limits — max steps, max runtime, max API usage
context isolation — sensitive vault data separated from prompts
```

## Medical and Finance Protections

```text
encryption at rest and in transit
consent management
audit trails
role-based access
immutable logs
data retention rules
```

## Robotics and Hardware Safety

```text
simulation-first workflows
emergency stop support
manual override
speed limits
geofencing
power constraints
safety watchdogs
```

## Official Extension Strategy

Core official packages — heavily reviewed and officially maintained:

```text
Galerina.Math
Galerina.Engineering
Galerina.AI
Galerina.Security
Galerina.Database
Galerina.Web
```

Requirements:

```text
security review
stable APIs
permission declarations
sandbox support
long-term maintenance
```

## Third-Party Plugin Ecosystem Rules

```text
signed packages
version pinning
permission manifests
dependency scanning
sandbox enforcement
security scoring
```

## Relationship to Runtime Extension Points

This document covers domain extension packages (Galerina.AI, Galerina.Medical, etc.).

Runtime extension points (`extension`, `observer`, `listener`) are internal runtime hooks for metrics, audit, and monitoring — not domain plugins. See `runtime-extension-points.md`.

## Core Principle

```text
Core language = trusted
Plugins = untrusted until granted capabilities

Galerina should safely support AI, engineering, medicine,
chemistry, finance, robotics and scientific computing
without compromising the security or simplicity of the core language.
```
