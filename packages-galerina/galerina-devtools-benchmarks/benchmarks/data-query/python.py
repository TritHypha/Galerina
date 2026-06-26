import json, sys, time, gc, tracemalloc

N = 1000
its = 1000

for i, a in enumerate(sys.argv):
    if a == "--size" and i+1<len(sys.argv): N=int(sys.argv[i+1])
    if a in ("--iterations","--operations") and i+1<len(sys.argv): its=int(sys.argv[i+1])

statuses   = ["pending", "approved", "rejected", "flagged"]
categories = ["healthcare", "finance", "government", "retail"]
dataset = [{"id": i+1, "amount": int(abs((i % 200) * 50)), "status": statuses[i%4],
            "category": categories[(i*7)%4], "year": 2020+(i%5), "priority": i%10,
            "approved": i%3!=0} for i in range(N)]

def bench(name, fn, iterations):
    for _ in range(5): fn()
    t0 = time.perf_counter()
    for _ in range(iterations): fn()
    elapsed = (time.perf_counter() - t0) * 1000
    return {"name": name, "iterations": iterations,
            "elapsedMs": round(elapsed, 3),
            "operationsPerSecond": round(iterations / max(elapsed/1000, 1e-9), 0),
            "nsPerOp": round(elapsed * 1e6 / max(iterations, 1), 1)}

from collections import defaultdict

results = {
    "filterByStatus": bench("Filter by status", lambda: [r for r in dataset if r["status"]=="approved"], its),
    "filterCompound":  bench("Compound filter",  lambda: [r for r in dataset if r["status"]=="approved" and r["amount"]>3000], its),
    "aggregateSum":    bench("SUM aggregate",    lambda: sum(r["amount"] for r in dataset if r["category"]=="healthcare"), its),
    "groupBy":         bench("GROUP BY",         lambda: {k: sum(1 for r in dataset if r["category"]==k) for k in categories}, its),
    "sortTop10":       bench("Sort + LIMIT 10",  lambda: sorted(dataset, key=lambda r: -r["amount"])[:10], its),
    "joinLike":        bench("JOIN-like filter",  lambda: [r for r in dataset if r["approved"] and r["category"]=="healthcare" and r["amount"]>5000], its),
}

# Memory measurement pass (separate from throughput timing).
# Primary/dominant op = filterByStatus, the main filter query.
_mem_iters = min(its, 50000)
gc.collect()
tracemalloc.start()
_base = tracemalloc.get_traced_memory()[0]
for _ in range(_mem_iters):
    [r for r in dataset if r["status"] == "approved"]
_cur, _peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
_heap_delta = _cur - _base

print(json.dumps({
    "runtime": "python", "benchmark": "data-query-v1", "datasetSize": N,
    "results": results,
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
        "tracemallocPeak": _peak,
    },
    "notes": [f"Dataset: {N} records"],
}, indent=2))
