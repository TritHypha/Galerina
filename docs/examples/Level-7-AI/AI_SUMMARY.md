## What this level teaches

- `ai.inference` as the required effect for any flow calling a machine-learning model
- Embedding flows: typed `Tensor<Float32, [1, 768]>` outputs from embedding models
- Local-model-only patterns: `deny [remote.execution, network.outbound]` for air-gapped deployments
- Protected AI input: validating raw user input before passing it to a model (`SPORE-VALUESTATE-003`)
- AI batch inference — processing multiple inputs under a single `ai.inference` declaration
- Embedding with fallback — handling model unavailability via `Result<T, E>`
- `ai.inference` effect propagation through call chains (same rules as other effects)
- AI flow governance: intent that describes model scope, audit requirements for AI decisions
- `redacted` values in AI audit logs — never log raw model input or output without redaction
- Classification flows and labelled output types

## Canonical patterns

```spore
// Basic embedding flow — ai.inference effect required
guarded flow embedText(text: String) -> EmbedTextResult
contract {
  types { type EmbedTextResult = Result<Tensor<Float32, [1, 768]>, AiError> }
  intent { "Embed text into a typed tensor using an on-device embedding model." }
  effects { ai.inference }
}
{
  let embedding = EmbeddingModel.embed(text)?
  return Ok(embedding)
}
```

```spore
// Local-only AI: deny remote execution for data-residency compliance
secure flow classify(readonly request: Request) -> ClassifyResult
contract {
  types { type ClassifyResult = Result<Response, AiError> }
  intent { "Classify locally only — no network access permitted." }
  effects { ai.inference }
}
{
  compute target best { prefer [cpu] deny [remote.execution, network.outbound] }
  unsafe let rawText: String = request.body.text
  let text: String           = validate.text(rawText)?
  let label: Label           = LocalClassifierModel.classify(text)?
  return Ok(Response.ok(label))
}
```

## Do not use in this level

- `result of X else Y` (proposal only — use `Result<T, E>`)
- Passing `unsafe` bindings directly to model calls without validation — triggers `SPORE-VALUESTATE-003`
- Calling a model in a flow without declaring `ai.inference` — triggers `SPORE-EFFECT-001`
- Logging raw model input or output as `protected` without `redact()` — triggers `SPORE-VALUESTATE-001`
- `authority` blocks (Level 9 concern for cross-boundary AI results)

## Key diagnostics this level demonstrates

| Code | Meaning |
|------|---------|
| `SPORE-EFFECT-001` | `ai.inference` used in flow body but not declared in `effects` |
| `SPORE-VALUESTATE-003` | Unsafe binding flows into a governed model sink without validation |
| `SPORE-VALUESTATE-001` | Protected model output logged without `redact()` |
| `SPORE-HINT-COMPUTE-001` | `ai.inference` present but no compute target preference declared |

## Example IDs at this level

351-embedding-flow, 352-ai-inference-effect, 353-protected-ai-input, 354-ai-batch-inference, 355-ai-governance-denied-remote, 356-ai-missing-audit, 357-tensor-model-input-output, 358-ai-secure-string-in-ai, 359-embedding-with-fallback, 360-ai-audit-redacted, 361-ai-any-tensor, 362-ai-invalid-tensor-arity, 363-local-model-only, 364-ai-effect-propagation, 365-ai-summary-flow, 366-ai-unsafe-input-to-model, 367-ai-inference-without-effect, 368-contract-ai-flow, 368-signed-attestation, 369-ai-classification-flow
