# Backend Compute Target Examples

Status: Draft.

These examples show how Galerina should express backend compute planning while keeping
vendor-specific hardware behaviour in plugins, drivers and deployment profiles.

---

## Good Examples

Compute auto:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute auto {
    return FraudModel.predict(features)
  }
}
```

Explicit GPU with CPU fallback:

```Galerina
compute target gpu fallback cpu_vector fallback cpu {
  result = Model.predict(input)
}
```

CPU/exact accounting:

```Galerina
flow calculateVat(subtotal: Money) -> Money {
  return subtotal * 0.20
}
```

Reason:

```text
Money/Decimal logic should remain exact and CPU-safe unless a project explicitly
uses batch analysis with clear precision rules.
```

Photonic candidate as advanced opt-in:

```Galerina
pure vector float flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute target photonic_mzi required {
    return FraudModel.predict(features)
  }
}
```

Reason:

```text
photonic_mzi is a plugin/deployment target. Normal code should prefer compute auto.
```

Memory movement policy:

```Galerina
compute {
  gpu {
    keep_on_device true
    fusion true
    warn_on_excess_transfers true
  }
}
```

Cloud profile:

```Galerina
deployment {
  cloud "aws"

  targets {
    ai_inference {
      prefer [cloud_ai_accelerator, gpu]
      fallback cpu
    }
  }
}
```

---

## Bad Examples

Hard-coding a vendor runtime in beginner code:

```Galerina
flow scoreFraud(features: FraudFeatures) -> FraudScore {
  compute target gpu_cuda required {
    return FraudModel.predict(features)
  }
}
```

Expected diagnostic:

```text
vendor_target_requires_plugin_or_policy
```

Reason:

```text
Vendor-specific target names require an installed target plugin or deployment
profile. Normal code should use compute auto or generic target categories.
```

---

Secret access inside compute auto:

```Galerina
compute auto {
  let key = env.secret("MODEL_KEY")
  return Model.predictWithKey(input, key)
}
```

Expected diagnostic:

```text
compute_forbidden_secret_effect
```

Reason:

```text
compute auto cannot read secrets unless a policy explicitly allows and reports it.
```

---

Database access inside accelerator compute:

```Galerina
compute target gpu fallback cpu {
  let rows = database.query("select * from orders")
  return analyse(rows)
}
```

Expected diagnostic:

```text
compute_forbidden_database_effect
```

Reason:

```text
Compute blocks are for compute-heavy work, not database I/O.
```

---

Analogue result used directly for a security decision:

```Galerina
let score = opticalRisk(features)

if score > 0.90 {
  approvePayment()
}
```

Expected diagnostic:

```text
analogue_result_requires_strict_conversion
```

Reason:

```text
Photonic/analogue compute must return to strict Galerina values before business or
security decisions.
```

---

Precision changed silently:

```Galerina
model RiskModel {
  input FraudFeatures
  output FraudScore

  targets {
    prefer [ai_accelerator, gpu]
    fallback cpu
  }
}
```

Expected diagnostic:

```text
missing_precision_policy_for_accelerator
```

Reason:

```text
Accelerator model workloads need explicit or inherited precision/tolerance
rules, and precision choices must be reported.
```

---

## Expected Reports

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

Reports should explain:

```text
which target was selected
which targets were checked and rejected
which fallback was used
which plugin or deployment profile mapped a vendor target
which precision was used
which memory transfers were estimated
which security constraints blocked targets
which generated report locations map back to .spore source
```

