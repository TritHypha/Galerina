# Legacy Pattern Restrictions

## Definition

Galerina blocks specific legacy patterns that would reintroduce hidden authority, inheritance-style confusion, or uncontrolled runtime behaviour. These restrictions exist to keep the language explicit, auditable, and AI-readable.

## Blocked Patterns

### 1. Inheritance-Style Hierarchy

```galerina
// Blocked
permission Admin extends User
data AdminUser extends User
flow AdminLogin extends Login
```

Use explicit composition instead:

```galerina
permission admin_profile_read {
  code {
    allow db.read table: Profiles
    allow audit.write
  }
}
```

### 2. Legacy Global Mutable State

```galerina
// Blocked
global user_id
global session
```

Use vaults:

```galerina
SessionVault.write(
  key: session_uuid,
  value: { actor_uuid: user.uuid, expires_at: ... }
)
```

### 3. Magic Legacy Imports / Silent Autoloading

Silent autoloading of packages without a governed package resolver is blocked.

All imports must go through the governed Package Resolver.

### 4. Ambiguous Legacy Names

Reserved and disallowed names in normal Galerina source:

```text
class
object
extends
override
super
this
```

These are blocked to avoid confusion with object-oriented inheritance patterns.

### 5. Legacy Dynamic Behaviour

```text
eval
reflection-based dispatch
monkey patching
runtime method replacement
```

All are blocked. Galerina execution must be deterministic and auditable at compile time.

### 6. Legacy Permission Inheritance

A permission must not secretly inherit another permission's effects or scope.

Prefer explicit inclusion:

```galerina
permission admin_profile_read {
  code {
    allow db.read table: Profiles
    allow audit.write
  }
}
```

Not:

```galerina
// Blocked
permission admin_profile_read inherits user_profile_read
```

### 7. Hidden Event Chains

Legacy-style hooks and listeners can create invisible execution paths. All event handling must use typed, declared events with explicit audit requirements.

## Core Principle

```text
Legacy compatibility must not reintroduce hidden authority.
```

Galerina supports clean structural hierarchies but blocks any legacy pattern that creates hidden behaviour, implicit authority, or unaudited execution.
