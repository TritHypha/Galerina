# Polymorphism

## Purpose

Galerina should support polymorphism without making class inheritance the main
object model.

The goal is to allow different implementations, data variants and reusable
generic flows while keeping behaviour visible to the compiler, permission
system, effect system and reports.

## Short Definition

Polymorphism means different implementations or data shapes can be used through
one declared contract, type family or matchable variant.

## Galerina Rule

```text
Galerina supports explicit polymorphism, not hidden polymorphism.
```

Allowed forms:

- contract-based polymorphism
- adapter-based polymorphism
- union and match polymorphism
- constrained generic type polymorphism
- explicit boot-time implementation selection

Disallowed forms:

- inheritance
- inherited permissions
- inherited effects
- inherited responses
- hidden dynamic dispatch
- implicit provider swapping
- unreported plugin behaviour
- runtime mutation of implementation behaviour

See [No Inheritance And Explicit Security](no-inheritance-explicit-security.md).

## Fit With The Core Model

| Core concept | Polymorphism role |
| --- | --- |
| `data` | generic and variant data shapes |
| `flow` | contract-defined behaviour |
| `permission` | required authority for the selected implementation |
| `boundary` | adapter, external, storage, AI/tool or compute boundary |
| `report` | proof of which implementation and effects were used |

## Contract-Based Polymorphism

Contracts are the preferred polymorphism mechanism.

```galerina
contract PaymentProvider {
  flow charge(
    request: PaymentRequest,
    ctx: RequestContext
  ) -> Result<PaymentResponse, PaymentError>
}
```

Different adapters may satisfy the same contract:

```galerina
adapter StripeProvider implements PaymentProvider {
  boundary external StripeApi
  permission use payment_provider_access

  effects {
    allow network.external
    allow audit.write
  }
}
```

```galerina
adapter TestPaymentProvider implements PaymentProvider {
  boundary internal TestPaymentBoundary
  permission use payment_test_access

  effects {
    allow audit.write
    deny network.external
  }
}
```

## Adapter-Based Polymorphism

Adapters are useful when the same application contract can be implemented by
different providers.

Examples:

- `PaymentProvider` implemented by Stripe, PayPal or a test provider
- `EmailSender` implemented by SendGrid, AWS SES or local development output
- `SearchProvider` implemented by local storage or a remote search API
- `ModelRunner` implemented by CPU, GPU, NPU or remote AI provider boundaries

Each adapter must declare its own permissions, effects, boundary and report
requirements.

## Union And Match Polymorphism

Variant data should use explicit union types and exhaustive `match`.

```galerina
type Notification =
  | EmailNotification
  | SmsNotification
  | PushNotification
```

```galerina
match notification {
  EmailNotification(email) => return EmailService.send(email, ctx)
  SmsNotification(sms) => return SmsService.send(sms, ctx)
  PushNotification(push) => return PushService.send(push, ctx)
}
```

Compiler direction:

```text
All variants must be handled unless a safe catch-all policy is declared.
```

## Generic Polymorphism

Galerina should support readable, constrained generics.

Examples:

```galerina
Option<T>
Result<T, E>
List<T>
Repository<T>
```

Generic flows should prefer constraints:

```galerina
flow getById<T: Model>(
  repository: Repository<T>,
  id: UUID
) -> Result<Option<T>, StorageError>
```

Constraints make the generic behaviour easier to check, document and explain.

## Permission-Aware Polymorphism

Polymorphism must not hide security behaviour.

If two implementations satisfy the same contract but have different effects,
Galerina must expose the effective implementation and effect set.

Example:

```galerina
adapter LocalSearch implements SearchProvider {
  effects {
    allow storage.read
    deny network.external
  }
}
```

```galerina
adapter RemoteSearch implements SearchProvider {
  effects {
    allow network.external
    allow audit.write
  }
}
```

The selected implementation must be known from configuration, boot profile,
runtime policy or a reportable selection rule.

## Boot-Time Selection

Implementation selection should be explicit.

```galerina
boot MyApp {
  use PaymentProvider = StripeProvider when env.production
  use PaymentProvider = TestPaymentProvider when env.test
}
```

This allows Galerina to report:

```text
PaymentProvider is StripeProvider in production.
PaymentProvider is TestPaymentProvider in test.
```

## Generated Report

```json
{
  "reportType": "galerina.polymorphism.effective",
  "contract": "PaymentProvider",
  "selectedImplementation": "StripeProvider",
  "environment": "production",
  "boundary": "StripeApi",
  "permission": "payment_provider_access",
  "effects": {
    "allow": ["network.external", "audit.write"],
    "deny": ["file.write", "secret.output"]
  },
  "safe": true
}
```

## Core Rule

```text
Different implementations are allowed only when they satisfy a declared contract
and their permissions, effects, data exposure and boundaries remain visible in reports.
```

Polymorphism must not use inherited authority. Each implementation must declare
its effective permissions, effects, boundaries and report requirements.
