# Error Codes

This document indexes the first planned Galerina diagnostic code ranges.

## Ranges

```text
Galerina-WARN-MEM-*      memory warnings
Galerina-ERR-MEM-*       recoverable memory errors
Galerina-FATAL-MEM-*     unrecoverable memory errors
Galerina-WARN-DISK-*     disk warnings
Galerina-ERR-DISK-*      disk errors
Galerina-FATAL-DISK-*    unrecoverable disk errors
Galerina-WARN-CACHE-*    cache warnings
Galerina-ERR-CACHE-*     cache errors
Galerina-WARN-LOGIC-*    logic-width warnings
Galerina-ERR-LOGIC-*     logic-width errors
Galerina-WARN-TARGET-*   target support warnings
Galerina-ERR-TARGET-*    target support errors
```

## Core Codes

```text
Galerina-WARN-MEM-001: Cached memory limit reached. Cache entry moved to general memory.
Galerina-ERR-MEM-001: Memory integrity check failed. Runtime restored previous checkpoint.
Galerina-FATAL-MEM-001: Memory corruption detected and recovery failed.
Galerina-WARN-DISK-001: Available disk space is low.
Galerina-ERR-DISK-001: Failed to write spill file.
Galerina-FATAL-DISK-001: Disk unavailable and no safe memory fallback exists.
Galerina-WARN-LOGIC-001: Target does not natively support requested logic width. Using simulation.
Galerina-ERR-LOGIC-001: Requested logic width is unsupported by selected target.
Galerina-WARN-TARGET-003: Accelerator target unavailable. Falling back to CPU.
Galerina-ERR-TARGET-001: Selected target is not installed.
```

## Prototype Codes

The current prototype emits these standardised codes for implemented checks:

```text
Galerina-ERR-TARGET-002
Galerina-WARN-TARGET-003
Galerina-WARN-LOGIC-001
Galerina-ERR-LOGIC-001
Galerina-WARN-DISK-003
Galerina-ERR-DISK-001
Galerina-WARN-MEM-002
Galerina-WARN-MEM-005
Galerina-ERR-MEM-006
Galerina-ERR-TYPE-001
Galerina-ERR-TYPE-002
Galerina-ERR-TYPE-003
Galerina-ERR-NULL-001
Galerina-ERR-NULL-002
Galerina-WARN-BUILD-002
Galerina-ERR-SEC-001
Galerina-WARN-SEC-002
Galerina-WARN-API-001
```
