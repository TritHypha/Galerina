# Galerina Hardware Feature Detection and Security

This document describes how **Galerina / Galerina** could use newer CPU and GPU
features for both speed and security without making application code difficult
to write.

Galerina source should stay clean. The compiler and build pipeline should detect
supported hardware features, select the safest useful target, preserve fallback
behaviour and report what happened.

Status: Research. This is target-planning direction, not a v0.1 runtime or
backend guarantee.

---

## Summary

Galerina could sensibly take advantage of newer CPU and GPU features because the
language and toolchain are being designed now rather than inherited from much
older compiler assumptions.

Core model:

```text
Galerina source stays clean.
Compiler detects hardware features.
Build output selects the best safe target.
Fallback is always available.
Reports explain what was used.
```

This should apply to both speed-oriented acceleration and hardware-assisted
security features.

Device capability detection is not the same as providing native device APIs.
Galerina may detect/report compute and security capabilities such as CPU vector
support, GPU compute, NPU/AI acceleration, DSP-style compute or trusted
execution features. Camera, microphone, GPS, Bluetooth, notifications and media
features should remain package/platform/framework capabilities guarded by
permissions and reports.

---

## Speed Features

### 1. CPU Vector Instructions

Modern CPUs provide better vector support than older systems. Galerina should be able
to plan safe use of:

```text
AVX2
AVX-512
AVX10
CPU vector/SIMD paths
```

Typical Galerina use:

```Galerina
let columns = vectorize rows {
  spend = .spend
  orders = .orders
  refunds = .refunds
}
```

Target planning idea:

```text
small dataset -> CPU
medium numeric dataset -> CPU vector
large tensor workload -> GPU
```

Galerina should not force developers to write intrinsics manually for common data
analysis or vectorised dataset work.

### 2. CPU Matrix and AI Instructions

Some newer CPU platforms also expose matrix or AI-oriented instruction sets.
Galerina could use these for:

```text
AI inference
matrix multiplication
fraud scoring
vector similarity
large numeric transforms
```

Example:

```Galerina
compute target best {
  prefer cpu_matrix
  fallback cpu_vector
  fallback cpu

  result = model.forward(features)
}
```

The compiler should only select these paths when the operation, precision and
host CPU capabilities match.

### 3. GPU Tensor and Matrix Cores

For AI and large dense numeric workloads, GPUs are the obvious major target.
Galerina should expose this through normal compute blocks:

```Galerina
compute target gpu fallback cpu {
  precision {
    compute Float16
    accumulate Float32
  }

  logits = model.forward(inputBatch)
}
```

This keeps precision visible while still allowing high-throughput GPU plans.

### 4. Keep Data on Device

A major performance loss comes from repeated host/device transfers:

```text
CPU -> GPU -> CPU -> GPU
```

Galerina should detect and report this.

Example:

```Galerina
compute target gpu {
  vector_policy {
    keep_on_device true
    fusion true
  }

  features = normalise(input)
  logits = model.forward(features)
  result = softmax(logits)
}
```

Compiler warning idea:

```text
GPU transfer warning:
Tensor moved between CPU and GPU 4 times.
Suggestion: keep_on_device true.
```

---

## Security Features

### 1. Control-Flow Protection

Galerina should be able to request hardware-assisted control-flow protection where the
platform supports it.

Example:

```Galerina
security {
  control_flow_protection true
}
```

Build report direction:

```text
CET enabled where supported.
Fallback: compiler-level control-flow checks.
```

This fits Galerina's security-first model without forcing low-level platform handling
into normal application flows.

### 2. Memory Protection Keys and Memory Isolation

Hardware memory-isolation features could help Galerina protect secrets, isolate
package memory and reduce the blast radius of unsafe integrations.

Example concept:

```Galerina
memory {
  protect_secrets true
  isolate_packages true
}
```

Use cases:

```text
protect SecureString memory
separate request memory regions
protect plugin/package memory
lock sensitive buffers after use
```

### 3. Confidential Computing

For cloud and server deployment, Galerina should be able to report when confidential
runtime environments are recommended for workloads using secrets, payment data
or sensitive AI inputs.

Deployment report direction:

```text
This app handles SecureString and payment data.
Recommended confidential runtime:
- AMD SEV-SNP
- Intel TDX
```

### 4. GPU Confidential Computing

Galerina should also support a policy direction for sensitive GPU workloads:

```Galerina
compute target gpu {
  confidential_required true
  fallback cpu_confidential

  result = privateModel.infer(features)
}
```

This is a planning and reporting feature first. It should fail closed if the
required confidential target is unavailable.

### 5. GPU Isolation

For multi-tenant GPU services, Galerina should be able to report when an isolated GPU
execution mode is recommended.

Report direction:

```text
GPU workload can run in isolated MIG instance.
Recommended for multi-tenant AI/API services.
```

Galerina should treat this as deployment guidance and target planning, not as an
implicit guarantee from the language alone.

---

## Future-Looking CPU Features

Galerina should remain open to newer hardware features such as:

```text
future vector ISA convergence
matrix extensions
improved control-flow entry models
memory tagging
```

The most important future-facing security feature is likely memory tagging,
because it could help detect:

```text
use-after-free
buffer overflows
invalid memory access
wrong-region memory use
```

That fits Galerina's memory-safe design direction well, but it should still be
treated as target capability and reportable policy rather than assumed runtime
behaviour.

---

## Best Galerina Design

Galerina should not require developers to manually code for every CPU or GPU feature.

Example direction:

```Galerina
target {
  speed_features "auto"
  security_features "auto"
  fallback "safe"
  report true
}
```

Compiler output should record what was detected, what was selected and what
fallback was used.

Example:

```json
{
  "hardwareFeatures": {
    "cpuVector": "AVX-512 available",
    "matrixAcceleration": "AMX unavailable",
    "gpuTensor": "available",
    "controlFlowProtection": "CET enabled",
    "confidentialVm": "TDX/SEV-SNP recommended",
    "fallback": "cpu"
  }
}
```

---

## Galerina Difference

Older toolchains often expose these features through:

```text
manual compiler flags
libraries
platform-specific intrinsics
special build scripts
```

Galerina should move that logic into the language toolchain:

```text
vectorize rows { ... }
compute target best { ... }
security { control_flow_protection true }
memory { protect_secrets true }
build reports explain hardware usage
fallback always available
```

---

## Recommended Early Focus

The strongest practical early targets are:

```text
CPU vectorisation for dataset analysis
GPU Tensor Core planning for AI/vector workloads
control-flow protection where available
secret memory protection strategy
confidential deployment reports
GPU confidential compute policy
hardware feature reports in app.target-report.json
```

These keep Galerina practical on today's hardware while preserving a path to richer
future backends.

---

## Final Rule

```text
Galerina should write clean code, detect modern hardware, use it when safe, fall back when unavailable, and report exactly what happened.
```

---

## References

The external references below describe the hardware features that informed this
planning document.

```text
AMD 4th Gen EPYC Processor Architecture
https://www.amd.com/content/dam/amd/en/documents/products/epyc/4th-gen-epyc-processor-architecture-white-paper.pdf

Intel Deep Learning with AVX-512 and DL Boost
https://www.intel.com/content/www/us/en/developer/articles/guide/deep-learning-with-avx512-and-dl-boost.html

NVIDIA Tensor Cores
https://www.nvidia.com/en-us/data-center/tensor-cores/

Intel Control-flow Enforcement Technology
https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/12th-generation-intel-core-processors-datasheet-volume-1-of-2/010/intel-control-flow-enforcement-technology/

Linux kernel documentation: Memory Protection Keys
https://docs.kernel.org/core-api/protection-keys.html

AMD Secure Encrypted Virtualization
https://www.amd.com/en/developer/sev.html

NVIDIA H100 Confidential Computing
https://developer.nvidia.com/blog/confidential-computing-on-h100-gpus-for-secure-and-trustworthy-ai/

NVIDIA MIG User Guide
https://docs.nvidia.com/datacenter/tesla/mig-user-guide/

AMD and Intel x86 Ecosystem Advisory Group update
https://www.amd.com/en/blogs/2025/amd-and-intel-celebrate-first-anniversary-of-x86-ecosys.html
```
