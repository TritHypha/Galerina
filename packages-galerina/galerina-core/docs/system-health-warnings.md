# System Health Warnings

Galerina should standardise warnings for system health issues that affect compilation, runtime safety, cache behaviour, target fallback or generated reports.

## Health Areas

```text
disk
memory
cache
compiler
runtime
hardware
target support
```

## Required Behaviour

System health problems should be:

```text
detected where practical
reported with a standard diagnostic code
source-mapped when tied to source code
included in structured reports
paired with a recovery action when one exists
promoted to fatal when continuing would be unsafe
```

## Example

```text
Galerina-WARN-TARGET-003: Accelerator target unavailable. Falling back to CPU.
```

This warning should also appear in the target report and build manifest diagnostics summary.
