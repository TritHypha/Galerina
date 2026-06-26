# Galerina Target Native

`galerina-target-native` is the future package for Galerina native executable and
native ABI target planning.

It belongs in:

```text
/packages-galerina/galerina-target-native
```

Use this package for:

```text
native target metadata
native artifact planning
platform triples
ABI requirements
native executable report format
native target constraints
```

## Boundary

`galerina-target-native` should consume checked IR, compute plans and machine
capability profiles, then describe future native executable outputs and native
ABI boundaries. It should not own Galerina language rules, secure web runtime
policy, API kernel policy or photonic hardware concepts.

This package is not the main v1 milestone. The v1 milestone is the secure web
runtime and `galerina serve`. Native executable output remains target-ready
planning until the memory, ABI, layout and report rules are mature.
