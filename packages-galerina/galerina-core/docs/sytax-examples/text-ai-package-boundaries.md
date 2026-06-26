# Text AI Package Boundary Examples

Status: Draft.

These examples show how Galerina should call text AI packages safely without making
LLM, NLP, translation, search or document AI tasks native language features.

---

## Good Examples

Text summarisation package:

```Galerina
secure flow summariseDocument(document: TextDocument) -> Result<TextSummary, TextAiError>
effects [compute.run] {
  return SummaryPackage.summarise {
    document document
    max_output_tokens 500
  }?
}
```

Embedding package:

```Galerina
secure flow createEmbedding(text: Text) -> Result<TextEmbedding, TextAiError>
effects [compute.run] {
  return EmbeddingPackage.encode {
    text text
  }?
}
```

External provider:

```Galerina
secure flow generateReplyWithProvider(prompt: TextPrompt) -> Result<GeneratedText, TextAiError>
effects [network.outbound] {
  return LlmProvider.generate {
    prompt prompt
    max_output_tokens 500
  }?
}
```

Prompt safety before generation:

```Galerina
secure flow handleUserMessage(req: Request) -> Result<Response, ApiError>
effects [network.inbound, compute.run] {
  let input: ChatRequest = json.decode<ChatRequest>(&req.body)?

  let safety: PromptSafetyResult = PromptSafetyPackage.check {
    text input.message
  }?

  match safety.decision {
    Deny   => return JsonResponse({ "status": "blocked" })
    Review => return JsonResponse({ "status": "review" })
    Allow  => continue
  }

  let reply: GeneratedText = GenerationPackage.generate {
    prompt input.message
  }?

  return JsonResponse({ "reply": reply })
}
```

Batch embedding compute:

```Galerina
secure flow createEmbeddings(texts: Array<Text>) -> Result<Array<TextEmbedding>, TextAiError>
effects [compute.run] {
  return EmbeddingPackage.encodeBatch {
    texts texts
  }?
}
```

---

## Bad Examples

Native text generation syntax:

```Galerina
flow reply(prompt: Text) -> Text {
  return generateText(prompt)
}
```

Expected diagnostic:

```text
text_ai_feature_not_core_language
```

Reason:

```text
Text generation belongs in packages or providers, not core Galerina.
```

---

Executing generated text:

```Galerina
let action = GenerationPackage.generate(message)?
execute(action)
```

Expected diagnostic:

```text
generated_text_must_not_execute
```

Reason:

```text
Generated text is data. Tool/action calls require typed validation and explicit
application logic.
```

---

External provider without network effect:

```Galerina
secure flow translateWithProvider(text: Text) -> Result<TranslatedText, TextAiError>
effects [compute.run] {
  return TranslationProvider.translate {
    text text
    targetLanguage "fr"
  }?
}
```

Expected diagnostic:

```text
missing_provider_network_effect
```

Reason:

```text
External provider calls require network.outbound permission/effect.
```

---

Silent truncation:

```Galerina
model SummaryModel {
  input TextDocument
  output TextSummary

  token_policy {
    max_input_tokens 8000
    truncation "silent"
  }
}
```

Expected diagnostic:

```text
unsafe_text_truncation_policy
```

Reason:

```text
Token truncation must be explicit, reported and safe. Silent truncation can
change meaning.
```

---

Raw generated answer used for security decision:

```Galerina
let answer = QuestionAnsweringPackage.answer {
  document policyDocument
  question "Should this payment be approved?"
}?

if answer.answer == "yes" {
  approvePayment()
}
```

Expected diagnostic:

```text
generated_text_used_for_security_decision
```

Reason:

```text
Generated answers must return to typed, strict Galerina decision logic before they
affect business or security decisions.
```

---

## Expected Reports

```text
text-package-target-report.json
token-report.json
text-memory-report.json
text-security-report.json
package-report.json
app.ai-guide.md
app.map-manifest.json
```

Reports should explain:

```text
which text packages and models are used
which text policies apply
which token limits were checked
which compute target was selected
which fallback was used
whether prompt safety ran
whether PII/secrets were redacted
whether generated output can be executed
which generated report entries map back to .spore source
```

