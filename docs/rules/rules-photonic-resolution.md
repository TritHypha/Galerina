# Rules: Photonic Resolution

Photonic and optical values may be useful compute outputs, but they must not
silently become application control flow.

## Core Rule

```text
Photonic and optical values cannot directly control application flow.
They must be measured, resolved or matched into classical Galerina values.
```

## Required Behavior

- `Bool` controls ordinary application flow.
- `Tri` models uncertainty.
- `PhotonicSignal` models light-based compute output.
- `resolve` or `measure` converts optical output into safe application decisions.
- Reports prove how resolution happened.

## Reports

```text
photonic-target-report.json
optical-measurement-report.json
tri-resolution-report.json
uncertainty-report.json
fallback-report.json
```

## Knowledge Base

See [Photonic Resolution Boundary](../Knowledge-Bases/photonic-resolution-boundary.md).
