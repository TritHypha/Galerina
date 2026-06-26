# release Keyword

## Definition

`release` signals explicit early cleanup of a runtime value. It does not
bypass memory safety — the runtime still controls all memory management.

```text
release = controlled early runtime cleanup
```

Most memory management in Galerina is automatic. `release` is used only for
large, sensitive, high-cost or security-critical values that should be cleaned
up before the flow ends.

## Why `release` Not `destroy`

| Term | Problem |
| --- | --- |
| destroy | sounds dangerous and low-level |
| delete | implies manual memory management |
| free | implies unmanaged allocation |
| release | controlled runtime cleanup |

`release` fits Galerina philosophy: the runtime owns memory, developers optionally
signal early cleanup.

## What `release` Does

```text
invalidates the variable
removes runtime access
allows early memory reclamation
prevents future use
optionally zeros sensitive memory
```

## Syntax

```galerina
release variable_name
```

Example:

```galerina
let upload: safe File = validate.file(raw_upload)
process(upload)
release upload
```

After release, the variable cannot be referenced:

```text
LNN-MEM-021: upload was released and can no longer be used.
LNN-MEM-022: released value cannot be referenced.
```

## Use Cases

`release` is intended for:

```text
large files
large AI contexts
large buffers
payment payloads
secrets
authentication tokens
cryptographic material
```

Not needed for normal local variables — those are cleaned up automatically.

## Examples

Large file processing:

```galerina
flow process_upload(raw: unsafe File) -> Result {
  let file: safe File = validate.file(raw)
  process(file)
  release file
  return Success
}
```

Secret handling (zeros memory where possible):

```galerina
let token: safe Secret = vault.read("api-token")
authenticate(token)
release token
```

AI context:

```galerina
let context: safe AiContext = build_context(messages)
let response = model.generate(context)
release context
```

Payment:

```galerina
let card: safe PaymentCard = validate.card(raw_card)
charge(card)
release card
```

Rejecting unsafe data:

```galerina
let raw_upload: unsafe File = request.file
release raw_upload
```

## Ownership Rules

`release` only works on:

```text
owned local values
temporary runtime values
releasable runtime objects
```

Invalid cases:

```galerina
release shared_cache       // still referenced elsewhere
release file               // inside fn when ownership belongs to caller
```

Values still in use by workers cannot be released until worker ownership ends.

## Runtime Requirements

The runtime must:

```text
track released values
prevent use-after-release
prevent double release
safely reclaim memory
zero sensitive memory where possible
enforce ownership correctness
```

## Relationship to Memory Safety

`release` does NOT disable memory safety. Galerina remains bounds-safe,
ownership-safe, allocation-safe and lifetime-safe. The runtime still controls
memory. `release` only signals: this value may safely be cleaned up early.

## Core Principle

```text
The runtime owns memory management.
Developers may optionally signal early release.

release signals early cleanup.
It does not bypass memory safety.
```
