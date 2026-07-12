# Galerina AI

`galerina-ai` is the package for generic AI inference contracts.

It belongs in:

```text
/packages-galerina/galerina-ai
```

Use this package for:

```text
AI model metadata
prompt and response contracts
inference options
model capability declarations
memory estimates
AI safety policy
AI inference reports
AI review and report explanation contracts
passive LLM cache policy contracts        (planned — not yet exported)
LLM provider cache key contracts          (planned — not yet exported)
embedding cache policy contracts          (planned — not yet exported)
target-neutral generation contracts
AI compute plan declarations
```

## AI Compute Plans

`galerina-ai` should describe AI work as typed, governed compute plans rather than
opaque model calls.

AI compute plans should declare:

```text
input type
output type
model class
data sensitivity
precision
latency target
compute target
memory needs
allowed tools
audit needs
```

This lets `galerina-core-runtime` enforce policy before execution, reduce copying,
batch compatible work, choose smaller models or quantised execution where safe,
and validate typed outputs.

AI compute plans must not let AI grant capabilities to itself or bypass policy,
type checks, effect checks, data minimisation or audit.

See `../../../ZTF-Knowledge-Bases/ai-compute-plan.md`.

## Boundary

`galerina-ai` should not own a model runtime, kernel implementation, GPU backend or
low-bit backend model formats. Those belong in target or adapter packages.

AI output is untrusted by default. Application policy must decide whether and
how model output can influence business decisions.

AI review over Galerina reports is advisory. The compiler, checker, runtime
policies and generated reports remain the source of enforcement and proof.

Passive LLM caching is allowed only when it is safe, typed, source-tracked,
privacy-checked and reportable. `galerina-ai` may define provider-neutral cache
policy, key material and typed output validation contracts. It must not own the
cache store implementation, provider runtime or secret scanning implementation.

See `../../docs/PASSIVE_LLM_CACHE.md`.

## Contracts

The package includes typed contracts for model registry entries, model
capabilities, prompt/options validation, target preference selection and
inference reports. Future contracts should cover passive prompt/response cache,
embedding cache, schema-output cache, code-analysis cache, AI-context cache
policy and local AI report explanation contracts.

Final rule:

```text
galerina-ai describes AI inference.
galerina-ai will describe provider-neutral passive LLM cache contracts (planned — see body).
galerina-ai-lowbit adapts low-bit model backends.
galerina-core-compute and target packages choose where work runs.
galerina-core-security owns secret and privacy checks.
galerina-core-reports owns shared cache report shapes.
```
