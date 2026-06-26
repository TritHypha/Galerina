# Disk, Memory and Cache Warnings

Galerina should use standard codes for disk, memory and cache health.

## Disk Warnings

```text
Galerina-WARN-DISK-001: Available disk space is low.
Galerina-WARN-DISK-002: Disk write speed is below expected threshold.
Galerina-WARN-DISK-003: Disk spill mode enabled due to memory pressure.
Galerina-ERR-DISK-001: Failed to write spill file.
Galerina-ERR-DISK-002: Failed to read spill file.
Galerina-FATAL-DISK-001: Disk unavailable and no safe memory fallback exists.
```

## Memory Warnings

```text
Galerina-WARN-MEM-001: Cached memory limit reached. Cache entry moved to general memory.
Galerina-WARN-MEM-002: General memory pressure detected.
Galerina-WARN-MEM-003: Memory spill to disk started.
Galerina-WARN-MEM-004: Memory checkpoint created due to risk threshold.
Galerina-ERR-MEM-001: Memory integrity check failed. Runtime restored previous checkpoint.
Galerina-ERR-MEM-002: Memory limit exceeded and recovery was required.
Galerina-FATAL-MEM-001: Memory corruption detected and recovery failed.
```

## Cache Warnings

```text
Galerina-WARN-CACHE-001: Cached function memory limit reached.
Galerina-WARN-CACHE-002: Cache entry demoted to general memory.
Galerina-WARN-CACHE-003: Cache entry spilled to disk.
Galerina-ERR-CACHE-001: Cache restore failed.
Galerina-ERR-CACHE-002: Cache checksum mismatch.
```

Cache warnings must not hide correctness failures. If a cache cannot be used safely, Galerina should compute without the cache where possible and report the recovery action.
