# 362 — AI invalid tensor arity

**Concept:** Tensor type with missing shape argument raises SPORE-TYPE-009

In an AI context, this error commonly occurs when a developer forgets the shape argument while writing inference code. The fix is to supply the shape, e.g., `Tensor<Float32, [1, 768]>` or `Tensor<Float32, DynamicShape>`.

**AI rule:** `Tensor` requires exactly two type parameters; omitting the shape is always a compile error.
