# Formal Proof System

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

Galerina supports formal mathematical reasoning through a structured proof system
with dedicated keywords. This makes proofs typed, reportable and compatible with
future Tri/Neutral logic extensions.

## Proof Keywords

### `axiom`

An accepted foundational mathematical rule — trusted without proof inside the
current proof system.

```galerina
axiom AdditionAssociative
```

### `theorem`

A proven or declared mathematical result.

```galerina
theorem FermatLittle
```

### `lemma`

A supporting theorem used to prove larger results.

```galerina
lemma FiniteFieldClosure
```

### `proof`

A formal proof block.

```galerina
proof FermatLittle {
  ...
}
```

### `assume`

A temporary proof assumption.

```galerina
assume p: Prime
```

### `given`

An input condition or known value.

```galerina
given field: FiniteField<p>
```

### `invariant`

A condition that must remain true across transitions.

```galerina
invariant matrix.rank >= 0
```

## Problem With Binary-Only Invariants

Traditional invariants assume only `true` or `false`. This becomes problematic
for Tri logic, neutral logic, photonic systems, symbolic reasoning, distributed
proof systems, incomplete knowledge and AI-assisted proofs.

## Future Tri/Neutral Logic Direction

Galerina should eventually support richer proof states beyond `True` / `False`:

```text
True
False
Neutral
Unknown
Undecidable
Deferred
AssumptionRequired
```

## Future Replacements for `invariant`

### `constraint`

A condition that should hold but may be unresolved:

```galerina
constraint energy_balance >= 0
```

The runtime or proof system must attempt to preserve or validate this.

### `guarantee`

A condition formally guaranteed by proof or runtime:

```galerina
guarantee session.revoked == False
```

### `stable`

A condition expected to remain unchanged across state transitions:

```galerina
stable actor_uuid
```

### `truth`

A Tri/Neutral-aware logical state:

```galerina
truth quantum_state != Unknown
```

Possible future states: `True`, `False`, `Neutral`, `Unknown`, `Deferred`.

## Near-Term Direction

For current Galerina, keep `invariant` but avoid assuming binary-only truth
forever. `invariant` currently means "must remain valid" — not necessarily
binary Boolean forever.

## Core Principle

```text
Proofs are typed and structured.
Current invariants remain practical.
Future logic systems remain open to Tri/Neutral evolution.
```
