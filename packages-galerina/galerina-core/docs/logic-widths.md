# Logic Widths

Logic width is the number of distinct states a logic model can represent.

## Supported Concepts

```text
logic width 2 = binary
logic width 3 = ternary
logic width 4 = quaternary
logic width n = future configurable width
```

## Required Terms

```text
Bool      = true / false
Decision  = domain decision such as Allow / Deny / Review
Tri       = mathematical or target-facing 3-state value
Galerina  = possible future width-aware logic value
```

Galerina should not treat every 3-state domain model as raw ternary maths. `Decision` and `Tri` should remain distinct unless the specification explicitly maps them.

## Conversion Risks

Converting between logic widths may lose state precision.

Example:

```text
5 states -> 3 states may collapse low/high into unknown or review states.
3 states -> 2 states may require a policy for unknown.
```

The compiler should report lossy conversions.

```text
Galerina-WARN-LOGIC-002: Logic width conversion may lose state precision.
```
