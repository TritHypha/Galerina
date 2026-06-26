# Resilient Flows And Controlled Recovery

## Summary

Galerina should support recovery and continuing, especially for data processing, but
it should be controlled recovery. It must not mean "ignore errors and carry on".

There are two different cases:

```text
system/runtime failure
  memory corruption, crash, timeout, lost database connection, GPU failure

data/item failure
  bad row, invalid JSON object, missing field, corrupt image, failed API record
```

Best rule:

```text
System failures should usually stop or restart safely.
Data failures can often be isolated, reported and skipped or held for review.
```

## Recommended Concept

Use:

```text
resilient flow
```

`resilient flow` is broader than just error handling. It means the flow declares
how partial failure is classified, recovered, retried, quarantined, checkpointed
and reported.

Example direction:

```Galerina
resilient stream flow importCustomers(input: Stream<Untrusted<JsonLine>>)
  -> ImportReport
{
  for item in input {
    recover item {
      let customer = Json.decode<Customer>(item)
      database.customers.save(customer)

      report.success(item)
    }
    error DecodeError as e {
      report.failed(item, reason: e)
      continue
    }
    error DatabaseError as e {
      report.failed(item, reason: e)
      retry max 3 backoff 1s
    }
  }

  return report.complete()
}
```

The flow continues only when the error policy says it is safe to continue.

## Good Use Cases

Resilient flows fit:

```text
CSV imports
JSONL imports
batch API processing
image processing
document indexing
search indexing
embedding generation
email sending batches
log processing
data migration
AI classification batches
security scans
large file processing
```

Example result:

```text
Import 10,000 rows.
28 rows are invalid.
9,972 rows are saved.
28 rows are written to a failure report.
The process finishes safely.
```

## Bad Use Cases

Resilient continuation is dangerous for:

```text
payments
banking
orders
security decisions
permission changes
stock/inventory updates
legal/audit records
multi-step transactions
anything requiring all-or-nothing consistency
```

For those workflows, Galerina should prefer:

```text
transaction
rollback
idempotency
hold for review
stop safely
```

## Recovery Modes

### Fail Fast

Stop on first error. This is the default for security-sensitive work.

```Galerina
flow processPayment(input: PaymentRequest)
  -> Result<PaymentResult, PaymentError>
{
  ...
}
```

### Continue On Item Error

Continue processing other records when one item fails.

```Galerina
resilient stream flow importProducts(input: Stream<JsonLine>)
  -> ImportReport
{
  on item_error continue
  on system_error stop
}
```

### Retry

Retry only errors marked as retryable.

```Galerina
retry max 3 backoff exponential {
  email.send(message)
}
```

### Quarantine / Hold For Review

Bad data is not ignored. It is captured and reported.

```Galerina
error ValidationError as e {
  quarantine.save(item, reason: e)
  continue
}
```

### Checkpoint And Resume

Useful for large jobs.

```Galerina
resilient stream flow indexDocuments(input: Stream<Document>)
  checkpoint every 100 items
{
  ...
}
```

## Recover Is Not Ignore

Galerina should never encourage:

```text
error happened
ignore it
continue silently
```

Galerina should encourage:

```text
error happened
classify it
record it
apply policy
continue only if safe
generate report
```

Rule:

```text
Recovery must be explicit, typed and reported.
```

## Batch Result Shape

Useful result direction:

```Galerina
type BatchResult<T> {
  successful: Array<T>
  failed: Array<FailedItem>
  report: ProcessingReport
}
```

Example:

```Galerina
resilient flow processBatch(items: Array<OrderImportRow>)
  -> BatchResult<ImportedOrder>
{
  recover each item in items {
    let order = decodeOrder(item)
    let saved = saveOrder(order)

    success saved
  }
  error ValidationError as e {
    fail item reason e
    continue
  }
}
```

## Example Report

```json
{
  "flow": "importCustomers",
  "total": 10000,
  "success": 9972,
  "failed": 28,
  "retried": 11,
  "quarantined": 28,
  "stopped": false,
  "failureTypes": {
    "ValidationError": 18,
    "DecodeError": 7,
    "DuplicateRecord": 3
  }
}
```

## Memory And System Failures

Bad memory, memory corruption, unsafe native failure or runtime integrity
failure should normally stop the affected flow.

Galerina should:

```text
stop the affected flow
cancel child tasks
release resources
write failure report
restart worker if supervised
resume from checkpoint only if safe
```

Memory pressure is different. Galerina can recover by:

```text
switching to streaming mode
falling back from GPU to CPU
reducing batch size
pausing input
backpressure
checkpointing and resuming
```

Example direction:

```Galerina
memory_policy {
  on pressure {
    reduce_batch_size
    use_streaming
    fallback cpu
  }

  on corruption {
    stop
    report
  }
}
```

## Package Ownership

```text
galerina-core
  resilient flow syntax direction, Result/Option, recover/retry/checkpoint syntax notes

galerina-core-runtime
  execution supervision, cancellation, retry scheduling, checkpoint/resume hooks

galerina-core-reports
  processing report, batch result report and failure summaries

galerina-core-security
  policy checks for whether recovery is allowed

galerina-framework-app-kernel
  API/job idempotency, transactions, replay protection and safe runtime boundaries

galerina-core-tasks
  safe automation reports for task-level partial failures
```

## Final Recommendation

```text
Continue on bad data only when the flow declares it safe.
Stop on unsafe system failures.
Never ignore errors silently.
Always report partial success and failed items.
```

Best design:

```text
fail fast for security-critical flows
resilient flow for batch/data flows
retry for temporary failures
quarantine for bad records
checkpoint for long jobs
rollback for transactions
reports for everything
```
