# Reports: Audit Evidence

## Purpose

Audit evidence reports collect deterministic proof about Galerina security,
permissions, data exposure, boundaries and runtime configuration.

## Important Limitation

Galerina reports can support audits, but they do not automatically make a system
compliant. Operational controls, deployment evidence, supplier governance,
incident response and human review remain required outside the language.

## Evidence Bundle

Possible future command:

```bash
galerina audit --env production --out build/audit
```

Output:

```text
build/audit/
  audit-summary.md
  security-report.json
  data-view-report.json
  model-exposure.json
  policy-effective.json
  contract-effective.json
  permission-effective.json
  audit-actor-report.json
  audit-event-report.json
  secret-usage-report.json
  storage-boundary-report.json
  external-boundary-report.json
  dependency-report.json
  production-config-report.json
```

## What Galerina Can Evidence

```text
which fields are PII
which fields are secret
which routes expose which fields
which flows can access external APIs
which flows can write to storage
which permissions are required
which actor, route, flow, permission and capabilities were attached to audit events
which audit events attempted to override runtime-owned identity fields
which fields are denied from public output
which policies apply in production
```

## What Galerina Cannot Prove Alone

```text
the real database is encrypted correctly
cloud IAM roles are correct
admins follow access policy
production servers are patched
backups restore successfully
the organisation follows incident process
```

## Positioning

Galerina is designed to support audit-ready secure software by making data
classification, permissions, flows, contracts, boundaries and exposure rules
explicit, compiler-checked and reportable.

Audit actor attribution should come from governed runtime context. Application
code may add event metadata, but runtime-owned identity fields such as primary
actor, request ID, route, flow, permission, capabilities, timestamp and
execution ID must be consistent and protected from silent override.
