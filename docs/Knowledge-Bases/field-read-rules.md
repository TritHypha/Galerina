# Field Read Rules

## Purpose

Galerina permissions should make database field access clear, safe and auditable.

The safest field-read rule is an explicit allow list:

```galerina
allow read Profiles fields: [
  id,
  owner,
  name,
  email
]
```

Only the named fields are readable.

Galerina may also support a controlled broad-read form:

```galerina
allow read Profiles fields: all except [
  email
]
```

This is convenient, but less safe than an explicit allow list.

## Core Principle

```text
Allow lists are safest.
Deny lists are convenient.
Broad reads must be visible.
```

## Preferred Secure Form

Use explicit allow lists for sensitive tables, public APIs, regulated data and
security-critical flows.

```galerina
allow read Profiles fields: [
  id,
  owner,
  name
]
```

This is safest because new fields are not automatically included.

## Broad Read Form

Galerina may allow:

```galerina
allow read Profiles fields: all except [
  email
]
```

Meaning:

```text
Allow reading all fields from Profiles except email.
```

This is clearer than symbolic forms such as:

```galerina
allow read Profiles fields: [
  *,
  !email
]
```

Avoid symbolic field denial because:

- `*` can feel too broad
- `!email` is less readable
- symbolic syntax is harder for non-experts
- AI and auditors may interpret it less clearly
- controlled language should prefer words over symbols

Preferred broad-read wording:

```galerina
fields: all except [
  email
]
```

## Security Warning

`all except` is convenient but riskier than an explicit allow list.

If a new sensitive field is later added:

```text
password_hash
api_key
secret_note
```

then this rule:

```galerina
allow read Profiles fields: all except [
  email
]
```

may accidentally allow the new field unless Galerina freezes the resolved field
set or requires explicit future-field permission.

## Safer Broad Read Form

Galerina may support:

```galerina
allow read Profiles fields: all current except [
  email
]
```

Meaning:

```text
Allow all fields that exist now except email.
Do not automatically allow fields added later.
```

This is safer than permanent `all except` because future fields remain denied
until policy is regenerated, reviewed or explicitly widened.

## Field Read Modes

| Mode | Example | Risk | Direction |
| --- | --- | --- | --- |
| Explicit allow list | `fields: [id, owner, name]` | Lowest | Preferred |
| All current except | `fields: all current except [email]` | Medium | Safer broad read |
| All except | `fields: all except [email]` | Higher | Use only when intentionally broad |
| All fields | `fields: all` | Highest | Require stronger review |

## Runtime And Compiler Behaviour

When Galerina sees:

```galerina
allow read Profiles fields: all except [
  email
]
```

the compiler/runtime should:

1. Resolve all known fields in `Profiles`.
2. Remove fields listed in `except`.
3. Check field `view` and security metadata.
4. Warn if excluded-field mode is used on sensitive tables.
5. Deny unknown future fields unless policy explicitly allows broad future access.
6. Emit a field-read report entry.

For `all current except`, Galerina should snapshot the resolved field set and deny
new future fields until review.

## Example Broad Permission

```galerina
permission profile_read {

  code {
    allow db.read table: Profiles
  }

  data {
    allow read Profiles fields: all except [
      email
    ]

    allow expose view: public
    allow expose view: private owner: actor
  }

  audit optional event "profile.read"
}
```

## Safer Alternative

```galerina
permission profile_read {

  code {
    allow db.read table: Profiles
  }

  data {
    allow read Profiles fields: [
      id,
      owner,
      name
    ]

    allow expose view: public
    allow expose view: private owner: actor
  }

  audit optional event "profile.read"
}
```

## Review Rules

Use explicit field allow lists when:

- the table includes secret, private, regulated, restricted or confidential data
- the permission is used by a public route
- the permission is used by AI/tool context
- the flow crosses trust zones
- the model changes frequently
- future fields may contain sensitive values

Use `all except` only when:

- the table is low-risk
- broad access is intentional
- future-field behaviour is explicitly reviewed
- generated reports show the resolved field set

Use `all` only with stronger review and report warnings.

## Reports

Field-read reports should include:

```text
field-read-permission-report.json
data-access-field-report.json
model-field-exposure-report.json
future-field-risk-report.json
```

Report entries should show:

- source permission
- model/table name
- field mode
- resolved field set
- excluded fields
- future-field policy
- field view levels
- sensitive-field warnings
- route or flow using the permission

## Relationship To Other Concepts

This concept connects:

- [Secure By Default Syntax Principles](secure-by-default-syntax-principles.md)
- [Data Visibility View Terminology](data-visibility-view-terminology.md)
- [Model Security Contracts](model-security-contracts.md)
- [Developer-Friendly Permission Model](developer-friendly-permission-model.md)

## Final Syntax Standard

Preferred secure syntax:

```galerina
allow read Profiles fields: [
  id,
  owner,
  name
]
```

Preferred broad-read syntax:

```galerina
allow read Profiles fields: all except [
  email
]
```

Safer broad-read syntax:

```galerina
allow read Profiles fields: all current except [
  email
]
```
