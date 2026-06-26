# call-chain

Measures **call-dispatch overhead** through a layered call stack — the shape of
ordinary application code where a controller calls a service method which calls a
utility function.

In OOP that is `Controller → Service.method() → util()`. In Galerina every layer is
a flow, so the chain is `main → serviceLayer → domainLayer → leafCompute`. Each
outer iteration fans out to **7 flow calls** (1 service + 2 domain + 4 leaf).

Galerina governed flows are expensive to call (each call binds args into tagged
value objects inside a governed frame), so a deep chain isolates that cost. Every
call is salted with the loop index, so the pure-flow memo cache never short-circuits
a call — the number reflects real dispatch, not cache hits.

## Algorithm

```
leafCompute(salt, x):   return (salt + x) * 2 + 1
domainLayer(salt, x):   return leafCompute(salt, x) + leafCompute(salt, x + 1)
serviceLayer(salt, x):  return domainLayer(salt, x) + domainLayer(salt, x + 2)
main():                 for i in 0..50000: checksum += serviceLayer(i, i)
```

Node/Python: same chain (class methods → leaf function), many iterations, reports
iterations/second and calls/second.
Galerina: 50,000 outer chains; runner normalises throughput to ops/second.

## Files

| File | Runtime |
|------|---------|
| `node.mjs` | Node.js |
| `python.py` | Python 3 |
| `benchmark.spore` | Galerina governed/manifest/passive |
