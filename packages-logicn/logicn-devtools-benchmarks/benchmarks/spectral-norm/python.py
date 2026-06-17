import json, sys, time, gc, tracemalloc

# spectral-norm — scaled-integer power iteration (Computer Language Benchmarks Game family).
#
# Mirrors node.mjs / bench.rs exactly: all values stay NON-NEGATIVE, so Python `//`
# matches Node `Math.trunc(a/b)` and Rust `a / b`. The `checksum` is byte-identical
# across the three runtimes. operationsPerSecond is reported as A-evals/sec on the
# basis ITERS*2*n^2 = 200000 A(i,j) evaluations per run.

SCALE = 4096
N = 100
ITERS = 10
A_EVALS = ITERS * 2 * N * N  # 200000


def eval_a(i, j):
    denom = ((i + j) * (i + j + 1)) // 2 + i + 1  # positive integer
    return SCALE // denom


def matvec(transpose, src, dst):
    # dst[i] = ( sum_j A[i][j] * src[j] ) // SCALE   (transpose uses A[j][i])
    for i in range(N):
        s = 0
        for j in range(N):
            a = eval_a(j, i) if transpose else eval_a(i, j)
            s += a * src[j]
        dst[i] = s // SCALE


def spectral_norm():
    u = [SCALE] * N
    v = [0] * N
    tmp = [0] * N
    for _ in range(ITERS):
        matvec(False, u, tmp)   # v = A^T A u
        matvec(True, tmp, v)
        matvec(False, v, tmp)   # u = A^T A v
        matvec(True, tmp, u)
    vBv = 0
    vv = 0
    for i in range(N):
        ui = u[i] // SCALE
        vi = v[i] // SCALE
        vBv += ui * vi
        vv += vi * vi
    return 0 if vv == 0 else (vBv * SCALE) // vv


its = 50
for i, a in enumerate(sys.argv):
    if a in ("--iterations", "--operations") and i + 1 < len(sys.argv):
        its = int(sys.argv[i + 1])

# Timed pass.
checksum = spectral_norm()  # also warmup / correctness capture
t0 = time.perf_counter()
for _ in range(its):
    checksum = spectral_norm()
elapsed_ms = (time.perf_counter() - t0) * 1000

# Memory pass (separate, bounded iteration count).
mem_iters = min(its, 10)
gc.collect()
tracemalloc.start()
_base = tracemalloc.get_traced_memory()[0]
for _ in range(mem_iters):
    spectral_norm()
_cur, _peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
_heap_delta = _cur - _base

print(json.dumps({
    "runtime": "python",
    "benchmark": "spectral-norm-v1",
    "iterations": its,
    "aEvals": A_EVALS,
    "checksum": checksum,
    "elapsedMs": round(elapsed_ms, 3),
    "operationsPerSecond": round(its * A_EVALS / max(elapsed_ms / 1000, 1e-9)),
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / (mem_iters * A_EVALS), 2),
        "tracemallocPeak": _peak,
    },
    "notes": ["Scaled-int power iteration (n=100, 10 iters); checksum is byte-identical to Node and Rust"],
}, indent=2))
