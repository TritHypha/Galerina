# Galerina Naming Conventions

```
Status: Accepted Style Direction
Applies to: flow parameters, local bindings, type aliases, contract sections
```

## TL;DR

- Use full intention-revealing names in public flow signatures (`request` not `req`)
- Local bindings should communicate trust state (`rawPatientId` not `id`)
- Type aliases for result types follow the pattern `FlowNameResult`
- **Readable names are part of Galerina's security model**

---

## Flow Parameters — Full Parameter Names

Flow signatures are public contracts. Parameter names appear in audit logs, proof chains, error messages, and AI-generated code. Abbreviations produce abbreviated security.

**Use:**

```galerina
secure flow createPatient(readonly request: Request) -> CreatePatientResult
secure flow respondToTicket(readonly response: Response) -> RespondResult
secure flow processOrder(context: Context) -> ProcessOrderResult
secure flow approveDataSharing(actor: Actor) -> ApproveSharingResult
secure flow traceRequest(traceId: TraceId) -> TraceResult
```

**Avoid:**

| Abbreviation | Use instead |
|---|---|
| `req` | `request` |
| `res` | `response` |
| `ctx` | `context` |
| `usr` | `actor` |
| `db` | use the typed repository name (e.g. `PatientsDB`) |
| `r` | any descriptive name |

**Reason:** AI tools learn from examples. Consistent full names produce consistent generated code. When `req` appears in training examples, generated code uses `req`. When `request` appears, generated code uses `request`. Readable names are part of Galerina's security model because they make intent legible at review time.

---

## Local Binding Names — Trust State Communication

Local binding names communicate whether a value has crossed a validation gate. This is not just style — it is how reviewers and AI tools know whether a value is safe to use.

**Use these naming patterns:**

| Name | Meaning |
|---|---|
| `rawPatientId` | prefix `raw` = unsafe, boundary-origin, not yet validated |
| `rawEmail` | from HTTP body, params, or headers — not validated |
| `rawNhsNumber` | from external input — treat as untrusted |
| `patientId` | no prefix = validated and trusted |
| `email` | has passed a `validate.email()` gate |
| `count`, `total`, `result` | descriptive operation names for internal values |

**Avoid:**

| Avoid | Problem |
|---|---|
| `id` | Ambiguous — is it validated? Which entity? |
| `data` | Tells nothing about type, trust, or origin |
| `val` | No information content |
| `temp` | Suggests throwaway code |
| `x`, `y` | Single-letter names in public signatures |
| `thing` | Explicitly non-descriptive |

**Example progression showing trust state:**

```galerina
unsafe let rawPatientId: String = request.params.patientId   // boundary origin
let patientId: protected PatientId = validate.patientId(rawPatientId)?  // validated
let patient = PatientsDB.find(patientId)?               // trusted domain value
```

The `raw` prefix is a visual gate. A reviewer scanning a flow body can immediately see which values have not yet been validated. This is load-bearing readability.

---

## Type Aliases — Named Result Types

Each flow should declare a named result type alias following the `FlowNameResult` pattern. This makes return types self-documenting and allows contracts to reference them by name.

**Pattern:** `FlowName` (PascalCase) → `FlowNameResult`

```galerina
// Flow: getPatient → result type: GetPatientResult
type GetPatientResult = Result<Response, ApiError>

// Flow: createOrder → result type: CreateOrderResult
type CreateOrderResult = Result<Response, ApiError>

// Flow: scoreCredit → result type: ScoreCreditResult
type ScoreCreditResult = Result<CreditScore, CreditError>
```

These aliases are declared in the flow's `contract { types { ... } }` block:

```galerina
secure flow createPatient(readonly request: Request) -> CreatePatientResult

contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
}
```

---

## Contract Section Names — Use the Full Name

Contract section names follow the same rule as flow parameters: full names only.

| Contract section | Use | Avoid |
|---|---|---|
| HTTP input parameter | `request` | `req` |
| HTTP output parameter | `response` | `res` |
| Execution context | `context` | `ctx` |
| Authenticated principal | `actor` | `usr`, `user` |
| Trace identifier | `traceId` | `tid`, `trace` |

---

## Counter-examples

The following table shows incorrect patterns and their correct replacements:

| Incorrect | Correct | Reason |
|---|---|---|
| `secure flow createUser(req: Request)` | `secure flow createUser(readonly request: Request)` | Full name; `readonly` makes immutability explicit |
| `secure flow handle(res: Response)` | `secure flow handle(readonly response: Response)` | Full name |
| `unsafe let id: String = request.body.id` | `unsafe let rawId: String = request.body.id` | `raw` prefix signals boundary origin |
| `let data = request.body` | `unsafe let rawBody: Bytes = request.body` | Explicit type and `raw` prefix |
| `type T = Result<Response, ApiError>` | `type CreatePatientResult = Result<Response, ApiError>` | Flow-scoped name |
| `let x = PatientsDB.find(patientId)?` | `let patient = PatientsDB.find(patientId)?` | Descriptive binding name |

---

## Rules at a Glance

- Use `readonly request: Request` not `readonly req: Request`
- Use `readonly response: Response` not `readonly res: Response`
- Prefix unsafe boundary values with `raw` (e.g. `rawEmail`, `rawPatientId`, `rawNhsNumber`)
- Use `FlowNameResult` for flow result type aliases
- No single-letter identifiers in public flow signatures
- No framework abbreviations (`req`, `res`, `ctx`) anywhere in Galerina source

---

## See Also

- [galerina-flow-contracts](galerina-flow-contracts.md) — contract block structure and sections
- [galerina-contract-full-model](galerina-contract-full-model.md) — all 16 contract sections
- [value-state-annotations](value-state-annotations.md) — `unsafe`/`safe` trust state prefixes
