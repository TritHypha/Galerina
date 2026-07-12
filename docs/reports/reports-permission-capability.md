# Reports: Permission And Capability

## Purpose

Permission and capability reports prove which actor authority, code effects,
data exposure rules and audit requirements apply to a flow, route, package or
tool boundary.

## Report Families

```text
permission-report.json
permission-effective-report.json
capability-report.json
capability-boundary-report.json
capability-grant-report.json
effect-report.json
security-report.json
```

## Contains

```text
actor type
required capabilities
granted capabilities
missing capabilities
declared effects
data exposure rules
audit requirements
source locations
related routes, flows, packages and tools
boundary check points
grant source
lease or expiry when applicable
```

## Security Rules

- Missing required capability must fail closed.
- Sensitive action requires capability.
- Sensitive data exposure requires capability.
- Effects must not be reported as actor authorization.
- Reports must not include secret values.
- Reports must distinguish declared permission from effective permission.

## Runtime Use

The runtime should use precomputed permission and capability tables where
possible:

```text
flow -> required capabilities -> actor capabilities -> allow/deny decision
```

## Knowledge Base

See [Capabilities](../../../ZTF-Knowledge-Bases/capabilities.md) and
[Permission, Capability And Actor Model](../../../ZTF-Knowledge-Bases/permission-capability-actor-model.md).
