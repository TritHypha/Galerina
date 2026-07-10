# Galerina Module System and Visibility

Status: Draft v0.1 documentation  
Scope: Core package, compiler, runtime and package documentation  
Applies to: `galerina-core`, package manifests, runtime loading, import resolution and audit reports

---

## 1. Purpose

Galerina needs a module system that is simple enough for humans and AI tools to understand, but strict enough for secure runtime execution.

The module system should answer these questions before code runs:

- Where does this name come from?
- Which package owns this code?
- What is allowed to be imported?
- What is public API and what is internal implementation?
- What permissions, effects or capabilities can imported code introduce?
- Can the runtime safely load this module?
- Can audit tooling explain the dependency path?

Galerina should not use a loose import model where files can reach across the project freely. Imports are part of governance.

The module system should support:

```text
explicit imports
package-owned modules
public/private visibility
deny-by-default access
stable API surfaces
compile-time resolution
runtime authority checking
machine-readable dependency reports
AI-readable project structure
```

---

## 2. Design Principles

### 2.1 Imports must be explicit

Galerina should not allow hidden globals, wildcard project access or automatic imports from arbitrary files.

A file should only use names that are:

1. declared in the same file,
2. imported explicitly,
3. provided by a controlled prelude, or
4. injected by an approved runtime capability.

Example:

```galerina
import { UserId, UserProfile } from "app/users/types"
import { find_user } from "app/users/repository"

fn get_profile(id: UserId) -> Result<UserProfile, UserError> {
    return find_user(id)
}
```

Bad example:

```galerina
fn get_profile(id: UserId) -> Result<UserProfile, UserError> {
    // Not allowed: find_user appears without a local declaration or import.
    return find_user(id)
}
```

### 2.2 Modules belong to packages

A module should be resolved through package ownership, not just a raw filesystem path.

This means the compiler and runtime should know:

```text
package -> module -> exported symbols -> required capabilities -> runtime policy
```

Example package layout:

```text
packages-galerina/
  galerina-core/
    src/
      string.fungi
      result.fungi
      module.fungi

app/
  src/
    users/
      types.fungi
      repository.fungi
      service.fungi
```

Example import:

```galerina
import { Result } from "galerina-core/result"
import { UserId } from "app/users/types"
```

### 2.3 Public API must be intentional

Nothing should become public because it exists in a file.

A symbol should be private by default unless declared as public.

```galerina
pub type UserId = Text

private type UserRecord = {
    id: UserId,
    password_hash: Text
}
```

If no visibility is written, Galerina should treat the symbol as private by default.

```galerina
type UserRecord = {
    id: UserId,
    password_hash: Text
}
```

The above should be equivalent to:

```galerina
private type UserRecord = {
    id: UserId,
    password_hash: Text
}
```

### 2.4 Imports must not bypass authority

Importing a module must not automatically grant authority to access files, environment variables, network routes, secrets, timers, schedulers, databases or system calls.

Example:

```galerina
import { read_config } from "app/config/reader"

fn boot() -> Result<AppConfig, ConfigError> {
    return read_config()
}
```

The import only makes `read_config` visible. It does not grant filesystem access by itself.

The compiler/runtime must still check the capability requirements declared by the imported function or module.

---

## 3. Proposed Syntax

### 3.1 Named imports

Named imports should be the default import style.

```galerina
import { UserId, UserProfile } from "app/users/types"
import { find_user } from "app/users/repository"
```

This is AI-readable and audit-friendly because every imported name is visible at the top of the file.

### 3.2 Aliased imports

Aliases should be allowed when they improve clarity or avoid collisions.

```galerina
import { UserId as AccountUserId } from "app/accounts/types"
import { UserId as AdminUserId } from "app/admin/types"
```

Use aliases for name conflicts, not for hiding meaning.

Good:

```galerina
import { Token as SessionToken } from "app/session/types"
```

Bad:

```galerina
import { Token as T } from "app/session/types"
```

### 3.3 Module namespace imports

Namespace imports should be allowed for modules with several related functions.

```galerina
import * as Users from "app/users/service"

fn run(id: Users.UserId) -> Result<Users.UserProfile, Users.UserError> {
    return Users.get_profile(id)
}
```

This should be used carefully because named imports are easier to audit.

Recommended rule:

```text
Named imports are preferred.
Namespace imports are allowed for cohesive modules.
Wildcard symbol imports are disallowed.
```

### 3.4 Disallowed wildcard symbol imports

Galerina should not support imports that dump every exported symbol into local scope.

Bad:

```galerina
import * from "app/users/service"
```

Reason:

```text
- hides where names came from
- increases AI misunderstanding risk
- makes audit reports weaker
- can create accidental symbol collisions
- makes refactoring less safe
```

### 3.5 Importing types only

Galerina may support type-only imports so the compiler and runtime can separate type dependencies from runtime dependencies.

```galerina
import type { UserId, UserProfile } from "app/users/types"
import { find_user } from "app/users/repository"
```

This helps runtime planning because importing a type should not require loading executable code.

### 3.6 Importing capabilities or contracts

Capability imports should be explicit and separate from normal value imports.

```galerina
import capability { HttpClient } from "galerina-core-network/http"
import { fetch_profile } from "app/users/remote-profile"
```

The import makes the capability type visible, but the runtime still controls whether an instance is granted.

Example:

```galerina
fn load_remote_profile(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> effect network {
    return fetch_profile(http, id)
}
```

---

## 4. Module Declaration

A file may declare its module name explicitly.

```galerina
module app/users/service

import { UserId, UserProfile } from "app/users/types"
import { find_user } from "app/users/repository"

pub fn get_profile(id: UserId) -> Result<UserProfile, UserError> {
    return find_user(id)
}
```

The declared module name must match the package manifest and source location.

Example:

```text
File path:
app/src/users/service.fungi

Declared module:
module app/users/service
```

If the declaration and path disagree, the compiler should fail.

Bad:

```galerina
// File: app/src/users/service.fungi
module app/payments/service
```

Compiler diagnostic:

```text
FUNGI-MODULE-001: module declaration does not match source location
file: app/src/users/service.fungi
found: app/payments/service
expected: app/users/service
```

---

## 5. Visibility Model

### 5.1 Default visibility

Galerina should be private by default.

```galerina
fn hash_password(password: Text) -> PasswordHash {
    return secure_hash(password)
}
```

Equivalent to:

```galerina
private fn hash_password(password: Text) -> PasswordHash {
    return secure_hash(password)
}
```

This reduces accidental API exposure.

### 5.2 Public symbols

Use `pub` to expose a symbol from a module.

```galerina
pub type UserId = Text

pub type UserProfile = {
    id: UserId,
    display_name: Text
}

pub fn get_profile(id: UserId) -> Result<UserProfile, UserError> {
    return find_user(id)
}
```

Only `pub` symbols can be imported from another module.

### 5.3 Private symbols

Private symbols can only be used inside the declaring module.

```galerina
private type UserRecord = {
    id: UserId,
    display_name: Text,
    password_hash: Text
}

private fn to_profile(record: UserRecord) -> UserProfile {
    return {
        id: record.id,
        display_name: record.display_name
    }
}
```

External module:

```galerina
import { UserRecord } from "app/users/repository"
```

Compiler diagnostic:

```text
FUNGI-VIS-001: cannot import private symbol
symbol: UserRecord
module: app/users/repository
```

### 5.4 Package-only visibility

Galerina may also support package-scoped visibility for symbols that can be shared inside one package but not outside it.

```galerina
package fn load_user_record(id: UserId) -> Result<UserRecord, UserError> {
    return database_find_user(id)
}
```

Meaning:

```text
same module: allowed
same package: allowed
outside package: denied
```

This is useful for package internals without making everything public.

### 5.5 Runtime-only visibility

Some functions may be callable only by the runtime, not by application code.

```galerina
runtime fn __runtime_register_module() -> ModuleDescriptor {
    return module_descriptor()
}
```

This should be reserved for compiler/runtime generated or privileged package code.

Application code should not normally define `runtime` symbols unless the package manifest allows it.

---

## 6. Recommended Visibility Keywords

| Keyword | Meaning | Importable by other modules | Importable outside package | Typical use |
|---|---|---:|---:|---|
| `private` | Current module only | No | No | helpers, internal records, implementation details |
| no keyword | Same as `private` | No | No | default for safety |
| `package` | Same package only | Yes, inside package | No | package internals, shared implementation |
| `pub` | Public module API | Yes | Yes | stable types, functions, contracts |
| `runtime` | Runtime-owned access | No, unless authorised | No, unless authorised | runtime hooks, generated descriptors |

Recommended v1 baseline:

```text
private by default
pub for public API
package optional but useful
runtime reserved for compiler/runtime integration
```

---

## 7. Export Rules

Galerina should not need a separate export block for most files. Visibility should be declared directly on the symbol.

Good:

```galerina
pub type UserId = Text
pub fn get_user(id: UserId) -> Result<UserProfile, UserError> { ... }
private fn to_profile(record: UserRecord) -> UserProfile { ... }
```

Avoid:

```galerina
export { UserId, get_user }
```

Reason:

```text
- duplicate source of truth
- easier to forget updates
- harder for AI tools to reason over
- visibility should be close to declaration
```

However, the compiler may generate an export map for tooling:

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

## 8. Example: User Module Package

### 8.1 File structure

```text
app/src/users/
  types.fungi
  repository.fungi
  service.fungi
  routes.fungi
```

### 8.2 `types.fungi`

```galerina
module app/users/types

pub type UserId = Text

pub type UserProfile = {
    id: UserId,
    display_name: Text
}

package type UserRecord = {
    id: UserId,
    display_name: Text,
    password_hash: Text
}

pub type UserError =
    | NotFound
    | StorageDenied
    | InvalidUserId
```

Notes:

```text
UserId and UserProfile are public.
UserRecord is package-only because routes should not expose password hashes.
UserError is public because API callers may need to handle it.
```

### 8.3 `repository.fungi`

```galerina
module app/users/repository

import { UserId, UserError } from "app/users/types"
import type { UserRecord } from "app/users/types"
import capability { Database } from "galerina-core-data/database"

package fn find_user_record(
    db: Database,
    id: UserId
) -> Result<UserRecord, UserError> effect storage {
    let record = db.find_one("users", { id: id })

    if record is Missing {
        return Error(UserError.NotFound)
    }

    return Ok(record)
}
```

Notes:

```text
find_user_record is package-visible.
It is not public because it returns UserRecord.
The storage effect is explicit.
Importing Database does not grant a database connection.
```

### 8.4 `service.fungi`

```galerina
module app/users/service

import { UserId, UserProfile, UserError } from "app/users/types"
import type { UserRecord } from "app/users/types"
import { find_user_record } from "app/users/repository"
import capability { Database } from "galerina-core-data/database"

private fn to_profile(record: UserRecord) -> UserProfile {
    return {
        id: record.id,
        display_name: record.display_name
    }
}

pub fn get_profile(
    db: Database,
    id: UserId
) -> Result<UserProfile, UserError> effect storage {
    let record_result = find_user_record(db, id)

    if record_result is Error {
        return record_result
    }

    return Ok(to_profile(record_result.value))
}
```

Notes:

```text
to_profile is private.
get_profile is public.
The public function returns safe data only.
The storage effect remains visible to the compiler and runtime.
```

### 8.5 `routes.fungi`

```galerina
module app/users/routes

import { UserId, UserProfile, UserError } from "app/users/types"
import { get_profile } from "app/users/service"
import capability { Database } from "galerina-core-data/database"
import capability { HttpRoute } from "galerina-core-network/http"

pub route GET "/users/{id}" requires [HttpRoute, Database] {
    input {
        id: UserId
    }

    output Result<UserProfile, UserError>

    handle(ctx) effect network, storage {
        return get_profile(ctx.db, ctx.params.id)
    }
}
```

Notes:

```text
The route imports only the public service function.
The route declares its required capabilities.
The runtime can deny the route if Database or HttpRoute is not granted.
```

---

## 9. Example: Invalid Visibility Access

### 9.1 Private helper leak

```galerina
module app/users/routes

import { to_profile } from "app/users/service"
```

Compiler error:

```text
FUNGI-VIS-001: cannot import private symbol
symbol: to_profile
module: app/users/service
```

### 9.2 Package-only symbol used outside package

```galerina
module app/admin/reporting

import { UserRecord } from "app/users/types"
```

Compiler error:

```text
FUNGI-VIS-002: cannot import package-visible symbol from outside owning package
symbol: UserRecord
from package: app/users
current package: app/admin
```

### 9.3 Import path not declared in package manifest

```galerina
import { read_secret } from "../../.env"
```

Compiler error:

```text
FUNGI-MODULE-002: import path is outside package boundary
import: ../../.env
```

---

## 10. Package Manifest Integration

Each package should declare its module roots and public entrypoints.

Example `galerina.package.json`:

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

The compiler should validate:

```text
- module path exists
- module declaration matches file location
- imports are inside allowed package graph
- private modules are not imported from outside the package
- public modules do not expose private types
- public functions do not leak package-only records unless allowed
```

---

## 11. Public API Safety Rules

A public function must not expose private or package-only types in a way that breaks module boundaries.

Bad:

```galerina
private type SecretToken = Text

pub fn get_token() -> SecretToken {
    return load_secret_token()
}
```

Compiler error:

```text
FUNGI-VIS-003: public function exposes private return type
function: get_token
private type: SecretToken
```

Good:

```galerina
private type SecretToken = Text

pub type TokenStatus =
    | Present
    | Missing

pub fn token_status() -> TokenStatus {
    if has_secret_token() {
        return TokenStatus.Present
    }

    return TokenStatus.Missing
}
```

---

## 12. Runtime Loading Rules

The runtime should load modules using a compiler-produced module graph, not by scanning the filesystem freely.

Runtime loading should receive:

```text
module id
package id
content hash
public symbols
required capabilities
declared effects
allowed target backends
source map reference
audit policy reference
```

Example generated module descriptor:

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

The runtime should reject a module when:

```text
- the module hash does not match the compiled graph
- the module requests undeclared capabilities
- the module imports a denied package
- the module exposes symbols not listed by the compiler
- the module requires effects not approved by policy
```

---

## 13. Circular Imports

Circular imports should be denied by default.

Bad:

```text
app/users/service -> app/users/routes
app/users/routes  -> app/users/service
```

Compiler error:

```text
FUNGI-MODULE-003: circular import detected
cycle:
app/users/service -> app/users/routes -> app/users/service
```

Allowed alternative:

```text
app/users/types      shared public types
app/users/repository storage implementation
app/users/service    business logic
app/users/routes     HTTP boundary
```

This creates a one-way dependency flow:

```text
types -> repository -> service -> routes
```

More accurately:

```text
repository imports types
service imports types and repository
routes imports types and service
```

---

## 14. Import Ordering Convention

Recommended import order:

```text
1. standard Galerina core imports
2. capability imports
3. external package imports
4. application package imports
5. type-only imports, if kept separate by formatter
```

Example:

```galerina
import { Result } from "galerina-core/result"
import capability { Database } from "galerina-core-data/database"
import { AuditEvent } from "galerina-audit/event"
import { UserId, UserProfile } from "app/users/types"
import type { UserRecord } from "app/users/types"
```

The formatter may group and sort imports automatically.

---

## 15. Suggested Compiler Diagnostics

| Code | Meaning |
|---|---|
| `FUNGI-MODULE-001` | Module declaration does not match source location |
| `FUNGI-MODULE-002` | Import path escapes package boundary |
| `FUNGI-MODULE-003` | Circular import detected |
| `FUNGI-MODULE-004` | Imported module not found |
| `FUNGI-MODULE-005` | Import is not listed in package policy |
| `FUNGI-MODULE-006` | Wildcard symbol import is not allowed |
| `FUNGI-VIS-001` | Cannot import private symbol |
| `FUNGI-VIS-002` | Cannot import package-visible symbol from outside package |
| `FUNGI-VIS-003` | Public symbol exposes private type |
| `FUNGI-VIS-004` | Public module exports non-public dependency type |
| `FUNGI-VIS-005` | Runtime-only symbol used by normal code |
| `FUNGI-CAP-001` | Imported function requires ungranted capability |
| `FUNGI-CAP-002` | Imported module declares denied effect |

---

## 16. AI Tooling Requirements

The module system should be designed so AI tools can safely reason over a project without guessing.

AI tooling should be able to read:

```text
module declaration
explicit imports
visibility keywords
capability requirements
effect declarations
package manifest
compiler module graph
```

AI tooling should not need to infer hidden globals, implicit exports or filesystem hacks.

Recommended generated report:

```json
{
  "module": "app/users/routes",
  "imports": [
    {
      "module": "app/users/types",
      "symbols": ["UserId", "UserProfile", "UserError"],
      "typeOnly": false
    },
    {
      "module": "app/users/service",
      "symbols": ["get_profile"],
      "typeOnly": false
    }
  ],
  "publicApi": ["GET /users/{id}"],
  "effects": ["network", "storage"],
  "capabilities": ["HttpRoute", "Database"]
}
```

---

## 17. Core Package Documentation Checklist

The core package docs should define:

```text
- module declaration syntax
- import syntax
- type-only import syntax
- capability import syntax
- visibility keywords
- package manifest fields
- compiler diagnostics
- generated module graph format
- runtime loading contract
- audit report expectations
```

The runtime docs should define:

```text
- how compiled module graphs are loaded
- how capability checks are applied
- how denied imports fail
- how source maps connect runtime errors to modules
- how module hashes are verified
- how public/private visibility appears in audit output
```

---

## 18. Recommended v0.1 Decision

For the first stable Galerina module-system baseline:

```text
1. Use explicit named imports.
2. Allow aliases.
3. Allow namespace imports only with `import * as Name`.
4. Disallow wildcard symbol imports.
5. Make all declarations private by default.
6. Use `pub` for public API.
7. Add `package` visibility for package internals.
8. Reserve `runtime` visibility for compiler/runtime integration.
9. Require module declarations to match source location.
10. Resolve modules through package manifests, not raw filesystem access.
11. Treat imports as visibility only, not authority grants.
12. Require runtime capability/effect checks before execution.
```

This gives Galerina a simple but secure foundation:

```text
clear source ownership
explicit dependency graph
minimal accidental exposure
safe package boundaries
runtime-governed loading
AI-readable project structure
audit-friendly execution reports
```
