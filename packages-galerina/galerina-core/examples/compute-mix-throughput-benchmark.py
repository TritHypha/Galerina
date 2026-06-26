"""
Harder benchmark v2:
Per operation: 2 LCG steps, 2 xorshift mixing rounds,
float sqrt, float-to-int conversion, 4-way conditional branch.
Algorithm must produce the same checksum as the Node.js version.
"""

import argparse
import json
import math
import os
import platform
import sys
import time
import tracemalloc

try:
    import resource
except ModuleNotFoundError:
    resource = None


DEFAULT_TARGET_MS = 30_000
DEFAULT_WARMUP_MS = 3_000
DEFAULT_BATCH_SIZE = 50_000
DEFAULT_SEED = 123_456_789
UINT32_MASK = 0xFFFF_FFFF


def run_batch(seed, checksum, batch_size):
    for _ in range(batch_size):
        seed = ((seed * 1_664_525) + 1_013_904_223) & UINT32_MASK
        mix1 = ((seed ^ (seed >> 13)) * 2_246_822_519) & UINT32_MASK
        mix2 = ((mix1 ^ (mix1 >> 17)) * 3_266_489_917) & UINT32_MASK
        fval    = mix2 / 4_294_967_296.0
        sqrtval = math.sqrt(fval + 1.0)
        intval  = int(sqrtval * 1_000_000.0) & UINT32_MASK
        branch = mix2 & 3
        if branch == 0:
            checksum = (checksum ^ intval) & UINT32_MASK
        elif branch == 1:
            checksum = (checksum + mix2) & UINT32_MASK
        elif branch == 2:
            checksum = (checksum ^ ((mix1 << 3) & UINT32_MASK)) & UINT32_MASK
        else:
            checksum = (checksum + intval + mix1) & UINT32_MASK
        seed     = ((seed * 2_891_336_453) + 1_442_695_041) & UINT32_MASK
        checksum = (checksum ^ seed) & UINT32_MASK
    return seed, checksum


def elapsed_ms(started_at):
    return (time.perf_counter() - started_at) * 1000


def validate_config(args):
    if args.operations is None and not 10_000 <= args.target_ms <= 30_000:
        raise ValueError("--target-ms must be between 10000 and 30000 unless --operations is used")
    if args.warmup_ms < 0:
        raise ValueError("--warmup-ms must be 0 or greater")
    if args.batch_size <= 0:
        raise ValueError("--batch-size must be greater than 0")
    if args.operations is not None and args.operations <= 0:
        raise ValueError("--operations must be greater than 0")


def memory_report(use_tracemalloc):
    report = {
        "rssBytes": None, "heapUsedBytes": None, "heapTotalBytes": None,
        "tracemallocCurrentBytes": None, "tracemallocPeakBytes": None, "maxRssBytes": None,
    }
    if use_tracemalloc:
        current, peak = tracemalloc.get_traced_memory()
        report["tracemallocCurrentBytes"] = current
        report["tracemallocPeakBytes"] = peak
    try:
        if resource is None:
            raise RuntimeError("resource module unavailable")
        usage = resource.getrusage(resource.RUSAGE_SELF)
        max_rss = usage.ru_maxrss
        report["maxRssBytes"] = max_rss if sys.platform == "win32" else max_rss * 1024
    except Exception:
        pass
    return report


def run_benchmark(args):
    validate_config(args)
    if args.tracemalloc:
        tracemalloc.start()

    if args.warmup_ms > 0:
        warmup_started_at = time.perf_counter()
        w_seed, w_checksum = args.seed & UINT32_MASK, 0
        while elapsed_ms(warmup_started_at) < args.warmup_ms:
            w_seed, w_checksum = run_batch(w_seed, w_checksum, args.batch_size)

    seed, checksum = args.seed & UINT32_MASK, 0
    started_at  = time.perf_counter()
    started_cpu = time.process_time()
    operations  = 0

    if args.operations is not None:
        while operations < args.operations:
            batch = min(args.batch_size, args.operations - operations)
            seed, checksum = run_batch(seed, checksum, batch)
            operations += batch
    else:
        while elapsed_ms(started_at) < args.target_ms:
            seed, checksum = run_batch(seed, checksum, args.batch_size)
            operations += args.batch_size

    elapsed  = elapsed_ms(started_at)
    cpu_ms   = (time.process_time() - started_cpu) * 1000
    ops_sec  = round(operations / max(elapsed / 1000, sys.float_info.epsilon), 2)
    ops_cpu  = round(operations / max(cpu_ms, sys.float_info.epsilon), 2)

    return {
        "runtime": "python", "benchmark": "compute-mix-throughput-v2",
        "executionMode": "direct-python", "comparisonType": "direct-runtime",
        "version": 2, "algorithm": "lcg2x-xorshift2x-sqrt-4branch",
        "targetMs": args.target_ms, "warmupMs": args.warmup_ms,
        "batchSize": args.batch_size, "seed": args.seed,
        "elapsedMs": round(elapsed, 3), "operations": operations,
        "operationsPerSecond": ops_sec, "operationsPerCpuMs": ops_cpu,
        "checksum": checksum & UINT32_MASK,
        "cpu": {"userMs": None, "systemMs": None, "totalMs": round(cpu_ms, 3)},
        "memory": memory_report(args.tracemalloc),
        "process": {"pid": os.getpid(), "node": None,
                    "python": platform.python_version(),
                    "platform": platform.platform(), "arch": platform.machine()},
        "notes": [
            "v2: 2x LCG, 2x xorshift mix, float sqrt, 4-way branch per operation",
            "Harder than v1 — exercises float, int, and branch prediction together",
        ],
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Compute-mix throughput benchmark v2")
    parser.add_argument("--target-ms",  type=int,  default=DEFAULT_TARGET_MS)
    parser.add_argument("--warmup-ms",  type=int,  default=DEFAULT_WARMUP_MS)
    parser.add_argument("--batch-size", type=int,  default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--operations", type=int,  default=None)
    parser.add_argument("--seed",       type=int,  default=DEFAULT_SEED)
    parser.add_argument("--tracemalloc",    action="store_true")
    parser.add_argument("--no-tracemalloc", action="store_true")
    args = parser.parse_args()
    if args.no_tracemalloc:
        args.tracemalloc = False
    return args


if __name__ == "__main__":
    try:
        print(json.dumps(run_benchmark(parse_args()), indent=2))
    except ValueError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
