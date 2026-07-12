# Galerina Compiler Effect Checker and Boundary Checker

Status: Draft v0.1 design document  
Package: `galerina-core-compiler`  
Purpose: Define how Galerina validates effects, capabilities, package boundaries and runtime safety before code is allowed to run.

---

## 1. Why This Exists

Galerina is governance-first. That means the compiler must understand more than syntax and types.

The compiler must also answer:

```text
What can this code do?
What authority does it require?
What package boundary does it cross?
What data boundary does it cross?
What runtime effects can happen?
Can this code be safely loaded by the runtime?
Can the decision be explained later?
```

The effect checker and boundary checker are two of the most important parts of the Galerina compiler because they turn code into governed execution.

They help prevent:

```text
hidden network access
hidden filesystem access
secret leakage
private API exposure
unsafe package imports
undeclared runtime behaviour
silent authority escalation
unsafe deployment
```

---

## 2. High-Level Roles

| Checker | Main Question | Example |
|---|---|---|
| Effect checker | What observable actions can this code perform? | network, storage, filesystem, scheduler |
| Boundary checker | Is this code allowed to cross this package/data/security boundary? | private imports, secret exposure, package escape |

They work together.

Example:

```galerina
pub fn load_profile(http: HttpClient, id: UserId)
    -> Result<UserProfile, NetworkError>
    effect network
{
    return http.get("/users/" + id)
}
```

The effect checker verifies that `http.get` requires the `network` effect and that the function declares it.

The boundary checker verifies that `HttpClient`, `UserId`, `UserProfile` and `NetworkError` are visible, importable and not leaking private data.

---

## 3. Compiler Pipeline Placement

Recommended compiler pass order:

```text
1. lex source
2. parse source
3. build AST
4. resolve modules and imports
5. resolve symbols
6. check types
7. check visibility
8. run effect checker
9. run boundary checker
10. resolve capabilities
11. generate module graph
12. generate runtime manifest
13. generate reports and diagnostics
14. emit executable target or intermediate output
```

Why after type checking?

```text
Effects and boundaries depend on knowing what each symbol means.
The compiler must know whether a call is a pure helper, storage call, network call or runtime intrinsic.
```

---

## 4. Core Terms

| Term | Meaning |
|---|---|
| Effect | An observable action or runtime-sensitive operation |
| Capability | Explicit authority object required to perform an effect |
| Boundary | Package, module, data, runtime or security limit |
| Manifest | Compiler-generated runtime description of modules, effects and capabilities |
| Policy | Rules that allow or deny effects, capabilities and imports |
| Audit metadata | Structured evidence emitted by compiler/runtime |

---

# Part A: Effect Checker

---

## 5. Effect Checker Purpose

The effect checker ensures that every effectful operation is declared, propagated and approved before runtime execution.

Galerina should not allow code to perform dangerous or externally visible operations silently.

Effectful operations include:

```text
network requests
file reads/writes
database reads/writes
secret access
process execution
timers
scheduled tasks
runtime triggers
cryptographic signing
accelerator use
optical I/O planning
```

---

## 6. Recommended Core Effects

| Effect | Meaning | Example |
|---|---|---|
| `network` | Sends or receives network traffic | HTTP request, socket access |
| `storage` | Reads or writes durable storage | database query |
| `filesystem` | Reads or writes files | config file read |
| `secret` | Reads protected secrets | API key access |
| `process` | Starts or controls processes | shell command |
| `timer` | Uses time-based waiting | timeout, delay |
| `scheduler` | Registers future work | scheduled action |
| `trigger` | Responds to runtime event | event listener |
| `crypto` | Performs sensitive cryptographic action | signing, verification |
| `accelerator` | Uses GPU or AI accelerator | tensor operation |
| `optical_io` | Uses future optical transport planning | optical interconnect planning |
| `audit` | Writes audit evidence | runtime audit record |

Not every effect needs to be implemented in v0.1, but the checker should be designed so new effects can be added without redesigning the language.

---

## 7. Effect Syntax

Recommended syntax:

```galerina
fn name(args) -> ReturnType effect effect_name {
    ...
}
```

Multiple effects:

```galerina
fn name(args) -> ReturnType effect network, storage {
    ...
}
```

No effect means pure or locally bounded code:

```galerina
fn add(a: Int, b: Int) -> Int {
    return a + b
}
```

---

## 8. Example: Pure Function

```galerina
pub fn normalise_name(name: Text) -> Text {
    return name.trim().lowercase()
}
```

Compiler result:

```json
{
  "function": "normalise_name",
  "effects": [],
  "pure": true
}
```

---

## 9. Example: Network Effect

```galerina
import capability { HttpClient } from "galerina-core-network/http"

pub fn fetch_profile(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> effect network {
    return http.get("/users/" + id)
}
```

Compiler result:

```json
{
  "function": "fetch_profile",
  "effects": ["network"],
  "capabilities": ["HttpClient"]
}
```

---

## 10. Example: Missing Effect

Bad:

```galerina
pub fn fetch_profile(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> {
    return http.get("/users/" + id)
}
```

Compiler diagnostic:

```text
FUNGI-EFFECT-001: undeclared effect
function: fetch_profile
operation: HttpClient.get
required effect: network
help: add `effect network` to the function declaration
```

---

## 11. Example: Storage Effect

```galerina
import capability { Database } from "galerina-core-data/database"

pub fn find_user(
    db: Database,
    id: UserId
) -> Result<UserProfile, UserError> effect storage {
    return db.find_one("users", { id: id })
}
```

The checker sees `db.find_one` and verifies that the function declares `storage`.

---

## 12. Effect Propagation

If a function calls another effectful function, the caller must declare the same effect unless it handles the effect through an approved boundary.

```galerina
pub fn get_user_page(
    db: Database,
    id: UserId
) -> Result<UserPage, UserError> effect storage {
    let profile = find_user(db, id)
    return render_user_page(profile)
}
```

Because `find_user` has `effect storage`, `get_user_page` must also have `effect storage`.

---

## 13. Missing Propagated Effect

Bad:

```galerina
pub fn get_user_page(
    db: Database,
    id: UserId
) -> Result<UserPage, UserError> {
    let profile = find_user(db, id)
    return render_user_page(profile)
}
```

Diagnostic:

```text
FUNGI-EFFECT-002: missing propagated effect
function: get_user_page
called function: find_user
required effect: storage
```

---

## 14. Effect Narrowing

A public API may expose a narrower effect surface than its internals only if the compiler can prove that the effect does not escape.

For v0.1, avoid complex effect narrowing.

Recommended v0.1 rule:

```text
If a function calls effectful code, it declares that effect.
```

Later versions may support effect handlers.

---

## 15. Effect Denial by Policy

Even if source code declares an effect correctly, runtime policy may deny it.

Example source:

```galerina
pub fn debug_ping(http: HttpClient) -> Result<PingResult, NetworkError> effect network {
    return http.get("https://debug.example.test/ping")
}
```

Production policy:

```json
{
  "denyEffects": ["network"],
  "denyModules": ["app/debug/*"]
}
```

Deployment diagnostic:

```text
FUNGI-POLICY-001: effect denied by deployment policy
module: app/debug/ping
function: debug_ping
effect: network
profile: production
```

---

## 16. Capability and Effect Relationship

Effects describe what happens.

Capabilities describe who has authority to do it.

Example:

```galerina
fn read_config(fs: FileSystem) -> Result<Config, FileError> effect filesystem {
    return fs.read_json("config/app.json")
}
```

Here:

```text
Effect: filesystem
Capability: FileSystem
```

The effect checker confirms the effect is declared.
The capability resolver confirms a `FileSystem` authority is required.
The runtime decides whether that authority is granted.

---

## 17. Effect Checker Algorithm

Simplified algorithm:

```text
For each function:
  collect declared effects
  walk function body
  for each call or operation:
    resolve operation symbol
    read operation required effects
    add required effects to observed effect set
  compare observed effects against declared effects
  if observed is not subset of declared:
    emit diagnostic
  write effect metadata to module graph
```

Pseudo-code:

```text
check_effects(function):
    declared = function.effects
    observed = empty_set

    for node in function.body:
        if node is call:
            target = resolve(node)
            observed.add_all(target.effects)

        if node is runtime_intrinsic:
            observed.add_all(node.required_effects)

    missing = observed - declared

    if missing is not empty:
        error(FUNGI-EFFECT-001, missing)

    return EffectSummary(declared, observed)
```

---

## 18. Effect Checker Output

Example output in compiler report:

```json
{
  "module": "app/users/service",
  "functions": [
    {
      "name": "get_profile",
      "declaredEffects": ["storage"],
      "observedEffects": ["storage"],
      "status": "ok"
    }
  ]
}
```

---

# Part B: Boundary Checker

---

## 19. Boundary Checker Purpose

The boundary checker ensures code cannot cross security, package, module or data boundaries without explicit permission.

It protects:

```text
private module internals
package-only APIs
runtime-only APIs
secret-bearing data
deny-by-default routes
unsafe imports
core runtime files
configuration files
environment data
```

---

## 20. Boundary Types

| Boundary | Meaning | Example Violation |
|---|---|---|
| Module boundary | Private symbols stay inside module | importing `private fn` |
| Package boundary | Package internals stay inside package | importing `package fn` externally |
| Runtime boundary | Runtime-only APIs cannot be called by app code | calling `runtime fn` |
| Secret boundary | Secret data cannot be exposed publicly | returning `SecretToken` |
| Filesystem boundary | Imports cannot escape source root | importing `../../.env` |
| Network/API boundary | Routes expose only declared schemas | leaking internal record |
| Capability boundary | Authority cannot be created freely | constructing `Database` manually |

---

## 21. Visibility Boundary Example

`app/users/service.fungi`:

```galerina
module app/users/service

private fn to_profile(record: UserRecord) -> UserProfile {
    return {
        id: record.id,
        display_name: record.display_name
    }
}

pub fn get_profile(db: Database, id: UserId)
    -> Result<UserProfile, UserError>
    effect storage
{
    let record = find_user_record(db, id)
    return Ok(to_profile(record))
}
```

External module:

```galerina
import { to_profile } from "app/users/service"
```

Diagnostic:

```text
FUNGI-BOUNDARY-001: cannot import private symbol
symbol: to_profile
module: app/users/service
visibility: private
```

---

## 22. Package Boundary Example

`app/users/types.fungi`:

```galerina
package type UserRecord = {
    id: UserId,
    display_name: Text,
    password_hash: Text
}
```

Allowed inside same package:

```galerina
module app/users/repository

import type { UserRecord } from "app/users/types"
```

Denied outside package:

```galerina
module app/admin/reporting

import type { UserRecord } from "app/users/types"
```

Diagnostic:

```text
FUNGI-BOUNDARY-002: package-visible symbol imported outside owning package
symbol: UserRecord
owner package: app/users
current package: app/admin
```

---

## 23. Secret Boundary Example

Bad:

```galerina
private type ApiSecret = Text

pub fn get_api_secret() -> ApiSecret effect secret {
    return runtime.secret("PAYMENT_API_KEY")
}
```

Diagnostic:

```text
FUNGI-BOUNDARY-003: public API exposes secret-bearing private type
function: get_api_secret
return type: ApiSecret
```

Better:

```galerina
pub type SecretStatus =
    | Present
    | Missing

pub fn payment_secret_status() -> SecretStatus effect secret {
    if runtime.has_secret("PAYMENT_API_KEY") {
        return SecretStatus.Present
    }

    return SecretStatus.Missing
}
```

---

## 24. Filesystem Boundary Example

Bad import:

```galerina
import { env } from "../../.env"
```

Diagnostic:

```text
FUNGI-BOUNDARY-004: import path escapes package source root
import: ../../.env
```

Galerina imports should resolve through package manifests, not arbitrary filesystem traversal.

---

## 25. Runtime Boundary Example

Runtime-owned function:

```galerina
runtime fn __runtime_register_module() -> ModuleDescriptor {
    return descriptor
}
```

Application code:

```galerina
import { __runtime_register_module } from "galerina-core-runtime/module"

pub fn run() -> ModuleDescriptor {
    return __runtime_register_module()
}
```

Diagnostic:

```text
FUNGI-BOUNDARY-005: runtime-only symbol used by normal application code
symbol: __runtime_register_module
```

---

## 26. Capability Boundary Example

Bad:

```galerina
pub fn make_database() -> Database {
    return Database("postgres://root:password@localhost")
}
```

Diagnostic:

```text
FUNGI-BOUNDARY-006: capability object cannot be constructed by normal code
capability: Database
help: request Database through runtime capability injection
```

Good:

```galerina
pub fn get_profile(db: Database, id: UserId)
    -> Result<UserProfile, UserError>
    effect storage
{
    return find_user(db, id)
}
```

---

## 27. API Boundary Example

Internal record:

```galerina
package type UserRecord = {
    id: UserId,
    email: Text,
    password_hash: Text
}
```

Bad route:

```galerina
pub route GET "/users/{id}" requires [Database] {
    output Result<UserRecord, UserError>

    handle(ctx) effect storage {
        return find_user_record(ctx.db, ctx.params.id)
    }
}
```

Diagnostic:

```text
FUNGI-BOUNDARY-007: public route exposes package-internal type
route: GET /users/{id}
type: UserRecord
field risk: password_hash
```

Good route:

```galerina
pub type UserProfile = {
    id: UserId,
    email: Text
}

pub route GET "/users/{id}" requires [Database] {
    output Result<UserProfile, UserError>

    handle(ctx) effect storage {
        let record = find_user_record(ctx.db, ctx.params.id)
        return Ok(to_profile(record))
    }
}
```

---

## 28. Boundary Checker Algorithm

Simplified algorithm:

```text
For each module:
  read package manifest
  validate module declaration
  validate imports
  validate symbol visibility
  validate public APIs
  validate capability construction
  validate secret-bearing types
  validate runtime-only APIs
  validate route input/output schemas
  emit diagnostics
  write boundary metadata to module graph
```

Pseudo-code:

```text
check_boundaries(module):
    package = resolve_package(module)

    for import in module.imports:
        target = resolve(import.path)

        if target outside allowed package graph:
            error(FUNGI-BOUNDARY-004)

        for symbol in import.symbols:
            visibility = resolve_visibility(symbol)

            if visibility == private and target.module != module:
                error(FUNGI-BOUNDARY-001)

            if visibility == package and target.package != package:
                error(FUNGI-BOUNDARY-002)

            if visibility == runtime and not module.is_runtime_authorized:
                error(FUNGI-BOUNDARY-005)

    for public_symbol in module.public_symbols:
        if exposes_private_type(public_symbol):
            error(FUNGI-BOUNDARY-003)

        if exposes_package_type_outside_package(public_symbol):
            error(FUNGI-BOUNDARY-007)
```

---

## 29. Boundary Checker Output

Example compiler report:

```json
{
  "module": "app/users/routes",
  "boundaryStatus": "ok",
  "imports": [
    {
      "module": "app/users/service",
      "symbols": ["get_profile"],
      "visibility": "public",
      "allowed": true
    }
  ],
  "publicApi": [
    {
      "kind": "route",
      "name": "GET /users/{id}",
      "exposesPrivateTypes": false,
      "exposesSecretFields": false
    }
  ]
}
```

---

# Part C: Effect and Boundary Checker Working Together

---

## 30. Full Example: Correct Module

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
    let record = find_user_record(db, id)
    return Ok(to_profile(record))
}
```

Effect checker result:

```text
get_profile declares storage
find_user_record requires storage
status: ok
```

Boundary checker result:

```text
UserRecord is package-only and used internally
get_profile is public but returns UserProfile
private helper is not exported
status: ok
```

---

## 31. Full Example: Broken Module

```galerina
module app/users/routes

import { UserRecord } from "app/users/types"
import { find_user_record } from "app/users/repository"
import capability { Database } from "galerina-core-data/database"

pub route GET "/users/{id}" requires [Database] {
    output Result<UserRecord, UserError>

    handle(ctx) {
        return find_user_record(ctx.db, ctx.params.id)
    }
}
```

Problems:

```text
UserRecord is package/private data crossing public API boundary
find_user_record requires storage effect
handle does not declare storage
route leaks password_hash
```

Diagnostics:

```text
FUNGI-EFFECT-002: missing propagated effect
route: GET /users/{id}
handler: handle
required effect: storage

FUNGI-BOUNDARY-007: public route exposes package-internal type
route: GET /users/{id}
type: UserRecord
```

---

## 32. Runtime Manifest Example

Compiler-generated manifest:

```json
{
  "module": "app/users/service",
  "package": "app-users",
  "hash": "sha256:module-hash",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "visibility": {
    "public": ["get_profile"],
    "private": ["to_profile"],
    "package": []
  },
  "boundary": {
    "status": "ok",
    "publicApiSafe": true,
    "secretLeakage": false,
    "packageEscape": false
  }
}
```

The runtime uses this manifest to decide whether the module can be loaded and executed.

---

## 33. Runtime Denial Example

If production policy denies storage:

```json
{
  "profile": "production-readonly",
  "denyEffects": ["storage"]
}
```

Runtime response:

```text
Runtime denied execution.
module: app/users/service
function: get_profile
effect: storage
reason: effect denied by runtime policy
```

---

## 34. Suggested Diagnostics

| Code | Meaning |
|---|---|
| `FUNGI-EFFECT-001` | Function performs undeclared effect |
| `FUNGI-EFFECT-002` | Caller missing propagated callee effect |
| `FUNGI-EFFECT-003` | Effect not allowed in current package policy |
| `FUNGI-EFFECT-004` | Runtime intrinsic requires undeclared effect |
| `FUNGI-EFFECT-005` | Effect declared but capability missing |
| `FUNGI-BOUNDARY-001` | Private symbol imported outside module |
| `FUNGI-BOUNDARY-002` | Package symbol imported outside package |
| `FUNGI-BOUNDARY-003` | Public API exposes private or secret-bearing type |
| `FUNGI-BOUNDARY-004` | Import path escapes package source root |
| `FUNGI-BOUNDARY-005` | Runtime-only symbol used by normal code |
| `FUNGI-BOUNDARY-006` | Capability object constructed directly |
| `FUNGI-BOUNDARY-007` | Public route exposes package-internal type |
| `FUNGI-BOUNDARY-008` | Public API exposes denied dependency |
| `FUNGI-BOUNDARY-009` | Module declaration does not match package manifest |

---

## 35. Required Test Cases

### 35.1 Effect checker tests

```text
pure function has no effects
network call requires network effect
storage call requires storage effect
caller inherits callee effects
multiple effects are collected
undeclared effect fails
policy-denied effect fails deployment validation
capability missing for declared effect fails
```

### 35.2 Boundary checker tests

```text
private symbol cannot be imported
package symbol cannot be imported outside package
runtime symbol cannot be called by app code
public API cannot expose private type
public route cannot expose internal record
import path cannot escape package root
capability cannot be constructed directly
module declaration must match package manifest
```

---

## 36. Implementation Checklist

For `galerina-core-compiler`:

```text
- define effect enum/registry
- attach required effects to core runtime intrinsics
- attach required effects to capability methods
- collect declared effects from functions/routes/actions
- walk AST and collect observed effects
- compare declared vs observed effects
- emit diagnostics with source spans
- resolve package manifests
- resolve module ownership
- enforce visibility rules
- enforce public API type safety
- enforce route schema boundaries
- enforce capability construction rules
- generate effect report
- generate boundary report
- generate runtime manifest fields
```

---

## 37. v0.1 Recommended Scope

Implement first:

```text
network
storage
filesystem
secret
scheduler
trigger
runtime-only
private/public/package visibility
public API type exposure checks
capability construction denial
manifest output
```

Defer:

```text
advanced effect handlers
effect narrowing
formal proof engine
photonic runtime enforcement
GPU runtime enforcement
Omni logic integration
```

---

## 38. Final Rule

Galerina source code should not be considered safe because it compiles syntactically.

It should only be considered runnable when:

```text
types are valid
effects are declared
capabilities are explicit
boundaries are respected
package policy allows imports
runtime policy allows execution
manifest output is complete
audit metadata can explain the decision
```

This is the purpose of the effect checker and boundary checker.
