# Galerina Storage-Aware Performance

Status: draft language, compiler, tooling and report contract.

Galerina should not claim direct support for M.2 SSDs, NVMe controllers or any
specific storage hardware. Operating systems, firmware, controllers and drivers
own physical storage access.

Galerina may be storage-aware. That means the compiler, runtime and tools can use
available storage facts to reduce wasted I/O, keep memory bounded, choose
conservative cache policy and produce reports.

## Positioning

Best claim:

```text
Galerina does not make hardware faster.

Galerina can perform better by understanding the project, storage, memory, schemas,
effects and target hardware before the program runs.
```

Galerina can gain speed through checked runtime output, strict
typed execution, streaming-first data handling and fewer runtime checks.

Galerina should not claim to be generally faster than mature optimized runtimes. Runtime maturity remains one
of the strongest raw-performance languages when written well. Galerina's opportunity
is to make safe performance defaults normal, visible and reportable.

## Hardware Boundary

Storage terms should be used carefully:

```text
M.2      = common hardware form factor
NVMe     = high-performance storage protocol
PCIe     = common transport for NVMe devices
SSD      = solid-state storage device
```

Galerina should report detected storage facts only when they are available and
reliable enough. In containers, virtual machines, cloud hosts, network volumes
or restricted environments, storage type may be unknown.

## Storage-Aware Uses

Fast storage may help with:

```text
compiler cache
IDE indexing
symbol search
large JSON processing
large project graph scanning
AI model loading
embedding databases
asset pipelines
database snapshots
logs and reports
incremental builds
```

Galerina should still treat fast storage as a performance opportunity, not a
correctness dependency.

## Conservative Cache Rule

Cache support must be conservative.

```text
Only deterministic, non-secret, rebuildable data may be cached automatically.
```

Default cache behavior should be:

```text
bounded
content-addressed where practical
invalidated by source hash, config hash, package lock hash and tool version
safe to bypass
safe to delete
never required for correctness
redacted in reports
explicit for sensitive or persistent data
```

Galerina should not cache by default:

```text
SecureString values
API keys
session tokens
payment tokens
private keys
raw unredacted request bodies
raw unredacted webhook payloads
authorization decisions
non-deterministic flow results
database query results unless an app policy explicitly declares it
external API responses unless an app policy explicitly declares it
```

If a cache cannot be used safely, Galerina should calculate the result without using
the cache, report the bypass and keep correctness unchanged.

## Storage Strategy Modes

Storage-aware planning may select conservative modes:

```text
unknown storage  -> minimal bounded cache, fewer random reads
HDD              -> small cache, sequential-friendly access
SATA SSD         -> normal bounded cache
NVMe SSD         -> larger bounded parallel index/cache if policy permits
RAM disk         -> temporary cache only, never durable assumptions
network storage  -> avoid excessive random I/O
cloud volume     -> benchmark or report unknown before tuning
container volume -> assume limited visibility unless measured
```

An automatic mode must remain reversible:

```Galerina
build cache {
  mode auto
  maxSizeGb 20
  preferFastStorage true
  fallback safe
  onLimit bypass
}
```

`fallback safe` means the build still works without the cache.

## Incremental Compilation

Galerina may use the project graph to avoid recompiling unaffected work:

```text
changed file
  -> affected modules
  -> affected generated reports
  -> affected output fragments
  -> rebuild only what changed
```

Example output:

```text
Changed files: 1
Affected modules: 4
Reused cache: 96%
Build time: 0.8s
```

The reuse percentage is a performance fact, not a correctness proof. The build
must still validate hashes, source maps, report dependencies and configuration
inputs.

## IDE Index Cache

IDE indexes should be local, bounded and rebuildable:

```text
.spore-cache/
  symbols.index
  types.index
  imports.index
  diagnostics.index
  project-graph.index
  ai-context.index
```

IDE caches must not store secrets. If an index might contain sensitive source
snippets, the IDE must either avoid the snippet, redact it or mark the cache as
local-only and safe-to-delete.

## Large JSON and File Processing

Galerina should prefer streaming for large files:

```Galerina
json stream Orders from "./orders.json" {
  memoryLimitMb 256
  batchSize 1000
  validate OrderSchema
}
```

The compiler should warn when code loads a large file or JSON payload into
memory when a streaming path is available.

## Read-Only Mapping and Copies

Galerina may support memory-mapped read-only files where the platform supports it:

```Galerina
let file = Storage.openReadOnly("./large.json")
let view = file.mapReadOnly()
let records = Json.stream(view)
```

Rules:

```text
read-only views are safe
mutation requires explicit clone()
large copies are warned or reported
hidden copies of large values should be denied or warned
```

## Reports

Galerina may generate:

```text
app.storage-report.json
app.build-cache-report.json
app.ide-index-report.json
app.hardware-report.json
```

Example storage report:

```json
{
  "storage": {
    "detected": true,
    "kind": "nvme",
    "formFactor": "m.2",
    "sequentialReadMbPerSecond": 5200,
    "sequentialWriteMbPerSecond": 4100,
    "randomReadIops": 650000,
    "recommendedCacheMode": "bounded-parallel-indexed"
  }
}
```

If the environment hides hardware details, the report should say so:

```json
{
  "storage": {
    "detected": false,
    "kind": "unknown",
    "recommendedCacheMode": "minimal-bounded"
  }
}
```

## Non-Goals

Galerina storage-aware performance should not:

```text
claim to make SSDs faster
require NVMe, M.2 or any specific hardware
depend on cache for correctness
cache secrets or raw sensitive payloads
cache non-deterministic results automatically
hide stale cache reuse
overfit to local hardware in portable builds
force one storage backend or database
```

## Final Principle

```text
Use storage facts when available.
Cache less by default.
Cache only safe, bounded, rebuildable data.
Prefer streaming for large data.
Report cache use, bypass, invalidation and unknown hardware clearly.
```
