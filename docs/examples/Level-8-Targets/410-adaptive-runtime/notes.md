# 410 — Adaptive runtime

**Concept:** adaptive runtime block that learns from workload to optimise batching and warmup

The `runtime adaptive` block allows the Galerina runtime to observe workload patterns (e.g., typical batch sizes, call frequency) and apply optimisations such as request batching and model warmup. The `preserve` clause guarantees that security, declared effects, and governance rules are never relaxed by the optimiser.

**AI rule:** `runtime adaptive` enables workload-learning optimisations within governance constraints.
