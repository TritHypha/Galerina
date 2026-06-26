# Governed Capability Modules

## Definition

A **governed capability module** is an external or optional runtime module that provides specific functionality only through declared capabilities, permissions, effects, budgets, and audit rules.

```text
Governed Capability Module =
a module that exposes governed operations
but cannot grant itself authority.
```

This replaces the idea of "extensions" or unrestricted plugins.

## Why Not "Extensions"

The word "extension" implies:

```text
load extra code
gain extra power
hook into runtime
modify runtime behaviour
```

Galerina must prevent modules from self-granting authority. A module provides capability — the runtime grants authority through permissions.

## Examples of Capability Modules

```text
DbModule          -> db.read, db.write
FileModule        -> file.read, file.write, file.list
NetworkModule     -> network.external
CryptoModule      -> crypto.password.verify, crypto.random.uuid
AIModule          -> ai.infer, ai.tool.use
ComputeModule     -> compute.target.gpu, compute.target.tpu
HardwareUsbModule -> hardware.usb.detect, hardware.usb.read
VaultModule       -> vault.read, vault.write
EmailModule       -> email.send
PaymentModule     -> payment.charge
```

## Where It Sits

```text
Certified Package Registry
 -> Package Resolver
 -> Capability Module Verification
 -> Governed IR
 -> Runtime Authority Control
 -> Execution
```

At runtime:

```text
Authority Control
 -> Capability Module
 -> Host system / hardware / external service
```

## Module Declaration Example

```galerina
module EmailModule {
  capability email.send

  effects {
    network.external
  }

  audit required
}
```

## Permission and Flow Example

Permission grants use of the module capability:

```galerina
permission send_welcome_email {
  code {
    allow email.send
  }

  audit required event "email.welcome.send"
}
```

Flow uses the permission and calls the module:

```galerina
flow sendWelcomeEmail(
  request: WelcomeEmail.send
) -> Result<WelcomeEmail.response, ApiError>
  permission use send_welcome_email
{
  EmailModule.send(
    to: request.email,
    template: "welcome"
  )

  return Ok(WelcomeEmail.response {
    status: "sent"
  })
}
```

## Rules

```text
1. Modules declare capabilities.
2. Permissions allow capabilities.
3. Runtime enforces authority.
4. Modules cannot bypass Authority Control.
5. Module effects must be declared.
6. Module calls are audited.
7. Modules are loaded only through the Package Resolver.
8. Dangerous modules require stricter runtime profiles.
```

## Core Principle

```text
Installed does not mean allowed.
Loaded does not mean trusted.
Capability still requires permission.
```

```text
Galerina modules provide capability.
Permissions grant use.
Runtime governs execution.
```
