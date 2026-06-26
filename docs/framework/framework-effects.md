# Framework: Effects

## Purpose

Effects make privileged or external behavior visible before code runs.

## Short Definition

An effect is a declared technical action such as database access, network
access, filesystem access, runtime clock access or metrics access.

## Syntax Example

```galerina
secure flow writeAudit(event: AuditEvent) -> Result<Void, AuditError>
effects [database.write, runtime.clock] {
  ...
}
```

## Security Rules

- Undeclared effects are denied.
- Effects say what code may technically do; capabilities say what the actor is
  authorised to do.
- Effects must match package and route policy.
- Client-safe code must not use server-only effects.
- Reports must show requested and allowed effects.

## Generated Reports

```text
effect-report.json
package-authority-report.json
route-policy-report.json
```

## v1 Scope

Source-visible effect declarations and basic effect reporting.
