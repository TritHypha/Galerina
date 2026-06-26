# Galerina — Common Fixes

The 10 most common AI-generated Galerina mistakes and their corrections.

---

## Fix 1: Using `req` instead of `request`

**Wrong:**
```galerina
secure flow getUser(readonly req: Request) -> GetUserResult {
  unsafe let rawId: String = req.params.id
}
```

**Why wrong:** `req` is an abbreviation. Galerina uses full, intention-revealing names.

**Correct:**
```galerina
secure flow getUser(readonly request: Request) -> GetUserResult {
  unsafe let rawId: String = request.params.id
}
```

**Diagnostic if wrong:** None — will work, but violates naming convention (SPORE-NAME-003 may fire in future).

---

## Fix 2: `with effects [...]` instead of `contract.effects`

**Wrong:**
```galerina
secure flow createUser(readonly request: Request) -> CreateUserResult
with effects [database.write, audit.write] {
  ...
}
```

**Why wrong:** Old syntax. New canonical style uses `contract.effects`.

**Correct:**
```galerina
secure flow createUser(readonly request: Request) -> CreateUserResult
contract {
  effects {
    database.write
    audit.write
  }
}
{ ... }
```

---

## Fix 3: Inline `Result<T,E>` in signature instead of named alias

**Wrong:**
```galerina
secure flow getUser(readonly request: Request) -> Result<Response, ApiError>
```

**Why wrong:** For flows with contracts, the return type should be a named alias in `contract.types`.

**Correct:**
```galerina
secure flow getUser(readonly request: Request) -> GetUserResult
contract {
  types {
    type GetUserResult = Result<Response, ApiError>
  }
  ...
}
```

---

## Fix 4: Missing `event X` declaration before `emit X`

**Wrong:**
```galerina
flow createOrder(...) -> OrderResult {
  emit OrderCreated   // no global event declaration!
  ...
}
```

**Correct:**
```galerina
event OrderCreated   // ← declare globally first

flow createOrder(...) -> OrderResult {
  emit OrderCreated   // ← now valid
  ...
}
```

**Diagnostic:** SPORE-EVENT-001 (EventNotDeclared)

---

## Fix 5: `protected Email` returned directly in response

**Wrong:**
```galerina
return Ok(Response.okJson({
  email: patient.email   // email is protected — not allowed in response
}))
```

**Correct:**
```galerina
// Either: redact it
return Ok(Response.okJson({
  email: redact(patient.email)
}))

// Or: don't include it (if contract.response.denies { email })
return Ok(Response.okJson({
  patientId: patient.id,
  name: patient.name
}))
```

**Diagnostic:** SPORE-GOV-003 (ProtectedDataInResponse)

---

## Fix 6: `unsafe let` directly to a governed sink

**Wrong:**
```galerina
unsafe let rawEmail: String = request.body.email
UsersDB.insert({ email: rawEmail })   // unsafe at governed sink!
```

**Correct:**
```galerina
unsafe let rawEmail: String = request.body.email
let email: protected Email = validate.email(rawEmail)?
UsersDB.insert({ email: email })
```

**Diagnostic:** SPORE-VALUESTATE-003 (UnsafeValueReachedGovernedSink)

---

## Fix 7: `AuditLog.write` with protected value instead of redacted

**Wrong:**
```galerina
AuditLog.write({
  event: "PatientRead",
  email: patient.email   // protected Email, not redacted!
})
```

**Correct:**
```galerina
AuditLog.write({
  event: "PatientRead",
  email: redact(patient.email)   // redacted Email — safe for audit
})
```

**Diagnostic:** SPORE-VALUESTATE-003 or SPORE-VALUESTATE-006

---

## Fix 8: Contract sections in wrong order

**Wrong:**
```galerina
contract {
  audit {}     // audit before intent — wrong order
  intent {}
  types {}
}
```

**Correct canonical order:**
```galerina
contract {
  types {}        // 1st
  intent {}       // 2nd
  request {}      // 3rd
  response {}     // 4th
  context {}      // 5th
  model {}        // 6th
  effects {}      // 7th
  timeouts {}     // 8th
  retries {}      // 9th
  limits {}       // 10th
  privacy {}      // 11th
  errors {}       // 12th
  rules {}        // 13th
  observability {} // 14th
  events {}       // 15th
  audit {}        // 16th — always last
}
```

---

## Fix 9: `let` binding outside a flow at top level

**Wrong:**
```galerina
let apiKey: SecureString = Secret.env("API_KEY")   // top-level let!

flow callApi(...) {
  ...
}
```

**Correct:**
```galerina
// Pass as parameter or read inside the flow
secure flow callApi(readonly request: Request) -> ApiResult {
  let apiKey: SecureString = Secret.env("API_KEY")
  ...
}
```

**Diagnostic:** SPORE-SYNTAX-006 (LET_AT_TOP_LEVEL)

---

## Fix 10: `result of X else Y` readable type form

**Wrong:**
```galerina
type GetPatientResult =
  result of Response else ApiError   // proposal only, not in parser
```

**Correct:**
```galerina
type GetPatientResult =
  Result<Response, ApiError>
```

See `DO_NOT_USE_YET.md` — readable type forms are documented as future proposals only.
