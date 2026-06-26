#!/usr/bin/env python3
"""
Galerina Strong Benchmark - Python reference implementation

Purpose:
- Runs the same deterministic mixed compute + memory workload as the Node.js version.
- Supports fixed-operation validation mode and timed throughput mode.
- Uses UInt32-style arithmetic so results can be compared with Node.js/Galerina.

For speed comparisons, use --no-tracemalloc.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import sys
import time
import tracemalloc
from array import array
from typing import Any, Dict, Optional

UINT32_MASK = 0xFFFFFFFF


def u32(value: int) -> int:
    return value & UINT32_MASK


def imul32(a: int, b: int) -> int:
    return (a * b) & UINT32_MASK


def is_power_of_two(value: int) -> bool:
    return value > 0 and (value & (value - 1)) == 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Galerina strong compute/memory throughput benchmark")
    parser.add_argument("--target-ms", type=int, default=20000)
    parser.add_argument("--operations", type=int, default=None)
    parser.add_argument("--warmup-ms", type=int, default=2000)
    parser.add_argument("--batch-size", type=int, default=100000)
    parser.add_argument("--buffer-size", type=int, default=65536)
    parser.add_argument("--seed", type=int, default=123456789)
    parser.add_argument("--tracemalloc", action="store_true", help="Enable tracemalloc diagnostics. Not recommended for speed tests.")
    parser.add_argument("--no-tracemalloc", action="store_true", help="Explicitly keep tracemalloc disabled for speed tests.")
    return parser.parse_args()


def validate_config(args: argparse.Namespace) -> None:
    if args.target_ms <= 0:
        raise ValueError("target-ms must be positive")
    if args.warmup_ms < 0:
        raise ValueError("warmup-ms must be zero or positive")
    if args.batch_size <= 0:
        raise ValueError("batch-size must be positive")
    if args.buffer_size <= 0 or not is_power_of_two(args.buffer_size):
        raise ValueError("buffer-size must be a positive power of two")
    if args.operations is not None and args.operations <= 0:
        raise ValueError("operations must be positive")
    if args.operations is None and not (10000 <= args.target_ms <= 30000):
        raise ValueError("target-ms should be between 10000 and 30000 for fair timed benchmark runs")


def next_seed(seed: int) -> int:
    return (imul32(seed, 1664525) + 1013904223) & UINT32_MASK


class BenchmarkState:
    __slots__ = ("seed", "state", "checksum", "cursor", "buffer", "mask")

    def __init__(self, seed: int, buffer_size: int) -> None:
        self.seed = seed & UINT32_MASK
        self.state = self.seed
        self.checksum = 0
        self.cursor = 0
        self.buffer = array("I", [0]) * buffer_size
        self.mask = buffer_size - 1

        s = self.state
        for i in range(buffer_size):
            s = next_seed(s)
            self.buffer[i] = s
        self.state = s


def run_operations(state: BenchmarkState, operation_count: int) -> None:
    buffer = state.buffer
    mask = state.mask
    s = state.state
    checksum = state.checksum
    cursor = state.cursor

    for _ in range(operation_count):
        s = (imul32(s ^ (s >> 16), 2246822519) + 3266489917) & UINT32_MASK

        idx = (s ^ (s >> 11) ^ cursor) & mask
        old = int(buffer[idx]) & UINT32_MASK

        mixed = imul32((old ^ s ^ (checksum >> 3)) & UINT32_MASK, 2654435761)
        mixed = (mixed ^ (mixed >> 15) ^ imul32(mixed, 2246822519)) & UINT32_MASK

        if (mixed & 7) == 0:
            checksum = (checksum + mixed + old) & UINT32_MASK
        elif (mixed & 1) == 0:
            checksum = (checksum ^ ((mixed << 1) & UINT32_MASK) ^ (old >> 1)) & UINT32_MASK
        else:
            checksum = (checksum + imul32((mixed ^ old) & UINT32_MASK, 1597334677)) & UINT32_MASK

        buffer[idx] = (mixed + checksum + cursor) & UINT32_MASK
        cursor = (cursor + 1) & mask

    state.state = s & UINT32_MASK
    state.checksum = checksum & UINT32_MASK
    state.cursor = cursor & UINT32_MASK


def run_warmup(args: argparse.Namespace) -> None:
    if args.warmup_ms <= 0:
        return

    state = BenchmarkState(args.seed, args.buffer_size)
    started_at = time.perf_counter()
    target_seconds = args.warmup_ms / 1000.0

    while (time.perf_counter() - started_at) < target_seconds:
        run_operations(state, args.batch_size)


def get_windows_memory() -> Dict[str, Optional[int]]:
    if os.name != "nt":
        return {"rssBytes": None, "maxRssBytes": None}

    try:
        import ctypes
        from ctypes import wintypes

        class PROCESS_MEMORY_COUNTERS_EX(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD),
                ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t),
            ]

        counters = PROCESS_MEMORY_COUNTERS_EX()
        counters.cb = ctypes.sizeof(PROCESS_MEMORY_COUNTERS_EX)
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ok = ctypes.windll.psapi.GetProcessMemoryInfo(
            handle,
            ctypes.byref(counters),
            counters.cb,
        )
        if not ok:
            return {"rssBytes": None, "maxRssBytes": None}

        return {
            "rssBytes": int(counters.WorkingSetSize),
            "maxRssBytes": int(counters.PeakWorkingSetSize),
        }
    except Exception:
        return {"rssBytes": None, "maxRssBytes": None}


def get_memory_usage(tracemalloc_enabled: bool) -> Dict[str, Any]:
    current = None
    peak = None

    if tracemalloc_enabled:
        current, peak = tracemalloc.get_traced_memory()

    memory = {
        "rssBytes": None,
        "heapUsedBytes": None,
        "heapTotalBytes": None,
        "tracemallocEnabled": tracemalloc_enabled,
        "tracemallocCurrentBytes": current,
        "tracemallocPeakBytes": peak,
        "maxRssBytes": None,
    }

    win = get_windows_memory()
    memory.update(win)
    return memory


def run_measured(args: argparse.Namespace, tracemalloc_enabled: bool) -> Dict[str, Any]:
    run_warmup(args)

    state = BenchmarkState(args.seed, args.buffer_size)
    operations = 0

    started_cpu = time.process_time()
    started_at = time.perf_counter()

    if args.operations is not None:
        while operations < args.operations:
            remaining = args.operations - operations
            batch = remaining if remaining < args.batch_size else args.batch_size
            run_operations(state, batch)
            operations += batch
    else:
        target_seconds = args.target_ms / 1000.0
        while (time.perf_counter() - started_at) < target_seconds:
            run_operations(state, args.batch_size)
            operations += args.batch_size

    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    cpu_total_ms = (time.process_time() - started_cpu) * 1000.0

    mode = "fixed-operations" if args.operations is not None else "timed-throughput"

    return {
        "runtime": "python",
        "benchmark": "compute-mix-throughput-v2",
        "executionMode": "direct-python",
        "comparisonType": "direct-runtime",
        "mode": mode,
        "targetMs": None if args.operations is not None else args.target_ms,
        "requestedOperations": args.operations,
        "warmupMs": args.warmup_ms,
        "batchSize": args.batch_size,
        "bufferSize": args.buffer_size,
        "seed": args.seed & UINT32_MASK,
        "elapsedMs": round(elapsed_ms, 3),
        "operations": operations,
        "operationsPerSecond": round(operations / (elapsed_ms / 1000.0), 2),
        "checksum": state.checksum & UINT32_MASK,
        "finalState": state.state & UINT32_MASK,
        "cursor": state.cursor & UINT32_MASK,
        "overshootMs": round(max(0.0, elapsed_ms - args.target_ms), 3) if args.operations is None else 0,
        "cpu": {
            "userMs": None,
            "systemMs": None,
            "totalMs": round(cpu_total_ms, 3),
        },
        "memory": get_memory_usage(tracemalloc_enabled),
        "process": {
            "pid": os.getpid(),
            "node": None,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "arch": platform.machine(),
            "cpus": os.cpu_count(),
        },
        "notes": [
            "V2 benchmark uses UInt32 compute, branching, and ring-buffer memory reads/writes.",
            "Memory tracing should remain disabled for speed comparisons.",
            "Use fixed-operations mode to compare checksum equality across runtimes.",
        ],
    }


def main() -> int:
    try:
        args = parse_args()
        validate_config(args)

        tracemalloc_enabled = bool(args.tracemalloc and not args.no_tracemalloc)
        if tracemalloc_enabled:
            tracemalloc.start()

        report = run_measured(args, tracemalloc_enabled)
        print(json.dumps(report, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({
            "runtime": "python",
            "benchmark": "compute-mix-throughput-v2",
            "error": str(exc),
        }, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
