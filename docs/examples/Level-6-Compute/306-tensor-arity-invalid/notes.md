# 306 — Tensor arity invalid

**Concept:** Tensor requires exactly two type parameters: element type and shape

`Tensor<Float32>` is missing the shape argument. The compiler raises `SPORE-TYPE-009` because `Tensor` is a generic type constructor that requires both an element type (e.g., `Float32`) and a shape (e.g., `[1, 768]` or `DynamicShape`).

**AI rule:** `Tensor<T, Shape>` requires both an element type and a shape argument; omitting either is a type error.
