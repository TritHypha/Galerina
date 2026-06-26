# Warnings and Diagnostics

Galerina should have standard warning, error and fatal diagnostic codes.

## Code Format

```text
Galerina-WARN-CATEGORY-NUMBER
Galerina-ERR-CATEGORY-NUMBER
Galerina-FATAL-CATEGORY-NUMBER
```

Examples:

```text
Galerina-WARN-MEM-001
Galerina-ERR-MEM-001
Galerina-FATAL-MEM-001
Galerina-WARN-DISK-001
Galerina-ERR-DISK-001
Galerina-WARN-LOGIC-001
Galerina-ERR-LOGIC-001
Galerina-WARN-TARGET-001
```

## Levels

```text
info     = useful information
warning  = problem detected, execution can continue
error    = operation failed, app may recover
fatal    = unsafe to continue
```

## Categories

```text
MEM       memory
DISK      disk and filesystem
CACHE     cache system
LOGIC     binary/ternary/omni logic
TARGET    compiler target support
TYPE      type system
NULL      null/undefined safety
SEC       security
ENV       environment variables
IO        input/output
NET       network
API       API calls
BUILD     build system
RUNTIME   runtime system
```

## Required Fields

All structured diagnostics should include:

```text
code
level
category
message
source file
source line
target
recovery action
timestamp
```

Example:

```json
{
  "code": "Galerina-WARN-DISK-001",
  "level": "warning",
  "category": "disk",
  "message": "Available disk space is low.",
  "target": "cpu",
  "recoveryAction": "continue_with_warning",
  "source": {
    "file": "compiler/galerina.js",
    "line": 120
  },
  "timestamp": "2026-05-03T00:00:00Z"
}
```

## Prototype Status

The v0.1 prototype now normalises compiler diagnostics into this shape while keeping the older `severity`, `errorType`, `problem` and `suggestedFix` fields for compatibility.

The shared schema entry point is:

```text
schemas/diagnostic.schema.json
```

Compiler reports, runtime reports, memory reports and build manifests now use or summarise the standard diagnostic format.
