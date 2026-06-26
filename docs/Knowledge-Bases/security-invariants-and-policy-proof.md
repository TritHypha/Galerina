# Security Invariants And Policy Proof

## Purpose

Galerina should be designed around security invariants instead of isolated exploit
fixes.

The design question is not:

```text
How do we stop this exploit?
```

The design question is:

```text
What architectural rule makes this exploit impossible or contained?
```

The long-term security goal is:

```text
Software should not merely run correctly.
Software should be architecturally incapable of violating declared security
policy.
```

## Core Invariant

```text
Declared security policy is part of program meaning.
```

Galerina should treat policy, permissions, classifications, effects, ownership,
trust boundaries and audit obligations as compiler/runtime facts, not comments
or optional middleware.

## Security-Aware IR

Galerina should compile through a security-aware intermediate representation.

The IR should track:

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

A public response must not contain `secret`, `internal`, `restricted` or other
non-public data unless a declared view, ownership rule and policy explicitly
allow it.

## Mandatory Classification

Every model, request, response, storage and report field should have a
classification or inherit one from an approved schema rule.

Classification should feed:

- response/view filtering
- log redaction
- AI context minimisation
- database field reads
- audit decisions
- package export decisions
- report generation

Unknown classification should fail closed for public output and sensitive
execution.

## Immutable Execution Plans

After a flow is checked and compiled, its runtime execution graph should become
immutable.

Galerina should deny:

- runtime monkey patching
- hidden behaviour injection
- runtime method lookup as authority
- dynamic property injection
- hidden metadata mutation
- unrestricted decorators
- runtime type rewriting
- reflective execution that bypasses policy

Runtime gates may consume verified compile-time metadata. Application code must
not mutate live execution behaviour to gain authority.

## No Ambient Authority

Code should never gain access because it happens to run in a process.

Bad model:

```text
All code can access filesystem, network, shell or database.
```

Good model:

```galerina
flow uploadImage
  use capability File.Temp.Write
```

Authority must be explicit, scoped, attributable, revocable and auditable.

## Policy Separate From Business Logic

Permissions should not be buried inside application conditionals.

Bad:

```galerina
if user.role == admin
```

Good:

```galerina
permission use profile_read
```

Business logic may request work. Policy decides whether the actor, capability,
resource, data classification, effect and boundary allow it.

## Scoped Capability Tokens

Galerina should prefer signed, scoped, short-lived and revocable capability tokens
over broad session authority.

A token should describe what it allows and what it does not allow:

```text
Can:
- read own profile
- upload image

Cannot:
- read billing
- export users
- call admin flows
```

Capability tokens must bind to actor, resource, action, expiry, audience,
issuer, proof requirements and revocation state where relevant.

## Unsafe Must Be Visible

Unsafe language or runtime escape hatches must be visible in source, diagnostics
and reports.

Example:

```galerina
unsafe {
  native memory access
}
```

Unsafe blocks should require explicit capability, source mapping, audit output
and policy approval. Hardened or enterprise profiles may deny unsafe blocks
entirely.

## Immutable Data By Default

Galerina should default to immutable local values.

```galerina
let profile = ...
```

Mutation should be explicit and governed because uncontrolled mutation creates
races, hidden state bugs, synchronization bugs and policy-bypass risks.

## AI As Hostile Automation

AI-generated actions should never execute directly.

The safe chain is:

```text
proposed -> validated -> authorized -> audited -> executed
```

AI may propose code, actions and policy. The compiler, policy engine,
capability system, test system and audit system remain authoritative.

## Deterministic Server Execution

Galerina server execution should avoid hidden threading, shared mutable globals
and timing-sensitive behaviour where policy or audit depends on outcome.

Deterministic execution is easier to reproduce, review, audit and secure.

## Mandatory Audit Semantics

Audit is part of the language/runtime contract, not optional logging.

Sensitive flows should declare audit requirements:

```galerina
audit {
  actor
  action
  resource
  decision
  permission
}
```

The compiler/runtime should ensure sensitive flows produce audit events with
runtime-owned identity, permission, capability, decision and result metadata.

## Signed Package Ecosystem

Packages should support:

- signing
- reproducible builds
- verified hashes
- permission manifests
- explicit denies
- package authority reports

Example:

```galerina
package image.tools
requires:
  File.Read.Temp
  File.Write.Processed
denies:
  Network.*
```

AI-generated or third-party packages must not be treated as trusted without
verification, declared permissions and reportable provenance.

## Secure Database Layer

Database access should be secure by construction:

- typed
- permission checked
- field constrained
- exposure aware
- parameterized
- audited

Raw string queries must be denied by default. Typed query artifacts should
require safe parameters and runtime authority.

## Multi-Layer Runtime Isolation

Galerina should not fully trust apps, plugins, flows, agents or packages.

Isolation may include:

- process isolation
- memory isolation
- capability isolation
- network isolation
- filesystem isolation
- package isolation
- worker isolation

Isolation policy should follow data sensitivity, package trust, effects,
capabilities and deployment profile.

## Enterprise Hardened Mode

Galerina should define a hardened profile for high-assurance deployments.

Example:

```text
Enterprise Hardened Mode:
- reflection disabled at runtime
- unsafe blocks disabled
- shell execution disabled
- external plugins signed only
- deterministic execution enforced
- audit mandatory
- raw SQL denied
- unsigned packages denied
```

This profile should be enforced by compiler, runtime, package and deployment
checks, not by convention.

## Policy Proof Over Speed

Galerina should optimise after security proof.

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
