import json, sys, time, gc, tracemalloc

T, F, U = 1, -1, 0
VALS = [T, F, U]

def tri_and(a, b):
    if a == F or b == F: return F
    if a == U or b == U: return U
    return T

def tri_or(a, b):
    if a == T or b == T: return T
    if a == U or b == U: return U
    return F

def tri_not(a):
    return {T: F, F: T, U: U}[a]

its = 200000
for i, a in enumerate(sys.argv):
    if a in ("--iterations","--operations") and i+1<len(sys.argv): its=int(sys.argv[i+1])

def bench(name, fn, iterations):
    for _ in range(100): fn()
    t0 = time.perf_counter()
    for _ in range(iterations): fn()
    elapsed = (time.perf_counter() - t0) * 1000
    return {"name": name, "iterations": iterations,
            "elapsedMs": round(elapsed, 3),
            "operationsPerSecond": round(iterations / max(elapsed/1000, 1e-9), 0),
            "nsPerOp": round(elapsed * 1e6 / max(iterations, 1), 1)}

results = {
    "triAnd":   bench("Tri.and (9 pairs)", lambda: [tri_and(a,b) for a in VALS for b in VALS], its),
    "triOr":    bench("Tri.or  (9 pairs)", lambda: [tri_or(a,b)  for a in VALS for b in VALS], its),
    "triNot":   bench("Tri.not (3 vals)",  lambda: [tri_not(a)   for a in VALS], its),
}

# Memory measurement pass (separate from throughput timing).
# Primary/dominant op = triAnd, the representative bulk 9-pair trit operation.
_mem_iters = min(its, 50000)
gc.collect()
tracemalloc.start()
_base = tracemalloc.get_traced_memory()[0]
for _ in range(_mem_iters):
    [tri_and(a, b) for a in VALS for b in VALS]
_cur, _peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
_heap_delta = _cur - _base

print(json.dumps({
    "runtime": "python", "benchmark": "tri-logic-v1",
    "results": results,
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
        "tracemallocPeak": _peak,
    },
    "notes": ["Python dict-based ternary dispatch"],
}, indent=2))
