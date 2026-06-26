# Compile-Time Metadata Reflection

## Purpose

Galerina should support reflection for proof, tooling and auditability, not for
runtime magic.

In Galerina, reflection should mean:

```text
compile-time metadata access only
```

It must not mean live runtime object inspection, string-based invocation,
dynamic field mutation, permission mutation or behaviour modification.

## Definition

Galerina compile-time metadata is structured information about declared source
elements available before execution.

Metadata may describe:

```text
data models
views
flows
permissions
capabilities
vaults
routes
events
packages
effects
response contracts
audit events
storage boundaries
```

This metadata is available to the compiler, tooling, audit system, report
generators, Governed IR builder and AI architecture index before runtime.

## Core Rule

```text
Metadata may describe execution.
Metadata must not control execution at runtime.
```

Metadata is evidence and structure. It is not runtime authority.

## Allowed Uses

Compile-time metadata may be used to:

```text
generate documentation
generate test matrices
generate schema and response reports
validate permissions
build runtime graphs
build audit graphs
check route, flow and data links
build AI-readable architecture indexes
build Governed IR
support static analysis
```

Conceptual examples:

```galerina
metadata Profile.response
metadata permission profile_read
metadata flow getProfile
```

These could produce:

```text
fields
view levels
required permission
audit event
response type
allowed database tables
effect declarations
source locations
```

This syntax is conceptual until formal Galerina metadata syntax is specified.

## Disallowed Runtime Reflection

Galerina should not allow normal runtime code to:

```text
list all live objects
inspect private fields dynamically
change function behaviour
invoke methods by string
load unknown modules dynamically
bypass permission checks
modify permissions at runtime
modify response exposure at runtime
patch route behaviour dynamically
```

Unsafe examples:

```galerina
Runtime.reflect(flowName).invoke()
Runtime.reflect(Profile).set("email", value)
Runtime.reflect(permissionName).grant(actor)
```

These patterns hide authority, undermine static analysis and make audit output
unreliable.

## Correct Placement

Compile-time metadata belongs in:

```text
compiler
tooling layer
semantic checker
governance checker
Governed IR builder
documentation generator
audit generator
test generator
AI architecture index
project graph builder
```

It does not belong inside normal flow execution as an object-inspection API.

## Pipeline

The safe pipeline is:

```text
source
  -> parser
  -> AST
  -> metadata extraction
  -> semantic checks
  -> governance checks
  -> Governed IR
  -> verified execution
  -> reports
```

Runtime gates may use verified metadata produced by this pipeline, but runtime
code should not dynamically discover new authority from live objects.

## Example

Source concept:

```galerina
data Profile {
  view response {
    name: String view: public
    email: String view: private
  }
}
```

Compile-time metadata may produce:

```text
Profile.response fields:
- name: public
- email: private
```

The response gate can then use verified metadata generated before runtime to
enforce response exposure rules. The application code should not inspect and
rewrite `Profile` dynamically at runtime.

## Why This Fits Galerina

Runtime reflection creates:

```text
hidden behaviour
dynamic authority
harder auditing
harder static analysis
policy bypass risk
AI misunderstanding
unstable reports
```

Compile-time metadata creates:

```text
better documentation
better AI understanding
better verification
better traceability
stable reports
auditable Governed IR
safer generated schemas
```

## Relationship To Risk Features

Galerina should keep policy-bypassing reflection denied by default. The safer
alternative is compile-time metadata plus source-mapped reports.

Related concepts:

- [Deny By Default Risk Features](deny-by-default-risk-features.md)
- [Model Security Contracts](model-security-contracts.md)
- [Generative Runtime Mapper](generative-runtime-mapper.md)
- [Architecture Charter](architecture-charter.md)

## Final Principle

```text
Galerina should support reflection for proof and tooling,
not for runtime magic.
```
