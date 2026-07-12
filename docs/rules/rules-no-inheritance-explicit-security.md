# Rules: No Inheritance And Explicit Security

## Purpose

This rule keeps Galerina security explicit by disallowing inheritance-based hidden
behaviour and inherited authority in normal application code.

## Rule

```text
Inheritance is disallowed.
```

Normal Galerina source should not use inheritance as a behaviour, data, response,
permission or effect-sharing mechanism.

## Explicit Security Rule

```text
Assume everything is unsafe until declared safe.
```

## Disallowed

- `extends`
- `inherits`
- `super`
- abstract classes
- virtual methods
- implicit overrides
- inherited permissions
- inherited effects
- inherited response fields
- inherited route behaviour
- inherited package authority

## Required Alternatives

- composition
- explicit contracts
- explicit adapters
- explicit views/responses
- explicit permissions
- explicit effects
- explicit package exports
- secure flows
- effective reports

## AI Instruction

AI tools must not suggest inheritance as the normal Galerina model.

When reuse is needed, suggest composition, contracts, adapters, variants,
generics or secure flows instead.

## Knowledge Base

See [No Inheritance And Explicit Security](../../../ZTF-Knowledge-Bases/no-inheritance-explicit-security.md).
