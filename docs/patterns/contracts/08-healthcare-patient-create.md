Title: Galerina Contract Pattern — Healthcare Patient Create (Full NHS Pattern)

### When to use

Use this pattern when a flow creates a new patient record in a healthcare context and must satisfy all NHS information governance requirements. It is the reference implementation for flows that combine PII, clinical data, role-based access, multi-table writes, event emission, audit redaction, rate limiting, and compliance reporting in a single contract. Apply it as the starting point whenever a flow operates under NHS DSP Toolkit obligations or equivalent healthcare data regulations.

### Correct example

```galerina
event PatientCreated {
  patientId: String
  nhsNumber: String?
  createdBy: String
  createdAt: Timestamp
  ward: String?
}

event PatientCreateRejected {
  reason: String
  attemptedBy: String
  attemptedAt: Timestamp
}

flow CreatePatientRecord(readonly request: Request) -> CreatePatientRecordResult {

  contract {

    types {
      Demographics = {
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        nhsNumber: String?,
        address: String?,
        email: String?
      }
      ClinicalContext = {
        ward: String?,
        admissionType: String,
        referringGp: String?
      }
      CreatePatientRecordResult = {
        patientId: String,
        status: String,
        nhsNumber: String?,
        createdAt: Timestamp
      }
    }

    intent = "Create a new NHS patient record with full PII protection, clinical context capture, role-gated access, and mandatory governance audit."

    request {
      requires request.body is JsonObject
      requires request.body["demographics"] is Demographics
      requires request.body["demographics"]["firstName"] is String
      requires request.body["demographics"]["lastName"] is String
      requires request.body["demographics"]["dateOfBirth"] is String
      requires request.body["clinical"] is ClinicalContext
      requires request.body["clinical"]["admissionType"] in ["emergency", "elective", "day_case", "outpatient"]
    }

    response {
      guarantees result.patientId is String
      guarantees result.status in ["created", "rejected"]
      guarantees result.createdAt is Timestamp
      denies result.nhsNumber unless context.actor.grants contains "patient:nhs_number:read"
    }

    context {
      requires context.actor is AuthenticatedUser
      requires context.actor.roles contains "clinical:staff"
      requires context.actor.grants contains "patient:create"
      requires context.organisation.type == "nhs_trust"
    }

    model {
      reads ["staff_directory", "ward_registry"]
      writes ["patients", "clinical_admissions", "audit_trail"]
    }

    privacy {
      pii: true
      fields: [
        request.body["demographics"]["firstName"],
        request.body["demographics"]["lastName"],
        request.body["demographics"]["dateOfBirth"],
        request.body["demographics"]["nhsNumber"],
        request.body["demographics"]["address"],
        request.body["demographics"]["email"]
      ]
      mask_default: true
      retention_policy: "nhs_records_7yr"
    }

    ai {
      intent: local_only
      remote: deny
      model_source: local_registry
    }

    financial {
      currency: GBP
      precision: bigint
      cross_currency: deny
    }

    events {
      emits: [PatientCreated, PatientCreateRejected]
      on_success: PatientCreated
      on_failure: PatientCreateRejected
    }

    effects {
      audit {
        on: always
        level: full
        redact: [
          request.body["demographics"]["firstName"],
          request.body["demographics"]["lastName"],
          request.body["demographics"]["dateOfBirth"],
          request.body["demographics"]["nhsNumber"],
          request.body["demographics"]["address"],
          request.body["demographics"]["email"]
        ]
        includes: [
          result.patientId,
          result.status,
          context.actor.id,
          context.actor.roles,
          request.body["clinical"]["admissionType"],
          request.body["clinical"]["ward"]
        ]
      }

      reports {
        runtime: true
        name: "patient-create-governance-report"
        fields: [
          result.patientId,
          result.status,
          context.actor.id,
          context.organisation.id,
          result.createdAt
        ]
        on: write_success
        compliance: ["nhs_dsp_toolkit", "uk_gdpr"]
      }
    }

    security {
      classification: restricted
      requires tls: true
      network_egress: local_only
      data_residency: "uk"
    }

    rate_limit {
      per_actor: 10
      window: "1m"
      on_exceed: reject
    }

    compliance {
      frameworks: ["nhs_dsp_toolkit", "uk_gdpr", "caldicott"]
      data_controller: "nhs_trust"
      lawful_basis: "vital_interests"
      requires_consent: false
      review_cycle: "annual"
    }

    idempotency {
      key: request.body["demographics"]["nhsNumber"]
      window: "24h"
      on_duplicate: return_existing
    }

    versioning {
      schema_version: "2.1"
      min_compatible: "2.0"
    }

    deprecation {
      status: active
      sunset: null
    }

    on_error {
      emit: PatientCreateRejected(
        reason: error.message,
        attemptedBy: context.actor.id,
        attemptedAt: now()
      )
      emit: AuditEvent(
        type: "patient.create.failed",
        actor: context.actor.id,
        org: context.organisation.id,
        reason: error.message
      )
      return: { patientId: "", status: "rejected", nhsNumber: null, createdAt: now() }
    }

  }

  let staff = db.staff_directory.find_by_id(context.actor.id)

  if staff is null {
    emit PatientCreateRejected(reason: "staff record not found", attemptedBy: context.actor.id, attemptedAt: now())
    return { patientId: "", status: "rejected", nhsNumber: null, createdAt: now() }
  }

  let ward = request.body["clinical"]["ward"] is String
    ? db.ward_registry.find_by_name(request.body["clinical"]["ward"])
    : null

  let patient = db.patients.insert({
    firstName: request.body["demographics"]["firstName"],
    lastName: request.body["demographics"]["lastName"],
    dateOfBirth: request.body["demographics"]["dateOfBirth"],
    nhsNumber: request.body["demographics"]["nhsNumber"],
    address: request.body["demographics"]["address"],
    email: request.body["demographics"]["email"],
    createdBy: context.actor.id,
    createdAt: now()
  })

  db.clinical_admissions.insert({
    patientId: patient.id,
    admissionType: request.body["clinical"]["admissionType"],
    ward: ward?.name,
    referringGp: request.body["clinical"]["referringGp"],
    admittedAt: now()
  })

  emit PatientCreated(
    patientId: patient.id,
    nhsNumber: patient.nhsNumber,
    createdBy: context.actor.id,
    createdAt: patient.createdAt,
    ward: ward?.name
  )

  return {
    patientId: patient.id,
    status: "created",
    nhsNumber: patient.nhsNumber,
    createdAt: patient.createdAt
  }

}
```

### What each contract section does

- Global `event` declarations — `PatientCreated` and `PatientCreateRejected` are module-scoped so other flows (ward management, audit subscribers) can consume them
- `types` — three composite types: `Demographics` (all PII fields, optionals for non-mandatory items), `ClinicalContext`, and `CreatePatientRecordResult`
- `intent` — enumerates every governance obligation: PII protection, clinical context, role gating, mandatory audit
- `request` — guards on both nested objects and a constrained `admissionType` enum; nested field access uses bracket notation
- `response` — four guarantees covering result shape, plus a `denies` on `nhsNumber` that requires an explicit PII read grant
- `context` — four requirements: authenticated user, `clinical:staff` role, `patient:create` grant, and organisation type must be an NHS trust
- `model` — reads two reference tables; writes to three tables including a dedicated audit trail table
- `privacy` — all six demographic fields are listed in `privacy.fields` with a 7-year NHS retention policy applied
- `ai` — local-only inference policy ensures no patient data reaches external AI endpoints
- `financial` — declares GBP precision even though no payment is processed; required because the patient journey may produce billing records elsewhere and the contract signals currency capability
- `events` — both events declared with `on_success` and `on_failure` mappings
- `effects.audit` — full audit with all six PII fields redacted; safe clinical and identity fields are explicitly included
- `effects.reports` — governance report fires on write success, names two compliance frameworks in `compliance` field, captures the minimal set of fields needed for DSP Toolkit sign-off
- `security` — restricted classification, TLS required, network egress limited to local, data residency pinned to UK
- `rate_limit` — 10 patient creations per actor per minute to prevent bulk-import abuse
- `compliance` — names three frameworks, declares the data controller, lawful basis under UK GDPR, no consent required (vital interests), and annual review cycle
- `idempotency` — uses NHS number as the idempotency key with a 24-hour window; returns the existing record if a duplicate is detected within that window
- `versioning` — schema version `2.1` with minimum compatible `2.0` for rolling upgrades
- `deprecation` — explicitly marks the flow as active with no sunset date
- `on_error` — emits both `PatientCreateRejected` and a structured `AuditEvent`; returns a safe empty result

### Common mistakes

**Mistake 1 — Omitting the `compliance` block for an NHS flow**
```galerina
contract {
  security { classification: restricted }
  privacy { pii: true }
}
```
Without the `compliance` block, the governance runtime cannot generate DSP Toolkit or GDPR evidence. All healthcare flows must declare the applicable frameworks, lawful basis, and data controller.

**Mistake 2 — Including PII fields in `audit.includes` rather than `audit.redact`**
```galerina
effects {
  audit {
    includes: [request.body["demographics"]["nhsNumber"]]
  }
}
```
NHS number and all other `privacy.fields` must appear in `audit.redact`, not `audit.includes`. Writing them to the audit log creates a secondary PII store that requires its own data protection assessment.

**Mistake 3 — Omitting `idempotency` and allowing duplicate NHS numbers**
```galerina
contract {
  model { writes ["patients"] }
  // no idempotency block
}
```
Without `idempotency`, concurrent or retried requests can create duplicate patient records for the same NHS number. This is a patient-safety issue in clinical systems and a DSP Toolkit violation. The `idempotency.key` must be set to the NHS number and `on_duplicate: return_existing` must be declared.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `compliance` block absent for `classification: restricted` healthcare flow | `E920 — restricted-classified flow with privacy.pii: true requires compliance block` |
| PII field in `audit.includes` without corresponding `audit.redact` entry | `E603 — privacy field 'nhsNumber' found in audit.includes; must be in audit.redact` |
| `idempotency` absent when `model.writes` includes `patients` | `W930 — patient table write without idempotency block; duplicate records possible` |
| `context.organisation.type` checked in body but not in context contract | `E305 — organisation field 'type' used in flow body but not declared in context contract` |
| `data_residency` absent for `classification: restricted` flow | `W502 — restricted-classified flow missing data_residency declaration` |
| `on_success` event not declared in `events.emits` | `E811 — events.on_success 'PatientCreated' must be listed in events.emits` |
| `versioning` absent when `schema_version` is referenced in manifest | `W840 — flow referenced by versioned manifest but no versioning block declared` |

### One-click fix

If `E920 — restricted-classified flow with privacy.pii: true requires compliance block` is raised, add the compliance block inside `contract { }`:

```galerina
compliance {
  frameworks: ["nhs_dsp_toolkit", "uk_gdpr", "caldicott"]
  data_controller: "nhs_trust"
  lawful_basis: "vital_interests"
  requires_consent: false
  review_cycle: "annual"
}
```
