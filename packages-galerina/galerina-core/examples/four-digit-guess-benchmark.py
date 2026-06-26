"""
Harder v2: expanded to 6-digit codes (1M combinations).
Each attempt computes a bulls+cows score (Wordle-style):
  bulls = digits correct position, cows = digits present, wrong position.
This makes each comparison ~6x more expensive than raw string equality.
max-attempts default raised to 2,000,000.
"""

import argparse
import json
import os
import platform
import random
import sys
import time
import tracemalloc

DEFAULT_MAX_ATTEMPTS = 2_000_000
CODE_LENGTH          = 6
CODE_SPACE           = 10 ** CODE_LENGTH   # 1_000_000


def format_code(value):
    return str(value).zfill(CODE_LENGTH)


def bulls_and_cows(candidate, target):
    """Return (bulls, cows) for candidate vs target."""
    bulls = 0
    cand_count = [0] * 10
    targ_count = [0] * 10

    for c, t in zip(candidate, target):
        if c == t:
            bulls += 1
        else:
            cand_count[int(c)] += 1
            targ_count[int(t)] += 1

    cows = sum(min(cand_count[d], targ_count[d]) for d in range(10))
    return bulls, cows


def run_benchmark(target, max_attempts, mode):
    tracemalloc.start()
    started_at  = time.perf_counter()
    started_cpu = time.process_time()

    attempt     = 0
    found       = False
    last_bulls  = last_cows = 0
    total_bulls = total_cows = 0

    while attempt < max_attempts:
        candidate = format_code(random.randrange(0, CODE_SPACE) if mode == "random" else attempt % CODE_SPACE)
        attempt  += 1

        bulls, cows = bulls_and_cows(candidate, target)
        total_bulls += bulls
        total_cows  += cows

        if bulls == CODE_LENGTH:
            found      = True
            last_bulls = bulls
            last_cows  = cows
            break

    elapsed_ms = (time.perf_counter() - started_at) * 1_000
    cpu_ms     = (time.process_time() - started_cpu) * 1_000
    current_bytes, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    return {
        "runtime":           "python",
        "benchmark":         "four-digit-guess-v2",
        "version":           2,
        "codeLength":        CODE_LENGTH,
        "mode":              mode,
        "target":            target,
        "found":             found,
        "attempts":          attempt,
        "finalScore":        {"bulls": last_bulls, "cows": last_cows} if found else None,
        "totalBulls":        total_bulls,
        "totalCows":         total_cows,
        "elapsedMs":         round(elapsed_ms, 3),
        "attemptsPerSecond": round(attempt / max(elapsed_ms / 1_000, sys.float_info.epsilon), 2),
        "cpu": {
            "processMs": round(cpu_ms, 3),
        },
        "memory": {
            "tracemallocCurrentBytes": current_bytes,
            "tracemallocPeakBytes":    peak_bytes,
        },
        "process": {
            "pid":      os.getpid(),
            "python":   platform.python_version(),
            "platform": platform.platform(),
            "arch":     platform.machine(),
        },
        "notes": [
            "v2: 6-digit codes (1M combinations), bulls+cows scoring per attempt",
            "Each attempt is ~6x more expensive than raw string equality",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description="Six-digit guess benchmark v2")
    parser.add_argument("--target",        default="042069")
    parser.add_argument("--max", "--max-attempts", dest="max_attempts", type=int, default=DEFAULT_MAX_ATTEMPTS)
    parser.add_argument("--mode",          choices=["sequential", "random"], default="sequential")
    args = parser.parse_args()

    if len(args.target) != CODE_LENGTH or not args.target.isdigit():
        print(f"target must be exactly {CODE_LENGTH} digits", file=sys.stderr)
        sys.exit(1)
    if args.max_attempts <= 0 or args.max_attempts > 20_000_000:
        print("max-attempts must be 1 … 20000000", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(run_benchmark(args.target, args.max_attempts, args.mode), indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"four-digit benchmark failed: {exc}", file=sys.stderr)
        sys.exit(1)
