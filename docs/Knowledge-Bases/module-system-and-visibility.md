# Module System and Visibility

## Definition

The Galerina module system organises code into reusable, isolated, and composable
units. All module resolution is performed statically during compilation.

Runtime dynamic module loading is not part of the core module model.

## Design Principles

```text
Deterministic resolution    — same source tree always resolves identically
Explicit dependencies       — no implicit global imports
Stable namespaces           — public APIs hide implementation details
Compile-time verification   — all imports validated before execution
```

## Module Structure

Each `.spore` file is a module. Directory hierarchy maps to module hierarchy.

```text
math/vector.spore  →  module path: math.vector
```

## Import Syntax

### Full Module Import

```galerina
import math.vector
```

Access through qualification:

```galerina
let v = math.vector::Vector { x: 1, y: 2 }
```

### Selective Symbol Import

```galerina
import math.vector::{Vector, normalize}
```

Only specified symbols enter local scope.

### Aliased Import

```galerina
import collections.long_module_name as list
```

Provides shorter or conflict-free names. Access as `list::create()`.

### Nested Import

```galerina
import graphics.render.pipeline
```

Modules may be nested arbitrarily.

### Relative Imports

```galerina
import ./helpers
import ../shared/types
```

Resolved relative to the current module file. Relative imports must not escape
package boundaries.

### Standard Library Imports

```galerina
import std.io
import std.collections
```

Standard library modules are explicit imports. No implicit preloaded namespaces.

## Re-Exports

Modules may re-export symbols from dependencies:

```galerina
// math/mod.spore
public import math.vector::{Vector}
public import math.matrix::{Matrix}
```

Consumers can then:

```galerina
import math::{Vector, Matrix}
```

## Package Imports

```galerina
import crypto.hash
```

Resolution order:

```text
1. Relative modules
2. Current package modules
3. Workspace packages
4. Explicit external dependencies
5. Standard library
```

Package manifest example:

```toml
[dependencies]
crypto = "1.2.0"
network = "2.0.1"
```

## Module Resolution Algorithm

The compiler:

```text
- resolves module paths
- validates package existence
- detects duplicate symbols
- validates visibility
- builds dependency graphs
- detects cycles
- produces deterministic resolution output
```

## Cyclic Dependency Detection

The compiler detects and rejects cyclic imports.

```text
A imports B
B imports C
C imports A
```

Cycles complicate initialisation ordering, type resolution, and build
determinism. The recommended fix is to extract shared contracts into
independent modules.

Example diagnostic:

```text
SPORE-E3007: cyclic module dependency

Module `auth.session` depends on `auth.user`.
Module `auth.user` depends on `auth.session`.
```

## Module Initialisation

Module initialisation order is deterministic, following dependency order.

Initialisation code should avoid:

```text
hidden side effects
runtime-dependent behaviour
network access
non-deterministic compile-time state
```

---

## Visibility

### Private by Default

All symbols are private unless explicitly exported.

```galerina
fn internal_helper() {
    // only accessible within this module
}
```

### Public Symbols

Use `public` to expose a symbol outside the current module.

```galerina
public fn add(a: Int, b: Int) -> Int {
    a + b
}
```

### Public Struct with Private Fields

```galerina
public struct User {
    public username: String
    private password_hash: String
}
```

Field visibility protects internal invariants and security-sensitive data.

### Module-Level Selective Visibility

```galerina
public fn parse() {}
fn tokenize() {}
```

`parse()` is exported. `tokenize()` remains internal.

### Package Visibility

```galerina
package fn validate_token() {}
```

Accessible within the same package but not externally.

### Visibility and Imports

Only public symbols may be imported externally.

```galerina
// auth.spore
private fn hash_password() {}
public fn login() {}

// app.spore
import auth::{login}         // valid
import auth::{hash_password} // compiler error: SPORE-E3004
```

### Visibility vs Authority

Visibility controls accessibility.

Capability systems control authority.

A public function still requires runtime capability approval:

```galerina
public fn send_request() effects(network.connect) { ... }
```

---

## Compiler Error Codes

```text
SPORE-E3001 unresolved import
SPORE-E3002 duplicate symbol
SPORE-E3003 invalid package reference
SPORE-E3004 visibility violation
SPORE-E3005 ambiguous import
SPORE-E3006 invalid relative import
SPORE-E3007 cyclic dependency
SPORE-E3008 inaccessible package symbol
SPORE-E3009 invalid visibility modifier
SPORE-E3010 private field access
```

## Recommended Practices

```text
Keep APIs minimal
Export stable contracts only
Hide implementation details
Avoid broad public surfaces
Prefer explicit re-exports
Separate trusted/internal APIs from public APIs
```

---

## Module Declaration

A file may declare its module name explicitly.

```galerina
module app/users/service
```

The declared name must match the package manifest and source location.

```text
File path:    app/src/users/service.spore
Module path:  app/users/service
```

If the declaration and path disagree, the compiler emits:

```text
SPORE-MODULE-001: module declaration does not match source location
file: app/src/users/service.spore
found: app/payments/service
expected: app/users/service
```

---

## Import Syntax Variants

The module system supports multiple import forms depending on scope.

### Named Imports (Preferred)

```galerina
import { UserId, UserProfile } from "app/users/types"
import { find_user } from "app/users/repository"
```

Named imports make every dependency explicit and are the easiest to audit.

### Type-Only Imports

```galerina
import type { UserRecord } from "app/users/types"
```

Type-only imports signal that no executable code is required at runtime from
that import — only type information. This improves runtime planning.

### Capability Imports

```galerina
import capability { Database } from "galerina-core-data/database"
import capability { HttpClient } from "galerina-core-network/http"
```

Capability imports make the capability type visible for use in function
signatures. They do not grant capability authority — the runtime still decides
whether an instance is issued.

```galerina
flow get_profile(
    db: Database,
    id: UserId
) -> GetProfileResult
contract {
  types {
    type GetProfileResult = Result<UserProfile, UserError>
  }
  effects {
    storage
  }
}
{
    find_user(db, id)
}
```

### Namespace Imports

```galerina
import * as Users from "app/users/service"

flow run(id: Users.UserId) -> RunResult
contract {
  types {
    type RunResult = Result<Users.UserProfile, Users.UserError>
  }
}
{
    Users.get_profile(id)
}
```

Namespace imports are allowed for cohesive modules but named imports are
preferred for clarity and auditability.

### Wildcard Symbol Imports — Disallowed

```galerina
import * from "app/users/service"   // NOT ALLOWED
```

Wildcard symbol imports dump every exported symbol into local scope. They are
disallowed because they:

```text
Hide where names come from
Increase AI misunderstanding risk
Weaken audit reports
Create accidental symbol collisions
Make refactoring less safe
```

---

## Extended Visibility Model

### Visibility Levels

| Keyword | Scope | Importable externally | Typical use |
| ------- | ----- | --------------------- | ----------- |
| `private` (default) | Current module only | No | helpers, internal records |
| no keyword | Same as `private` | No | default for safety |
| `package` | Same package only | Within package | package internals |
| `public` / `pub` | Public module API | Yes | stable types, contracts |
| `runtime` | Runtime-owned | Only if authorised | runtime hooks, descriptors |

`pub` is a shorthand for `public`. Both are valid:

```galerina
pub fn add(a: Int, b: Int) -> Int { a + b }
public fn add(a: Int, b: Int) -> Int { a + b }
```

### Runtime Visibility

`runtime` is reserved for compiler-generated or runtime-privileged code:

```galerina
runtime fn __runtime_register_module() -> ModuleDescriptor {
    module_descriptor()
}
```

Application code should not normally define `runtime` symbols unless the
package manifest explicitly permits it.

### Public API Safety

A public function must not expose private or package-only types in its
return type or parameters:

```galerina
private type SecretToken = String

pub fn export_token() -> SecretToken { ... }
// SPORE-VIS-003: public function exposes private return type
```

Correct approach — expose a safe wrapper type:

```galerina
public enum TokenStatus { Present, Missing }

pub fn token_status() -> TokenStatus { ... }
```

---

## Export Rules

Visibility is declared directly on the symbol, not in a separate export block.

Preferred:

```galerina
public fn parse() {}
fn tokenize() {}         // private by default
```

Avoid:

```galerina
export { parse }         // not the Galerina model
```

The compiler generates an export map for tooling:

```json
{
  "module": "app/users/service",
  "public": ["get_profile"],
  "package": [],
  "private": ["to_profile"],
  "runtime": []
}
```

---

## Runtime Loading Rules

The runtime loads modules using a compiler-produced module graph, not by
scanning the filesystem. Each module is represented as a descriptor:

```json
{
  "module": "app/users/service",
  "package": "app-users",
  "hash": "sha256:example",
  "visibility": {
    "public": ["get_profile"],
    "package": [],
    "private": ["to_profile"]
  },
  "imports": [
    "app/users/types",
    "app/users/repository",
    "galerina-core-data/database"
  ],
  "effects": ["storage"],
  "capabilities": ["Database"]
}
```

The runtime rejects a module when:

```text
the module hash does not match the compiled graph
the module requests undeclared capabilities
the module imports a denied package
the module exposes symbols not listed by the compiler
the module requires effects not approved by policy
```

---

## Package Manifest Integration

Each package declares its module roots, public entrypoints, and allowed imports:

```json
{
  "name": "app-users",
  "moduleRoot": "app/src/users",
  "modulePrefix": "app/users",
  "publicModules": [
    "app/users/types",
    "app/users/service",
    "app/users/routes"
  ],
  "privateModules": [
    "app/users/repository"
  ],
  "allowedImports": [
    "galerina-core/result",
    "galerina-core-data/database",
    "galerina-core-network/http"
  ]
}
```

The compiler validates:

```text
module path exists
module declaration matches file location
imports are inside allowed package graph
private modules are not imported from outside the package
public modules do not expose private types
```

---

## Import Ordering Convention

Recommended order within a file:

```text
1. Standard Galerina core imports
2. Capability imports
3. External package imports
4. Application package imports
5. Type-only imports (if kept separate by formatter)
```

Example:

```galerina
import { Result } from "galerina-core/result"
import capability { Database } from "galerina-core-data/database"
import capability { HttpClient } from "galerina-core-network/http"
import { UserId, UserProfile } from "app/users/types"
import type { UserRecord } from "app/users/types"
```

The formatter may group and sort imports automatically.

---

## Extended Compiler Error Codes

Module system diagnostics:

```text
SPORE-MODULE-001  module declaration does not match source location
SPORE-MODULE-002  import path escapes package boundary
SPORE-MODULE-003  circular import detected
SPORE-MODULE-004  imported module not found
SPORE-MODULE-005  import not listed in package policy
SPORE-MODULE-006  wildcard symbol import not allowed
SPORE-VIS-001     cannot import private symbol
SPORE-VIS-002     cannot import package-visible symbol from outside package
SPORE-VIS-003     public function exposes private return type
SPORE-VIS-004     public module exports non-public dependency type
SPORE-VIS-005     runtime-only symbol used by application code
SPORE-CAP-001     imported function requires ungranted capability
SPORE-CAP-002     imported module declares denied effect
```

See also the `SPORE-E3xxx` series in the compiler diagnostics for earlier
prototype codes.

---

## Imports and Authority

Importing a module makes its symbols visible. It does not grant authority.

```galerina
import { read_config } from "app/config/reader"

flow boot() -> BootResult
contract {
  types {
    type BootResult = Result<AppConfig, ConfigError>
  }
}
{
    read_config()
}
```

The import only brings `read_config` into scope. It does not grant filesystem
access. The compiler and runtime still verify the capability requirements
declared by the imported function.

```text
Visibility  → controlled by import / public / private / package
Authority   → controlled by capability declarations and runtime policy
```

---

## Future Extensions

```text
Version-scoped imports
Lazy module loading
Optional dependencies
Feature-gated imports
Sandboxed plugin modules
```

These remain future extensions rather than core requirements.
