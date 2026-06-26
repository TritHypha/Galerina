# Galerina Target Photonic

`galerina-target-photonic` is the compiler target package for photonic hardware,
photonic simulators, optical I/O interconnect planning and photonic planning
output.

Status: early package scaffold. The current package defines boundaries and
initial TypeScript contracts only; it does not provide a real photonic hardware
backend.

It belongs in:

```text
/packages-galerina/galerina-target-photonic
```

Think of it as:

```text
galerina-target-photonic teaches the compiler how to aim code at a photonic target.
```

Use this package for:

```text
photonic backend plans
photonic target capabilities
logic-to-photonic lowering plans
photonic simulation targets
photonic target reports
photonic execution plans
optical I/O interconnect plans
data movement reports
topology-aware placement hints
remote memory safety reports
photonic simulation output
hardware mapping files
fallback reports
optical channel layout reports
matrix operation mapping reports
```

`galerina-target-photonic` is about where the code is going.

It answers:

```text
Can this flow be mapped to a photonic target?
What photonic target is available?
What operations can run photonically?
What falls back to CPU?
What plan/report should be generated?
What simulator or hardware backend should receive the output?
Is this target actually optical I/O rather than photonic compute?
How much data moves across the interconnect?
What fallback path is available if optical I/O is not present?
```

## Target Role

`galerina-target-photonic` sits after language checking and compute planning.

```text
.spore source
  ->
galerina-core / galerina-core-compiler
  ->
galerina-core-compute
  ->
galerina-target-photonic
  ->
photonic plan, simulator output or hardware mapping report
```

The package should accept checked compiler/compute output and decide whether a
flow can be represented as a photonic target plan.

It should be able to return:

```text
photonic-compatible
photonic-simulation-only
fallback-required
unsupported
optical-io-only
```

## Optical I/O Is Not Photonic Compute

Intel Silicon Photonics and OCI-style devices should be modelled as optical I/O
and interconnect targets, not as general-purpose photonic CPUs.

Use `optical_io` for:

```text
high-bandwidth data movement
CPU/GPU/accelerator interconnect
AI cluster fabric planning
GPU disaggregation
memory pooling
tensor streaming
schema-compressed transfer planning
remote memory safety reports
```

Use `photonic` or `photonic_compute` for:

```text
photonic matrix operations
logic-to-light mapping
photonic simulation
hardware or simulator compute lowering
```

The package can report both families, but it must keep them distinct.

## Boundary

`galerina-target-photonic` should use `galerina-core-photonic` concepts such as wavelength,
phase, amplitude, optical signal and optical channel. It should not own the
general photonic vocabulary itself.

`galerina-target-photonic` should consume plans from `galerina-core-compute` and concepts from
`galerina-core-photonic`, then produce target-specific outputs.

It should not own:

```text
Tri or Galerina semantics
vector/matrix operation semantics
compute target selection policy
photonic vocabulary
runtime API/auth policy
general compiler parsing/checking
```

Those belong in `galerina-core-logic`, `galerina-core-vector`, `galerina-core-compute`, `galerina-core-photonic`,
`galerina-framework-app-kernel` and `galerina-core-compiler`.

## Inputs

Expected inputs:

```text
checked flow or IR summary from galerina-core-compiler
compute plan from galerina-core-compute
vector/matrix operation summary from galerina-core-vector
photonic concepts from galerina-core-photonic
target preferences from project config
available target capability map
```

The first implementation should start with planning and reports rather than
hardware execution.

## Outputs

Example outputs:

```text
/build/photonic/app.photonic.plan.json
/build/reports/photonic-target-report.json
/build/reports/photonic-fallback-report.json
/build/reports/photonic-channel-layout-report.json
/build/reports/photonic-matrix-mapping-report.json
/build/reports/optical-io-report.json
/build/reports/interconnect-report.json
/build/reports/data-movement-report.json
/build/reports/topology-report.json
```

Example report:

```json
{
  "flow": "multiplyFast",
  "requestedTarget": "photonic",
  "actualTarget": "photonic_sim",
  "fallback": false,
  "channels": [
    { "wavelength": "1550nm" },
    { "wavelength": "1551nm" }
  ],
  "notes": [
    "Generated photonic simulation plan. No physical hardware backend selected."
  ]
}
```

## Target Report Fields

A photonic target report should include:

```text
flow name
requested target
actual target
simulator or backend name
fallback status
fallback target
mapped operations
unsupported operations
optical channels
wavelength layout
precision notes
hardware assumptions
diagnostics
safe suggested fixes
```

Optical I/O report fields should include:

```text
provider
mode
estimated bandwidth
estimated latency
reach
fallback interconnect
source and target locations
estimated transfer bytes
largest transfer
transfer format
remote memory status
encryption policy
placement recommendations
warnings
```

## Fallback Rules

Photonic targeting must fail safely.

Rules:

```text
do not silently claim hardware execution
fall back only when fallback is declared
report every fallback decision
require CPU reference verification where precision matters
deny side effects inside photonic compute regions
do not expose secrets or environment values in reports
do not treat remote optical memory as local RAM
require encryption and access policy for remote memory
fall back to PCIe, Ethernet or standard network paths only when declared
```

Example source using both packages:

```Galerina
import vector
import photonic

photonic vector flow multiplyFast(input: Matrix<Float32>) -> Matrix<Float32> {
  compute target photonic fallback cpu {
    return photonic.matmul(input)
  }
}
```

Package roles in that flow:

```text
galerina-core-photonic
  provides photonic.matmul()
  provides photonic modelling types
  understands wavelength/phase/amplitude concepts

galerina-target-photonic
  checks whether multiplyFast can target photonic execution
  creates photonic plan/output
  reports unsupported operations
  defines fallback to CPU if needed
```

## Related Packages

| Package | Responsibility |
| --- | --- |
| `galerina-core-photonic` | Photonic types, models, APIs and simulations |
| `galerina-target-photonic` | Compiler backend, output target and hardware or simulator mapping |
| `galerina-core-vector` | Vector, matrix, tensor types and operations |
| `galerina-core-compute` | `compute auto`, target selection and fallback planning |
| `galerina-target-native` | Future native executable output |
| `galerina-target-gpu` | GPU target planning and output contracts |
| `galerina-tools-benchmark` | Benchmark diagnostics for optical I/O and fallback paths |
| `galerina-core-reports` | Shared report schemas and report-writing contracts |

## First Version Scope

The first version should support:

```text
define photonic target capability model
define input contract from galerina-core-compute
define photonic plan output format
define simulation target report format
define unsupported-operation diagnostics
define fallback report format
define optical channel layout report format
define matrix operation mapping report format
define optical I/O transfer report format
define data movement and topology report format
add examples
add tests
```

Do not start with:

```text
real hardware execution
vendor SDK integration
automatic deployment to photonic hardware
opaque precision claims
runtime auth/API enforcement
general photonic vocabulary ownership
```

Final rule:

```text
galerina-core-photonic defines photonic concepts.
galerina-target-photonic maps compiled Galerina code to photonic hardware, simulators or plans.
```
