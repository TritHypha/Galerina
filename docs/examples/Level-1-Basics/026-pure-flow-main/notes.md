# 026 — pure flow main()

`pure flow main() -> Int` is the canonical program entry point in Galerina.

## How to run

```bash
galerina run docs/examples/Level-1-Basics/026-pure-flow-main/example.fungi
```

Expected output:
```
Hello from Galerina!
```

The `run` command compiles the `.fungi` file to WASM, then invokes `main` automatically.
If you want to target a different flow explicitly, use `--invoke`:

```bash
galerina run example.fungi --invoke main
```

## Key points

- `pure flow` — no effects, no runtime authority; the compiler proves purity
- `main()` — zero-argument entry; the runner calls it automatically
- `-> Int` — the return value is the process exit code; `0` means success
- `print(...)` — writes to stdout; blocked for `SecureString` values (FUNGI-SECRET-001)
- No `contract { effects { ... } }` needed — pure flows have no effects to declare
