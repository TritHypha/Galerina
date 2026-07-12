import json, sys, time, gc

# tri-logic — Kleene ternary logic, Int8 encoding: True=1, Unknown=0, False=-1.
# Tri.and = min(a,b), Tri.or = max(a,b), Tri.not = -a.
def tri_and(a, b): return a if a < b else b
def tri_or(a, b):  return a if a > b else b
def tri_not(a):    return -a


def verify_truth_tables():
    VALS = [1, -1, 0]
    andE = {(1,1):1,(1,0):0,(1,-1):-1,(0,1):0,(0,0):0,(0,-1):-1,(-1,1):-1,(-1,0):-1,(-1,-1):-1}
    orE  = {(1,1):1,(1,0):1,(1,-1):1,(0,1):1,(0,0):0,(0,-1):0,(-1,1):1,(-1,0):0,(-1,-1):-1}
    errors = 0
    for a in VALS:
        for b in VALS:
            if tri_and(a, b) != andE[(a, b)]: errors += 1
            if tri_or(a, b)  != orE[(a, b)]:  errors += 1
    for a in VALS:
        if tri_not(a) != -a: errors += 1
    return errors


# THE common bulk-N workload — mirrors benchmark.fungi main() = runBulkTri(100000)
# EXACTLY: n elements, each 3 trit-ops (and + or + not), one call = 3n trit-ops.
def run_bulk_tri(n):
    total = 0
    for i in range(n):
        a = (i % 3) - 1
        b = ((i * 7) % 3) - 1
        total = total + tri_and(a, b) + tri_or(a, b) + tri_not(a)
        if total > 1000000:
            total -= 1000000
    return total


ELEMENTS = 100000                       # matches benchmark.fungi main()
TRIT_OPS_PER_CALL = ELEMENTS * 3        # 300000 — the canonical N

calls = 40                              # python is ~30x slower; fewer calls, same throughput unit
for i, a in enumerate(sys.argv):
    if a in ("--iterations", "--operations") and i + 1 < len(sys.argv):
        calls = int(sys.argv[i + 1])

truth_table_errors = verify_truth_tables()

for _ in range(2):
    run_bulk_tri(ELEMENTS)              # warmup
gc.collect()

t0 = time.perf_counter()
checksum = 0
for _ in range(calls):
    checksum = run_bulk_tri(ELEMENTS)
elapsed = (time.perf_counter() - t0) * 1000

total_ops = calls * TRIT_OPS_PER_CALL
print(json.dumps({
    "runtime": "python",
    "benchmark": "tri-logic-v1",
    "truthTableErrors": truth_table_errors,
    "truthTableCorrect": truth_table_errors == 0,
    "calls": calls,
    "elementsPerCall": ELEMENTS,
    "tritOpsPerCall": TRIT_OPS_PER_CALL,
    "checksum": checksum,
    "elapsedMs": round(elapsed, 3),
    "operationsPerSecond": round(total_ops / max(elapsed / 1000, 1e-9)),
    "callsPerSecond": round(calls / max(elapsed / 1000, 1e-9)),
    "notes": [
        "Common bulk-N path: runBulkTri(100000) = 300000 trit-ops/call, identical on every runtime",
    ],
}, indent=2))
