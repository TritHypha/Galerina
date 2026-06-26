# 309 — Compute photonic

**Concept:** photonic compute target with classical fallback chain

Photonic (optical) accelerators offer extremely high throughput for certain linear algebra workloads. Galerina supports `photonic` as a first-class compute target. Because photonic hardware is not universally available, the fallback chain `npu, gpu, cpu` ensures portability.

**AI rule:** Include `photonic` first in the preference list when optical hardware is available; always provide a classical fallback chain.
