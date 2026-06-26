# Galerina Backend Compute Targets and Runtime Planning

Status: Draft.

Ownership note: `galerina-core` may document compute block syntax, compiler checks and
report contracts. Detailed compute planning, capabilities, budgets, offload and
target selection belong in `packages-galerina/galerina-core-compute/`. Target-specific planning
belongs in `packages-galerina/galerina-target-cpu/`, `packages-galerina/galerina-target-native/`,
`packages-galerina/galerina-target-gpu/` and `packages-galerina/galerina-target-photonic/`. Optimized CPU
kernel contracts belong in `packages-galerina/galerina-cpu-kernels/`. AI inference contracts
belong in `packages-galerina/galerina-ai/`, with low-bit and ternary AI backend planning in
`packages-galerina/galerina-ai-lowbit/`.

Galerina, short for **Galerina**, is a strict, memory-safe, security-first
programming language and compiler/toolchain.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
routes.spore
models.spore
compute-policy.spore
```

---

## Summary

This document defines how Galerina should support backend compute planning without
hard-coding one hardware vendor, cloud provider, chip family, accelerator or
runtime.

Unlike databases, audio, video, search, translation or provider APIs, compute
planning is a valid Galerina compiler/runtime concern.

Galerina should support:

```text
compute auto
CPU fallback
CPU vector planning
GPU planning
AI accelerator planning
photonic candidate planning
memory/interconnect awareness
precision reporting
fallback reporting
target reports
security rules
```

Galerina should not become:

```text
a hardware driver framework
a GPU programming language only
a photonic-only language
a cloud-specific runtime
a vendor-specific SDK
a replacement for CUDA, ROCm, TPU runtimes or photonic vendor drivers
```

Goal:

```text
Write clean Galerina.
Let the compiler and runtime plan suitable compute targets.
Use packages/plugins for vendor-specific hardware backends.
Fallback safely.
Report everything.
```

---

## Classification

```text
Area: Backend compute planning and target selection
Native language/compiler concern: Yes
Vendor-specific implementation: No
Supported through Galerina primitives: Yes
Belongs in: Compiler, runtime, target plugins, deployment tooling, hardware drivers
```

---

## Core Principle

Galerina should support compute target planning at the language/compiler/runtime
level.

Galerina should not hard-code vendor-specific hardware behaviour.

Correct model:

```text
Galerina core:
  compute blocks
  target declarations
  precision declarations
  fallback rules
  safety rules
  reports

Galerina compiler/runtime:
  target planning
  capability detection
  fallback selection
  memory/interconnect planning

Galerina target plugins:
  CPU backend
  low-bit AI inference backend
  CUDA backend
  ROCm backend
  Vulkan backend
  TPU backend
  Trainium backend
  Inferentia backend
  NPU backend
  photonic backend
  cloud-specific backend

External systems:
  drivers
  hardware runtimes
  vendor SDKs
  cloud infrastructure
```

---

## Compute Auto

`compute auto` is the preferred beginner-friendly model.

Example:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

This means:

```text
this block is compute-heavy
Galerina should select the best safe target
fallback is allowed
target choice should be reported
```

Most developers should not need hardware-specific target names.

Advanced users may write:

```Galerina
compute target gpu fallback cpu_vector fallback cpu {
  result = Model.predict(input)
}
```

Specialist hardware targets may be used for testing, benchmarking or deployment
constraints, but should not be required for normal application code.

---

## What Galerina Provides

Galerina should provide general compute planning primitives:

```text
compute auto
compute target
fallback rules
target preference lists
target capability reports
precision declarations
tolerance declarations
memory movement reports
source maps
runtime capability maps
security reports
failure reports
AI-readable compute explanations
```

Galerina may support broad target categories:

```text
cpu
low_bit_ai
cpu.generic
cpu_vector
gpu
ai_accelerator
photonic_auto
accelerator_auto
safe_cpu
```

These are generic target classes, not vendor lock-in.

---

## What Target Plugins Provide

Target plugins may provide support for specific runtimes or hardware.

Examples:

```text
CUDA plugin
ROCm plugin
Vulkan compute plugin
Metal plugin
WebGPU plugin
TPU plugin
Trainium plugin
Inferentia plugin
NPU plugin
photonic MZI plugin
photonic WDM plugin
cloud confidential compute plugin
```

These should not be hard-coded into Galerina core.

Galerina core defines the target model. Plugins implement hardware-specific
behaviour.

---

## What Applications Decide

Applications should decide:

```text
whether accelerator use is allowed
whether CPU-only mode is required
whether fallback is allowed
whether mixed precision is allowed
whether cloud cost matters
whether confidential compute is required
whether photonic targets are experimental or production-ready
whether target choice is build-time or runtime
```

Example policy:

```Galerina
compute {
  target_selection "auto"

  prefer [
    ai_accelerator,
    gpu,
    cpu_vector,
    cpu
  ]

  fallback true

  precision {
    default_float Float32
    default_ai_compute Float16
    default_accumulate Float32
    allow_mixed_precision true
  }

  reports {
    target_report true
    precision_report true
    fallback_report true
    memory_report true
    ai_guide true
  }
}
```

---

## CPU Support

The CPU remains the control layer.

CPU should handle:

```text
operating system interaction
API routing
JSON parsing
security policy
file access
database access
network access
business logic
decimal money calculations
exact branching
fallback execution
device orchestration
```

CPU target names:

```text
cpu
safe_cpu
server_cpu
cloud_cpu
cpu_x86_64
cpu_arm64
cpu_vector
```

Galerina should never make CPU optional.

Every Galerina program should have a safe CPU fallback unless the project explicitly
requires special hardware.

---

## CPU Vector Support

CPU vector/SIMD support is useful for numeric workloads.

Examples:

```text
AVX
AVX2
AVX-512
AVX10
Arm NEON
Arm SVE
```

Good candidates:

```text
dataset analysis
bulk numeric transforms
batch validation
small/medium vector maths
fallback AI inference
pre-processing
post-processing
```

Example:

```Galerina
pure vector decimal flow analyseCustomers(rows: CustomerRows) -> CustomerAnalysisResult {
  let columns = vectorize rows {
    spend = .spend
    orders = .orders
    refunds = .refunds
  }

  compute auto {
    totalSpend = vector.sum(columns.spend)
    refundRiskCount = vector.countTrue((columns.refunds / columns.orders) > 0.10)
  }

  return CustomerAnalysisResult {
    rowCount: rows.length()
    totalSpend: totalSpend
    refundRiskCount: refundRiskCount
  }
}
```

---

## GPU Support

GPUs are useful parallel compute targets.

Galerina should support GPU as a broad target category. Vendor/runtime-specific
support should come from target plugins.

Generic target names:

```text
gpu
gpu_auto
webgpu
```

Plugin-specific target names may include:

```text
gpu_cuda
gpu_rocm
gpu_vulkan
gpu_metal
gpu_opencl
```

Good GPU candidates:

```text
matrix multiplication
tensor operations
AI inference
AI training
image processing
video processing
simulation
physics
scientific compute
large parallel transforms
vector similarity
embedding comparison
```

Poor GPU candidates:

```text
API routing
JSON parsing
database queries
small if/else logic
payment decisions
exact accounting
secret handling
small one-off calculations
```

---

## GPU Memory Movement Rule

Galerina should avoid unnecessary movement such as:

```text
CPU -> GPU -> CPU -> GPU
```

Preferred:

```text
move once
compute many times
return final result
```

Example policy:

```Galerina
compute {
  gpu {
    keep_on_device true
    fusion true
    warn_on_excess_transfers true
  }
}
```

Reports should show:

```text
host-to-device transfers
device-to-host transfers
estimated memory pressure
whether data stayed on device
whether transfers were excessive
```

---

## AI Accelerator Support

AI accelerators should be treated as specialised tensor/model targets.

Generic target names:

```text
ai_accelerator
accelerator_auto
npu
edge_ai
```

Plugin or deployment-specific target names may include:

```text
tpu
trainium
inferentia
cloud_ai_accelerator
```

Good AI accelerator candidates:

```text
AI inference
AI training
transformer models
LLM inference
embeddings
recommendation models
vision models
speech models
ranking models
large tensor graphs
quantised models
```

Example model declaration:

```Galerina
model FraudModel {
  input FraudFeatures
  output FraudScore

  precision {
    input Float16
    compute Float16
    accumulate Float32
    output Float32
    tolerance 0.001
  }

  targets {
    prefer [ai_accelerator, gpu, cpu_vector, cpu]
    fallback true
  }
}
```

---

## Photonic Compute Support

Photonic chips should be treated as specialised accelerators, not
general-purpose CPUs.

Documentation status: `docs/COVERAGE.md` records unresolved photonic conflicts
between `galerina-core-photonic`, `galerina-core-vector` and governance KB files.
Until reconciled, this document may describe broad target planning only. Do not
derive implementation contracts for `OpticalTransportMode`,
`PhotonicRuntimeTarget`, `PhotonicExecutionPlan` or `SPORE-PHOTONIC-*` diagnostics
from this language-core compute overview.

Galerina may support broad photonic target planning:

```text
photonic_auto
photonic_candidate
```

Specialist target plugins may expose:

```text
photonic_mzi
photonic_wdm
photonic_ring
photonic_crossbar
photonic_interconnect
photonic_signal
wavelength
```

Galerina core should not assume a specific photonic chip exists.

Photonic support should remain optional, report-driven and fallback-safe.

---

## Photonic Target Discovery

A photonic target plugin may report:

```text
whether a photonic accelerator exists
photonic backend runtime
supported optical compute type
supported precision
supported matrix sizes
calibration state
temperature/thermal state
firmware version
driver version
fallback availability
```

Galerina should include this in target reports.

---

## MZI Support

`photonic_mzi` may refer to Mach-Zehnder Interferometer mesh support.

This should be a target-plugin capability, not a mandatory Galerina feature.

A photonic MZI plugin may support:

```text
MZI mesh discovery
optical phase control
interference-based weighting
matrix/vector multiplication mapping
calibration of MZI paths
temperature drift correction
tolerance/error reporting
CPU reference verification
fallback to GPU/CPU
```

Good workload:

```text
weights * features
```

Advanced override:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute target photonic_mzi required {
    return FraudModel.predict(features)
  }
}
```

Normal code should prefer:

```Galerina
compute auto {
  return FraudModel.predict(features)
}
```

---

## WDM and Wavelength Support

`photonic_wdm` may refer to wavelength-division multiplexing.

This should be handled through target plugins.

A WDM-capable plugin may support:

```text
multiple light wavelengths
parallel optical channels
channel allocation
wavelength collision detection
wavelength error detection
optical data movement
wavelength scheduling
```

Target names may include:

```text
photonic_wdm
wavelength
photonic_signal
```

Wavelength/analogue compute must declare or inherit:

```text
precision
tolerance
verification
fallback
calibration requirements
```

Example:

```Galerina
model OpticalModel {
  input FraudFeatures
  output FraudScore

  targets {
    prefer [photonic_auto, gpu, cpu]
    fallback true
  }

  precision {
    compute Analogue
    accumulate Float32
    tolerance 0.001
  }

  verify {
    cpu_reference true
    max_error 0.001
  }
}
```

---

## Photonic Workload Rules

Good photonic candidates:

```text
matrix multiplication
vector multiplication
linear algebra kernels
neural network dense layers
AI inference
signal processing
Fourier-like transforms
optical pre-processing
large matrix-heavy workloads
```

Poor photonic candidates:

```text
API routing
JSON parsing
database access
file I/O
security decisions
payment logic
exact accounting
cryptography
permission checks
secret handling
```

Important rule:

```text
Photonic compute must return to strict Galerina values before affecting business or
security decisions.
```

---

## Memory and Interconnect Awareness

Moving data is often the bottleneck.

Galerina should support memory/interconnect planning as part of `compute auto`.

Support areas:

```text
HBM memory
unified memory
shared CPU/GPU memory
NUMA
PCIe bandwidth
GPU interconnects
chip-to-chip interconnects
optical interconnects
rack-scale interconnects
memory bandwidth profiling
```

Generic target names:

```text
memory_interconnect
hybrid_cpu_gpu
cloud_interconnect
photonic_interconnect
```

Reports should show:

```text
estimated data transfer cost
CPU/GPU transfer count
memory pressure
device memory availability
whether data can stay on device
whether compact layout can reduce memory
whether columnar layout helps
```

Example memory report:

```json
{
  "memoryInterconnect": {
    "flow": "scoreFraud",
    "selectedTarget": "gpu",
    "dataTransfer": {
      "hostToDevice": 1,
      "deviceToHost": 1,
      "excessTransfers": false
    },
    "memoryPressure": "low"
  }
}
```

---

## Cloud Compute Profiles

Galerina should support cloud compute profiles without hard-coding cloud providers
into the core language.

Cloud-specific support should be handled through deployment profiles and target
plugins.

Cloud profile examples:

```text
cloud_cpu
cloud_ai_accelerator
cloud_confidential_compute
cloud_security_processor
cloud_interconnect
```

Provider-specific target names may be exposed by plugins:

```text
aws_graviton
aws_trainium
aws_inferentia
aws_nitro_enclave
google_axion
google_tpu
google_confidential_vm
azure_confidential_compute
```

These names are optional plugin/deployment profile names. They are not required
Galerina core targets.

Example cloud deployment policy:

```Galerina
deployment {
  cloud "aws"

  targets {
    api {
      prefer [cloud_cpu, cpu]
      fallback cpu
    }

    ai_inference {
      prefer [cloud_ai_accelerator, gpu]
      fallback cpu
    }

    sensitive_flows {
      prefer [cloud_confidential_compute]
      require_attestation true
      fallback "deny"
    }
  }
}
```

A deployment plugin may map:

```text
cloud_cpu -> aws_graviton
cloud_ai_accelerator -> aws_inferentia
cloud_confidential_compute -> aws_nitro_enclave
```

Another deployment plugin may map the same generic profile to different cloud
targets.

---

## Hybrid CPU/GPU/AI Systems

Modern systems often combine CPU, GPU and accelerators.

Galerina should support planning for:

```text
hybrid CPU/GPU scheduling
unified memory
shared address space
CPU control with GPU compute
data transfer minimisation
coherent memory where available
multi-device scheduling
```

Target names:

```text
hybrid_cpu_gpu
accelerator_auto
memory_interconnect
```

Example:

```Galerina
compute auto {
  features = prepareFeatures(input)
  result = Model.predict(features)
}
```

Galerina may plan:

```text
prepareFeatures -> CPU or CPU vector
Model.predict -> GPU / AI accelerator
postprocess -> CPU
```

---

## Precision Support

Galerina should support precision types for compute planning:

```text
Decimal
Float64
Float32
Float16
BFloat16
FP8
Int8
Int4
Quantized
Analogue
```

Rules:

```text
Decimal / Money -> business, VAT, accounting, exact values
Float* -> approximate maths, AI, vector, GPU, photonic candidates
BFloat16 -> AI acceleration where supported
FP8 / INT8 / INT4 -> quantised models where supported
Analogue -> wavelength/photonic planning only
```

Precision changes must be reported.

Precision must not silently change security or business decisions.

---

## Friendly Syntax Rule

Normal developers should use friendly types:

```Galerina
type Money = Decimal
type FraudFeatures
type FraudScore
type CustomerRows = Array<CustomerDumpRow>
```

Normal code:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Advanced code may expose lower-level types:

```Galerina
type FraudFeatureVector = Vector<1024, Float16>
type FraudScoreVector = Vector<256, Float32>
```

This should not be required in ordinary application code.

---

## Startup Hardware Detection

Before `main()` runs, Galerina should validate compute capabilities.

Startup order:

```text
1. Read boot.spore
2. Validate compute policy
3. Detect CPU features
4. Detect CPU vector support
5. Detect GPU support through available plugins
6. Detect AI accelerator support through available plugins
7. Detect photonic support through available plugins
8. Detect memory/interconnect capabilities
9. Detect cloud/deployment target metadata where available
10. Build target capability map
11. Run main()
```

Example capability map:

```json
{
  "availableTargets": {
    "photonic_auto": {
      "available": false,
      "reason": "No photonic target plugin detected"
    },
    "gpu": {
      "available": true,
      "plugin": "gpu_cuda",
      "supportsFloat16": true
    },
    "cpu_vector": {
      "available": true,
      "features": ["AVX2"]
    },
    "cpu": {
      "available": true
    }
  }
}
```

---

## Fallback Rules

Fallback is essential.

Recommended fallback chain:

```text
photonic candidate -> AI accelerator -> GPU -> CPU vector -> CPU
```

Fallback should happen if:

```text
target unavailable
driver missing
plugin missing
precision unsupported
calibration failed
memory too small
data transfer cost too high
workload unsuitable
security policy blocks target
cloud target unavailable
```

Fallback must be reported.

Fallback must not silently reduce safety.

---

## Security Rules

Compute targets must respect Galerina's security model.

Rules:

```text
compute auto cannot perform file I/O
compute auto cannot perform database I/O
compute auto cannot call APIs
compute auto cannot read secrets unless explicitly allowed
photonic targets cannot perform business side effects
GPU/AI/photonic results must return to strict Galerina values
security decisions must remain exact and exhaustive
fallback must not silently reduce safety
precision changes must be reported
analogue compute must declare tolerance and verification
```

---

## Energy and Cost Awareness

Galerina may eventually consider:

```text
energy cost
cloud cost
latency
throughput
device availability
memory movement cost
carbon/efficiency hints where available
```

Example policy:

```Galerina
compute {
  target_selection "auto"

  optimise_for "balanced"

  allowed_modes [
    "fastest",
    "lowest_cost",
    "lowest_energy",
    "balanced"
  ]
}
```

This should guide target planning. It must not override security, correctness or
policy constraints.

---

## Reports Galerina Should Generate

Galerina should generate:

```text
app.target-report.json
app.precision-report.json
app.fallback-report.json
app.memory-report.json
app.cloud-target-report.json
app.security-report.json
app.compute-capability-map.json
app.ai-guide.md
app.map-manifest.json
```

Target reports should include:

```text
selected target
available targets
rejected targets
fallback reason
precision used
memory movement
security constraints
cloud target recommendations
plugin used
vendor-specific mapping where applicable
```

Example target report:

```json
{
  "computeTargetSelection": {
    "flow": "scoreFraud",
    "source": "src/risk/fraud.spore:8",
    "computeMode": "auto",
    "selectedTarget": "gpu",
    "selectedPlugin": "gpu_cuda",
    "preferredTargets": [
      "photonic_auto",
      "ai_accelerator",
      "gpu",
      "cpu_vector",
      "cpu"
    ],
    "fallbackUsed": true,
    "fallbackReason": "photonic target plugin not available",
    "checkedTargets": [
      {
        "target": "photonic_auto",
        "available": false,
        "suitable": true
      },
      {
        "target": "gpu",
        "available": true,
        "suitable": true
      },
      {
        "target": "cpu_vector",
        "available": true,
        "suitable": true
      },
      {
        "target": "cpu",
        "available": true,
        "suitable": true
      }
    ]
  }
}
```

---

## AI Guide Integration

The generated AI guide should explain compute decisions clearly.

Example:

```markdown
## Compute Auto Summary

Flow:
`scoreFraud`

Source:
`src/risk/fraud.spore`

Developer code:
`compute auto`

Target preference:
1. photonic_auto
2. ai_accelerator
3. gpu
4. cpu_vector
5. cpu

Selected target:
GPU

Reason:
No photonic target plugin was available. GPU was available and suitable.

Fallback:
CPU vector and CPU available.

AI note:
Do not hard-code `compute target photonic_mzi` unless this project requires that
hardware and a target plugin is available.
```

---

## Recommended Target Names

General:

```text
compute auto
accelerator_auto
safe_cpu
```

CPU:

```text
cpu
cpu_x86_64
cpu_arm64
cloud_cpu
server_cpu
cpu_vector
```

GPU:

```text
gpu
gpu_auto
gpu_cuda
gpu_rocm
gpu_vulkan
webgpu
gpu_metal
gpu_opencl
```

AI accelerators:

```text
ai_accelerator
accelerator_auto
tpu
trainium
inferentia
npu
edge_ai
cloud_ai_accelerator
```

Photonic:

```text
photonic_auto
photonic_candidate
photonic_mzi
photonic_wdm
photonic_ring
photonic_crossbar
photonic_interconnect
photonic_signal
wavelength
```

Memory / interconnect:

```text
memory_interconnect
hybrid_cpu_gpu
cloud_interconnect
photonic_interconnect
```

Cloud / confidential compute:

```text
cloud_cpu
cloud_ai_accelerator
cloud_confidential_compute
cloud_security_processor
aws_graviton
aws_trainium
aws_inferentia
aws_nitro_enclave
google_axion
google_tpu
google_confidential_vm
azure_confidential_compute
```

Provider-specific names should be treated as optional plugin/deployment names,
not mandatory Galerina core features.

---

## Non-Goals

Galerina compute support should not:

```text
force developers to understand hardware details
force all compute onto GPU
force all compute onto photonic targets
make CPU optional
require photonic hardware
hard-code one cloud provider
hard-code one chip vendor
hard-code one GPU runtime
hard-code one AI accelerator
hide fallback decisions
silently change precision
run business logic on analogue targets
make beginner syntax look like hardware kernel code
replace vendor drivers or SDKs
```

---

## Open Questions

```text
Should compute auto be inferred from pure vector float flow?
Should compute auto be required for accelerator planning?
Should photonic_mzi always require CPU reference verification?
Should Decimal flows avoid GPU/photonic by default?
Should Money always remain CPU/exact unless explicitly batch-analysed?
Should cloud cost hints be built in or plugin-provided?
Should deployment targets be selected at build time, runtime, or both?
Should target capability maps be cached?
Should Galerina support vendor plugins for hardware backends?
Should provider-specific target names be allowed in core docs or moved to plugin docs?
Should analogue compute require mandatory tolerance and verification blocks?
```

---

## Recommended Early Version

Version 0.1:

```text
compute auto
cpu fallback
cpu_vector planning
gpu planning
target report
friendly vector syntax
fallback report
```

Version 0.2:

```text
AI accelerator target category
model precision metadata
memory/interconnect report
runtime capability map
target plugin boundary
```

Version 0.3:

```text
photonic_auto target category
photonic candidate reports
CPU reference verification
analogue tolerance rules
plugin-based photonic target names
```

Version 0.4:

```text
wavelength support as plugin target
photonic_wdm as plugin target
cloud cost/energy hints
cloud deployment target profiles
hardware plugin system
```

---

## Refactoring Summary

This document keeps compute planning as a valid Galerina compiler/runtime concern, but
removes wording that makes Galerina sound like it directly implements hardware
vendors, cloud chips, GPU runtimes, AI accelerator runtimes or photonic hardware
drivers.

Revised position:

```text
Compute planning belongs in Galerina compiler/runtime.
Vendor-specific hardware support belongs in target plugins, drivers and deployment profiles.
Galerina provides safe compute blocks, target categories, fallback rules, precision rules and reports.
```

Kept as Galerina compiler/runtime concerns:

```text
compute auto
CPU fallback
CPU vector planning
GPU planning
AI accelerator planning
photonic candidate planning
memory/interconnect awareness
precision declarations
fallback rules
target reports
precision reports
memory reports
security reports
runtime capability maps
AI-readable compute reports
```

Narrowed to plugin or deployment-profile areas:

```text
CUDA
ROCm
Vulkan compute
Metal
OpenCL
WebGPU runtime details
Google TPU
AWS Trainium
AWS Inferentia
AWS Graviton
AWS Nitro Enclave
Google Axion
Google Confidential VM
photonic MZI hardware
photonic WDM hardware
photonic ring hardware
specific optical compute chips
specific cloud security processors
```

Removed as native core assumptions:

```text
a photonic accelerator exists
a GPU exists
an AI accelerator exists
a specific cloud provider is used
a specific GPU runtime is available
a specific AI chip is available
a specific photonic chip is available
hardware-specific target names are always valid
```

---

## Final Principle

Galerina should support modern and future compute without making code difficult to
write or locking projects to one hardware ecosystem.

Final rule:

```text
CPU controls.
CPU vector accelerates small and medium numeric work.
GPU accelerates parallel workloads.
AI chips specialise in model workloads.
Photonic targets are optional candidates for suitable maths.
Memory/interconnect planning reduces bottlenecks.
Cloud target profiles guide deployment.
Target plugins handle vendor-specific backends.
compute auto chooses safely.
Fallback protects correctness.
Reports explain everything.
```

Galerina should make compute safer, clearer and easier to optimise.

Galerina should not become a vendor-specific hardware SDK.
