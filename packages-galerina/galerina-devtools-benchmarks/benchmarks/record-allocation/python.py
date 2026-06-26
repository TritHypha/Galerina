import gc, json, os, platform, sys, time, tracemalloc
DEFAULT_ITERATIONS = 200000

def run_bench(iterations):
    t0 = time.perf_counter()
    cpu0 = time.process_time()
    total = 0
    for i in range(iterations):
        rec = {"x": i, "y": i * 2, "z": i + 1}
        total += rec["x"] + rec["z"]
    elapsed = (time.perf_counter() - t0) * 1000
    cpu_ms = (time.process_time() - cpu0) * 1000

    # Separate memory-measurement pass (does not affect throughput numbers above)
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    _mem_total = 0
    for i in range(_mem_iters):
        rec = {"x": i, "y": i * 2, "z": i + 1}
        _mem_total += rec["x"] + rec["z"]
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    return {
        "runtime": "python", "benchmark": "record-allocation-v1",
        "iterations": iterations, "sum": total,
        "elapsedMs": round(elapsed, 3),
        "iterationsPerSecond": round(iterations / max(elapsed/1000, 1e-9), 2),
        "cpu": {"processMs": round(cpu_ms, 3)},
        "memory": {
            "heapUsedBytes": _cur,
            "heapUsedDelta": _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
            "tracemallocPeak": _peak,
        },
        "process": {"pid": os.getpid(), "python": platform.python_version(),
                    "platform": platform.platform(), "arch": platform.machine()},
    }

if __name__ == "__main__":
    its = DEFAULT_ITERATIONS
    for i, a in enumerate(sys.argv):
        if a in ("--operations","--iterations") and i+1<len(sys.argv):
            its = int(sys.argv[i+1])
    print(json.dumps(run_bench(its), indent=2))
