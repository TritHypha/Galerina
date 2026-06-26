import json, os, platform, sys, time, gc, tracemalloc

ELEMENTS = 100000
DEFAULT_ITERATIONS = 500  # Python is slower — fewer outer reps

def kernel(i): return i * 2 + 1

def map_reduce(n):
    acc = 0
    for i in range(n):
        acc += kernel(i)
        if acc > 1000000000:
            acc -= 1000000000
    return acc

def run_bench(elements, iterations):
    for _ in range(3): map_reduce(elements)  # warmup

    t0 = time.perf_counter()
    cpu0 = time.process_time()
    result = 0
    for _ in range(iterations):
        result = map_reduce(elements)
    elapsed = (time.perf_counter() - t0) * 1000
    cpu_ms = (time.process_time() - cpu0) * 1000

    # Memory measurement pass (separate from throughput timing)
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        map_reduce(elements)
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    total_elements = iterations * elements
    return {
        "runtime": "python",
        "benchmark": "gpu-compute-v1",
        "device": "cpu (serial)",
        "elements": elements,
        "iterations": iterations,
        "result": result,
        "elapsedMs": round(elapsed, 3),
        "iterationsPerSecond": round(iterations / max(elapsed / 1000, 1e-9), 2),
        "operationsPerSecond": round(total_elements / max(elapsed / 1000, 1e-9), 0),
        "cpu": {"processMs": round(cpu_ms, 3)},
        "memory": {
            "heapUsedBytes": _cur,
            "heapUsedDelta": _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
            "tracemallocPeak": _peak,
        },
        "process": {"pid": os.getpid(), "python": platform.python_version(), "platform": platform.platform()},
        "notes": ["CPU serial execution — CPython.", "GPU-shaped map-reduce workload."],
    }

if __name__ == "__main__":
    elements = ELEMENTS
    its = DEFAULT_ITERATIONS
    for i, a in enumerate(sys.argv):
        if a == "--elements" and i + 1 < len(sys.argv): elements = int(sys.argv[i + 1])
        if a in ("--operations", "--iterations") and i + 1 < len(sys.argv): its = int(sys.argv[i + 1])
    print(json.dumps(run_bench(elements, its), indent=2))
