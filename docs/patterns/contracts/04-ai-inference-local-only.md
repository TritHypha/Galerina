Title: Galerina Contract Pattern — AI Inference Local-Only

### When to use

Use this pattern when a flow invokes an AI model for inference and must guarantee that no data leaves the local device or local network. It is required for any AI-assisted feature that processes sensitive or confidential input and where regulatory or organisational policy prohibits remote model calls. Apply it whenever the intent is `local_only` and the hardware preference is NPU.

### Correct example

```galerina
flow RunLocalInference(readonly request: Request) -> RunLocalInferenceResult {

  contract {

    types {
      RunLocalInferenceResult = {
        inferenceId: String,
        output: String,
        modelUsed: String,
        executedOn: String
      }
    }

    intent = "Run AI inference entirely on the local device using the NPU, with no data transmitted to any remote endpoint."

    request {
      requires request.body is JsonObject
      requires request.body["prompt"] is String
      requires request.body["modelId"] is String
    }

    response {
      guarantees result.inferenceId is String
      guarantees result.executedOn in ["npu", "cpu"]
      guarantees result.modelUsed is String
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.device.npu.available is true
    }

    model {
      reads ["local_model_registry"]
      writes []
    }

    ai {
      intent: local_only
      preferred_hardware: npu
      fallback_hardware: cpu
      remote: deny
      model_source: local_registry
    }

    effects {
      audit {
        on: always
        level: partial
        includes: [result.inferenceId, result.modelUsed, result.executedOn, context.actor.id]
        excludes: [request.body["prompt"]]
      }
    }

    security {
      classification: confidential
      requires tls: false
      network_egress: deny
    }

    on_error {
      emit: AuditEvent(type: "inference.failed", actor: context.actor, modelId: request.body["modelId"])
      return: { inferenceId: "", output: "", modelUsed: "", executedOn: "cpu" }
    }

  }

  let model = local_model_registry.resolve(request.body["modelId"])
  let hw = context.device.npu.available ? "npu" : "cpu"
  let output = ai.infer(model, request.body["prompt"], hardware: hw)

  return {
    inferenceId: generate_id(),
    output: output.text,
    modelUsed: model.id,
    executedOn: hw
  }

}
```

### What each contract section does

- `types` — declares `RunLocalInferenceResult` with `executedOn` to track whether NPU or CPU handled the inference
- `intent` — explicitly states local-only execution; this string is consumed by the network-egress policy enforcer
- `request` — requires `prompt` and `modelId` are present and correctly typed
- `response` — guarantees `executedOn` is always one of the two valid hardware targets
- `context` — requires an authenticated user and that the device NPU is actually available before the flow executes
- `model` — reads from `local_model_registry` to resolve the model; writes nothing
- `ai` — the core local-only block: sets intent to `local_only`, prefers NPU, allows CPU fallback, denies any remote call, and restricts model loading to the local registry
- `effects.audit` — partial audit; the prompt is excluded from the audit log to prevent inference input leaking into logs
- `security` — confidential classification, TLS not required (local device communication), and network egress explicitly denied
- `on_error` — emits a safe audit event with no prompt content included

### Common mistakes

**Mistake 1 — Setting `remote: allow` when local-only is required**
```galerina
ai {
  intent: local_only
  remote: allow
}
```
`remote: allow` directly contradicts `intent: local_only`. The contract validator will raise a conflict error. `remote` must be `deny` whenever `intent` is `local_only`.

**Mistake 2 — Omitting the `ai` block entirely**
```galerina
contract {
  intent = "Run AI inference locally."
  request { ... }
  response { ... }
}
```
The `ai` block is required for any flow that calls `ai.infer`. Without it, the runtime cannot enforce hardware selection or remote-call denial, and the intent string alone has no enforcement effect.

**Mistake 3 — Including the prompt in the audit `includes` list**
```galerina
effects {
  audit {
    includes: [request.body["prompt"], result.output]
  }
}
```
Including the prompt or the model output in audit logs means sensitive inference data is written to persistent storage, which may violate the same confidentiality policy the flow exists to uphold. Use `excludes` for both.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `remote: allow` combined with `intent: local_only` | `E701 — ai.remote cannot be 'allow' when ai.intent is 'local_only'` |
| `ai.infer` called without `ai` block in contract | `E702 — ai.infer called in flow body but no ai block declared in contract` |
| `network_egress: deny` absent in `security` for local-only flow | `W501 — local_only ai intent without network_egress: deny in security block` |
| `context.device.npu.available` referenced without context block declaring it | `E305 — device capability 'npu.available' referenced but not declared in context contract` |
| Prompt included in audit `includes` for confidential-classified flow | `W603 — confidential-classified field 'prompt' found in audit.includes; consider moving to excludes` |

### One-click fix

If `E701 — ai.remote cannot be 'allow' when ai.intent is 'local_only'` is raised, update the `ai` block:

```galerina
ai {
  intent: local_only
  preferred_hardware: npu
  fallback_hardware: cpu
  remote: deny
  model_source: local_registry
}
```
