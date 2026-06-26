# Framework: Overview

## Purpose

The Galerina framework documentation explains how secure web applications are
structured around typed routes, contracts, policies, secure flows and reports.

## Short Definition

The framework layer is the application runtime shape around Galerina source. It
does not replace the language core; it explains how application concepts connect
when running through `galerina serve` and the secure web runtime.

## Why It Exists

Galerina needs a consistent application model for security, memory safety,
developer clarity, runtime speed and AI understanding.

The framework layer gives names to the moving parts:

```text
routes
requests
responses
models
secure flows
contracts
policies
effects
capabilities
reports
```

## Where It Lives

```text
packages-galerina/galerina-framework-app-kernel/
packages-galerina/galerina-framework-api-server/
packages-galerina/galerina-framework-example-app/
docs/framework/
```

## How It Connects

```text
route -> request contract -> policy check -> secure flow -> response contract -> reports
```

## Security Rules

- Public routes must have typed request and response boundaries.
- Effects must be declared before privileged work can run.
- Raw storage models must not be returned directly from public routes.
- Secrets must use protected secret types and safe sinks.
- Package authority must be declared and reported.

## AI-Friendly Output

Framework docs should map concepts to generated reports, route manifests,
contract manifests, type manifests and AI-safe project summaries.

## Generated Reports

```text
route-report.json
contract-report.json
policy-report.json
security-report.json
ai-context-report.json
```

## v1 Scope

V1 framework docs focus on secure web runtime applications: APIs, webhooks,
queue workers, service workers and agent/tool gateway backends.

## Future Scope

Frontend framework adapters, advanced storage, external API gateways and compute
targets stay package-owned and should not become mandatory framework behavior.
