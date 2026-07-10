# Framework: Policies

## Purpose

Policies declare allowed behavior before runtime work starts.

## Short Definition

A policy is a source-visible rule that controls effects, capabilities, data
exposure, runtime adapters or package authority.

## Policy Areas

```text
app policy
package policy
data policy
route policy
flow policy
response policy
memory policy
runtime policy
compute policy
interop policy
audit policy
```

## Placement Rule

Place policy at the smallest useful boundary.

```text
field-specific policy -> field/model
response-specific policy -> response/view
route-specific policy -> route
flow-specific policy -> secure flow
app-wide policy -> /policies
```

Reusable policy belongs in `/policies`. Local policy can live next to the
boundary it protects.

## Developer-Facing Relationship

Normal developers can use `permission` as the simple authority block. Policies
remain first-class source rules that can be compiled into effective permission,
capability, effect, data exposure, memory and audit decisions.

## Security Rules

- Policy must fail closed when required facts are unknown.
- Effective policy must be reportable.
- Conflicting policy must produce diagnostics.
- Runtime choices must not silently weaken source policy.

## Generated Reports

```text
policy-index.json
policy-definitions.json
policy-effective.json
policy-conflicts.json
policy-ai-summary.json
policy-human-summary.md
```

## v1 Scope

Declare and report core app, route, flow, response and package policy.

## Knowledge Base

See [Policy Architecture](../../../ZTF-Knowledge-Bases/policy-architecture.md).
