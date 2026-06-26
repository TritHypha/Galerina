# Galerina Contract — timeouts {}, retries {}, and limits {} Sections

## Status

```
Phase 10B — Specification
Parser: Phase 10B
Enforcement: SPORE-TIMEOUT-001, SPORE-RETRY-001, SPORE-LIMIT-001 (Phase 10C+)
```

## TL;DR

- `timeouts {}` prevents runaway execution and resource exhaustion
- `retries {}` makes retry policy explicit and governance-visible instead of hidden in flow bodies
- `limits {}` protects system resources by declaring maximum allowed sizes

---

## Section: timeouts {}

### Purpose

Declare maximum execution time for the flow and its sub-operations. Prevents runaway execution, resource exhaustion, infinite waits, and hung network or database calls. Without a `timeouts` declaration, a flow has no contract-level bound on how long it may run.

### Basic deadline

```galerina
timeouts {
  deadline 5 seconds
}
```

### With per-operation timeouts

```galerina
timeouts {
  deadline 30 seconds

  network {
    timeout 5 seconds
  }

  database {
    timeout 2 seconds
  }
}
```

### With cancellation on deadline

```galerina
timeouts {
  deadline 10 seconds
  cancel on deadline
}
```

`cancel on deadline` instructs the runtime to cancel all in-flight sub-operations when the flow deadline is reached, rather than allowing them to continue after the response is returned.

### Rules

- `deadline unlimited` is not valid in Galerina — unbounded execution must be justified by a policy declaration
- All per-operation timeouts must be less than or equal to the flow `deadline`
- `network.timeout` and `database.timeout` are sub-bounds within the overall deadline, not additions to it

---

## Section: retries {}

### Purpose

Make retry policy explicit. Prevents copy-paste retry loops in flow bodies, inconsistent policies across flows, and hidden network retries that are invisible to the governance verifier. A `retries` declaration in the contract is the single authoritative statement of how this flow handles transient failures.

### Basic network retry

```galerina
retries {
  network.outbound {
    attempts 3
  }
}
```

### With strategy and database retries

```galerina
retries {
  network.outbound {
    attempts 5
    strategy exponential_backoff
  }

  database.read {
    attempts 2
  }
}
```

### Retry strategies

| Strategy | Meaning |
|---|---|
| `exponential_backoff` | Each attempt waits longer than the previous (2x by default) |
| `linear_backoff` | Each attempt waits a fixed additional interval |
| `immediate` | Retry immediately with no delay |

### Rules

- `database.write { attempts unlimited }` is invalid — can produce duplicate writes
- Write operations should have `attempts 1` unless idempotency is proven and declared
- `network.outbound { attempts unlimited }` is invalid — retry counts must be finite
- The total time across all retry attempts must not exceed the flow `deadline`

---

## Section: limits {}

### Purpose

Protect system resources by declaring maximum allowed sizes. Prevents memory exhaustion, large request attacks, unexpected batch growth, and resource abuse. Without `limits`, a flow has no contract-level bound on the size of inputs it will accept.

### Common limits

```galerina
limits {
  max request size 5 MB
  max batch size 100
  max memory 256 MB
  max prompt size 10000 characters
}
```

### Available limit declarations

| Declaration | Meaning |
|---|---|
| `max request size N MB/KB` | Maximum accepted request body size |
| `max batch size N` | Maximum number of items in a batch operation |
| `max memory N MB/GB` | Maximum memory this flow may allocate |
| `max prompt size N characters` | Maximum AI prompt length (prevents prompt injection amplification) |
| `max response size N MB/KB` | Maximum response body size |
| `max concurrent N` | Maximum concurrent sub-operations |

### Rules

- `max batch size unlimited` is not valid
- `max request size unlimited` is not valid
- AI flows should declare `max prompt size` to prevent prompt injection attacks via oversized inputs
- All `max *` values must be finite positive integers with a valid unit

---

## How They Connect

These three sections express operational constraints that the runtime enforces. Together with `context { require deadline }`, they form a complete bounded execution contract:

```galerina
context {
  require deadline
}

timeouts {
  deadline 10 seconds
  cancel on deadline

  network {
    timeout 3 seconds
  }

  database {
    timeout 2 seconds
  }
}

retries {
  network.outbound {
    attempts 3
    strategy exponential_backoff
  }
}

limits {
  max request size 1 MB
  max batch size 50
}
```

`context { require deadline }` asserts that a deadline must be provided by the caller. `timeouts {}` declares what the flow enforces internally. `retries {}` constrains how transient failures are handled. `limits {}` bounds the inputs the flow will accept. Together they eliminate the four main classes of unbounded execution risk.

---

## Full Example: boundedImport flow

```galerina
secure flow boundedImport(readonly request: Request)
-> BoundedImportResult

contract {

  types {
    type BoundedImportResult = Result<ImportResult, ApiError>
  }

  intent {
    "Import a batch of patient records with bounded execution and explicit retry policy."
  }

  context {
    require actor
    require trace_id
    require deadline
  }

  effects {
    database.write
    audit.write
    network.outbound
  }

  timeouts {
    deadline 30 seconds
    cancel on deadline

    network {
      timeout 5 seconds
    }

    database {
      timeout 3 seconds
    }
  }

  retries {
    network.outbound {
      attempts 3
      strategy exponential_backoff
    }

    database.read {
      attempts 2
    }
  }

  limits {
    max request size 10 MB
    max batch size 100
    max memory 512 MB
  }

  audit {
    require proof
    require audit.write
  }

}
{
  let batch = request.body.records

  for record in batch {
    let result = PatientsDB.upsert(record)?
    AuditLog.write({ event: "PatientImported", id: result.id, actor: context.actor })
  }

  return Ok(ImportResult { count: batch.length })
}
```

---

## Rules at a Glance

- `deadline unlimited` is not valid
- `max * unlimited` is not valid
- Write operation retries require explicit idempotency justification
- AI flows should declare `max prompt size`
- All per-operation timeouts must be less than or equal to the flow `deadline`
- Retry counts must be finite
- `cancel on deadline` is recommended for flows with external sub-operations

---

## See Also

- `docs/Knowledge-Bases/galerina-contract-full-model.md` — full contract section reference
- `docs/Knowledge-Bases/galerina-contract-errors.md` — errors {} section
- `docs/Knowledge-Bases/galerina-governed-memory-blocks.md` — memory governance
- `docs/Knowledge-Bases/galerina-contract-privacy-observability.md` — privacy and observability sections
