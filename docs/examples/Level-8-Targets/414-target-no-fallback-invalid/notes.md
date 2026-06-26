# 414 — Target no fallback invalid

**Concept:** omitting the fallback clause from a non-cpu compute target is an error

`compute target npu {}` without a `fallback` clause means the flow cannot execute on any machine that lacks an NPU. The compiler raises `SPORE-TARGET-001` to prevent silent deployment failures. The fix is to add `fallback gpu` or `fallback cpu`.

**AI rule:** Every compute target other than `cpu` requires an explicit `fallback` clause.
