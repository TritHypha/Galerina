# Galerina Runtime-Owned Single-Instance Resources

**Status:** Canonical v1 concept — replaces OOP singleton pattern  
**Scope:** `@galerina/core`, `@galerina/core-runtime`, `@galerina/core-compiler` — resource declaration, lifecycle, effects, capabilities  
**Source:** NOTES TO COVER / f (2026-05-26)  
**Related KB:** `runtime-policy-config.md`, `capabilities.md`, `galerina-core-security-secret-reference-model.md`

---

## 1. Decision: No OOP Singletons

Galerina does not use a class system and must not copy the classic object-oriented Singleton pattern.

Classic singleton:
```text
one class · private constructor · static global instance
shared mutable state · hidden access · hard to test · hard to audit
```

**Galerina uses runtime-owned resources instead.**

---

## 2. Core Concept

```text
A resource may have exactly one instance per declared scope.
The Galerina runtime owns its lifecycle.
Code must declare that it uses the resource (uses keyword).
The compiler checks effects, policy, mutability, and lifecycle.
```

Benefits:
```text
no hidden global state · explicit dependencies · auditable lifecycle
safe concurrency · testable via resource overrides · reportable in manifests
```

---

## 3. v1 Syntax

### Readonly runtime resource (preferred default)

```galerina
readonly resource AppConfig
  scope runtime
{
  appName: Text
  region: Text
  supportEmail: EmailAddress
}
```

### Runtime resource with effects

```galerina
resource Database
  scope runtime
  effects [database.read, database.write]
{
  connection from vault "DATABASE_URL"
}
```

### Runtime resource with effects + capability

```galerina
resource Database
  scope runtime
  effects [database.read, database.write]
  requires capability DatabaseAccess
{
  connection from vault "DATABASE_URL"
}
```

### Request-scoped resource

```galerina
resource RequestContext
  scope request
{
  requestId: RequestId
  user: Optional<User>
  startedAt: DateTime
}
```

### Resource with explicit init/shutdown

```galerina
resource Database
  scope runtime
  effects [database.read, database.write]
{
  init {
    connect using vault "DATABASE_URL"
  }

  shutdown {
    close connection
  }
}
```

---

## 4. Using Resources — `uses` Declaration

Code must declare the resources it consumes.

```galerina
guarded flow getUser(id: UserId)
  intent "load user profile"
  uses Database
  effects [database.read]
{
  return Database.users.find(id)
}
```

**Rejected — undeclared resource use:**

```galerina
flow getUser(id: UserId) {
  return Database.users.find(id)   // SPORE-RESOURCE-001
}
```

---

## 5. Resource Scope

### v1 Scopes

| Scope | Meaning |
|---|---|
| `runtime` | One instance for the whole runtime process |
| `request` | One instance per HTTP request |

### Post-v1 Scopes

```text
worker   — one instance per worker
tenant   — one instance per tenant / customer / org
test     — one instance per test case
```

---

## 6. Resource Mutability

| Form | Meaning |
|---|---|
| `readonly resource` | Cannot be mutated through application code — preferred default |
| `resource` | Managed runtime resource; may have internally controlled state |
| `mut resource` | App-visible mutation; discouraged and policy-gated — post-v1 |

---

## 7. Concurrency Modes

Resources must declare their concurrency safety:

```galerina
resource Cache
  scope runtime
  concurrency safe
{ ... }
```

```galerina
resource LegacyNativeLibrary
  scope runtime
  concurrency single_thread
  effects [native.call]
{ ... }
```

| Mode | Meaning |
|---|---|
| `readonly` | Immutable; always safe to share |
| `safe` | Internally synchronized; safe for concurrent access |
| `guarded` | Access serialized by runtime lock |
| `single_thread` | Must only be accessed from one thread; runtime enforces |
| `unsafe` | No runtime concurrency enforcement; caller responsible |

---

## 8. Resource Lifecycle

```text
declared → planned → initializing → ready → failed → shutting_down → closed
```

TypeScript shape:

```ts
export type ResourceLifecycleState =
  | "declared"
  | "planned"
  | "initializing"
  | "ready"
  | "failed"
  | "shutting_down"
  | "closed";

export interface RuntimeResourceInstance<T> {
  id: string;
  name: string;
  scope: ResourceScope;
  state: ResourceLifecycleState;
  value?: T;
  initializedAt?: string;
  closedAt?: string;
}
```

---

## 9. TypeScript Type Shapes

### ResourceDeclaration

```ts
export type ResourceScope =
  | "runtime"
  | "request"
  | "worker"    // post-v1
  | "tenant"    // post-v1
  | "test";     // post-v1

export type ResourceMutability =
  | "readonly"
  | "managed"
  | "mutable";  // discouraged; post-v1

export interface ResourceDeclaration {
  name: string;
  scope: ResourceScope;
  mutability: ResourceMutability;
  effects: string[];
  requiredCapabilities: string[];
  sourceLocation?: SourceLocation;
}
```

### RuntimeResourceRegistry

```ts
export interface RuntimeResourceRegistry {
  register<T>(
    declaration: ResourceDeclaration,
    factory: ResourceFactory<T>,
  ): void;

  get<T>(
    name: string,
    scopeContext: ResourceScopeContext,
  ): Promise<T>;

  shutdownScope(
    scopeContext: ResourceScopeContext,
  ): Promise<void>;
}

export interface ResourceFactory<T> {
  init(context: ResourceInitContext): Promise<T>;
  shutdown?(value: T, context: ResourceShutdownContext): Promise<void>;
}

export interface ResourceScopeContext {
  runtimeId: string;
  requestId?: string;
  workerId?: string;
  tenantId?: string;
  testId?: string;
}
```

Application code does not construct global resources directly — the runtime constructs them through registered factories.

---

## 10. Resource Manifest

Build output must include a resource manifest:

```ts
export interface ResourceManifest {
  schemaVersion: "spore.resource.manifest.v1";
  resources: ResourceManifestEntry[];
}

export interface ResourceManifestEntry {
  name: string;
  scope: ResourceScope;
  mutability: ResourceMutability;
  effects: string[];
  requiredCapabilities: string[];
  usedBy: string[];
}
```

Example:

```json
{
  "schemaVersion": "spore.resource.manifest.v1",
  "resources": [
    {
      "name": "Database",
      "scope": "runtime",
      "mutability": "managed",
      "effects": ["database.read", "database.write"],
      "requiredCapabilities": ["DatabaseAccess"],
      "usedBy": ["getUser", "createOrder"]
    }
  ]
}
```

---

## 11. Resource Report

Runtime emits resource lifecycle evidence:

```json
{
  "schemaVersion": "spore.resource.report.v1",
  "runtimeId": "runtime_001",
  "resources": [
    {
      "name": "Database",
      "scope": "runtime",
      "state": "ready",
      "initializedAt": "2026-05-26T00:00:00.000Z",
      "shutdownAt": null
    }
  ]
}
```

---

## 12. Resource Diagnostic Codes — SPORE-RESOURCE-001..010

| Code | Name | Description |
|---|---|---|
| `SPORE-RESOURCE-001` | `RESOURCE_USED_WITHOUT_DECLARATION` | Resource accessed without `uses` declaration |
| `SPORE-RESOURCE-002` | `RESOURCE_SCOPE_VIOLATION` | Resource used outside its declared scope |
| `SPORE-RESOURCE-003` | `RESOURCE_EFFECT_NOT_DECLARED` | Flow uses a resource that requires an effect not declared by the flow |
| `SPORE-RESOURCE-004` | `RESOURCE_CAPABILITY_MISSING` | Flow lacks the capability required by a resource it uses |
| `SPORE-RESOURCE-005` | `RESOURCE_INITIALIZATION_FAILED` | Resource failed to initialize at startup |
| `SPORE-RESOURCE-006` | `RESOURCE_SHUTDOWN_FAILED` | Resource failed to shut down cleanly |
| `SPORE-RESOURCE-007` | `MUTABLE_RESOURCE_REQUIRES_POLICY` | Mutable runtime resource used without explicit policy approval |
| `SPORE-RESOURCE-008` | `REQUEST_RESOURCE_SCOPE_ESCAPE` | Request-scoped resource reference escaped the request scope |
| `SPORE-RESOURCE-009` | `RESOURCE_OVERRIDE_DENIED_IN_PRODUCTION` | Test resource override used in a production build target |
| `SPORE-RESOURCE-010` | `RESOURCE_CONCURRENCY_UNSAFE_FOR_TARGET` | Resource concurrency mode is unsafe for the selected compute target |

All ten codes have severity `"error"`.

---

## 13. Example Resources

### AppConfig — readonly runtime resource

```galerina
readonly resource AppConfig
  scope runtime
{
  appName: Text
  region: Region
  maxUploadMb: Int
}

flow uploadLimit() -> Int
  uses AppConfig
{
  return AppConfig.maxUploadMb
}
```

### Database — guarded flow usage

```galerina
resource Database
  scope runtime
  effects [database.read, database.write]
  requires capability DatabaseAccess
{
  connection from vault "DATABASE_URL"
}

guarded flow createUser(input: CreateUserRequest)
  intent "create user"
  uses Database
  effects [database.write]
{
  let user = input.validate().sanitize().toUser()
  return Database.users.insert(user)
}
```

### AuditWriter — append-only resource

```galerina
resource AuditWriter
  scope runtime
  effects [audit.write]
{
  output file "build/reports/audit/runtime-audit.jsonl"
}

guarded flow login(input: LoginRequest)
  intent "authenticate user"
  uses AuditWriter
  effects [audit.write, auth.check]
{
  AuditWriter.append("login.attempted")
}
```

### SecretVault — protected secret access

```galerina
resource SecretVault
  scope runtime
  effects [secret.read]
  requires capability SecretAccess
{
  provider vault "production"
}

guarded flow callPaymentProvider(payment: Payment)
  intent "call payment provider"
  uses SecretVault
  effects [secret.read, network.call]
{
  let key = SecretVault.get("STRIPE_API_KEY")
  let header = key.unwrapForApprovedSink(StripeAuthHeaderSink)
  return header
}
```

`SecretVault` returns `ProtectedSecret<T>` values, not raw strings.

### RequestContext — request-scoped resource

```galerina
resource RequestContext
  scope request
{
  requestId: RequestId
  user: Optional<User>
  startedAt: DateTime
}
```

Request-scoped resources must not leak across requests (`SPORE-RESOURCE-008`).

---

## 14. Feature Flags

```galerina
readonly resource FeatureFlags
  scope runtime
{
  newCheckout: Bool
  betaSearch: Bool
}

flow chooseCheckout()
  uses FeatureFlags
{
  if FeatureFlags.newCheckout {
    return NewCheckout
  }
  return OldCheckout
}
```

---

## 15. Testing — Resource Overrides

Test code explicitly overrides resources:

```galerina
test "getUser returns user" {
  use resource Database = FakeDatabase {
    users: [
      User { id: 1, name: "Ada" }
    ]
  }

  let result = getUser(1)
  expect result.name == "Ada"
}
```

Resource overrides are not permitted in production targets (`SPORE-RESOURCE-009`).

---

## 16. Compiler Check Example

```ts
export function checkResourceUse(input: {
  flow: CheckedFlow;
  resource: ResourceDeclaration;
}): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];

  if (!input.flow.usedResources.includes(input.resource.name)) {
    diagnostics.push({
      code: "SPORE-RESOURCE-001",
      name: "RESOURCE_USED_WITHOUT_DECLARATION",
      severity: "error",
      message: `Resource ${input.resource.name} is used but not declared in uses list.`,
    });
  }

  for (const effect of input.resource.effects) {
    if (!input.flow.effects.includes(effect)) {
      diagnostics.push({
        code: "SPORE-RESOURCE-003",
        name: "RESOURCE_EFFECT_NOT_DECLARED",
        severity: "error",
        message: `Resource ${input.resource.name} requires effect ${effect}.`,
      });
    }
  }

  return diagnostics;
}
```

---

## 17. AstNodeKind Additions Required

The following AST node kinds must be added to `@galerina/core`:

```text
resourceDecl          — readonly resource / resource declaration
resourceScopeDecl     — scope runtime / scope request
resourceInitBlock     — init { … }
resourceShutdownBlock — shutdown { … }
usesDecl              — uses ResourceName in flow header
```

---

## 18. v1 Implementation Checklist

```text
[ ] resourceDecl / resourceScopeDecl — add to AstNodeKind in @galerina/core
[ ] usesDecl — add to AstNodeKind (flow header sub-declaration)
[ ] ResourceDeclaration type shape — add to @galerina/core
[ ] ResourceManifest / ResourceManifestEntry — add to @galerina/core
[ ] SPORE-RESOURCE-001..010 — add diagnostic constants to @galerina/core-compiler
[ ] checkResourceUse() stub — add to @galerina/core-compiler
[ ] RuntimeResourceRegistry interface — add to @galerina/core-runtime
[ ] Resource report schema — add to @galerina/core-reports
[ ] Resource examples — AppConfig, Database, AuditWriter, RequestContext
[ ] Test resource override syntax — parser + compiler stub
```

---

## 19. v1 Scope

Implement in v1:
```text
readonly resource · resource
scope runtime · scope request
uses ResourceName
resource manifests
resource diagnostics (SPORE-RESOURCE-001..010)
test overrides
```

Post-v1:
```text
mut resource · tenant scope · worker scope
advanced pooling · resource hot reload
distributed resource placement · resource sharding
thread-affine resources · native handle resources
```

---

## 20. Key Rules

```text
1.  Galerina does not use OOP singletons.
2.  The runtime owns resource lifecycle — not application code.
3.  One resource instance exists per declared scope.
4.  Dependencies must be declared with uses.
5.  Resources declare effects.
6.  Resources declare capabilities.
7.  Resources are readonly by default where possible.
8.  Request-scoped resources must not escape request scope.
9.  Test overrides are explicit and blocked in production.
10. Resource use is auditable and reportable.
```
