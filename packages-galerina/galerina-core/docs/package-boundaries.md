# Galerina Package Boundaries

This document explains which Galerina concepts belong in `galerina-core` and which concepts
belong in sibling packages.

`galerina-core` should stay focused on the language, compiler-facing syntax, core type
rules, safety model, report contracts and examples needed to describe the
language.

It should not absorb every future Galerina package.

If `docs/COVERAGE.md` records conflicting public contract shapes, do not treat
the conflict as implementable. Update the owning package docs to either choose
one canonical shape or mark the conflict as unresolved.

## Package Ownership

```text
packages-galerina/galerina-core
  Bool
  Option
  Result
  basic flow syntax
  basic type rules
  effects syntax
  compiler diagnostics
  report contracts
  language examples

packages-galerina/galerina-core-compiler
  lexer
  parser
  AST
  checker pipeline
  IR
  diagnostics
  source maps
  compiler reports

packages-galerina/galerina-core-runtime
  checked execution
  compiled execution
  effect dispatch
  runtime memory policy
  runtime error handling
  runtime reports

packages-galerina/galerina-core-security
  SecureString helper model
  redaction primitives
  permission model types
  security diagnostics
  security report contracts

packages-galerina/galerina-core-config
  project config shape
  environment modes
  config validation diagnostics
  production policy loading

packages-galerina/galerina-core-reports
  shared report metadata
  shared diagnostics
  report schema contracts
  processing report contracts
  report writer contracts

packages-galerina/galerina-core-logic
  Tri
  Galerina
  Decision
  RiskLevel
  Omni logic
  multi-state logic rules
  conversion rules
  truth tables
  logic reports

packages-galerina/galerina-core-vector
  Vector<T, N>
  Matrix<T, R, C>
  Tensor<T, Shape>
  Shape
  numeric element contracts
  vector dimensions
  vector lanes
  vector operations
  tensor operations
  vector safety rules
  vector reports

packages-galerina/galerina-core-compute
  compute planning
  compute capabilities
  compute budgets
  offload planning
  fallback planning
  target selection
  compute reports

packages-galerina/galerina-ai
  AI model metadata
  prompt and response contracts
  inference options
  AI safety policy
  AI inference reports

packages-galerina/galerina-ai-lowbit
  low-bit model references
  GGUF model metadata
  low-bit and ternary quantization declarations
  backend selection contracts
  CPU low-bit inference plans
  low-bit inference reports

packages-galerina/galerina-ai-agent
  agent definitions
  agent tool permissions
  agent limits
  supervised task group plans
  merge policies
  agent reports

packages-galerina/galerina-ai-neural
  neural model definitions
  neural layers
  activation functions
  inference boundaries
  training boundaries
  neural reports

packages-galerina/galerina-ai-neuromorphic
  Spike
  SpikeTrain
  EventSignal<T>
  spiking model contracts
  neuromorphic reports

packages-galerina/galerina-core-photonic
  Wavelength
  Phase
  Amplitude
  OpticalSignal
  OpticalChannel
  photonic simulation concepts
  logic-to-light vocabulary
  photonic runtime target semantics
  photonic execution plan semantics
  SPORE-PHOTONIC diagnostics after reconciliation

packages-galerina/galerina-target-cpu
  CPU architecture metadata
  SIMD capability reports
  threading policy
  memory limits
  CPU fallback reports

packages-galerina/galerina-cpu-kernels
  GEMM and GEMV kernel contracts
  vector and matrix kernel plans
  low-bit operation contracts
  ternary operation contracts
  tiling and threading plans

packages-galerina/galerina-target-native
  native target metadata
  native artifact planning
  platform triples
  ABI requirements
  native target reports

packages-galerina/galerina-target-wasm
  WASM target metadata
  WASM module output planning
  import/export contracts
  WASM target reports

packages-galerina/galerina-target-gpu
  GPU target capabilities
  GPU plan output
  kernel mapping plans
  precision and data movement reports

packages-galerina/galerina-target-ai-accelerator
  NPU and TPU target capabilities
  AI-chip target planning
  passive accelerator backend profiles
  precision compatibility reports
  accelerator memory and topology reports
  model operation mapping plans
  accelerator fallback reports

packages-galerina/galerina-target-photonic
  photonic backend target plans
  optical I/O interconnect plans
  photonic target capabilities
  optical interconnect capabilities
  logic-to-photonic lowering plans
  data movement reports
  photonic target reports

packages-galerina/galerina-framework-app-kernel
  typed API boundary enforcement
  validation policy
  auth policy
  rate-limit policy
  idempotency and replay protection
  queue/job contracts
  runtime and audit reports

packages-galerina/galerina-framework-api-server
  HTTP listening
  request normalisation
  route manifest loading
  server-level limits
  safe HTTP responses

packages-galerina/galerina-core-cli
  developer commands
  check/build/run/serve/report commands
  safe output formatting
  task command dispatch

packages-galerina/galerina-core-tasks
  safe project automation
  task effects and permissions
  dry run mode
  task reports
  unsafe shell gates

packages-galerina/galerina-tools-benchmark
  benchmark configuration
  benchmark task definitions
  light/full/stress benchmark modes
  target fallback diagnostics
  privacy-safe benchmark reports
  shareable benchmark payload contracts

packages-galerina/galerina-devtools-project-graph
  project graph nodes and relationships
  package ownership maps
  documentation and decision links
  graph output manifests
  AI assistant map contracts
```

## Update Rule

When changing a concept, update the owning package first.

Examples:

```text
Tri conversion rule changes
  update packages-galerina/galerina-core-logic first
  update galerina-core docs only if syntax or compiler checking changes

Vector lane rules
  update packages-galerina/galerina-core-vector first
  update galerina-core docs only if language syntax changes

Compute target selection
  update packages-galerina/galerina-core-compute first
  update galerina-core docs only if compute block syntax changes

AI inference contracts
  update packages-galerina/galerina-ai first
  update galerina-core docs only if package registry or effect syntax changes

Low-bit AI backend
  update packages-galerina/galerina-ai-lowbit, packages-galerina/galerina-target-cpu or packages-galerina/galerina-cpu-kernels first
  update galerina-core docs only if compute target syntax or report contracts change

Parallel AI agent orchestration
  update packages-galerina/galerina-ai-agent first
  update packages-galerina/galerina-core-runtime only if structured concurrency contracts change
  update packages-galerina/galerina-core-security only if permission or tool safety contracts change
  update galerina-core docs only if async/task_group/spawn syntax changes

Neural model or training boundary changes
  update packages-galerina/galerina-ai-neural first
  update packages-galerina/galerina-core-vector only if tensor shape contracts change
  update galerina-core docs only if language-level compute syntax changes

Neuromorphic event or spiking model changes
  update packages-galerina/galerina-ai-neuromorphic first
  update target packages only if hardware planning changes

AI accelerator target changes
  update packages-galerina/galerina-target-ai-accelerator first
  update packages-galerina/galerina-core-compute only if target selection contracts change

AI accelerator vendor profile changes
  update docs/AI_ACCELERATOR_TARGETS.md and packages-galerina/galerina-target-ai-accelerator first
  update packages-galerina/galerina-tools-benchmark only if benchmark target contracts change
  update galerina-core docs only if target syntax or package registry contracts change

Photonic wavelength model
  update packages-galerina/galerina-core-photonic first
  update galerina-core docs only if language-level target declarations change

Photonic backend lowering
  update packages-galerina/galerina-target-photonic first
  update galerina-core docs only if target report contracts change

Optical I/O or interconnect planning
  update docs/OPTICAL_IO.md and packages-galerina/galerina-target-photonic first
  update packages-galerina/galerina-core-compute only if target selection or data movement contracts change
  update packages-galerina/galerina-tools-benchmark only if benchmark target contracts change
  update galerina-core docs only if target syntax or package registry contracts change

WASM or GPU target backend changes
  update packages-galerina/galerina-target-wasm or packages-galerina/galerina-target-gpu first
  update galerina-core docs only if target syntax or report contracts change

Security primitive changes
  update packages-galerina/galerina-core-security first
  update galerina-core docs only if language security syntax or compiler checks change

Runtime execution changes
  update packages-galerina/galerina-core-runtime first
  update galerina-core docs only if language runtime contracts change

Resilient flow or controlled recovery changes
  update docs/RESILIENT_FLOWS.md first for workspace-level policy
  update packages-galerina/galerina-core-runtime first for supervision, retry and checkpoint behavior
  update packages-galerina/galerina-core-reports first for processing report shape changes
  update galerina-core docs only if resilient/recover syntax changes

Compiler pipeline changes
  update packages-galerina/galerina-core-compiler first
  update galerina-core docs only if language contracts or schemas change

Config or report shape changes
  update packages-galerina/galerina-core-config or packages-galerina/galerina-core-reports first
  update galerina-core docs only if compiler output contracts change

CLI command behaviour
  update packages-galerina/galerina-core-cli first
  update galerina-core docs only if compiler command contracts change

Safe task automation
  update packages-galerina/galerina-core-tasks first
  update galerina-core docs only if package registry or task syntax changes

Benchmark diagnostics
  update packages-galerina/galerina-tools-benchmark first
  update target packages only if capability detection contracts change
  update packages-galerina/galerina-core-reports only if shared report schemas change
  update galerina-core docs only if benchmark syntax or package registry contracts change

Project knowledge graph tooling
  update packages-galerina/galerina-devtools-project-graph first
  update galerina-core docs only if compiler reports or package registry contracts change
```

## Core Reference Policy

`galerina-core` may reference sibling packages to explain boundaries, imports and
compiler report contracts.

`galerina-core` should avoid owning package implementation details such as:

```text
HTTP server internals
auth provider implementation
task runner execution
benchmark runner implementation
project graph extraction implementation
photonic hardware backend code
binary emitter implementation
AI model runtime implementation
BitNet or other low-bit backend adapter implementation
vector runtime kernels
compute scheduler implementation
CLI command UX details
framework conventions
CMS/admin/frontend features
```

## Future Repository Split

The current workspace may keep packages in one root repository while boundaries
are still changing.

The future layout may split reusable packages into their own repository:

```text
light-framework/.git
light-framework/packages-galerina/.git
```

When that split happens, `galerina-core` docs should continue to reference sibling
packages by package name and path, but implementation details should remain in
the owning package repository.
