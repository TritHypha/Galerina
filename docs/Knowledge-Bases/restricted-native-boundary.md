# Restricted Native Boundary (FFI)

## Definition

The **Galerina Restricted Native Boundary** is a governed interface allowing verified native code to be called from Galerina under explicit capability, permission, audit, and runtime policy control.

```text
Restricted Native Boundary =
a governed native execution interface where native code crosses
a controlled boundary but cannot escape Galerina governance.
```

This replaces traditional unrestricted FFI (Foreign Function Interface).

## Why Standard FFI Is Unsafe

Normal FFI systems often allow:

```text
arbitrary memory access
unsafe pointer sharing
runtime crashes
permission bypass
hidden side effects
untracked hardware access
```

Galerina must prevent all of these.

## When Native Boundary Is Used

```text
hardware drivers
GPU/TPU runtimes
legacy libraries
cryptography primitives
OS APIs
high-performance compute kernels
certified external systems
sensor interfaces
```

## Where It Sits

At flow execution time:

```text
Flow
 -> Permission Check
 -> Authority Control
 -> Restricted Native Boundary
 -> Native Capability Module
 -> Host OS / hardware / native library
```

At compile and load time:

```text
Certified Package Registry
 -> Package Resolver
 -> Native Boundary Verification
 -> Governed IR
 -> Runtime
```

## Native Module Declaration

```galerina
native module CryptoNative {

  capability crypto.hash

  effects {
    cpu.compute
  }

  boundary restricted

  audit required
}
```

## Flow Usage Example

```galerina
flow hashPassword(
  request: Password.hash
) -> HashPasswordResult
  permission use password_hash
contract {
  types {
    type HashPasswordResult = Result<Password.response, ApiError>
  }
}
{
  let hash = CryptoNative.hash(
    algorithm: "argon2id",
    value: request.password
  )

  return Ok(Password.response {
    hash: hash
  })
}
```

## Rules

### 1. Native code never bypasses governance

Even native calls must obey:

```text
permission
audit
budget
capability
runtime profile
```

### 2. Native modules declare all effects

```galerina
effects {
  network.external
  hardware.usb.read
  gpu.compute
}
```

### 3. Memory crossing is restricted

Avoid:

```text
raw shared pointers
unbounded native memory ownership
unmanaged mutable references
```

Prefer:

```text
typed boundary structures
copy-safe data transfer
runtime-owned buffers
```

### 4. Profiles may restrict native boundaries

```galerina
profile strict {
  deny unrestricted_native_boundary
}

profile high_integrity {
  require verified_native_modules
}
```

### 5. Native modules must be certified

```galerina
runtime policy {
  native {
    require signature
    require declared_effects
    require capability_map
    deny unknown_native_modules
  }
}
```

## What Galerina Avoids

```c
// Rejected: C-style raw FFI
void* ptr;
unsafe_cast(...)
direct pointer arithmetic
```

Galerina exposes governed native capabilities, not raw machine access.

## Final Architecture

```text
Galerina Flow
 -> Permission
 -> Capability Module
 -> Restricted Native Boundary
 -> Verified Native Runtime
 -> Host System
```

## Core Principle

```text
Native code may extend capability.
Native code must not escape governance.
```

```text
FFI in Galerina is not "unsafe access."
It is a governed native execution boundary.
```
