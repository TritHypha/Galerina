# Machine Profile Bridge

The Machine Profile Bridge is the draft Galerina layer between high-level source
and machine-specific runtime setup.

Galerina source should stay readable, secure and application-focused. Developers
should not need to write low-level platform code to get a fast local web
runtime. The bridge lets tooling detect the current machine and prepare a local
runtime plan while preserving the meaning of the checked source.

## Purpose

```text
high-level Galerina source
  -> parser/checker/type/effect analysis
  -> typed IR
  -> Machine Profile Bridge
  -> local runtime plan
  -> galerina serve / target adapter
```

The bridge should answer:

```text
What machine is this running on?
Which runtime adapters are available?
Which capabilities were detected?
Which capabilities were required but missing?
Which fallback was selected?
Which local boot/main settings were generated?
Which report proves the decision?
```

## Local Capability Profile

The bridge may write local machine facts to uncommitted files:

```text
.galerina/capabilities.local.json
build/target-cache/local-capabilities.json
```

These files are machine-specific and should not be committed. They may include:

```text
operating system
architecture
runtime versions
CPU feature flags when available
memory and concurrency hints when available
available runtime adapters
available target adapters
capability detection timestamp
```

Unknown facts must remain unknown. The bridge must not invent capabilities.

## Draft Syntax Direction

```galerina
machine profile local_runtime {
  detect os
  detect architecture
  detect runtime
  detect cpu_features

  cache ".galerina/capabilities.local.json"
  commit false
}
```

```galerina
runtime bridge web_runtime {
  from local_runtime
  serve AppServer

  prefer runtime.local
  fallback runtime.safe
  fallback cpu

  allow silent_fallback false
  report "runtime-bridge-report.json"
}
```

This syntax is a documented draft, not a parser guarantee yet.

## Native Boundaries

Low-level boundaries should use the official draft category `native`, with an
explicit ABI:

```galerina
layout native UserRecord {
  abi c

  fields {
    id: UInt64
    email: CString
    active: Bool8
  }

  alignment auto
  padding explicit
}
```

```galerina
interop native sqlite {
  abi c
  library "sqlite3"

  memory {
    ownership explicit
    nulls denied
    bounds checked
  }
}
```

The category is `native`; the ABI is the specific boundary rule. Future ABI
values may include `c`, `wasm`, `system` and `plugin`.

## Safety Rules

```text
Normal app code stays high-level.
Machine-specific facts are untrusted until detected and reported.
Local profiles are not committed.
Fallback must be declared and reported.
Native interop is denied in normal production profiles unless explicitly allowed.
Native layout and interop must declare ABI, ownership, nullability and effects.
The bridge must not change program meaning silently.
```

The bridge is how Galerina can be runtime-first and machine-aware without making
the source look like low-level systems code.
