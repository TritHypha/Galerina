Title: Galerina Contract Pattern — Audit Write Policy

### When to use

Use this pattern when a flow writes data that must be redacted before it enters the audit log, and the audit system is expected to produce a runtime report of every write operation. It is appropriate for flows that persist sensitive data (passwords, tokens, health notes) where the audit trail is mandatory but must not itself become a data-leak vector. Apply it whenever `effects.audit.redact` is required alongside a `reports` declaration.

### Correct example

```galerina
flow SaveSensitiveRecord(readonly request: Request) -> SaveSensitiveRecordResult {

  contract {

    types {
      SaveSensitiveRecordResult = { recordId: String, savedAt: Timestamp, status: String }
    }

    intent = "Persist a sensitive record to storage, emitting a redacted audit event and a governance report on every write."

    request {
      requires request.body is JsonObject
      requires request.body["recordType"] is String
      requires request.body["payload"] is JsonObject
    }

    response {
      guarantees result.recordId is String
      guarantees result.status in ["saved", "rejected"]
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.roles contains "records:write"
    }

    model {
      reads []
      writes ["sensitive_records"]
    }

    effects {
      audit {
        on: always
        level: full
        redact: [request.body["payload"]["secret"], request.body["payload"]["token"]]
        includes: [request.body["recordType"], result.recordId, result.status, context.actor.id]
      }

      reports {
        runtime: true
        name: "sensitive-write-report"
        fields: [context.actor.id, request.body["recordType"], result.recordId, result.savedAt]
        on: write_success
      }
    }

    security {
      classification: confidential
      requires tls: true
    }

    on_error {
      emit: AuditEvent(
        type: "record.write.failed",
        actor: context.actor,
        recordType: request.body["recordType"],
        reason: error.message
      )
      return: { recordId: "", savedAt: now(), status: "rejected" }
    }

  }

  let record = build_record(request.body, context.actor)
  let saved = db.sensitive_records.insert(record)

  return { recordId: saved.id, savedAt: saved.timestamp, status: "saved" }

}
```

### What each contract section does

- `types` — declares `SaveSensitiveRecordResult` including `savedAt: Timestamp` for the report timestamp
- `intent` — states the dual obligation: persist the record and produce a governance report
- `request` — requires the body is a JSON object with `recordType` and `payload` present
- `response` — guarantees `recordId` is always a String and `status` is one of two known values
- `context` — requires the actor holds the `records:write` role before the flow body executes
- `model` — declares a write to `sensitive_records`; no reads (the record is built from the request)
- `effects.audit` — always-on full audit with two fields redacted from the log; safe fields are explicitly included
- `effects.reports` — enables a runtime report named `sensitive-write-report` that fires on successful writes and captures the fields needed for governance sign-off
- `security` — marks data as confidential and mandates TLS
- `on_error` — emits a structured audit event with redaction-safe fields even when the write fails

### Common mistakes

**Mistake 1 — Omitting `redact` and expecting sensitive values to be auto-excluded**
```galerina
effects {
  audit {
    on: always
    level: full
    includes: [request.body["payload"]["secret"], result.recordId]
  }
}
```
The runtime does not auto-redact. Every field listed in `includes` is written to the audit log verbatim. Sensitive values must appear explicitly in `redact` and must not appear in `includes`.

**Mistake 2 — Placing `reports` outside `effects`**
```galerina
contract {
  effects { audit { ... } }
  reports { runtime: true, name: "sensitive-write-report" }
}
```
`reports` is a sub-section of `effects`, not a top-level contract section. Placing it at the contract root causes a parse error.

**Mistake 3 — Using `on: write` instead of `on: write_success`**
```galerina
effects {
  reports {
    runtime: true
    on: write
  }
}
```
`on: write` is not a valid trigger. The valid triggers for reports are `write_success`, `write_failure`, `always`, and `never`. Using an invalid trigger silently disables report generation in some runtime versions and raises a warning in others.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| Sensitive field in `includes` without `redact` entry | `E603 — field listed in audit.includes must also appear in audit.redact if it is privacy-classified` |
| `reports` at contract root instead of inside `effects` | `E220 — unexpected section 'reports' at contract scope; expected inside effects block` |
| `on: write` invalid trigger | `W621 — unknown report trigger 'write'; valid values are write_success, write_failure, always, never` |
| `model.writes` empty when flow calls `db.*.insert` | `E310 — db write detected in flow body but model.writes is empty` |
| `redact` field not matching a field path in `includes` or body | `W622 — redact path not found in audit.includes or request.body; may be a no-op` |

### One-click fix

If `E310 — db write detected in flow body but model.writes is empty` is raised, add the table to `model.writes`:

```galerina
model {
  reads []
  writes ["sensitive_records"]
}
```
