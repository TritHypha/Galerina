# Governed Streams

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

A **Galerina governed stream** is a typed, permission-controlled, budgeted, and auditable flow of data over time.

```text
Streams are data over time.
Galerina governs every part of that time.
```

## Purpose

Streams allow Galerina to process large or continuous data without loading everything into memory.

Use cases:

```text
large files
logs
video feeds
IoT/sensor data
AI token output
database exports
real-time hardware data
HTTP uploads
message queues
```

## Where Streams Sit in Governance

```text
Intake Guard
 -> Stream Contract
 -> Permission Check
 -> Execution Coordination Scheduler
 -> Flow Processing
 -> Response Gate
 -> Audit
```

Streams pass through the same governance as normal requests.

## Stream Declaration

```galerina
stream UsbFileStream {
  source: Runtime.Hardware.USB
  item: FileChunk
  max_chunk: 64kb
  max_total: 100mb
  timeout: 30s
}
```

## Flow Using a Stream

```galerina
flow scanUsbFiles(
  stream: UsbFileStream
) -> Result<Scan.response, ScanError>
  permission use usb_scan
{
  for chunk in stream bounded 1600 {
    scan.check(chunk)
  }

  return Ok(Scan.response {
    status: "complete"
  })
}
```

## Permission

```galerina
permission usb_scan {
  code {
    allow hardware.usb.read
    allow file.stream
  }

  audit required event "usb.scan"
}
```

## Stream Rules

```text
1. Streams must be typed.
2. Streams must have limits (chunk size, total size, timeout).
3. Streams must declare their source.
4. Streams must be permissioned.
5. Streams must be auditable.
6. Streams must support cancellation.
7. Streams must apply backpressure.
8. Streams must not bypass the Response Gate.
```

## Runtime Responsibilities

The runtime manages:

```text
chunk size enforcement
timeout enforcement
memory budget
backpressure signalling
cancellation handling
ordering guarantees
partial failure handling
audit events per chunk/completion
```

## Security Rule

```text
Streaming does not mean trusted.
```

A stream still requires: input validation, size limits, permission checks, view rules, and audit.
