# record-allocation

Measures object/record creation overhead by allocating N simple structs with three numeric fields and summing two of them.

This is the #1 Galerina bottleneck: every value in the governed runtime is a `{__tag, value}` object, so raw allocation throughput directly impacts all other benchmarks.

## Algorithm

```
for i in 0..N:
  rec = { x: i, y: i*2, z: i+1 }
  sum += rec.x + rec.z
```

Default N: 200,000 (Node/Python/Rust/C++), 10,000 (Galerina — runner normalises to ops/second).

## Files

| File | Runtime |
|------|---------|
| `node.mjs` | Node.js |
| `python.py` | Python 3 |
| `benchmark.spore` | Galerina governed/manifest |
| `bench.rs` | Rust (compile with `rustc -O`) |
| `bench.cpp` | C++ (compile with `g++ -O2`) |
