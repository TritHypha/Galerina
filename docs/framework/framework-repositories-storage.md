# Framework: Repositories And Storage

## Purpose

Repositories and storage contracts define how Galerina flows read and write
persistent data without hiding database behaviour inside models.

## Short Definition

A repository is a named storage boundary that exposes declared read/write
operations for a data source.

## Boundary Role

Repositories and storage belong under the core `boundary` concept because they
cross from governed application code into a persistence system.

Models describe data. Repositories describe how data is fetched, saved or
queried.

Models must not own storage effects directly; this keeps model contracts
security-focused and storage behaviour reportable.

## Avoid Hidden Active Record Behaviour

Avoid:

```galerina
user.save()
User.findById(id)
```

Prefer:

```galerina
let user = try UsersRepository.findRequired(userId)
```

This keeps storage effects visible and reportable.

## Syntax Example

```galerina
repository UsersRepository {
  storage UsersDatabase
  model User

  query findRequired(id: UserId) -> Result<User, StorageError>
    effects {
      allow db.read
    }
}
```

## Storage Contract Responsibilities

Storage contracts should declare:

- data source
- owned models
- allowed queries and commands
- read/write effects
- permission requirements
- parameterised query rules
- transaction policy
- encryption requirements
- classification and redaction rules
- report output

## Security Rules

- Storage access must be declared as an effect.
- Public routes must not return raw database models.
- Query parameters must be typed and parameterised.
- Storage boundaries must not silently log secrets or PII.
- Storage reads from untrusted sources must validate and classify results.
- Writes must be permissioned and auditable.
- Cross-tenant reads must be denied unless an explicit tenant policy allows
  them.

## V1 Position

Repository and storage boundaries are v1-critical as concepts because secure web
apps need explicit database access. Full ORM design, migrations and provider
adapter ecosystems are not v1 language-core requirements.

## Generated Reports

```text
storage-boundary-report.json
repository-report.json
query-effect-report.json
model-exposure-report.json
```

## Knowledge Base

See [Boundary Extension Concepts](../../../ZTF-Knowledge-Bases/boundary-extension-concepts.md).
