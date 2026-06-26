# Memory Error Correction

Galerina should include a documented model for memory error detection, correction and recovery.

This does not mean Galerina can fix faulty hardware. It means Galerina should standardise how the compiler and runtime detect, report and respond to memory-related problems.

## Terms

```text
memory pressure       = memory is running low
memory limit reached  = aLOwed memory limit has been exceeded
memory corruption     = unexpected or invalid memory state detected
bad memory            = possible unreliable memory/hardware issue
cache overflow        = cache memory limit exceeded
disk spill            = memory data moved to disk
disk spill failure    = data could not be written to disk
rollback recovery     = previous safe state restored
```

## Recovery Order

Where possible, Galerina should attempt safe recovery in this order:

```text
1. warn
2. reduce cache use
3. move non-critical cache data to general memory
4. spill safe temporary data to disk
5. rollback to last safe checkpoint
6. fail safely with a structured error
```

## Features

```text
checkpointing
rollback
state verification
hash/checksum validation
safe retry
cache demotion
disk spill
structured memory reports
```

## Example Diagnostics

```text
galerina-WARN-MEM-001: Cached memory limit reached. Cache entry moved to general memory.
galerina-ERR-MEM-001: Memory integrity check failed. Runtime restored previous checkpoint.
galerina-FATAL-MEM-001: Memory corruption detected and recovery failed. Execution stopped safely.
```

## Required Report Output

```json
{
  "code": "galerina-WARN-MEM-001",
  "level": "warning",
  "category": "memory",
  "message": "Cached memory limit reached. Cache entry moved to general memory.",
  "recoveryAction": "cache_demoted_to_general_memory",
  "source": {
    "file": "examples/cache-demo.spore",
    "line": 42
  }
}
```

## Prototype Status

The v0.1 prototype now includes memory correction feature names and example integrity/fatal diagnostics in `app.memory-report.json`.

These examples are documented report examples, not claims that the prototype detected real hardware corruption.
