# Modules and Visibility

Galerina should use explicit modules and visibility rules.

Package approval and the distinction between local `import` and package
`use` are documented in `docs/package-use-registry.md`.

## Planned Visibility

```text
private  = visible only inside the current module
module   = visible inside the current module group
package  = visible inside the current package
public   = visible to importing packages
```

## Rules

```text
Local names should be private by default.
Public APIs should require explicit declaration.
Secrets should not be public.
Target-specific internals should not leak into general APIs.
Generated docs should report public contracts separately from internals.
```

## Import and Use Direction

Recommended split:

```text
import = local Galerina source files/modules
use    = approved packages and standard library modules
```

Local source dependencies should stay visible through `import`, while
third-party and standard-library dependencies should stay visible through
explicit file-level `use` statements.
