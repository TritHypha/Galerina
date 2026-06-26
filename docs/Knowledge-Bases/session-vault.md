# Session Vault

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

**SessionVault** is the governed vault for storing active session records in Galerina, replacing PHP-style global session bags.

```text
SessionVault =
a governed vault for storing active session records,
linked to an actor, a session UUID, expiry, permissions, audit, and cookie binding.
```

It is not a global session bag. It is a typed, permission-controlled, audited store.

## What It Replaces

Instead of PHP-style mutable global session state:

```php
$_SESSION["user_id"] = 123;
```

Galerina uses:

```galerina
SessionVault.write(
  key: session_uuid,
  value: {
    actor_uuid: user.uuid,
    expires_at: Runtime.now() + Duration.hours(12)
  }
)
```

## Where It Sits in the Flow

```text
Login flow
 -> verify user credentials
 -> create session_uuid
 -> write SessionVault
 -> set secure cookie (cookie holds only session_uuid)

Next request
 -> read session_uuid from cookie
 -> read SessionVault by session_uuid
 -> attach actor to Runtime.Context
 -> continue flow
```

## Vault Declaration

```galerina
vault SessionVault {
  key session_uuid: SessionUUID

  value {
    actor_uuid: ActorUUID
    expires_at: DateTime
    created_at: DateTime
    revoked: Bool
  }

  audit required
}
```

## Permission

```galerina
permission auth_login {
  code {
    allow db.read table: Users
    allow vault.write SessionVault
    allow cookie.write
    allow crypto.random.uuid
    allow crypto.password.verify
  }

  audit required event "auth.login"
}
```

## Login Write

```galerina
let session_uuid = crypto.random.uuid()

SessionVault.write(
  key: session_uuid,
  value: {
    actor_uuid: user.uuid,
    created_at: Runtime.now(),
    expires_at: Runtime.now() + Duration.hours(12),
    revoked: false
  }
)
```

## Request Read and Validation

```galerina
let session = SessionVault.read(
  key: request.cookie("__Host-logicn_session")
)

require session.revoked == false
require session.expires_at > Runtime.now()
```

After validation, the runtime attaches the actor:

```text
context.actor = session.actor_uuid
```

## Cookie Rule

The cookie must contain only:

```text
session_uuid
```

Not user data, not actor details, not permission information.

## Core Principle

```text
Cookie holds the key.
SessionVault holds the authority.
Runtime.Context receives the actor.
```

No global bags. No untyped session state. No hidden session writes.
