# Galerina Photonic — Distinct Compute Model

## Overview

Photonic compute is **not** GPU compute with a different device label. It is a distinct
physical and computational substrate with fundamentally different primitives:

```text
wavelength-domain parallelism   — multiple signals sharing one waveguide
optical delay lines             — the memory / time-state primitive
interference patterns           — the compute operation
phase, amplitude, wavelength    — first-class values
routing / coupling / splitting  — physical operations with semantic consequences
```

Galerina must model photonic compute with its own IR, its own effect types, its own
memory/state model, its own target reports and its own compatibility checks.

---

## Why Photonic ≠ GPU

GPU compute is based around threads, warps, blocks, global/shared/local memory, SIMD
lanes and kernel launches. A GPU planner asks:

```text
what block size?    what memory layout?
what occupancy?     what coalescing?
```

Photonic compute involves wavelength multiplexing, phase shifts, amplitude modulation,
interference, beam splitting, optical delay, resonators, detectors and analog noise.
A photonic planner must ask:

```text
what wavelength channels?       what phase precision?
what optical path length?       what interference topology?
what delay-line depth?          where are E/O conversion boundaries?
what noise budget?              what calibration constraints?
```

If the compiler treats both as the same thing, it asks the wrong questions about each.

---

## First-Class Photonic Types

```galerina
Wavelength<Nm>
WavelengthBand<StartNm, EndNm>
OpticalSignal<Amplitude, Phase, Wavelength>
OpticalChannel<Wavelength>
Phase<Radians>
Amplitude<Normalized>
Delay<Picoseconds>
Waveguide
InterferencePattern
Resonator
Detector
OpticalBuffer<DelayLine>
```

Usage:

```galerina
let lambda: Wavelength<1550nm>
let phase: Phase<Radians>
let signal: OpticalSignal<Float32, phase, lambda>
```

---

## Wavelength-Domain Parallelism

Wavelength multiplexing is explicit — it is not equivalent to GPU lanes:

```galerina
let channels: WavelengthSet<[1530nm, 1540nm, 1550nm, 1560nm]>
let signal: OpticalSignal<Float32, channels>
```

The compiler checks:

```text
channel compatibility
wavelength spacing
cross-talk risk
supported bands
detector support
multiplexer / demultiplexer availability
```

---

## Delay-Line Memory Model

Photonic memory must not be modeled as RAM. Optical delay lines represent time/state:

```text
state exists as signal delay
storage is transient
capacity is delay/path-length limited
access is sequential / time-based
noise and attenuation matter
refresh / conversion may be needed
```

Type syntax:

```galerina
let history: DelayLine<OpticalSignal<Float32>, 64ps>
```

Compiler checks:

```text
delay is supported by target
signal lifetime fits optical path
conversion boundary is explicit
feedback loop is stable under policy
```

---

## Interference as Compute

Interference is a physical operation, not arithmetic. It carries:

```text
phase relationship
amplitude
coherence
path length
coupling ratio
noise / error budget
calibration assumptions
```

```galerina
let y = interfere(a, b, phase: theta)
```

This must not be lowered as `y = a + b` unless the target/simulation proves that
abstraction valid under a declared model.

---

## Photonic Effects

```text
photonic.route
photonic.modulate
photonic.interfere
photonic.delay
photonic.detect
photonic.convert.eo       (electrical → optical)
photonic.convert.oe       (optical → electrical)
photonic.calibrate
photonic.measure
```

`detect` collapses an optical signal into an electrical measurement — phase information
is lost. The effect system must reflect that.

---

## Optical/Electrical Conversion Boundaries

Conversions must be explicit:

```galerina
let optical = electricalToOptical(input)
let resultOptical = photonicLayer(optical)
let result = opticalToElectrical(resultOptical)
```

A type transition enforces the loss of phase after detection:

```galerina
OpticalSignal<Amplitude, Phase, Wavelength>
  -> detect()
  -> ElectricalSignal<Amplitude>
```

The compiler prevents use of `Phase` after detection.

---

## Photonic IR Nodes

```text
modulate
split / combine
interfere
phase_shift
delay
route
wavelength_multiplex / wavelength_demultiplex
detect
convert_electrical_to_optical / convert_optical_to_electrical
attenuate
resonate
calibrate
```

Example IR node:

```json
{
  "kind": "PhotonicOp",
  "op": "interfere",
  "inputs": ["signal_a", "signal_b"],
  "phaseShift": "phase:theta",
  "output": "signal_out",
  "wavelength": "1550nm",
  "noiseBudget": "declared"
}
```

---

## Noise and Precision Policy

Photonic compute often has analog behavior. A project declares its tolerance model:

```galerina
photonic_policy {
  noise_budget 0.01
  require_calibration true
  allow_analog_approximation true
  verify cpu_reference tolerance 1e-3
}
```

---

## Target Capability Manifests

```json
{
  "target": "photonic",
  "supports": {
    "wavelengthBands": ["C-band"],
    "ops": ["phase_shift", "interfere", "delay", "detect"],
    "maxChannels": 16,
    "delayRange": "0ps..500ps",
    "phasePrecision": "8-bit",
    "conversion": ["electrical_to_optical", "optical_to_electrical"]
  }
}
```

The compiler compares the photonic IR against this manifest before compilation.

---

## Simulation-First Strategy

Until real hardware backends exist, Galerina supports simulation/planning artefacts:

```bash
galerina build --target photonic-sim
```

Output:

```text
photonic compatibility report
simulated photonic graph
conversion boundaries
noise assumptions
unsupported operations
fallback plan
```

No production performance claims until a hardware backend with reproducible benchmarks
exists.

---

## Relationship to GPU Target

GPU and photonic share governance/orchestration infrastructure but not low-level IR:

```text
Shared:
  compute intent, target approval, fallback policy, reports, resource budgets, verification

Separate GPU IR:
  threads, blocks, memory, kernels

Separate Photonic IR:
  wavelengths, phase, amplitude, delay, interference, conversion
```

---

## Relationship to Neural Operators

Neural ops can lower to photonic primitives:

```text
matmul
  -> modulation
  -> wavelength multiplexing
  -> interference mesh
  -> detection
```

But the photonic backend still requires its own IR for the physical lowering:

```text
Neural IR -> Photonic lowering plan -> Photonic IR -> target/simulation/backend report
```

---

## 4-Stage Rollout

| Stage | Content |
|---|---|
| 1. Type layer | `Wavelength`, `Phase`, `Amplitude`, `OpticalSignal`, `OpticalChannel`, `DelayLine` |
| 2. Photonic IR schema | IR nodes and report schemas; no claimed hardware execution |
| 3. Simulation target | Photonic compatibility and simulation artefacts |
| 4. Neural/compute lowering | Selected neural ops lower to photonic IR for planning |

Real hardware provider interface only when actual backends exist.

---

## Build Reports

```json
{
  "target": "photonic",
  "mode": "simulation",
  "ops": ["modulate", "interfere", "delay", "detect"],
  "wavelengths": ["1550nm", "1551nm"],
  "conversionBoundaries": ["input", "output"],
  "noiseBudget": "0.01",
  "status": "planned-not-hardware-backed"
}
```

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-PHOTONIC-001` | Photonic op unsupported by target |
| `SPORE-PHOTONIC-002` | Wavelength band unsupported |
| `SPORE-PHOTONIC-003` | Wavelength channels conflict |
| `SPORE-PHOTONIC-004` | Delay-line depth unsupported |
| `SPORE-PHOTONIC-005` | Optical/electrical conversion required but not declared |
| `SPORE-PHOTONIC-006` | Phase information lost after detection |
| `SPORE-PHOTONIC-007` | Noise budget exceeded |
| `SPORE-PHOTONIC-008` | Calibration evidence required |
| `SPORE-PHOTONIC-009` | Photonic fallback changed semantics |
| `SPORE-PHOTONIC-010` | Photonic target cannot be treated as GPU kernel |

Example:

```text
SPORE-PHOTONIC-004: delay-line depth unsupported

Requested:
  DelayLine<128ps>

Target supports:
  0ps..64ps

Suggestion:
  reduce delay requirement, split the graph, or select a simulated/CPU fallback target.
```

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Shared type/effect/report hooks |
| `galerina-core-compute` | High-level compute planning and target/fallback policy |
| `galerina-core-photonic` | Photonic types: `Wavelength`, `Phase`, `Amplitude`, `OpticalSignal`, `OpticalChannel` |
| `galerina-target-photonic` | Photonic IR, target manifests, simulation reports, compatibility checks |
| `galerina-core-reports` | Photonic report schemas |
| `galerina-tools-benchmark` | Simulation and eventual hardware benchmark evidence |
