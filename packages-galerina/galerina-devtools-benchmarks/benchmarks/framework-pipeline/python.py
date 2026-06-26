import sys
import json
import time
import gc
import tracemalloc

# framework-pipeline — Python "middleware chain" baseline.
# An equivalent SYNC gate chain doing the SAME gates as Galerina's App Kernel
# (route → body-size → content-type → auth → JSON decode → idempotency →
# concurrency → dispatch → encode → audit) on the SAME synthetic request.
#
# This is a hand-rolled stdlib chain — a REAL middleware framework (FastAPI/Flask
# + validation/auth/rate-limit packages) would be SLOWER, so this is a conservative
# (generous-to-Python) baseline, not a rigged one. One op = one successful request.

MAX_SIZE = 256 * 1024
CONTENT_TYPE = "application/json"
MAX_CONCURRENT = 10
ROUTES = {("POST", "/orders"): "createOrder"}


def create_order(jsn):
    return {"status": 200, "body": {"ok": True, "id": (jsn or {}).get("id", 0)}}


DISPATCH = {"createOrder": create_order}


def hget(headers, name):
    t = name.lower()
    for k, v in headers.items():
        if k.lower() == t:
            return v
    return None


def base_ct(v):
    i = v.find(";")
    return (v if i == -1 else v[:i]).strip().lower()


class State:
    seen = set()
    in_flight = 0
    audit = 0


def middleware_chain(req):
    # 1 route
    handler = ROUTES.get((req["method"], req["path"]))
    if handler is None:
        State.audit += 1
        return {"status": 404}
    body = req["body"]
    # 2 body size
    if len(body) > MAX_SIZE:
        State.audit += 1
        return {"status": 413}
    # 3 content-type
    if len(body) > 0:
        ct = hget(req["headers"], "content-type")
        if ct is None or base_ct(ct) != CONTENT_TYPE:
            State.audit += 1
            return {"status": 415}
    # 4 auth
    if hget(req["headers"], "authorization") is None:
        State.audit += 1
        return {"status": 401}
    # 5 decode JSON
    jsn = None
    if len(body) > 0:
        try:
            jsn = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            State.audit += 1
            return {"status": 422}
    # 6 idempotency
    key = hget(req["headers"], "idempotency-key")
    if key is not None:
        ck = f'{req["method"]} {req["path"]} {key}'
        if ck in State.seen:
            State.audit += 1
            return {"status": 409}
        State.seen.add(ck)
    # 7 concurrency
    if State.in_flight >= MAX_CONCURRENT:
        State.audit += 1
        return {"status": 429}
    # 8 dispatch + 9 encode
    State.in_flight += 1
    try:
        r = DISPATCH[handler](jsn)
        res = {"status": r["status"], "body": json.dumps(r["body"]).encode("utf-8")}
    finally:
        State.in_flight -= 1
    # 10 audit
    State.audit += 1
    return res


BODY = json.dumps({"id": 1, "item": "widget", "qty": 3}).encode("utf-8")


def fresh_req():
    return {"method": "POST", "path": "/orders",
            "headers": {"authorization": "Bearer t", "content-type": "application/json"},
            "body": BODY, "query": {}}


def int_flag(name, fb):
    if name in sys.argv:
        try:
            return int(sys.argv[sys.argv.index(name) + 1])
        except (ValueError, IndexError):
            return fb
    return fb


def main():
    iterations = int_flag("--iterations", int_flag("--operations", 200000))

    probe = middleware_chain(fresh_req())
    if probe["status"] != 200:
        sys.stderr.write(f'framework-pipeline probe failed: status {probe["status"]}\n')
        sys.exit(1)

    for _ in range(2000):
        middleware_chain(fresh_req())

    t0 = time.perf_counter()
    ok = 0
    for _ in range(iterations):
        if middleware_chain(fresh_req())["status"] == 200:
            ok += 1
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # ── memory pass (separate from the timed loop) ──
    mem_iters = min(iterations, 50000)
    gc.collect()
    tracemalloc.start()
    base = tracemalloc.get_traced_memory()[0]
    for _ in range(mem_iters):
        middleware_chain(fresh_req())
    cur, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    heap_delta = cur - base

    print(json.dumps({
        "runtime": "python",
        "benchmark": "framework-pipeline-v1",
        "iterations": iterations,
        "handledOk": ok,
        "elapsedMs": round(elapsed_ms, 3),
        "operationsPerSecond": round(iterations / (elapsed_ms / 1000.0)),
        "memory": {
            "heapUsedBytes": cur,
            "heapUsedDelta": heap_delta,
            "bytesPerOperation": round(heap_delta / mem_iters, 2),  # retained heap per request
            "tracemallocPeak": peak,
        },
        "notes": ["Hand-rolled stdlib middleware chain (same gates); a real framework would be slower"],
    }, indent=2))


if __name__ == "__main__":
    main()
