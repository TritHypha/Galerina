"""
Harder v2: doubled threshold, plus modular multiply + XOR checksum each cycle.
Each loop iteration: 4 additions + 1 multiply + 1 XOR (vs 2 additions in v1).
Checksum must match Node.js version for the same threshold.
"""

import argparse
import json
import os
import platform
import sys
import time
import tracemalloc

DEFAULT_THRESHOLD = 200_000_000_000_000   # doubled from v1
UINT32_MASK = 0xFFFF_FFFF


def run_benchmark(threshold, use_tracemalloc=False):
    if use_tracemalloc:
        tracemalloc.start()

    started_at  = time.perf_counter()
    started_cpu = time.process_time()

    total     = 0
    i         = 0
    additions = 0
    checksum  = 0          # uint32 checksum — extra work per cycle

    while total <= threshold:
        # Unrolled double-step (same as v1) + checksum update
        total += i
        i += 1
        additions += 1

        total += i
        i += 1
        additions += 1

        # Extra work: modular multiply + XOR accumulate (matches Node.js Math.imul behaviour)
        # Explicit intermediate to avoid Python's lower & precedence swallowing the addition
        prod     = ((checksum ^ (i & UINT32_MASK)) * 2_654_435_761) & UINT32_MASK
        checksum = (prod + (i & UINT32_MASK)) & UINT32_MASK

    elapsed_ms = (time.perf_counter() - started_at) * 1_000
    cpu_ms     = (time.process_time() - started_cpu) * 1_000

    if use_tracemalloc:
        current_bytes, peak_bytes = tracemalloc.get_traced_memory()
        tracemalloc.stop()
    else:
        current_bytes = peak_bytes = None

    return {
        "runtime":            "python",
        "benchmark":          "arithmetic-threshold-v2",
        "version":            2,
        "threshold":          threshold,
        "total":              total,
        "nextI":              i,
        "additions":          additions,
        "checksum":           checksum & UINT32_MASK,
        "loopCycles":         additions // 2,
        "elapsedMs":          round(elapsed_ms, 3),
        "additionsPerSecond": round(additions / max(elapsed_ms / 1_000, sys.float_info.epsilon), 2),
        "cpu": {
            "processMs": round(cpu_ms, 3),
        },
        "memory": {
            "tracemallocEnabled":      use_tracemalloc,
            "tracemallocCurrentBytes": current_bytes,
            "tracemallocPeakBytes":    peak_bytes,
        },
        "process": {
            "pid":      os.getpid(),
            "python":   platform.python_version(),
            "platform": platform.platform(),
            "arch":     platform.machine(),
        },
        "notes": ["v2: doubled threshold, +multiply+XOR checksum per cycle"],
    }


def main():
    parser = argparse.ArgumentParser(description="Arithmetic threshold benchmark v2")
    parser.add_argument("--threshold",      type=int, default=DEFAULT_THRESHOLD)
    parser.add_argument("--tracemalloc",    action="store_true")
    parser.add_argument("--no-tracemalloc", action="store_true")
    args = parser.parse_args()

    if args.threshold <= 0:
        print("threshold must be a positive integer", file=sys.stderr)
        sys.exit(1)

    use_tm = args.tracemalloc and not args.no_tracemalloc
    print(json.dumps(run_benchmark(args.threshold, use_tm), indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"arithmetic benchmark failed: {exc}", file=sys.stderr)
        sys.exit(1)
