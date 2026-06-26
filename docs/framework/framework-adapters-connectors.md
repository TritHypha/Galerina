# Framework: Adapters And Connectors

## Purpose

Adapters and connectors define how Galerina integrates with external systems
without hidden SDK calls, monkey patching or uncontrolled plugin behaviour.

## Short Definition

An adapter is a governed boundary implementation for a declared external
contract.

## Boundary Role

Adapters and connectors belong under the core `boundary` concept:

```text
boundary = package + storage + external + event + AI/tool + compute
```

They connect Galerina to systems such as payment providers, email services, search
engines, object storage, AI models, MCP servers, analytics systems and legacy
APIs.

## Syntax Example

```galerina
adapter StripePaymentAdapter implements PaymentProvider {
  contract use PaymentProviderContract
  permission use payment_provider_access

  effects {
    allow network.external
    allow audit.write
    deny file.write
  }
}
```

## Adapter Responsibilities

Adapters should declare:

- external contract implemented
- selected provider or implementation name where applicable
- request and response data shapes
- required permissions
- allowed effects
- timeout policy
- retry policy
- idempotency policy
- secret handling
- redaction rules
- audit events
- fallback behaviour

## Security Rules

- External SDK calls must go through declared adapters.
- Adapters must not gain authority from import side effects.
- Adapter-based polymorphism must not hide effects, permissions or boundaries.
- Dynamic plugin loading must require governed registration.
- Network, file, shell, AI/tool and compute access must be declared as effects.
- MCP tools, resources and prompts must go through declared AI/tool boundaries;
  raw tool exposure is not an adapter shortcut.
- Secrets must be passed as secret references, not raw strings in logs or
  reports.
- Retries must be safe for the operation type.
- Adapter failures must return typed errors.

## V1 Position

Adapter and connector concepts should be documented early, but broad provider
ecosystems can remain later work. V1 should focus on the boundary rules needed
to prevent hidden external access.

## Generated Reports

```text
adapter-boundary-report.json
external-boundary-report.json
provider-effect-report.json
connector-security-report.json
polymorphism-effective-report.json
mcp-tool-definitions.json
```

## Knowledge Base

See [Boundary Extension Concepts](../Knowledge-Bases/boundary-extension-concepts.md).
