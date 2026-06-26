# 318 — compute hint missing (INFO)

**Concept:** SPORE-HINT-COMPUTE-001 — planning hint, not a governance error

When a flow declares ai.inference but has no compute target block, the governance
verifier emits an info-level hint suggesting NPU or GPU preference.

This is a planning hint, not a compile error. Adding a compute target block silences it.

**AI rule:** Declare compute target best { prefer [npu, gpu, cpu] } for AI inference flows.
