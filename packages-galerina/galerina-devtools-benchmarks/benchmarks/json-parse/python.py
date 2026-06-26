import json, sys, time, gc, tracemalloc

REC = "id:1001,name:alice,role:admin,active:true,score:95"

def count_fields(obj):
    return len(obj.split(","))

def sum_value_lengths(obj):
    total = 0
    for pair in obj.split(","):
        parts = pair.split(":")
        if len(parts) > 1:
            total += len(parts[1])
    return total

def scan_records(n):
    total = 0
    for _ in range(n):
        total += count_fields(REC) + sum_value_lengths(REC)
    return total

JSON_REC = '{"id":1001,"name":"alice","role":"admin","active":true,"score":95}'

def parse_json_record():
    o = json.loads(JSON_REC)
    return len(o["name"]) + len(o["role"]) + o["score"]

N = 500
its = 200000
for i, a in enumerate(sys.argv):
    if a == "--size" and i+1 < len(sys.argv): N = int(sys.argv[i+1])
    if a in ("--iterations", "--operations") and i+1 < len(sys.argv): its = int(sys.argv[i+1])

def bench(name, fn, iterations):
    for _ in range(5): fn()
    t0 = time.perf_counter()
    for _ in range(iterations): fn()
    elapsed = (time.perf_counter() - t0) * 1000
    return {"name": name, "iterations": iterations,
            "elapsedMs": round(elapsed, 3),
            "operationsPerSecond": round(iterations / max(elapsed/1000, 1e-9), 0),
            "nsPerOp": round(elapsed * 1e6 / max(iterations, 1), 1)}

results = {
    "splitScan": bench("Split-scan parse", lambda: scan_records(N), max(1, its // N)),
    "jsonParse": bench("json.loads + field read", parse_json_record, its),
}

# Memory measurement pass (separate from throughput timing).
# Primary/dominant op = splitScan's scan_records(N); use its natural per-call count.
_mem_iters = min(max(1, its // N), 50000)
gc.collect()
tracemalloc.start()
_base = tracemalloc.get_traced_memory()[0]
for _ in range(_mem_iters):
    scan_records(N)
_cur, _peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
_heap_delta = _cur - _base

print(json.dumps({
    "runtime": "python",
    "benchmark": "json-parse-v1",
    "records": N,
    "iterations": its,
    "checksum": scan_records(N),
    "results": results,
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
        "tracemallocPeak": _peak,
    },
    "notes": [
        f"Records: {N} key:value records",
        "checksum = N x (5 fields + 20 value-chars) via split/len — matches Galerina and Node",
    ],
}, indent=2))
