# Mathematics and Tri-Logic

## Definition

Galerina supports advanced mathematical and combinatoric computation through explicit structures, exact types, and a multi-state logical model — remaining compatible with security-first architecture, strict typing, explicit effects, future photonic compute, and AI-readable contracts.

## Core Principle

Galerina supports mathematics through:

```text
exact structures
explicit logical states
typed assumptions
reportable reasoning
deterministic computation
```

Not through:

```text
hidden coercion
float-first design
implicit truthiness
runtime magic
inheritance-heavy abstraction
```

## Suitable Research Domains

Galerina is well suited for:

```text
discrete mathematics
finite field algebra
combinatorics
incidence geometry
symbolic computation
exact arithmetic
graph theory
formal reasoning
proof tracking
constraint systems
```

## Package Architecture

Mathematics lives outside the core language package:

```text
galerina-core              = core type system and execution
galerina-math-algebra      = rings, fields, groups, matrices
galerina-math-finite-field = finite field arithmetic
galerina-math-geometry     = affine/projective geometry
galerina-math-combinatorics = sumsets, product sets, incidence systems
galerina-math-proof        = assumptions, lemmas, proof reports
galerina-math-symbolic     = symbolic expressions and simplification
```

## Safe Mathematical Types

### Structural Types

```text
Set<T>
List<T>
Map<K, V>
Graph<T>
Tree<T>
```

### Exact Numeric Types

```text
Integer
BigInteger
Rational
ExactDecimal
```

### Algebraic Types

```text
FiniteField<p>
Polynomial<F>
Vector<F, N>
Matrix<F, R, C>
Tensor<T>
GroupElement<G>
RingElement<R>
```

### Geometry Types

```text
Point<F, N>
Line<F, N>
Plane<F, N>
ProjectivePoint<F, N>
AffineTransform<F>
```

## The Logical Type System

Traditional binary logic (`true`/`false`) is insufficient for symbolic computation, AI-assisted reasoning, partial proofs, photonic logic, and incomplete information.

Galerina separates logical categories:

### Bool

Strict binary — only when certainty is guaranteed:

```text
True
False
```

### Tri

Three-state logic — when neutrality or undecided state is valid:

```text
True
False
Neutral
```

### Decision

Operational security/runtime decision type:

```text
Allow
Deny
Unknown
Unsafe
Deferred
```

Used for permissions, security policy, runtime checks, routing, and deployment gates.

### ProofResult

Mathematical reasoning state:

```text
Proven
Disproven
NotProven
AssumptionRequired
Undecidable
```

Used for symbolic and research systems.

## Example

Instead of:

```galerina
incidence(point, line) -> Bool
```

Galerina supports:

```galerina
incidence(point, line) -> Decision
```

or:

```galerina
incidence(point, line) -> ProofResult
```

because the result may depend on symbolic assumptions, incomplete computation, or partial information.

## Legacy Binary Assumptions to Avoid

```text
truthy/falsy coercion
Boolean-only decision systems
silent null
NaN as control flow
implicit conversions
float-first architecture
integer overflow
hidden runtime dispatch
```

These create problems for security auditing, AI readability, formal verification, neutral logic, and photonic planning.

## Recommended Design Patterns

```text
contracts/interfaces     — explicit shape declarations
adapters                 — explicit boundary implementations
sealed variants          — exhaustive match branches
explicit match           — no implicit fallthrough
capability objects       — declared authority
pure functions           — no hidden side effects
Result<T,E>              — explicit failure
explicit dependency injection — boot-time binding
typed pipelines          — declared data flow
```

## Patterns to Avoid

```text
deep inheritance
hidden runtime polymorphism
service locator
singleton-heavy design
reflection-based dispatch
runtime monkey patching
magic middleware
implicit plugin discovery
```

## Photonic Compatibility Direction

Galerina remains CPU-compatible by default while allowing future support for:

```text
Tri logic
optical signalling
photonic compute planning
neutral-state computation
non-binary compute simulation
```

Mathematical structures remain exact and stable. Logical systems become explicitly typed rather than forcing all computation into binary-only assumptions.

## Final Principle

```text
Galerina supports explicit mathematics and explicit logic.

Mathematical structures may be neutral.

Logical decisions must always be explicitly typed.

Binary Bool must never be used where Neutral, Unknown,
Unsafe, or NotProven are valid states.
```
