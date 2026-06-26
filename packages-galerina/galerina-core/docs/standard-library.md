# Standard Library

The Galerina standard library should start small and strict.

## Planned Areas

```text
core types
Option and Result
JSON
API helpers
environment access
secure strings
time and duration
collections
math
logic
diagnostics
filesystem with permissions
network with permissions
```

## Design Rule

Standard library APIs should return explicit `Result<T, Error>` values where operations can fail and should avoid silent null or undefined behaviour.
