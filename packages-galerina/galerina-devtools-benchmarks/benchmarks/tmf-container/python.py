import sys
import json
import time
import gc
import hashlib
import struct
import tracemalloc

# tmf-container — Python reference implementation of the .tmf v0 trust-container.
# Byte-identical to @galerina/ext-tmf (Python stdlib `hashlib.shake_256` IS the spec's
# reference oracle), so it asserts the SAME golden root and does identical work.
# Spec: TMX-256 = 3-ary SHAKE256 Merkle over coord-bound leaves; container = LE packing.

GOLDEN_ROOT = "43386e644c7b53aa0900cda21c15acd15f30b3fdf997950e39e7dd3dbc685212"
H = 32
ARITY = 3


def shake256(msg, out_len=H):
    return hashlib.shake_256(msg).digest(out_len)


def le16(x):
    return struct.pack("<H", x & 0xFFFF)


def le32(x):
    return struct.pack("<I", x & 0xFFFFFFFF)


def le64(x):
    return struct.pack("<Q", x)


def lp(b):
    return le32(len(b)) + b


TAG_ABSENT = b"TMX-ABSENT-v0"
TAG_LEAF = b"TMX-LEAF-v0"
TAG_NODE = b"TMX-NODE-v0"
TAG_ROOT = b"TMX-ROOT-v0"
ABSENT = shake256(lp(TAG_ABSENT))
MAGIC = bytes([0x89, 0x54, 0x4D, 0x46, 0x0D, 0x0A, 0x1A, 0x0A])


def leaf_hash(kind, modality, coord, payload):
    return shake256(lp(TAG_LEAF) + le16(kind) + le16(modality) + lp(coord) + lp(payload))


def node_hash(c0, c1, c2):
    return shake256(lp(TAG_NODE) + c0 + c1 + c2)


def top_node(leaves):
    level = list(leaves)
    while True:
        nxt = []
        for i in range(0, len(level), ARITY):
            c0 = level[i]
            c1 = level[i + 1] if i + 1 < len(level) else ABSENT
            c2 = level[i + 2] if i + 2 < len(level) else ABSENT
            nxt.append(node_hash(c0, c1, c2))
        level = nxt
        if len(level) <= 1:
            return level[0]


def header_core(profile, flags, count):
    return MAGIC + le16(0) + le16(0) + le16(profile) + le16(flags) + le64(count)


def tmx_root(hc, leaves):
    return shake256(lp(TAG_ROOT) + lp(hc) + top_node(leaves))


def write_tmf(sections):
    leaves, entries, region = [], [], []
    blob_off = 0
    for s in sections:
        leaf = leaf_hash(s["kind"], s["modality"], s["coord"], s["payload"])
        leaves.append(leaf)
        blob_len = len(s["coord"]) + len(s["payload"])
        entries.append(le16(s["kind"]) + le16(s["modality"]) + le32(len(s["coord"])) +
                       le64(blob_off) + le64(blob_len) + leaf)
        region.append(s["coord"]); region.append(s["payload"])
        blob_off += blob_len
    hc = header_core(0, 0, len(sections))
    root = tmx_root(hc, leaves)
    return hc + root + b"".join(entries) + b"".join(region)


def i32le3(a, b, c):
    return struct.pack("<iii", a, b, c)


SECTIONS = [
    {"kind": 1, "modality": 0, "coord": i32le3(3, 5, 7), "payload": b"hello"},
    {"kind": 1, "modality": 2, "coord": i32le3(3, 5, 8), "payload": b"world!"},
]


def int_flag(name, fb):
    if name in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(name) + 1])
        except (ValueError, IndexError):
            return fb
    return fb


def main():
    iterations = int_flag("--iterations", int_flag("--operations", 100000))

    sample = write_tmf(SECTIONS)
    root = sample[24:56].hex()
    if len(sample) != 203 or root != GOLDEN_ROOT:
        sys.stderr.write(f"tmf-container correctness check failed: len={len(sample)} root={root}\n")
        sys.exit(1)

    for _ in range(1000):
        write_tmf(SECTIONS)

    t0 = time.perf_counter()
    acc = 0
    for _ in range(iterations):
        acc += len(write_tmf(SECTIONS))
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # ── memory pass (separate from the timed loop so tracemalloc never skews throughput) ──
    mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    base = tracemalloc.get_traced_memory()[0]
    for _ in range(mem_iters):
        write_tmf(SECTIONS)
    cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    heap_delta = cur - base

    print(json.dumps({
        "runtime": "python",
        "benchmark": "tmf-container-v1",
        "iterations": iterations,
        "containerBytes": len(sample),
        "integrityRoot": root,
        "checksum": acc,
        "elapsedMs": round(elapsed_ms, 3),
        "operationsPerSecond": round(iterations / (elapsed_ms / 1000.0)),
        "memory": {
            "heapUsedBytes": cur,
            "heapUsedDelta": heap_delta,
            "bytesPerOperation": round(heap_delta / mem_iters, 2),  # retained heap per container
            "tracemallocPeak": peak,
        },
        "notes": ["Python reference impl (hashlib.shake_256) — byte-identical to the Galerina engine"],
    }, indent=2))


if __name__ == "__main__":
    main()
