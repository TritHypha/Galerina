import json, os, platform, sys, time, gc, tracemalloc
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

def mat_mul_pure(n, iterations):
    A = [[i*0.001 + 0.1 for i in range(n)] for _ in range(n)]
    B = [[(n*n - i)*0.001 + 0.1 for i in range(n)] for _ in range(n)]
    checksum = 0.0
    t0 = time.perf_counter()
    for _ in range(iterations):
        for r in range(n):
            for c in range(n):
                s = sum(A[r][k] * B[k][c] for k in range(n))
        checksum += s
    return (time.perf_counter() - t0) * 1000, checksum

def mat_mul_pure_mem(n, iterations):
    A = [[i*0.001 + 0.1 for i in range(n)] for _ in range(n)]
    B = [[(n*n - i)*0.001 + 0.1 for i in range(n)] for _ in range(n)]
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        for r in range(n):
            for c in range(n):
                s = sum(A[r][k] * B[k][c] for k in range(n))
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return _cur, _peak, _cur - _base, _mem_iters

def mat_mul_numpy(n, iterations):
    A = (np.random.rand(n, n) * 0.001).astype(np.float32)
    B = (np.random.rand(n, n) * 0.001).astype(np.float32)
    _ = A @ B  # warmup
    t0 = time.perf_counter()
    checksum = 0.0
    for _ in range(iterations):
        C = A @ B
        checksum += float(C[0, 0])
    return (time.perf_counter() - t0) * 1000, checksum

def mat_mul_numpy_mem(n, iterations):
    A = (np.random.rand(n, n) * 0.001).astype(np.float32)
    B = (np.random.rand(n, n) * 0.001).astype(np.float32)
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        C = A @ B
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return _cur, _peak, _cur - _base, _mem_iters

n   = 64
its = 50
for i, a in enumerate(sys.argv):
    if a == "--size" and i+1<len(sys.argv): n=int(sys.argv[i+1])
    if a in ("--iterations","--operations") and i+1<len(sys.argv): its=int(sys.argv[i+1])

if HAS_NUMPY:
    elapsed, cs = mat_mul_numpy(n, its)
    impl = "numpy"
    _cur, _peak, _heap_delta, _mem_iters = mat_mul_numpy_mem(n, its)
else:
    elapsed, cs = mat_mul_pure(n, its)
    impl = "pure-python"
    _cur, _peak, _heap_delta, _mem_iters = mat_mul_pure_mem(n, its)

flops_per_iter = 2 * n * n * n
total_flops = flops_per_iter * its
gflops = total_flops / max(elapsed / 1000, 1e-9) / 1e9
print(json.dumps({
    "runtime": "python", "benchmark": "matrix-multiply-v1",
    "matrixSize": n, "iterations": its, "implementation": impl,
    "elapsedMs": round(elapsed, 3),
    "iterationsPerSecond": round(its / max(elapsed/1000, 1e-9), 2),
    "gflops": round(gflops, 3),
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
        "tracemallocPeak": _peak,
    },
    "notes": [f"NumPy float32 matmul" if HAS_NUMPY else "Pure Python (slow, install numpy for real numbers)"],
}, indent=2))
