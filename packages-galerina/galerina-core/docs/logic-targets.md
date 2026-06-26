# Logic Targets

Ownership note: logic widths, truth tables and logic reports belong in
`packages-galerina/galerina-core-logic/`. Photonic representation belongs in
`packages-galerina/galerina-core-photonic/`, and photonic backend target planning belongs in
`packages-galerina/galerina-target-photonic/`.

Logic targets describe which logic widths a compiler backend, runtime, simulator or accelerator can support.

## Target Examples

```text
cpu         = binary-native, wider logic by simulation
wasm        = binary-native, wider logic by simulation
gpu         = binary-native with accelerator constraints
ternary-sim = ternary simulation
omni-sim    = configurable simulation
photonic    = future target capability, backend-specific
wavelength  = future analogue photonic maths target, backend-specific
```

## Target Capability Fields

Target reports should include:

```text
target name
native logic width
supported simulated widths
requested program width
fallback mode
precision policy
unsupported states
diagnostics
```

Wavelength target reports should additionally include:

```text
analogue precision policy
tolerance
CPU reference requirement
fallback chain
candidate operation classification
blocked side effects
strict Galerina return type
```

## Required Diagnostics

```text
Galerina-WARN-LOGIC-001: Target does not natively support requested logic width. Using simulation.
Galerina-ERR-LOGIC-001: Requested logic width is unsupported by selected target.
Galerina-ERR-LOGIC-002: Invalid logic state for current logic mode.
```

## Prototype Status

The v0.1 prototype recognises:

```Galerina
logic mode ternary
logic width 5
```

It reports:

```text
Galerina-WARN-LOGIC-001
Galerina-ERR-LOGIC-001
```

Target reports include native logic width and supported simulated widths for each declared target.

The prototype also emits:

```text
app.omni-logic.sim
```

This is a planning artefact, not a real hardware backend.

Wavelength compute is documented in
`docs/hybrid-logic-and-wavelength-compute.md`. It is a research target concept
and is not implemented by the v0.1 prototype.
