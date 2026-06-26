# Query Type and Database Access

## Definition

`Query` is a protected external-boundary query artifact. It is not normal
`Text`. It is the Galerina type for parameterized queries sent to external data
stores.

## What Query Means to the Runtime

```text
intended for an external query boundary
requires capability permission to execute
requires safe parameters only
must be audited
must not be built with unsafe string merging
cannot execute itself
immutable once created
```

## Query Type

Use `Query` as the single type for external queries. One type, multiple block
labels:

```galerina
let q: Query = sql {
  SELECT id, email
  FROM users
  WHERE id = :id
}

let profile: Query = graphql {
  query GetUser($id: ID!) {
    user(id: $id) { id email }
  }
}
```

Block labels (`sql`, `graphql`, `mongo`, `search`) identify the query format.
The type `Query` tells the runtime this is external-boundary content.

## Invalid: Unsafe Interpolation

```galerina
let raw_name: unsafe String = request.name

let query: Query = sql {
  SELECT * FROM users WHERE name = ${raw_name}
}
```

Unsafe values cannot be interpolated into queries.

## Correct: Parameterized

```galerina
let raw_name: unsafe String = request.name
let name: safe String = clean.text(raw_name)

let query: Query = sql {
  SELECT * FROM users WHERE name = :name
}

database.main.run(query, { name: name })
```

## Database Connection Declaration

Connections are declared declaratively using GlobalVault. Credentials are never
stored in variables.

```galerina
database main_db {
  provider: "postgres"
  source: GlobalVault.database.main
}

database analytics_db {
  provider: "mysql"
  source: GlobalVault.database.analytics
}
```

## Database Output Is Unsafe

Database results cross an external boundary and must be treated as unsafe until
validated:

```galerina
let raw_result: unsafe Any = database.main_db.run(query, params)
let result: safe MyType = validate.my_type(raw_result)
```

## Multi-Database Flow Example

```galerina
flow get_user_report(id: safe Id) -> Report
  uses database.main_db.read
  uses database.analytics_db.read
{
  let user_query: Query = sql {
    SELECT id, email
    FROM users
    WHERE id = :id
  }

  let stats_query: Query = sql {
    SELECT user_id, visits, purchases
    FROM user_stats
    WHERE user_id = :id
  }

  let raw_user: unsafe Any = database.main_db.run(user_query, { id: id })
  let raw_stats: unsafe Any = database.analytics_db.run(stats_query, { id: id })

  let user: safe User = validate.user(raw_user)
  let stats: safe UserStats = validate.user_stats(raw_stats)

  return build_report(user, stats)
}
```

## Core Boundary Rule

```text
Query going out  = protected external-boundary artifact
Result coming in = unsafe until validated
```

## Core Principle

```text
Text should not be used for executable queries.
Query is the runtime signal that content is
meant for an external database/query boundary.
```
