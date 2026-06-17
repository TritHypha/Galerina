import gc, json, os, platform, sys, time, tracemalloc

DEFAULT_STREAM_SIZE = 10000
DEFAULT_ITERATIONS = 1000  # fewer — Python is slower

def validate(n): return 1 if 0 <= n <= 1000000 else 0
def classify(n):
    if n < 100:   return 1
    if n < 1000:  return 2
    if n < 10000: return 3
    return 4

def process_stream(count):
    total = 0
    for i in range(count):
        if validate(i):
            total += classify(i)
    return total

def run_bench(stream_size, iterations):
    # Warmup
    for _ in range(10): process_stream(stream_size)

    tracemalloc.start()
    t0 = time.perf_counter()
    cpu0 = time.process_time()

    result = 0
    for _ in range(iterations):
        result = process_stream(stream_size)

    elapsed = (time.perf_counter() - t0) * 1000
    cpu_ms = (time.process_time() - cpu0) * 1000
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    total_ops = iterations * stream_size
    bytes_per_op = current / total_ops if total_ops > 0 else 0

    # Separate memory-measurement pass (does not affect throughput numbers above).
    # N = number of iterations the throughput pass ran.
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        process_stream(stream_size)
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    return {
        "runtime": "python", "benchmark": "low-memory-v1",
        "streamSize": stream_size, "iterations": iterations, "result": result,
        "elapsedMs": round(elapsed, 3),
        "iterationsPerSecond": round(iterations / max(elapsed / 1000, 1e-9), 2),
        "totalOps": total_ops,
        "memory": {
            "tracemallocCurrentBytes": current,
            "tracemallocPeakBytes": peak,
            "bytesPerStreamElement": round(bytes_per_op, 2),
            "heapUsedBytes":     _cur,
            "heapUsedDelta":     _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2) if _mem_iters else 0,
            "tracemallocPeak":   _peak,
        },
        "cpu": {"processMs": round(cpu_ms, 3)},
        "process": {"pid": os.getpid(), "python": platform.python_version(), "platform": platform.platform()},
        "notes": [
            "tracemalloc measures Python heap allocations",
            f"Bytes/op: {bytes_per_op:.2f} (Python objects are ~56+ bytes each)",
        ],
    }

if __name__ == "__main__":
    size = DEFAULT_STREAM_SIZE
    its  = DEFAULT_ITERATIONS
    for i, a in enumerate(sys.argv):
        if a == "--stream-size" and i + 1 < len(sys.argv): size = int(sys.argv[i + 1])
        if a in ("--operations", "--iterations") and i + 1 < len(sys.argv): its = int(sys.argv[i + 1])
    print(json.dumps(run_bench(size, its), indent=2))
