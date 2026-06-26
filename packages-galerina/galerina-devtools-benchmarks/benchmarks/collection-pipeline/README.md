# collection-pipeline

Measures collection/iterator overhead and closure performance via a filter-map-sum pipeline over 10,000 integers.

Pipeline: `filter(isEven) -> map(*2) -> sum`

Expected result: `49990000` (sum of 0,4,8,...,19998).

Node.js and Python use native filter/map/reduce and list comprehensions respectively. Galerina uses a while loop since filter/map/reduce chaining requires stdlib verification not yet available in governed mode.

## Algorithm

```
arr = [0..9999]
result = sum(x*2 for x in arr if x % 2 == 0)
```

Default: 10,000 element array, 5000–100K iterations, reports iterations/second.

## Files

| File | Runtime |
|------|---------|
| `node.mjs` | Node.js (Array.filter/map/reduce) |
| `python.py` | Python 3 (generator expression + sum) |
| `benchmark.spore` | Galerina governed/manifest (while loop) |
| `bench.rs` | Rust (iterator chain, compile with `rustc -O`) |
| `bench.cpp` | C++ (manual loop, compile with `g++ -O2`) |
