import gc, json, os, platform, sys, time, tracemalloc

DEFAULT_N = 1000
DEFAULT_ITERATIONS = 100000

def triangle_number(n):
    total = 0
    for i in range(1, n + 1):
        total += i
    return total

def run_bench(n, iterations):
    # Warmup
    triangle_number(n)

    t0 = time.perf_counter()
    cpu0 = time.process_time()
    result = 0
    for _ in range(iterations):
        result = triangle_number(n)
    elapsed = (time.perf_counter() - t0) * 1000
    cpu_ms = (time.process_time() - cpu0) * 1000

    # Separate memory-measurement pass (does not affect throughput numbers above)
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        triangle_number(n)
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    return {
        "runtime": "python", "benchmark": "governance-cost-v1",
        "n": n, "result": result, "iterations": iterations,
        "elapsedMs": round(elapsed, 3),
        "iterationsPerSecond": round(iterations / max(elapsed / 1000, 1e-9), 2),
        "cpu": {"processMs": round(cpu_ms, 3)},
        "memory": {
            "heapUsedBytes": _cur,
            "heapUsedDelta": _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
            "tracemallocPeak": _peak,
        },
        "process": {"pid": os.getpid(), "python": platform.python_version(),
                    "platform": platform.platform(), "arch": platform.machine()},
        "notes": ["Pure Python loop: sum 1..n for each iteration"],
    }

if __name__ == "__main__":
    n = DEFAULT_N
    its = DEFAULT_ITERATIONS
    for i, a in enumerate(sys.argv):
        if a == "--n" and i + 1 < len(sys.argv): n = int(sys.argv[i + 1])
        if a in ("--operations", "--iterations") and i + 1 < len(sys.argv): its = int(sys.argv[i + 1])
    print(json.dumps(run_bench(n, its), indent=2))
