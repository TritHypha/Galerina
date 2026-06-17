import sys
import json
import time
import gc
import tracemalloc

# binary-trees — THE allocation/GC benchmark (Computer Language Benchmarks Game).
# minDepth=4, maxDepth=10. Builds full binary trees of real Node objects, walks them
# to count nodes, and accumulates a deterministic integer checksum. One full run
# ALLOCATES EXACTLY 135854 nodes (the op unit), so the bytes/op column is the headline.
# The checksum (135854) is identical across Python, Node, Rust and the LogicN path.
MIN_DEPTH = 4
MAX_DEPTH = 10
NODES_PER_RUN = 135854  # verified: nodes allocated == checksum == 135854

sys.setrecursionlimit(10000)


class Node:
    # Real heap object with two child slots (None for a leaf) so the memory pass
    # measures genuine tree allocation.
    __slots__ = ("l", "r")

    def __init__(self, l, r):
        self.l = l
        self.r = r


def bottom_up_tree(depth):
    if depth <= 0:
        return Node(None, None)
    return Node(bottom_up_tree(depth - 1), bottom_up_tree(depth - 1))


def item_check(node):
    if node.l is None and node.r is None:
        return 1
    return 1 + item_check(node.l) + item_check(node.r)


def checksum():
    check = 0
    stretch_depth = MAX_DEPTH + 1
    check += item_check(bottom_up_tree(stretch_depth))

    long_lived_tree = bottom_up_tree(MAX_DEPTH)

    depth = MIN_DEPTH
    while depth <= MAX_DEPTH:
        iterations = 2 ** (MAX_DEPTH - depth + MIN_DEPTH)
        total = 0
        for _ in range(iterations):
            total += item_check(bottom_up_tree(depth))
        check += total
        depth += 2

    check += item_check(long_lived_tree)
    return check


def int_flag(name, fb):
    if name in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(name) + 1])
        except (ValueError, IndexError):
            return fb
    return fb


def main():
    iterations = int_flag("--iterations", int_flag("--operations", 1))

    # Correctness gate.
    sample = checksum()
    if sample != NODES_PER_RUN:
        raise SystemExit(f"binary-trees checksum failed: got {sample}, expected {NODES_PER_RUN}")

    t0 = time.perf_counter()
    cpu0 = time.process_time()
    check = 0
    for _ in range(iterations):
        check = checksum()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    cpu_ms = (time.process_time() - cpu0) * 1000.0

    # Memory-measurement pass: one full run's tree allocation (separate from timing).
    mem_iters = 1
    gc.collect()
    tracemalloc.start()
    base = tracemalloc.get_traced_memory()[0]
    for _ in range(mem_iters):
        checksum()
    cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    heap_delta = cur - base

    total_nodes = NODES_PER_RUN * iterations
    print(json.dumps({
        "runtime": "python",
        "benchmark": "binary-trees-v1",
        "iterations": iterations,
        "nodesAllocated": NODES_PER_RUN,
        "checksum": check,
        "elapsedMs": round(elapsed_ms, 3),
        "operationsPerSecond": round(total_nodes / (elapsed_ms / 1000.0)),  # nodes/sec
        "cpu": {"processMs": round(cpu_ms, 3)},
        "memory": {
            "heapUsedBytes": cur,
            "heapUsedDelta": heap_delta,
            "bytesPerOperation": round(heap_delta / NODES_PER_RUN, 2),  # surviving per node
            "peakBytesPerOperation": round(peak / NODES_PER_RUN, 2),    # live high-water per node
            "tracemallocPeak": peak,
        },
        "notes": [
            "One op = one allocated tree node (135854/run). Headline metric = bytesPerOperation.",
            "binary-trees churns: most trees are freed immediately, so heapUsedDelta (surviving) is "
            "tiny; tracemallocPeak is the live high-water mark of the largest simultaneous tree.",
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
