# Galerina Hello World

A working hello world for Galerina as it exists today.

> **Status:** Updated 2026-07 to reflect the compiler's actual shipped behaviour.
> Commands and snippets below are real and runnable.

---

## The simplest program

Create `hello.fungi`:

```galerina
@version 1
pure flow main() -> Int
contract {
  intent { "Hello World — return exit code 0." }
}
{
  print("Hello from Galerina!")
  return 0
}
```

Run it:

```bash
galerina run hello.fungi
```

Expected output:

```text
Hello from Galerina!
```

That's it. `pure flow main() -> Int` is the entry point. `print()` writes to stdout.
`return 0` is the exit code.

---

## What works today

| Feature | Status |
|---|---|
| `pure flow main() -> Int` entry point | ✅ works |
| `print("text")` | ✅ works |
| `print("label", value)` — multi-arg | ✅ works |
| `galerina run <file.fungi>` | ✅ works — calls `main` automatically |
| `galerina run <file.fungi> --invoke <flow>` | ✅ works — targets any pure flow |
| `galerina check <file.fungi>` | ✅ works — type-check + governance |
| `galerina build <file.fungi>` | ✅ works — emits `.wasm` + `.lmanifest` |

---

## Multi-value print

```galerina
@version 1
pure flow main() -> Int
contract { intent { "Demonstrate multi-value print." } }
{
  let x: Int = 42
  print("The answer is", x)
  print("2 + 2 =", 2 + 2)
  return 0
}
```

Output:

```text
The answer is 42
2 + 2 = 4
```

---

## Calling a helper flow

```galerina
@version 1

pure flow greet(name: String) -> String
contract { intent { "Build a greeting string." } }
{
  return "Hello, " + name + "!"
}

pure flow main() -> Int
contract { intent { "Print a greeting." } }
{
  print(greet("Galerina"))
  return 0
}
```

Run:
```bash
galerina run hello.fungi
```

Output:
```text
Hello, Galerina!
```

---

## Security: what print() blocks

`print()` is blocked for secret and protected values at compile time:

```galerina
// This is a compile error — FUNGI-SECRET-001
let apiKey: SecureString = Secrets.get("API_KEY")?
print(apiKey)  // ❌ SecureString cannot be printed
```

```galerina
// Use redact() for a safe placeholder
print(redact(apiKey))  // ✅ prints [REDACTED]
```

---

## Why `pure flow main()` not `secure flow main()`

- **`pure flow`** — no effects, no runtime authority needed. The right default for a program that just computes and prints.
- **`secure flow`** — requires an `effects {}` block in the contract. Use it when your program reads secrets, writes to a database, or calls a network service.

For hello world, `pure flow` is correct and simpler.

---

## Running with wasmtime (no Node.js)

```bash
galerina build hello.fungi
wasmtime --invoke main build/hello.wasm
```

---

## Examples corpus

Working examples live in [`docs/examples/Level-1-Basics/`](../../docs/examples/Level-1-Basics/):

- [`026-pure-flow-main/`](../../docs/examples/Level-1-Basics/026-pure-flow-main/) — minimal `main()` entry point
- [`027-print-hello-world/`](../../docs/examples/Level-1-Basics/027-print-hello-world/) — `print()` with multiple value types
- [`001-pure-flow/`](../../docs/examples/Level-1-Basics/001-pure-flow/) — a pure calculation flow (no main)
- [`003-secure-flow/`](../../docs/examples/Level-1-Basics/003-secure-flow/) — a flow with effects and a contract
