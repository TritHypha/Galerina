# Security Invariants And Policy Proof

Galerina should be designed around security invariants rather than isolated
security features.

The compiler and runtime should ask:

```text
What architectural rule makes this exploit impossible or contained?
```

## Core Invariant

```text
Declared security policy is part of program meaning.
```

Permissions, capabilities, classifications, effects, ownership, trust
boundaries, actor identity and audit obligations should become compiler/runtime
facts.

## Security-Aware IR

Galerina should compile through a security-aware IR that tracks:

- permissions
- capabilities
- data classification
- exposure level
- ownership
- actor identity
- trust boundaries
- side effects
- audit requirements
- package authority
- runtime isolation requirements

Example:

```galerina
field email: text private
field salary: money restricted
field password_hash: text secret
field name: text public
```

A public response cannot expose `secret`, `internal`, `restricted` or other
non-public data unless a declared view, ownership rule and policy explicitly
allow it.

## Required Invariants

Galerina should enforce these invariants:

- every sensitive field has a classification or approved inherited
  classification
- execution plans become immutable after checking
- runtime monkey patching, hidden behaviour injection and reflective execution
  are denied in normal code
- authority is explicit and never ambient
- business logic requests work, while policy grants or denies authority
- unsafe blocks are source-visible, capability-gated, audited and profile-gated
- data is immutable by default and mutation is explicit
- AI-generated actions are proposed, validated, authorized, audited and only
  then executed
- sensitive server execution is deterministic enough to reproduce and audit
- audit semantics are mandatory for sensitive flows
- packages are signed, hash-verified and permission-manifested before trusted
  use
- database access is typed, permission checked, field constrained, exposure
  aware and parameterized
- apps, plugins, flows, agents and packages run through layered isolation
- hardened profiles can disable runtime reflection, unsafe blocks, shell
  execution, unsigned plugins and nondeterministic execution

## Capability Tokens

Galerina should prefer signed, scoped, short-lived and revocable capability tokens
over broad session authority.

Tokens should bind actor, resource, action, expiry, audience, issuer, proof
requirements and revocation state where relevant.

## Policy Proof

Galerina should optimise after policy proof.

The strategic proof target is:

```text
Can this flow expose restricted data?
Compiler and reports can prove no.
```

Policy proof should be built from source declarations, classifications,
permissions, capabilities, effects, IR facts, package manifests, execution
plans and audit/report output.

## Final Rule

```text
Galerina should make declared policy violations impossible by default and
contained, visible, denied or audited when escape hatches are explicitly used.
```
