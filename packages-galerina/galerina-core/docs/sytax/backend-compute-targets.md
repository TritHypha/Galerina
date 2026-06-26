# Backend Compute Target Syntax

Status: Draft.

This file defines syntax direction for backend compute planning. Compute
planning is a valid Galerina compiler/runtime concern, but vendor-specific runtimes,
drivers, SDKs and cloud hardware mappings belong in target plugins or deployment
profiles.

---

## Purpose

```text
support compute auto
support generic target categories
support fallback chains
support precision and tolerance declarations
support memory/interconnect planning
support runtime capability maps
support target reports
avoid vendor-specific core language lock-in
```

---

## Grammar Direction

```text
compute_block     = "compute" ("auto" | target_clause) block
target_clause     = "target" target_name fallback_clause*
fallback_clause   = "fallback" target_name
compute_policy    = "compute" block
prefer_list       = "prefer" "[" target_name_list "]"
precision_block   = "precision" block
verify_block      = "verify" block
deployment_block  = "deployment" block
```

Generic target names may include:

```text
cpu
safe_cpu
cpu_vector
gpu
gpu_auto
ai_accelerator
accelerator_auto
photonic_auto
photonic_candidate
memory_interconnect
hybrid_cpu_gpu
cloud_cpu
cloud_ai_accelerator
cloud_confidential_compute
```

Plugin/deployment names may include vendor-specific names, but those are not
mandatory Galerina core targets.

---

## Minimal Examples

Beginner-friendly compute:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Explicit target with fallback:

```Galerina
compute target gpu fallback cpu_vector fallback cpu {
  result = Model.predict(input)
}
```

Project compute policy:

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

Model precision metadata:

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

Photonic candidate with verification:

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

Cloud deployment profile:

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

---

## Security Rules

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
provider-specific target names require plugins or deployment profiles
```

---

## Report Output

Recommended reports:

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

Report fields should include:

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
source-map links back to .spore files
```

---

## Open Parser and Runtime Work

```text
parse compute auto
parse explicit compute target fallback chains
parse compute policy blocks
parse precision/tolerance metadata
parse model target preferences
parse deployment target profiles
build runtime capability maps
report CPU/GPU/AI/photonic/memory target checks
report fallback and precision choices
report plugin and deployment-profile mappings
reject vendor-specific targets without plugin/deployment support
keep vendor SDKs and hardware drivers out of Galerina core
```

