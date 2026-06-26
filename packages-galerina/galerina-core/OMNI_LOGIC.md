# Galerina Omni-Logic

Galerina starts with strong support for binary and ternary logic, but it must not be designed as a ternary-only language.

The long-term design goal is **Omni-logic compatibility**: the compiler, runtime, schemas and target reports should be able to describe multiple logic widths without changing the language model.

## Logic Widths

```text
binary logic      = 2-state logic
ternary logic     = 3-state logic
quaternary logic  = 4-state logic
n-state logic     = future configurable logic width
omni logic        = abstraction over multiple logic widths
```

Ternary logic remains a first-class Galerina feature, especially for decision modelling, photonic planning and non-binary simulation. It should not force every internal name or schema to use `ternary` when a broader term is more accurate.

Prefer names such as:

```text
logic-state
logic-width
logic-mode
logic-target
omni-logic
multi-state
```

Avoid designs that lock the language to:

```text
ternary-only
three-way-only
photonic-only
```

## Target Capability Rule

Logic mode and logic width should be treated as target capabilities.

```text
target cpu {
  logic_width: 2
}

target ternary-sim {
  logic_width: 3
}

target omni-sim {
  logic_width: dynamic
}
```

When a program requests a logic width that the selected target cannot support, the compiler must report that clearly.

```text
Galerina-WARN-LOGIC-001: Target does not natively support requested logic width. Using simulation.
Galerina-ERR-LOGIC-001: Requested logic width is unsupported by selected target.
```

## Detailed Documents

The detailed Omni-logic design lives in:

```text
docs/omni-logic.md
docs/logic-widths.md
docs/logic-targets.md
docs/warnings-and-diagnostics.md
```

Final rule:

```text
Galerina may begin with ternary logic, but it should be designed as Omni-logic compatible from the start.
```
