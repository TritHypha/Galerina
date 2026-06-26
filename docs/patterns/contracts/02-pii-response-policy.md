Title: Galerina Contract Pattern — PII Response Policy

### When to use

Use this pattern when a flow returns data that contains personally identifiable information and the response must be filtered before it reaches the caller. It is required any time fields such as email, date of birth, national ID, or address appear in a response and the caller may not be authorised to see them in full. Apply it whenever `privacy.pii` is set to `true` and the response contract uses `denies`.

### Correct example

```galerina
flow GetUserProfile(readonly request: Request) -> GetUserProfileResult {

  contract {

    types {
      GetUserProfileResult = {
        userId: String,
        displayName: String,
        email: String?,
        dateOfBirth: String?,
        accountTier: String
      }
    }

    intent = "Return a user profile, masking all PII fields unless the caller holds an explicit data:pii grant."

    request {
      requires request.params["userId"] is String
    }

    response {
      guarantees result.userId is String
      guarantees result.displayName is String
      guarantees result.accountTier is String
      denies result.email unless context.actor.grants contains "data:pii"
      denies result.dateOfBirth unless context.actor.grants contains "data:pii"
    }

    context {
      requires context.actor is AuthenticatedUser
    }

    model {
      reads ["users"]
      writes []
    }

    privacy {
      pii: true
      fields: [email, dateOfBirth]
      mask_default: true
    }

    effects {
      audit {
        on: always
        level: partial
        includes: [request.params["userId"], context.actor.id, context.actor.grants]
        excludes: [result.email, result.dateOfBirth]
      }
    }

    security {
      classification: restricted
      requires tls: true
    }

    on_error {
      emit: AuditEvent(type: "profile.fetch.failed", actor: context.actor)
      return: { userId: "", displayName: "", accountTier: "", email: null, dateOfBirth: null }
    }

  }

  let profile = db.users.find_by_id(request.params["userId"])

  if profile is null {
    return { userId: "", displayName: "Unknown", accountTier: "none", email: null, dateOfBirth: null }
  }

  return {
    userId: profile.id,
    displayName: profile.displayName,
    accountTier: profile.tier,
    email: profile.email,
    dateOfBirth: profile.dateOfBirth
  }

}
```

### What each contract section does

- `types` — defines `GetUserProfileResult` with `email` and `dateOfBirth` as optional (`?`) since they may be withheld
- `intent` — documents the privacy-first purpose so governance tooling can categorise this flow correctly
- `request` — requires `userId` param is present and is a String
- `response.guarantees` — asserts non-PII fields are always present and typed
- `response.denies` — blocks `email` and `dateOfBirth` from leaving the flow unless the actor holds `data:pii`
- `context` — requires an authenticated user; the grants check in `denies` uses `context.actor.grants`
- `model` — reads from the `users` table, writes nothing
- `privacy` — marks the flow as PII-containing, lists the sensitive fields, and sets masking on by default
- `effects.audit` — audits always at partial level, explicitly excluding PII fields from the audit record itself
- `security` — classifies data as restricted and mandates TLS

### Common mistakes

**Mistake 1 — Using `response.hides` instead of `response.denies`**
```galerina
response {
  hides result.email unless context.actor.grants contains "data:pii"
}
```
`hides` is not a valid keyword. The correct keyword is `denies`. The compiler will reject `hides` with a syntax error.

**Mistake 2 — Declaring PII fields as non-optional in `types`**
```galerina
types {
  GetUserProfileResult = { userId: String, email: String, dateOfBirth: String }
}
```
When `response.denies` can withhold a field, that field must be typed as optional (`String?`). A non-optional field that may be absent causes a type mismatch at the call site.

**Mistake 3 — Including PII fields in the audit `includes` list**
```galerina
effects {
  audit {
    includes: [result.email, result.dateOfBirth]
  }
}
```
Including PII fields in audit records defeats the privacy contract. The audit block must use `excludes` for all fields listed in `privacy.fields`.

### Expected diagnostics (if incorrect)

| Mistake | Diagnostic |
|---|---|
| `hides` used instead of `denies` | `E130 — unknown response directive 'hides'; did you mean 'denies'?` |
| Non-optional PII field when `denies` applies | `E115 — field 'email' must be typed optional (String?) when response.denies may suppress it` |
| PII field present in audit `includes` | `E602 — privacy.fields member 'email' must not appear in audit.includes` |
| `privacy` block absent when `response.denies` is used | `W610 — response.denies detected but no privacy block declared` |
| `mask_default` omitted | `W611 — pii: true set but mask_default not declared; defaulting to false` |

### One-click fix

If `E115 — field 'email' must be typed optional` is raised, change the `types` declaration:

```galerina
types {
  GetUserProfileResult = {
    userId: String,
    displayName: String,
    email: String?,
    dateOfBirth: String?,
    accountTier: String
  }
}
```
