# Framework: Routes

## Purpose

Routes define public API or web entry points.

## Short Definition

A route connects an external method/path boundary to a declared request,
response/view, flow and policy.

## Syntax Example

```galerina
route GET "/users/{id}" {
  request User.get
  response User.authorised
  permission use user_read_with_pii
  flow getUser
}
```

## Security Rules

- Routes must not accept raw untyped input.
- Routes must not return raw internal models.
- Routes must declare request and response/view boundaries.
- Routes must connect to secure flows and permission policy.
- Unknown methods and paths should be rejected before body parsing.

## Generated Reports

```text
route-index.json
route-policy-report.json
route-exposure-report.json
```

## v1 Scope

Route declarations for typed web/API entry points.
