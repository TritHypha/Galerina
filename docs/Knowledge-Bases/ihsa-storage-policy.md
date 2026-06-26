# Galerina — IHSA Governed Storage Policy

## Status

```
Future runtime feature (post-v1 implementation)
Design spec for the storage access governance system
```

This document defines the IHSA (Infrequent Hard Storage Access) model for
Galerina. It specifies how disk access is declared, bounded, audited, and
prevented by default in favour of memory-resident and streaming execution.

---

## 1. Core Philosophy

```text
memory first
    ↓
cache only what is safe / useful
    ↓
avoid disk by default
    ↓
allow rare disk access only through IHSA
    ↓
audit every disk touch
```

Disk access is an **effect** in Galerina, not a free operation. Memory pressure
is a **runtime policy**, not an implicit spill behaviour. Streaming is the
**default** for large data reads. Spill-to-disk is **denied** unless
explicitly declared.

---

## 2. What IHSA Means

```text
IHSA = Infrequent Hard Storage Access
```

A flow that declares IHSA is designed to run mostly from memory. Disk reads
are allowed only when:

- Declared in the `intent` block (`requires [storage.read.infrequent]`)
- Governed by a `governance` policy block
- Accessed through a streaming API (`openStream()`, `pagedRead()`)
- Audited on every read

Unbounded disk loads (`readAll()`, `readFile()`) are blocked at compile time.

---

## 3. Effect Name

```text
storage.read.infrequent
```

Other related effects:

| Effect | Meaning |
|---|---|
| `storage.read.infrequent` | Rare, bounded, streaming disk reads |
| `storage.write.unbounded` | Unlimited disk writes — denied under IHSA |
| `filesystem.scan` | Directory enumeration — denied under IHSA |
| `filesystem.write` | Arbitrary file writes — denied under IHSA |
| `memory.stream` | Streaming read from memory-mapped or buffered source |

---

## 4. Intent Block

```galerina
intent ProcessLargeDataset {
  purpose "Process a large dataset without loading everything into memory"

  requires [
    storage.read.infrequent
  ]

  denies [
    storage.write.unbounded,
    filesystem.scan,
    filesystem.write
  ]
}
```

---

## 5. Governance Policy Block

```galerina
governance LargeDatasetGovernance {
  effects [
    storage.read.infrequent,
    memory.stream,
    audit.write
  ]

  resources [
    DatasetStore,
    MemoryArena,
    AuditLog
  ]

  policy {
    hard_storage_access IHSA
    max_open_files      1
    read_mode           streaming
    preload             false
    cache_policy        bounded_lru
    memory_soft_limit   512mb
    memory_hard_limit   768mb
  }
}
```

---

## 6. Flow Example

```galerina
secure flow processDataset(path: FilePath safe validated)
  -> Result<DatasetSummary, DatasetError>
effects [storage.read.infrequent, memory.stream, audit.write] {

  // Does NOT load the whole file — returns a streaming handle
  let stream: StorageStream<DataRow> = DatasetStore.openStream(path)

  mut count: Int     = 0
  mut total: Decimal = 0.0

  for row: DataRow in stream {
    count = count + 1
    total = total + row.value
  }

  AuditLog.write({
    event: "IHSAStorageRead",
    mode:  "streaming",
    file:  path
  })

  return Ok(DatasetSummary {
    rows:  count,
    total: total
  })
}
```

---

## 7. What the Compiler Prevents

### Unbounded load

```galerina
// Under IHSA policy — this is illegal:
let allRows: List<DataRow> = DatasetStore.readAll(path)
```

```text
SPORE-STORAGE-001:
Unbounded hard storage load denied.

Reason:
  Flow uses IHSA policy.
  Use openStream() or pagedRead() instead.
```

### Missing effect declaration

A flow that calls `openStream()` without declaring `storage.read.infrequent`
in its `effects [ ]` clause receives `SPORE-EFFECT-001: UndeclaredEffect`.

### Ungoverned path input

The `path` parameter above is typed `FilePath safe validated`. An
`unsafe unvalidated` path reaching a storage call would be caught by
`SPORE-VALUESTATE-003: UnsafeValueReachedGovernedSink`.

---

## 8. Diagnostic Code

| Code | Name | Trigger |
|---|---|---|
| `SPORE-STORAGE-001` | `UnboundedStorageLoad` | `readAll()` or equivalent under IHSA policy |

---

## 9. Memory Pressure Policy

Declared in the runtime block (future syntax):

```galerina
runtime {
  memory {
    soft_limit 512mb
    hard_limit 768mb

    on_pressure [
      "free_finished_values",
      "evict_safe_cache",
      "bypass_cache",
      "backpressure",
      "reject_new_work"
    ]

    spill {
      enabled false
    }
  }
}
```

**`spill.enabled false`** is the default under IHSA. The runtime will not
silently spill memory to disk. If memory limits are exceeded, backpressure
and work rejection are applied first. Spill must be declared explicitly:

```galerina
spill {
  enabled true
  target  "/tmp/galerina-spill"
  effect  storage.write.spill
}
```

---

## 10. The Five Rules

```text
1. Disk access is an effect.
2. Memory pressure is a runtime policy.
3. Streaming is the default for large data.
4. Spill-to-disk is denied unless declared.
5. IHSA means: rare, bounded, audited disk reads.
```

---

## 11. Audit Proof Format

```yaml
auditProof:
  flow: processDataset
  storagePolicy: IHSA

  storageAccess:
    - kind:   streaming
      effect: storage.read.infrequent
      target: DatasetStore
      path:   "<validated FilePath>"

  memoryPolicy:
    soft_limit: 512mb
    hard_limit: 768mb
    spill:      disabled

  governanceViolations: none
```

---

## 12. Relationship to Other Systems

| System | Relationship |
|---|---|
| Effect system | `storage.read.infrequent` is an effect that must be declared |
| Governance verifier | `intent` + `governance` blocks define the storage policy |
| Value-state checker | Path inputs must be `safe validated` before reaching storage calls |
| Compute chain | IHSA reads inside `compute target cpu { }` stages must still declare the effect |
| `@state(persisted)` | Persisted runtime state (Layer C) has its own serialisation rules — distinct from IHSA |

---

## 13. v1 Scope

IHSA is a **future runtime enforcement** feature. In v1:

- Parse `storage.read.infrequent` as a valid effect name
- Validate it in `effects [ ]` clauses
- Recognise `DatasetStore.readAll()` shape in governance policy docs
- Full enforcement (blocking `readAll`, memory pressure, spill control) is
  post-v1 runtime work
