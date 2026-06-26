# fibonacci-recursive

Measures recursive function call overhead using naive (no-memoization) Fibonacci.

`fib(30) = 832040`. The naive implementation makes 2,692,537 recursive calls to compute this, making it an effective stress test for call-stack allocation.

Galerina governed flows are expensive to call (each call allocates tagged value objects), so this benchmark isolates that cost.

## Algorithm

```
fib(n):
  if n <= 1: return n
  return fib(n-1) + fib(n-2)
```

Node/Python/Rust/C++: fib(30), 5000–100K iterations, reports calls/second.
Galerina: fib(20) to keep wall time reasonable; runner normalises throughput.

## Files

| File | Runtime |
|------|---------|
| `node.mjs` | Node.js |
| `python.py` | Python 3 |
| `benchmark.spore` | Galerina governed/manifest |
| `bench.rs` | Rust (compile with `rustc -O`) |
| `bench.cpp` | C++ (compile with `g++ -O2`) |
