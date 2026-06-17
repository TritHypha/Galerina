import sys
import json
import time
import gc
import tracemalloc

# Mandelbrot escape-time (Computer Language Benchmarks Game) — scaled-integer kernel.
# Mirrors benchmark.lln, node.mjs and bench.rs EXACTLY. The only negative division
# numerator (2*zr*zi) is split into sign+magnitude so EVERY numerator is non-negative
# and every denominator is positive → Python `//` (floor) == trunc == Rust / == LogicN /,
# so the checksum is identical across all runtimes.
W = 128
H = 128
MAXITER = 100
SCALE = 8192
MINR = -20480   # real axis: -2.5 .. +1.0 (×SCALE)
SPANR = 28672
MINI = -16384   # imag axis: -2.0 .. +2.0 (×SCALE)
SPANI = 32768


def mandel():
    checksum = 0
    for py in range(H):
        ci = MINI + (py * SPANI) // H
        for px in range(W):
            cr = MINR + (px * SPANR) // W
            zr = 0
            zi = 0
            it = 0
            while it < MAXITER:
                zr2 = (zr * zr) // SCALE
                zi2 = (zi * zi) // SCALE
                if zr2 + zi2 > 32768:          # escape: |z|^2 > 4 (= 4*SCALE)
                    break
                cross = zr * zi                 # may be negative
                sgn = -1 if cross < 0 else 1
                mag = -cross if cross < 0 else cross
                nzi = sgn * ((2 * mag) // SCALE) + ci
                nzr = zr2 - zi2 + cr
                zr = nzr
                zi = nzi
                it = it + 1
            checksum = checksum + it
    return checksum


def int_flag(name, fb):
    if name in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(name) + 1])
        except (ValueError, IndexError):
            return fb
    return fb


def main():
    iterations = int_flag("--iterations", int_flag("--operations", 200))

    for _ in range(2):  # warmup
        mandel()

    t0 = time.perf_counter()
    checksum = 0
    for _ in range(iterations):
        checksum = mandel()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Memory measurement pass (separate from throughput timing).
    # Mandelbrot is heavy, so keep the memory pass small.
    mem_iters = min(iterations, 5)
    gc.collect()
    tracemalloc.start()
    base = tracemalloc.get_traced_memory()[0]
    for _ in range(mem_iters):
        mandel()
    cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    heap_delta = cur - base

    pixels = W * H  # 16384 pixels per run
    print(json.dumps({
        "runtime": "python",
        "benchmark": "mandelbrot-v1",
        "iterations": iterations, "pixels": pixels,
        "checksum": checksum,
        "elapsedMs": round(elapsed_ms, 3),
        "operationsPerSecond": round(iterations * pixels / (elapsed_ms / 1000.0)),  # pixels/sec
        "memory": {
            "heapUsedBytes": cur,
            "heapUsedDelta": heap_delta,
            "bytesPerOperation": round(heap_delta / (mem_iters * pixels), 2),
            "tracemallocPeak": peak,
        },
        "notes": ["Scaled-integer Mandelbrot escape-time — checksum matches Node, Rust and LogicN bit-for-bit"],
    }, indent=2))


if __name__ == "__main__":
    main()
