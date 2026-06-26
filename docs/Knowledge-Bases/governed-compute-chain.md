# Galerina — Governed Compute Chain

## Status

```
Future runtime feature (post-v1 implementation)
Design spec for the compute target system
```

This document defines the `compute target` syntax and the governed compute
chain model for Galerina. It covers CPU/GPU staging, AI inference chains,
tensor transfer semantics, fallback policies, and the audit proof format for
multi-target execution.

---

## 1. Core Concept

Not every part of a flow should run on the same compute target. Some logic
belongs on the CPU (normal governed logic, database reads, audit writes),
some belongs on the GPU or NPU (tensor operations, rendering, inference).

Galerina models this as a **chained compute graph** — an ordered sequence of
compute stages, each with its own target, effects, resources, and fallback:

```text
business / normal logic   (cpu)
    ↓
data preparation          (cpu)
    ↓
graphics / AI compute     (gpu / npu)
    ↓
result processing         (cpu)
    ↓
audit proof               (cpu)
```

---

## 2. Syntax

### Basic compute stage

```galerina
compute target cpu {
  let user: User = UsersDB.findById(request.userId)?
  let data: ChartData = ReportsDB.loadChartData(user.id)?
}
```

### GPU stage

```galerina
compute target gpu {
  let frame: RenderFrame = Graphics.render({
    vertices: vertices,
    labels:   labels,
    width:    request.width,
    height:   request.height
  })
}
```

### Best-available target with preferences

```galerina
compute target best {
  prefer [npu, gpu]

  let embedding: EmbeddingVector = EmbeddingModel.embed(tokens)
}
```

### Target with fallback and governance

```galerina
compute target best {
  prefer [gpu, npu]
  fallback cpu

  let completion: LlmCompletion = LocalLLM.generate({ prompt, context })
}
```

### Target with explicit capability requirements

```galerina
compute target gpu
requires [graphics.render]
effects  [gpu.compute]
fallback cpu {
  let frame: RenderFrame = Graphics.render(gpuBuffer)
}
```

---

## 3. Supported Target Keywords

| Target | Meaning |
|---|---|
| `cpu` | Standard CPU execution |
| `gpu` | GPU compute (graphics or GPGPU) |
| `npu` | Neural Processing Unit |
| `photonic` | Photonic compute (future) |
| `distributed` | Distributed cluster execution |
| `inference_cluster` | Dedicated AI inference cluster |
| `best` | Runtime selects best available target from `prefer` list |

---

## 4. Explicit Tensor Transfer

Data crossing between compute targets must be **declared explicitly**. Hidden
memory copies are not allowed.

```galerina
// CPU → GPU
let gpuBuffer: GpuBuffer<Vertex> = transfer.toGpu(vertices)
let frame: RenderFrame = Graphics.render(gpuBuffer)

// GPU → CPU
let image: Image = transfer.fromGpu(frame)
```

For AI workloads:

```galerina
// Full-precision embedding → quantized GPU tensor
let embedding: Tensor<Float32> = EmbeddingModel.embed(tokens)
let quantized: Tensor<Int8> quantized = quantize.int8(embedding)

compute target npu {
  let logits: Tensor<Int8> = Inference.run(quantized)
}

// Back to CPU
let output: Tensor<Float32> = dequantize(logits)
```

**Why explicit?** Hidden cross-target copies are a major source of
performance bugs (VRAM pressure, silent CPU fallback, unexpected PCIe
bandwidth). Making them visible allows the runtime planner to optimise and
the audit system to record them.

---

## 5. Full Example — Dashboard Rendering

```galerina
secure flow renderDashboard(request: DashboardRequest)
  -> Result<RenderedDashboard, RenderError>
effects [database.read, gpu.compute, audit.write] {

  // Governed data load on CPU
  compute target cpu {
    let user: User     = UsersDB.findById(request.userId)?
    let data: ChartData = ReportsDB.loadChartData(user.id)?
  }

  // Geometry preparation on CPU
  compute target cpu {
    let vertices: VertexBuffer = ChartCompiler.toVertices(data)
    let labels:   TextLayout   = ChartCompiler.layoutLabels(data)
  }

  // Rendering on GPU
  compute target gpu {
    let gpuBuffer: GpuBuffer<Vertex> = transfer.toGpu(vertices)
    let frame: RenderFrame = Graphics.render({
      vertices: gpuBuffer,
      labels:   labels,
      width:    request.width,
      height:   request.height
    })
  }

  // Back to CPU for audit and response
  compute target cpu {
    let image: Image = transfer.fromGpu(frame)

    AuditLog.write({
      event:  "DashboardRendered",
      userId: request.userId
    })

    return Ok(RenderedDashboard { image, format: "png" })
  }
}
```

---

## 6. AI Compute Chain Model

A single AI request is naturally a multi-stage compute chain:

```text
API request
    ↓
tokenization          (cpu)
    ↓
embedding generation  (npu / gpu)
    ↓
vector search         (cpu / ram)
    ↓
LLM inference         (gpu / npu)
    ↓
safety validation     (cpu)
    ↓
stream output         (cpu / network)
```

### Full AI flow example

```galerina
secure flow answerQuestion(request: ChatRequest)
  -> Result<ChatResponse, ChatError>
effects [
  ai.inference,
  vector.search,
  gpu.compute,
  network.stream,
  audit.write
] {

  compute target cpu {
    let user:   User   = UsersDB.findById(request.userId)?
    let prompt: Prompt safe validated = PromptBuilder.fromRequest(request)?
  }

  compute target cpu {
    let tokens: TokenBuffer = Tokenizer.encode(prompt)
  }

  compute target best {
    prefer [npu, gpu]
    let embedding: EmbeddingVector = EmbeddingModel.embed(tokens)
  }

  compute target cpu {
    let context: RetrievedContext = VectorDB.search(embedding)?
  }

  compute target best {
    prefer [gpu, npu]
    fallback cpu

    let completion: LlmCompletion = LocalLLM.generate({ prompt, context })
  }

  compute target cpu {
    let checked: SafeCompletion safe validated =
      SafetyPolicy.validate(completion)?
  }

  compute target cpu {
    AuditLog.write({ event: "ChatCompletionGenerated", userId: request.userId })
    return Ok(ChatResponse { text: checked.text })
  }
}
```

---

## 7. AI Governance Intent

```galerina
intent LocalPrivateInference {
  denies [
    remote.execution,
    network.external
  ]
}
```

The compiler and runtime can prove:

```text
Model inference remained local.
No cloud API calls occurred.
```

This is critical for private AI, enterprise AI, regulated/medical AI,
edge deployments, and offline copilots.

---

## 8. Runtime Compute Plan

The runtime generates a structured compute plan from the staged flow:

```yaml
computePlan:
  stages:
    - id: tokenize
      target: cpu
    - id: embed
      target: npu
    - id: vector_search
      target: cpu
    - id: inference
      target: gpu
    - id: safety_validation
      target: cpu
    - id: response_stream
      target: cpu

  transfers:
    - cpu_to_npu: TokenBuffer
    - npu_to_cpu: EmbeddingVector
    - cpu_to_gpu: ContextBundle
    - gpu_to_cpu: LlmCompletion
```

---

## 9. Audit Proof Format

```yaml
auditProof:
  flow: answerQuestion

  computeStages:
    - target: cpu
      purpose: load user and build prompt
    - target: npu
      purpose: generate embedding
    - target: cpu
      purpose: vector search retrieval
    - target: gpu
      purpose: LLM inference
    - target: cpu
      purpose: safety validation and output

  transfers:
    - cpu_to_npu: TokenBuffer
    - npu_to_cpu: EmbeddingVector
    - cpu_to_gpu: ContextBundle
    - gpu_to_cpu: LlmCompletion

  inference:
    model:            galerina-7b
    quantized:        true
    precision:        int8
    local_execution:  true
    remote_execution: none

  safetyValidation: enabled
  fallbackUsed:     false
  governanceViolations: none
```

---

## 10. Quantized Execution Chains

Galerina tracks precision transitions across compute targets:

```galerina
let embedding: Tensor<Float32> = EmbeddingModel.embed(tokens)
let quantized: Tensor<Int8> quantized = quantize.int8(embedding)

compute target npu {
  let logits: Tensor<Int8> = Inference.run(quantized)
}

let output: Tensor<Float32> = dequantize(logits)
```

The compiler prevents mixing quantized and full-precision tensors unsafely
(see `SPORE-TYPE-017: QuantizedPrecisionMismatch`).

---

## 11. Streaming Inference

```galerina
compute target gpu {
  stream token in LocalLLM.stream(prompt) {
    yield token
  }
}
```

The runtime governs: stream rate, memory growth, token filtering,
runtime cancellation, and audit evidence.

---

## 12. Verification Stage

For critical AI workloads, outputs can be verified against a reference:

```galerina
compute target gpu {
  let logits: Tensor<Float16> = LocalLLM.generate(tokens)
}

compute target cpu {
  verify.sample(logits)?
}
```

Or declaratively:

```galerina
verification {
  reference_model cpu
  tolerance       0.001
}
```

This catches silent GPU corruption, driver issues, quantized inference drift,
and photonic approximation errors.

---

## 13. Relationship to Other Systems

| System | Relationship |
|---|---|
| Effect system | Each compute stage declares its effects |
| Governance verifier | `intent` blocks govern which targets are allowed |
| Value-state checker | `secret protected` values cannot be passed to GPU stages |
| Audit proof | Every stage, transfer, and fallback is recorded |
| IHSA storage policy | Disk reads inside compute stages must declare `storage.read.infrequent` |
| `@state(gpu)` | GPU lifecycle state lives in Layer C (see `lifecycle-state-system.md`) |

---

## 14. v1 Scope

The `compute target` syntax is **designed now, implemented post-v1**. In v1:

- Parse `compute target <keyword> { ... }` as a `ComputeTargetBlock` AST node
- Record `target`, `prefer`, `fallback`, `requires`, `effects` metadata
- Emit `SPORE-COMPUTE-001` (unsupported in runtime) — warn but do not halt

Full runtime dispatch and tensor transfer tracking are Layer B features.
