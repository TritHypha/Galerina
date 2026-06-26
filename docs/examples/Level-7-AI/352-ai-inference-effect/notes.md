# 352 — AI inference effect missing

**Concept:** calling an AI model without declaring the required ai.inference effect

When a flow calls any model inference function (e.g., `ClassifierModel.classify`), the compiler tracks the `ai.inference` side-effect. If the flow does not declare `with effects [ai.inference]`, the compiler raises `SPORE-EFFECT-001`.

**AI rule:** Declare `effects [ai.inference]` on every flow that calls a machine learning model.
