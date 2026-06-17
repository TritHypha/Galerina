import sys
import json
import time
import gc
import tracemalloc

# N-body pairwise gravitational force — scaled-integer kernel.
# Mirrors benchmark.lln and node.mjs exactly. `//` (floor) == trunc here because
# every numerator (G * adx) is non-negative and every denominator (d2) is positive,
# so the checksum is identical across Python, Node and the LogicN integer path.
G = 100000   # scaled gravitational constant
SOFT = 1     # softening^2 (avoids division by zero)


def pos_x(i, t):
    return i * 73 + i * t


def pos_y(i, t):
    return i * 149 + i * t


def net_force(i, t, n):
    fxi = 0
    fyi = 0
    for j in range(n):
        if j != i:
            dx = pos_x(j, t) - pos_x(i, t)
            dy = pos_y(j, t) - pos_y(i, t)
            d2 = dx * dx + dy * dy + SOFT
            adx = -dx if dx < 0 else dx
            ady = -dy if dy < 0 else dy
            sx = -1 if dx < 0 else (1 if dx > 0 else 0)
            sy = -1 if dy < 0 else (1 if dy > 0 else 0)
            fxi += sx * ((G * adx) // d2)
            fyi += sy * ((G * ady) // d2)
    return (-fxi if fxi < 0 else fxi) + (-fyi if fyi < 0 else fyi)


def simulate(n, steps):
    checksum = 0
    for t in range(steps):
        for i in range(n):
            checksum = checksum + net_force(i, t, n)
            if checksum > 1000000000:
                checksum = checksum - 1000000000
            if checksum < -1000000000:
                checksum = checksum + 1000000000
    return checksum


def int_flag(name, fb):
    if name in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(name) + 1])
        except (ValueError, IndexError):
            return fb
    return fb


def main():
    n = int_flag("--bodies", int_flag("--size", 64))
    steps = int_flag("--steps", 8)
    iterations = int_flag("--iterations", int_flag("--operations", 50))

    for _ in range(2):  # warmup
        simulate(n, steps)

    t0 = time.perf_counter()
    checksum = 0
    for _ in range(iterations):
        checksum = simulate(n, steps)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Memory measurement pass (separate from throughput timing)
    _mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _ in range(_mem_iters):
        simulate(n, steps)
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    force_evals = steps * n * n * iterations
    print(json.dumps({
        "runtime": "python",
        "benchmark": "nbody-v1",
        "bodies": n, "steps": steps, "iterations": iterations,
        "checksum": checksum,
        "elapsedMs": round(elapsed_ms, 3),
        "iterationsPerSecond": round(iterations / (elapsed_ms / 1000.0), 2),
        "forceEvalsPerSecond": round(force_evals / (elapsed_ms / 1000.0)),
        "memory": {
            "heapUsedBytes": _cur,
            "heapUsedDelta": _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
            "tracemallocPeak": _peak,
        },
        "notes": ["Scaled-integer N-body — checksum matches Node and LogicN bit-for-bit"],
    }, indent=2))


if __name__ == "__main__":
    main()
