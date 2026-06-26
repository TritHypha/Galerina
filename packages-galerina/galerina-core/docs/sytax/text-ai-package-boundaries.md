# Text AI Package Boundary Syntax

Status: Draft.

This file defines syntax direction for text AI package boundaries. Galerina should
support typed text, policies, effects, permissions, reports and `compute auto`
without making text AI tasks native language features.

---

## Purpose

```text
declare text policy
declare token policy
declare prompt safety and redaction policy
call text AI packages through typed boundaries
support compute auto for model-heavy stages
keep generated text non-executable
report token, memory, target and security decisions
```

---

## Grammar Direction

```text
text_policy      = "text_policy" block
token_policy     = "token_policy" block
prompt_safety    = "prompt_safety" block
text_redaction   = "text_redaction" block
model_binding    = "model" identifier block
package_call     = package_identifier "." task_identifier call_block
```

Text AI task names such as summarisation, embeddings and moderation must resolve
to packages or providers, not core Galerina syntax.

---

## Minimal Examples

Text policy:

```Galerina
text_policy {
  max_chars 200000
  max_tokens 8000
  encoding "utf-8"
  normalise_unicode true
  strip_control_chars true

  safety {
    pii_detection true
    secret_detection true
    prompt_injection_check true
  }
}
```

Token policy:

```Galerina
model SummaryModel {
  input TextDocument
  output TextSummary

  token_policy {
    max_input_tokens 8000
    max_output_tokens 500
    truncation "deny"
  }
}
```

Package boundary:

```Galerina
secure flow summariseDocument(document: TextDocument) -> Result<TextSummary, TextAiError>
effects [compute.run] {
  return SummaryPackage.summarise {
    document document
  }?
}
```

Prompt safety:

```Galerina
security {
  prompt_safety {
    enabled true
    detect_instruction_override true
    detect_secret_request true
    detect_tool_abuse true
    action "review"
  }
}
```

---

## Security Rules

```text
text AI tasks are package/provider calls, not core Galerina features
external providers require network permissions
generated text must not be executable
generated text must not directly trigger business or security actions
prompt safety checks must run where policy requires them
PII and secrets must be redacted before logging or AI reports where policy requires it
token limits and truncation policy must be reported
model-heavy stages may use compute auto
final safety and business decisions must return to strict CPU/exact logic
```

---

## Report Output

Recommended reports:

```text
text-package-target-report.json
token-report.json
text-memory-report.json
text-security-report.json
package-report.json
app.ai-guide.md
app.map-manifest.json
```

Report fields should include:

```text
text package and model
input/output types
token limits and actual counts
truncation behaviour
selected compute target and fallback
prompt safety settings
PII and secret redaction settings
external provider/network use
generated-output executable status
source-map links back to .spore files
```

---

## Open Parser and Runtime Work

```text
parse text_policy
parse token_policy
parse prompt_safety policy
parse text_redaction policy
check generated text is not executed directly
check external provider calls against network permissions
emit token reports
emit text package target reports
emit text memory reports
emit text security reports
connect text package compute auto to backend target reports
keep summarisation, generation, embeddings, moderation and NLP tasks out of core Galerina
```

