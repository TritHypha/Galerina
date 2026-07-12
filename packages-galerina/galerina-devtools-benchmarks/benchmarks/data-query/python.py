import json, sys, time, gc

# data-query — SQL-like filter + group-by over a synthetic record stream.
#
# THE common bulk-N workload — mirrors benchmark.fungi main() = scanRecords(10000, 3000)
# EXACTLY: ONE pass over n records, each a WHERE test (amount > threshold) plus a
# GROUP BY category count, so one call = n record-scans. Same on every runtime.
def scan_records(n, threshold):
    matching = 0
    c0 = c1 = c2 = c3 = 0
    for i in range(n):
        amount = (i * 50) % 10000               # 0..9999 deterministic
        if amount > threshold:
            matching += 1
        cat = (i * 7) % 4                        # 0..3
        if cat == 0: c0 += 1
        elif cat == 1: c1 += 1
        elif cat == 2: c2 += 1
        else: c3 += 1
    return matching + c0 + c1 + c2 + c3


N = 10000                       # records scanned per call — matches benchmark.fungi main()
THRESHOLD = 3000
RECORD_SCANS_PER_CALL = N       # the canonical N

calls = 300                     # python is slower; fewer calls, same throughput unit
for i, a in enumerate(sys.argv):
    if a in ("--iterations", "--operations") and i + 1 < len(sys.argv):
        calls = int(sys.argv[i + 1])

for _ in range(3):
    scan_records(N, THRESHOLD)  # warmup
gc.collect()

t0 = time.perf_counter()
checksum = 0
for _ in range(calls):
    checksum = scan_records(N, THRESHOLD)
elapsed = (time.perf_counter() - t0) * 1000

total_scans = calls * RECORD_SCANS_PER_CALL
print(json.dumps({
    "runtime": "python",
    "benchmark": "data-query-v1",
    "datasetSize": N,
    "calls": calls,
    "recordScansPerCall": RECORD_SCANS_PER_CALL,
    "checksum": checksum,
    "elapsedMs": round(elapsed, 3),
    "operationsPerSecond": round(total_scans / max(elapsed / 1000, 1e-9)),
    "callsPerSecond": round(calls / max(elapsed / 1000, 1e-9)),
    "notes": [
        "Common bulk-N path: scanRecords(10000) = 10000 record-scans/call (filter + group-by), identical on every runtime",
    ],
}, indent=2))
