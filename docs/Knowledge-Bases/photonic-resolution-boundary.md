# Photonic Resolution Boundary

Photonic and optical support fits the Galerina core model as a compute boundary,
not as normal application control flow.

## Core Rule

```text
Photonic and optical values cannot directly control application flow.
They must be measured, resolved or matched into classical Galerina values.
```

Only `Bool` controls ordinary application flow.

Every resolution from signal, `Tri`, confidence or uncertainty to `Bool` must
be explicit, policy-based and reportable.

## Why This Exists

Photonic and optical systems may produce:

```text
signal strength
wavelength
phase
amplitude
noise
interference
thresholds
confidence
Tri / unknown
analogue values
```

Galerina must not pretend every optical result is automatically a clean Boolean.

## Unsafe Pattern

```galerina
let access: PhotonicTri = OpticalAccessCheck.evaluate(user)

if access {
  return AdminPanel.show()
}
```

This should be rejected because `access` may be true, false, unknown, noisy or
below the required confidence threshold.

## Safe Pattern

```galerina
let access: PhotonicTri = OpticalAccessCheck.evaluate(user)

match access {
  true => return AdminPanel.show()
  false => return Error.forbidden()
  unknown => return Error.manualReview()
}
```

Or use explicit resolution:

```galerina
let allowed: Bool = resolve access using {
  unknown_as false
  minimum_confidence 0.98
  on_low_confidence manual_review
  report true
}
```

## Compute Boundary

```galerina
boundary compute OpticalRiskScoring {
  target light {
    prefer photonic
    fallback gpu
    fallback cpu_vector
    allow silent_fallback false
  }

  input RiskInput
  output PhotonicTri

  report {
    require target_report
    require uncertainty_report
    require fallback_report
  }
}
```

Normal Galerina web app code still runs in the secure runtime. Photonic execution
is a declared compute boundary.

## Resolve Policy

```galerina
resolve policy AccessResolutionPolicy {
  input PhotonicTri
  output Bool

  true when value == true and confidence >= 0.98
  false when value == false and confidence >= 0.98
  unknown_as false
  audit required
  report required
}
```

## Reports

```text
photonic-target-report.json
optical-measurement-report.json
tri-resolution-report.json
uncertainty-report.json
fallback-report.json
```

## Core Model Fit

| Concept | Photonic role |
|---|---|
| `data` | photonic signals, measurements, confidence and decisions |
| `flow` | secure flow calls a compute boundary and resolves the result |
| `permission` | controls who can use the compute boundary and expose results |
| `boundary` | photonic/optical compute boundary |
| `report` | target, uncertainty, resolution and fallback evidence |
