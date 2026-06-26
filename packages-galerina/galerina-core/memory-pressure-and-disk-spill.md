# Galerina Memory Pressure and Disk Spill

This document defines the proposed memory pressure and disk spill model for
Galerina / Galerina.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and
accelerator-aware programming language concept. Memory pressure handling is
part of that security model: runtime pressure should be visible, bounded,
source-mapped and recoverable where possible.

## Summary

Galerina should treat memory limits in different categories.

```text
Cache memory limit reached
  -> calculate result normally
  -> return result
  -> do not store result in cache
  -> report cache bypass

Total memory pressure reached
  -> free safe memory
  -> evict caches
  -> bypass caches
  -> apply backpressure
  -> spill approved data to disk if configured
  -> reject new work safely if needed
  -> fail gracefully before uncontrolled crash
```

Core rule:

```text
Limit long-lived memory.
Protect normal execution.
Spill only approved non-secret data.
Fail safely before uncontrolled out-of-memory.
```

## Cache Limit vs Total Memory Roof

| Situation | Meaning | Correct Behaviour |
|---|---|---|
| Cache limit hit | A specific cache is full | Calculate and return result, but do not cache it |
| Queue buffer full | A queue/channel reached its buffer limit | Apply overflow policy |
| Soft memory limit reached | Application memory is getting high | Start memory pressure actions |
| Hard memory limit reached | Application is close to unsafe memory usage | Reject new work or fail gracefully |
| Disk spill limit reached | Temporary spill storage is full | Stop spilling and apply the next fallback |

## Cache Bypass

When a cached pure flow reaches its cache memory limit, Galerina should not fail the
flow.

```text
1. Calculate the result.
2. Return the result.
3. Do not store the result in cache.
4. Record a cache bypass warning.
5. Recommend a cache increase or removal if repeated bypassing hurts performance.
```

This is called `cache_bypass`.

## Memory Pressure Ladder

When total memory pressure rises, Galerina should respond in this order:

```text
1. Free short-lived finished values.
2. Evict eligible caches.
3. Bypass cache storage.
4. Apply backpressure to queues and channels.
5. Spill approved data to disk if configured.
6. Reject new work safely.
7. Fail gracefully before uncontrolled out-of-memory.
```

Disk spill is a safety valve, not a normal performance path.

## Runtime Policy in boot.spore

```Galerina
runtime {
  memory {
    soft_limit 512mb
    hard_limit 768mb

    on_pressure [
      "evict_caches",
      "bypass_cache",
      "backpressure",
      "spill_eligible",
      "reject_new_work",
      "graceful_fail"
    ]

    spill {
      enabled true
      path "./storage/tmp/galerina-spill"
      max_disk 2gb
      ttl 1h
      encryption true
      redact_secrets true

      allow [
        "cache_entries",
        "queue_events",
        "json_stream_buffers",
        "build_cache"
      ]

      deny [
        "SecureString",
        "RequestContext",
        "SessionToken",
        "PaymentToken",
        "PrivateKey"
      ]
    }
  }
}
```

## Approved Spill Data

Good candidates for disk spill:

```text
large JSON stream buffers
dead-letter queue events
temporary batch data
build cache data
non-secret pure-flow cache entries
large sort/transform intermediate data
```

These are usually safe because they are temporary, non-secret, serialisable,
recoverable and not live handles.

## Denied Spill Data

Galerina should deny spilling sensitive or unsafe data:

```text
SecureString values
API keys
payment tokens
session secrets
private keys
raw unredacted webhook payloads
live request context
database connections
file handles
network sockets
thread handles
GPU buffers containing sensitive data
photonic target buffers containing sensitive data
```

Secret spill rule:

```text
Secrets must not be spilled to disk by default.
```

## Queue and Channel Spill

Queues and channels should be bounded. Overflow policies may include:

```text
wait
reject
dead_letter
spill_then_dead_letter
drop_oldest
drop_newest
scale_worker
```

Backpressure means Galerina slows or rejects incoming work before memory grows
without bounds.

## JSON Stream Spill

Large JSON streams may use disk spill when explicitly configured and bounded.
This avoids loading very large payloads into memory at once.

## Build Cache Spill

Compiler and build cache may spill non-secret temporary data such as parsed AST
cache, type-check cache, API report cache, AI guide generation cache and target
planning cache.

Build spill must not include secrets.

## Reports and Generated Documentation

Galerina builds should generate:

```text
app.runtime-report.json
app.memory-report.json
app.security-report.json
app.map-manifest.json
docs/runtime-guide.md
docs/memory-pressure-guide.md
app.ai-guide.md
app.ai-context.json
```

The memory report should include:

```text
soft limit
hard limit
pressure ladder
cache bypass behaviour
spill configuration
spill encryption status
spill allow list
spill deny list
queue and channel pressure expectations
JSON stream spill expectations
compile-time checks
recommendations
```

## AI Guide Integration

The AI guide should include memory policy summaries, pressure ladder behaviour,
cache bypass semantics and secret spill rules. It should be regenerated only
after a successful compile, so it describes the code and configuration that
actually compiled.

## Compile Mode Behaviour

Compile mode should validate:

```text
spill path exists or can be created
spill deny list includes SecureString
disk spill has max_disk
spill has TTL
queues have overflow policies
caches have memory limits
hard limit is above soft limit
```

## Production Behaviour

Production builds should use explicit memory policies:

```text
soft limit configured
hard limit configured
spill encrypted
spill TTL configured
spill max disk configured
secrets denied from spill
queues have backpressure or dead-letter
caches have on_limit action
memory reports enabled
```

## Non-Goals

Galerina memory pressure handling should not:

```text
write secrets to disk
silently spill everything
hide memory pressure forever
make disk spill the normal performance path
globally cap normal local execution by default
allow unbounded queues
allow unbounded caches
crash without a report where avoidable
```

## Final Principle

```text
Clean up local values.
Limit long-lived memory.
Bypass caches when full.
Apply backpressure to queues.
Spill only approved non-secret data.
Report memory pressure clearly.
Recommend better settings.
Fail safely before uncontrolled out-of-memory.
```

Disk spill should protect stability, not hide poor design forever. Galerina should
make memory pressure visible, safe and source-mapped.
