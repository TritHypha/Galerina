# 305 — Tensor dynamic shape

**Concept:** dynamic shape tensor for variable-length inference

`DynamicShape` is the Galerina escape hatch for shapes that are only known at runtime — for example, a language model that processes prompts of variable length. The shape is tracked at runtime rather than compile time.

**AI rule:** Use `DynamicShape` when batch size or sequence length varies at runtime.
