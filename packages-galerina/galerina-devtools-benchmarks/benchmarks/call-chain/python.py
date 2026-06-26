import json, os, platform, sys, time, gc, tracemalloc

# call-chain benchmark — Python reference
# Mirrors benchmark.spore: controller -> service.method() -> util function,
# 7 calls per outer iteration (1 service + 2 domain + 4 leaf), same salting.

DEFAULT_ITERATIONS = 1_000_000  # ~1-2s in CPython

def leaf_compute(salt, x):
    return (salt + x) * 2 + 1

class DomainLayer:
    def compute(self, salt, x):
        return leaf_compute(salt, x) + leaf_compute(salt, x + 1)

class ServiceLayer:
    def __init__(self):
        self.domain = DomainLayer()
    def process(self, salt, x):
        return self.domain.compute(salt, x) + self.domain.compute(salt, x + 2)

def chain(iterations):
    service = ServiceLayer()
    checksum = 0
    for i in range(iterations):
        checksum += service.process(i, i)
    return checksum

def run_bench(iterations):
    # Warmup
    chain(min(iterations, 50_000))

    t0 = time.perf_counter()
    cpu0 = time.process_time()
    result = chain(iterations)
    elapsed = (time.perf_counter() - t0) * 1000
    cpu_ms = (time.process_time() - cpu0) * 1000

    # Memory measurement pass (separate from throughput timing)
    _mem_iters = min(iterations, 50000)
    _svc = ServiceLayer()
    gc.collect()
    tracemalloc.start()
    _base = tracemalloc.get_traced_memory()[0]
    for _i in range(_mem_iters):
        _svc.process(_i, _i)
    _cur, _peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    _heap_delta = _cur - _base

    return {
        "runtime": "python", "benchmark": "call-chain-v1",
        "result": result, "iterations": iterations,
        "callsPerIteration": 7,
        "elapsedMs": round(elapsed, 3),
        "iterationsPerSecond": round(iterations / max(elapsed / 1000, 1e-9), 2),
        "callsPerSecond": round((iterations * 7) / max(elapsed / 1000, 1e-9), 2),
        "cpu": {"processMs": round(cpu_ms, 3)},
        "memory": {
            "heapUsedBytes": _cur,
            "heapUsedDelta": _heap_delta,
            "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
            "tracemallocPeak": _peak,
        },
        "process": {"pid": os.getpid(), "python": platform.python_version(),
                    "platform": platform.platform(), "arch": platform.machine()},
    }

if __name__ == "__main__":
    its = DEFAULT_ITERATIONS
    for i, a in enumerate(sys.argv):
        if a in ("--operations", "--iterations") and i + 1 < len(sys.argv):
            its = int(sys.argv[i + 1])
    print(json.dumps(run_bench(its), indent=2))
