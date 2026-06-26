# Pure Flow Caching

Galerina may support caching for pure flows where inputs, outputs and side effects can be safely controlled.

## Rules

```text
Only pure flows are eligible by default.
Cache keys must be deterministic.
Secrets must not become cache keys or cache values unless explicitly safe.
Cache pressure must not change correctness.
Cache overflow should degrade to normal computation where possible.
```

## Diagnostics

```text
Galerina-WARN-CACHE-001: Cached function memory limit reached.
Galerina-WARN-CACHE-002: Cache entry demoted to general memory.
Galerina-WARN-CACHE-003: Cache entry spilled to disk.
Galerina-ERR-CACHE-001: Cache restore failed.
Galerina-ERR-CACHE-002: Cache checksum mismatch.
```
