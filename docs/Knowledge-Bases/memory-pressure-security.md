# Memory Pressure Security

## Purpose

Galerina should treat low memory as a security event, not only as a crash or
performance problem.

Attackers can deliberately exhaust memory through large inputs, deep nesting,
concurrency, parser bombs, expensive queries, regular expressions, uploaded
files and oversized AI contexts. A secure runtime must detect pressure early,
bound work, shed load safely and preserve security/audit paths.

## Core Rule

```text
Memory must be budgeted, checked, bounded, and fail-safe.
```

Memory handling is part of the Galerina security model because uncontrolled
allocation can become denial of service, audit loss, transaction corruption or
secret exposure.

## Memory Budgets

Every app, package, task, request and worker should have explicit memory
budgets.

Conceptual policy shape:

```galerina
memory {
  max_app_memory 512mb
  max_request_memory 16mb
  max_json_body 1mb
  max_stream_buffer 256kb
  max_ai_context 64kb
}
```

These limits prevent one request, upload, JSON body, AI job, parser worker,
database result or background task from consuming the whole process.

This syntax is conceptual until formal Galerina memory policy syntax is defined.

## Fallible Allocation

Galerina should not assume allocation always succeeds.

Unsafe model:

```galerina
let data = allocateHugeBuffer(size)
```

Preferred model:

```galerina
let data = tryAllocate<Buffer>(size)
  -> Result<Buffer, MemoryError>
```

Possible memory errors:

```text
OutOfMemory
MemoryLimitExceeded
AllocationDenied
FragmentationRisk
BufferTooLarge
```

Allocation failure must be a typed recoverable result where possible, not an
unreported crash path.

## Backpressure Before Out Of Memory

The runtime should react before true out-of-memory.

Pressure states:

```text
normal       accept requests
warning      reduce concurrency
critical     reject new risky requests
emergency    cancel non-essential work
```

Possible HTTP behaviour:

```text
503 Service Unavailable
Retry-After: 10
```

Backpressure must happen before the process becomes unstable. The runtime
should prefer controlled refusal over partial execution, corrupted state or
missing audit records.

## Streaming By Default

Galerina should avoid loading whole data sets into memory.

Prefer:

```text
stream JSON
stream files
page database results
chunk AI context
bound queues
limit recursion
limit parser depth
```

Avoid:

```text
readAll()
loadEntireFile()
unbounded arrays
unbounded recursion
unbounded queues
SELECT * with no limit
unlimited JSON depth
unlimited regex processing
```

Streaming and paging should be normal runtime behaviour for uploads, API
bodies, database reads, file processing, AI context construction and report
generation.

## Request And Worker Isolation

Each request should have an independent memory budget.

Security goals:

```text
request A cannot starve request B
one upload cannot kill the server
one user cannot exhaust the runtime
one AI job cannot consume all context memory
one parser worker cannot destabilise the main runtime
```

Worker isolation is especially important for untrusted files, base64 assets,
AI processing and reference enrichment. Parser and AI workers should fail
within their own memory budgets.

## Priority-Based Load Shedding

When memory pressure rises, Galerina should preserve critical work and cancel
lower-priority work first.

Work priority classes:

```text
critical security/auth
audit and cleanup
normal user request
background job
analytics
AI summarisation
cache rebuild
```

Load-shedding order:

```text
cancel AI/cache/background work first
refuse new risky work
reduce concurrency
preserve auth/security/audit paths
complete cleanup paths
```

Security and audit work must remain available as long as possible.

## Safe Cleanup

Galerina needs deterministic cleanup when memory pressure occurs.

Conceptual cleanup pattern:

```galerina
using file = openFile(path) {
  process(file)
}
```

Cleanup requirements:

```text
close files
release buffers
rollback transactions
flush audit logs
release parser workers
cancel timers
zero sensitive memory where possible
```

Cleanup must run even when allocation fails, a task is cancelled or emergency
load shedding begins.

## OOM Attack Classes

Galerina should explicitly model memory exhaustion as an attack class.

Common inputs:

```text
huge JSON bodies
deep JSON/XML nesting
large file uploads
many concurrent requests
expensive regex
large AI prompts
unbounded database queries
zip bombs
image bombs
base64 decode amplification
parser expansion
recursive archives
```

These are not merely operational risks. They are denial-of-service and
boundary-bypass risks if the runtime cannot refuse safely.

## Reports

Galerina should emit secret-safe, machine-readable reports:

```text
memory-pressure-report.json
allocation-denied-report.json
request-memory-report.json
oom-near-miss-report.json
cleanup-report.json
```

Reports should include:

```text
pressure state
budget exceeded
request or worker identity
input class
allocation size requested
action taken
cancelled work
retry guidance
cleanup status
redaction status
```

Reports must redact secrets, private payloads, raw credentials, authorization
headers, tokens and sensitive personal data.

## Relationship To Other Concepts

Memory pressure security supports:

```text
malicious data and exploit resistance
untrusted file and asset processing
bit width and base64 asset policy
generative runtime mapper memory heat maps
AI worker sandboxing
```

Relevant Knowledge Base concepts:

- [Malicious Data And Exploit Resistance](malicious-data-and-exploit-resistance.md)
- [Untrusted File And Asset Processing](untrusted-file-asset-processing.md)
- [Bit Width And Base64 Asset Policy](bit-width-and-base64-asset-policy.md)
- [Generative Runtime Mapper](generative-runtime-mapper.md)
- [AI As Untrusted Reasoning Worker](ai-as-untrusted-reasoning-worker.md)

## Final Principle

```text
Galerina should not wait for out-of-memory.

It should detect memory pressure early,
shed load safely,
cancel low-priority work,
clean up deterministically,
and return typed recoverable errors where possible.
```
