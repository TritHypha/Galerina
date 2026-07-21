# 027 — print() hello world

`print()` is the standard output function in Galerina. It is available in all flow kinds
(pure, guarded, secure) and requires no effect declaration.

## How to run

```bash
galerina run docs/examples/Level-1-Basics/027-print-hello-world/example.fungi
```

Expected output:
```
Hello from Galerina!
The answer is 42
2 + 2 = 4
```

## Calling patterns

```galerina
print("hello world")           // single string
print("x =", x)                // label + value (space-separated)
print(calculateVat(price))     // call return value inline
print("count:", items.length)  // method call in args
```

## Security rules

- `print(apiKey)` where `apiKey: SecureString` → **FUNGI-SECRET-001** compile error
- `print(email)` where `email: protected Email` → **FUNGI-VALUESTATE-006** compile error
- Use `print(redact(email))` to print a `[REDACTED]` placeholder safely

## No effect declaration needed

`print` writes only to stdout (not to an audit sink or database). Pure flows may call it
without adding `effects { console.write }` to their contract.
