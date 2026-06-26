# json-parse benchmark

JSON-style **string parsing** in Galerina — the scan-heavy part of real JSON
workloads. Each record is a `key:value,key:value,...` string; the kernel splits
records on `,`, splits each field on `:`, and accumulates field counts plus
value character-lengths over N records.

## Canonical checksum

`main()` = `scanRecords(500)` = **12500** = `500 × (5 fields + 20 value-chars)`.

`split` and `length` have identical semantics in Galerina, JavaScript and Python,
so the checksum matches **bit-for-bit** across all three runtimes (asserted in
`node.mjs` / `python.py`, same as the nbody benchmark).

## What it exercises

Galerina's String stdlib **sync fast-path** (`split`, `length`) plus the safe
indexed list accessor (`.get(i)` → `Some/None`) — not the integer bytecode VM.
The Node/Python mirrors also include a native `JSON.parse` / `json.loads` row for
throughput reference; that path has no Galerina equivalent builtin.

## Scope note (deliberately parse-only)

This benchmark intentionally avoids JSON *serialization with embedded quotes*.
While building it, two Galerina String quirks surfaced and are tracked as
AI-ergonomics findings rather than worked around silently:

- A `\"` inside a string literal is emitted as `\"` (backslash kept), not `"`.
- `String.replace(" ", "")` replaced only the first occurrence, not all.

Because of these, quote-laden serialization does not yet produce valid JSON, so
the benchmark stays on the parse path (split/length), which is correct and
runtime-faithful.
