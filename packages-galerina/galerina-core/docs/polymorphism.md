# Galerina Polymorphism Direction

## Purpose

This document defines the language-level direction for polymorphism in Galerina.
Framework-specific provider and adapter examples may live in `docs/`, but the
core language rule belongs here.

## Position

Galerina should support explicit polymorphism without making class inheritance the
main model.

Supported direction:

- contracts and interfaces
- adapters that implement contracts
- sealed variants handled by `match`
- constrained generics
- explicit implementation selection through boot/profile policy

Avoid as a core model:

- inheritance chains
- implicit method overriding
- hidden dynamic dispatch
- runtime behaviour mutation
- unreported plugin substitution

## Contract Polymorphism

Contracts define the behaviour that an implementation must satisfy.

```galerina
contract PaymentProvider {
  flow charge(
    request: PaymentRequest,
    ctx: RequestContext
  ) -> Result<PaymentResponse, PaymentError>
}
```

Implementations must explicitly satisfy the contract and declare their own
authority:

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

## Variant Polymorphism

Variant data should be explicit and matchable.

```galerina
type Actor =
  | HumanUser
  | ServiceAccount
  | AiAgent
```

```galerina
match actor {
  HumanUser(user)          => return handleHuman(user)
  ServiceAccount(service)  => return handleService(service)
  AiAgent(agent)           => return handleAgent(agent)
}
```

Production direction:

```text
Variant maps should be exhaustive unless a declared safe fallback (else branch) is used.
```

## Generic Polymorphism

Generics are required for safe reusable types such as:

```text
Option<T>
Result<T, E>
List<T>
Repository<T>
ReadOnly<T>
```

Mature generic APIs should use constraints:

```galerina
flow getById<T: Model>(
  repository: Repository<T>,
  id: UUID
) -> Result<Option<T>, StorageError>
```

## Security Rule

Polymorphism must not hide:

- permissions
- effects
- data exposure
- boundaries
- errors
- audit requirements
- selected implementation

If a polymorphic call can dispatch to different implementations, Galerina must be
able to produce an effective report showing which implementation was selected
and what authority it used.

## Report Direction

Future compiler/runtime reports should include:

```text
polymorphism-effective-report.json
contract-implementation-report.json
generic-constraint-report.json
variant-exhaustiveness-report.json
```

## Practical Rule

```text
Galerina supports explicit polymorphism, not hidden polymorphism.
```
