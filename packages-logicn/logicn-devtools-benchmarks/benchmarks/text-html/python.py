import json, sys, time, re, html as html_mod, gc, tracemalloc

SAMPLE_HTML = "<div class=\"container\"><p>Hello, <b>World</b>!</p><script>alert('test')</script></div>"
SAMPLE_OBJ  = {"status": "ok", "user": {"id": 1234, "email": "user@example.com"}, "data": [{"id": i, "value": i * 1.5} for i in range(20)]}
SAMPLE_STR  = json.dumps(SAMPLE_OBJ)
WORDS       = "The quick brown fox jumps over the lazy dog and then ran away very fast indeed"
RE_WORDS    = re.compile(r'\b\w{4,}\b')

def bench(name, fn, iterations):
    for _ in range(20): fn()
    t0 = time.perf_counter()
    for _ in range(iterations): fn()
    elapsed = (time.perf_counter() - t0) * 1000
    return {"name": name, "iterations": iterations,
            "elapsedMs": round(elapsed, 3),
            "operationsPerSecond": round(iterations / max(elapsed/1000, 1e-9), 0),
            "nsPerOp": round(elapsed * 1e6 / max(iterations, 1), 1)}

its = 20000
for i, a in enumerate(sys.argv):
    if a in ("--iterations","--operations") and i+1<len(sys.argv): its=int(sys.argv[i+1])

results = {
    "htmlEscape":   bench("html.escape", lambda: html_mod.escape(SAMPLE_HTML), its),
    "jsonParse":    bench("json.loads",  lambda: json.loads(SAMPLE_STR), its),
    "jsonDumps":    bench("json.dumps",  lambda: json.dumps(SAMPLE_OBJ), its),
    "stringSplit":  bench("split+join",  lambda: "-".join(WORDS.split()), its),
    "regexMatch":   bench("re.findall",  lambda: RE_WORDS.findall(WORDS), its),
}

# Memory measurement pass (separate from throughput timing).
# Primary/dominant op = htmlEscape (html.escape), the namesake text-html operation.
_mem_iters = min(its, 50000)
gc.collect()
tracemalloc.start()
_base = tracemalloc.get_traced_memory()[0]
for _ in range(_mem_iters):
    html_mod.escape(SAMPLE_HTML)
_cur, _peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
_heap_delta = _cur - _base

print(json.dumps({
    "runtime": "python", "benchmark": "text-html-v1",
    "results": results,
    "memory": {
        "heapUsedBytes": _cur,
        "heapUsedDelta": _heap_delta,
        "bytesPerOperation": round(_heap_delta / _mem_iters, 2),
        "tracemallocPeak": _peak,
    },
    "notes": ["Python html.escape + json built-ins (C extension)"],
}, indent=2))
