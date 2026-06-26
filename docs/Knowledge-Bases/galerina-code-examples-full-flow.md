# Galerina — Full Flow Code Examples

Intent, governance, safe/unsafe value states, and the complete governance model
shown in practical code.

These examples use current v0.1 flow syntax together with `intent`,
`governance`, and `audit` shown as proposed semantic blocks — the full design
direction, not just the current Node.js prototype subset.

---

## Syntax Used in These Examples

### Current v0.1 Flow Prefixes

```text
flow           — normal flow
secure flow    — security-sensitive logic (credentials, access control, payments)
pure flow      — deterministic, zero-effects computation
```

These are the only active flow prefixes in the v0.1 grammar. `safe flow`,
`unsafe flow`, and `guard flow` are not valid current syntax.

### Value-State Annotations

`safe` and `unsafe` annotate **values**, not flows:

```galerina
let rawEmail: String unsafe unvalidated = form.email
let email: Email safe validated = validate.email(rawEmail)?
```

A value that crosses a host, platform, or external boundary is marked
`unsafe unvalidated`. Validation converts it to `safe validated`.

### Mutation and Immutable Bindings

```galerina
mut count: Int = 0       // mutable — declare with mut
let name: String = "x"   // immutable — declare with let (default)
```

Use `mut`, not `let mut`.

### Proposed Semantic Blocks

`intent { }` and `governance { }` are standalone declarations. The
`audit { }` block is a post-v1 proposed annotation. All three appear in these
examples to show the full design direction.

---

## 1. API Response — Read Order Status

Receives an API request, reads an order from the database, and returns a
governed response with structured audit evidence.

```galerina
intent GetOrderStatus {
  purpose "Return the current status of a customer order"

  requires [
    orders.read
  ]

  denies [
    database.write,
    payment.charge,
    filesystem.write,
    process.spawn,
    network.unlisted
  ]

  produces [
    OrderStatusReturned
  ]
}

governance GetOrderStatusGovernance {
  effects [
    database.read,
    audit.write
  ]

  capabilities [
    orders.read
  ]

  resources [
    OrdersDB,
    AuditLog
  ]

  denies [
    database.write,
    filesystem.write,
    process.spawn
  ]
}

api OrdersApi {
  GET "/orders/{orderId}/status" {
    request GetOrderStatusRequest
    response ApiResponse<OrderStatusResponse>
    errors [OrderError, ApiError]
    timeout 5s
    max_body_size 64kb
    handler getOrderStatus
  }
}

secure flow getOrderStatus(request: GetOrderStatusRequest) -> Result<ApiResponse<OrderStatusResponse>, ApiError>
effects [database.read, audit.write] {
  let orderId: OrderId = request.orderId

  let order: Order = OrdersDB.findById(orderId)?

  let response: OrderStatusResponse = OrderStatusResponse {
    orderId:   order.id,
    status:    order.status,
    updatedAt: order.updatedAt
  }

  AuditLog.write({
    event:   "OrderStatusReturned",
    orderId: order.id
  })

  return Ok(ApiResponse.ok(response))
}
```

**Example API response:**

```json
{
  "ok": true,
  "data": {
    "orderId": "ord_123",
    "status": "processing",
    "updatedAt": "2026-05-28T10:15:00Z"
  },
  "audit": {
    "intent": "GetOrderStatus",
    "capabilitiesVerified": ["orders.read"],
    "effectsExecuted": ["database.read", "audit.write"],
    "deniedEffectsTriggered": []
  }
}
```

---

## 2. Desktop User — Host Platform Boundary

Reads the current signed-in OS user. The host API call returns an
`unsafe unvalidated` value — it must be validated before being used as a
typed application value. A separate wrapper exposes only the permitted fields.

```galerina
intent GetDesktopUser {
  purpose "Read the current signed-in desktop user"

  requires [
    desktop.user.read
  ]

  denies [
    network.external,
    database.write,
    filesystem.write,
    process.spawn
  ]

  produces [
    DesktopUserLoaded
  ]
}

governance DesktopUserGovernance {
  effects [
    desktop.user.read,
    audit.write
  ]

  capabilities [
    desktop.user.read
  ]

  resources [
    DesktopSession,
    AuditLog
  ]

  denies [
    network.external,
    process.spawn,
    filesystem.write
  ]
}

// Use secure flow because reading desktop identity is security-sensitive.
// The unsafe part is the value returned from the host boundary — not the flow itself.
secure flow readDesktopUserFromHost() -> Result<DesktopUser, DesktopUserError>
effects [desktop.user.read] {
  // Host.currentUser() crosses a platform boundary.
  // Mark the result as unsafe/untrusted until it is normalised.
  let rawUser: HostUser unsafe unvalidated = Host.currentUser()?

  // Validation converts the unsafe host value into a safe application value.
  let user: DesktopUser safe validated = validate.desktopUser(rawUser)?

  return Ok(user)
}

// Safe wrapper — most application code calls this, not the lower-level flow directly.
// Only safe fields are exposed; homeDirectory is intentionally omitted.
secure flow getDesktopUser() -> Result<DesktopUserView, DesktopUserError>
effects [desktop.user.read, audit.write] {
  let user: DesktopUser = readDesktopUserFromHost()?

  let view: DesktopUserView = DesktopUserView {
    id:          user.id,
    displayName: user.displayName
    // homeDirectory intentionally omitted
  }

  AuditLog.write({
    event:  "DesktopUserLoaded",
    userId: user.id
  })

  return Ok(view)
}
```

---

## 3. Form Submission — Unsafe Input Sanitization

Receives a form submission from an external API. Raw string inputs are marked
`unsafe unvalidated` at the boundary. A pure sanitizer converts them to
`safe validated` values before any database operation.

```galerina
intent SaveContactForm {
  purpose "Validate and store a submitted contact form"

  requires [
    forms.create,
    database.write
  ]

  denies [
    payment.charge,
    process.spawn,
    filesystem.write,
    network.unlisted
  ]

  produces [
    ContactFormSaved
  ]
}

type ContactFormRequest {
  name:    String
  email:   String
  message: String
}

type SanitizedContactForm {
  name:    String
  email:   Email
  message: String
}

governance SaveContactFormGovernance {
  effects [
    database.write,
    audit.write
  ]

  capabilities [
    forms.create,
    database.write
  ]

  resources [
    ContactFormsDB,
    AuditLog
  ]

  denies [
    payment.charge,
    filesystem.write,
    process.spawn
  ]
}

api FormsApi {
  POST "/forms/contact" {
    request  ContactFormRequest
    response ApiResponse<FormSavedResponse>
    errors   [ValidationError, DatabaseError]
    timeout  5s
    max_body_size 1mb
    handler  saveContactForm
  }
}

// Pure sanitizer — zero effects. Compiler enforces this.
pure flow sanitizeContactForm(input: ContactFormRequest) -> Result<SanitizedContactForm, ValidationError> {
  // API input is treated as unsafe/unvalidated at the boundary.
  let rawName:    String unsafe unvalidated = input.name
  let rawEmail:   String unsafe unvalidated = input.email
  let rawMessage: String unsafe unvalidated = input.message

  // Validation converts unsafe unvalidated values into safe validated values.
  let name:    String safe validated = sanitize.text(rawName)?
  let email:   Email  safe validated = validate.email(rawEmail)?
  let message: String safe validated = sanitize.text(rawMessage)?

  return Ok(SanitizedContactForm {
    name:    name,
    email:   email,
    message: message
  })
}

secure flow saveContactForm(request: ContactFormRequest) -> Result<ApiResponse<FormSavedResponse>, ApiError>
effects [database.write, audit.write] {
  let form: SanitizedContactForm = sanitizeContactForm(request)?

  // Mutable local state — use mut, not let mut.
  mut status: FormStatus = FormStatus.PendingReview

  if form.email.domain == "trusted.example" {
    status = FormStatus.AutoApproved
  }

  let saved: ContactForm = ContactFormsDB.insert({
    name:    form.name,
    email:   form.email,
    message: form.message,
    status:  status
  })?

  AuditLog.write({
    event:  "ContactFormSaved",
    formId: saved.id
  })

  return Ok(ApiResponse.created(FormSavedResponse {
    formId: saved.id,
    status: status
  }))
}
```

---

## 4. Pure Calculation — Zero Effects

A pure, deterministic invoice calculation. No effects, no capabilities, no
database or network access. Can be compile-time evaluated when called with
literal arguments.

```galerina
intent CalculateInvoiceTotal {
  purpose "Calculate invoice total from subtotal, tax, and discount"

  requires []

  denies [
    database.read,
    database.write,
    network.external,
    filesystem.write,
    secret.read,
    process.spawn
  ]

  produces [
    InvoiceTotalCalculated
  ]
}

pure flow calculateInvoiceTotal(
  subtotal: Money<GBP>,
  taxRate:  Decimal,
  discount: Money<GBP>
) -> Money<GBP> {
  let tax:   Money<GBP> = subtotal * taxRate
  let total: Money<GBP> = subtotal + tax - discount

  return Money.round(total)
}
```

Usage:

```galerina
let total = calculateInvoiceTotal(
  subtotal: Money.gbp(100.00),
  taxRate:  0.20,
  discount: Money.gbp(10.00)
)
// total = £110.00
```

---

## 5. Guard-Style Authorization — Decision Flow

Authorization logic returns a typed `Decision`. `guard flow` is not current
v0.1 syntax — model guard logic as a `secure flow` returning a typed decision.

```galerina
intent AuthorizeRefund {
  purpose "Decide whether a user may refund a payment"

  requires [
    auth.check,
    payment.refund
  ]

  denies [
    database.write,
    network.unlisted,
    process.spawn
  ]

  produces [
    RefundAuthorizationDecision
  ]
}

enum AuthDecision {
  Allow
  Deny
  Review
}

secure flow authorizeRefund(user: User, refund: RefundRequest) -> Result<AuthDecision, AuthError>
effects [database.read, audit.write] {
  let role: UserRole = UsersDB.getRole(user.id)?

  match role {
    Admin        => return Ok(Allow)
    SupportAgent => return Ok(Review)
    Customer     => return Ok(Deny)
  }
}
```

A future grammar extension could add `guard flow` as first-class syntax. For
now, `secure flow` returning `Result<Decision, E>` is the correct pattern.

---

## 6. Webhook Signature — Constant-Time Secret Comparison

Verifies a webhook signature using HMAC-SHA256. The provided signature is
`unsafe unvalidated` at the boundary. The `==` operator on secure values is
rejected by the compiler — `constantTimeEquals` is required.

```galerina
intent VerifyWebhookSignature {
  purpose "Verify webhook signature without leaking secret timing information"

  requires [
    secret.read,
    webhook.verify
  ]

  denies [
    filesystem.write,
    process.spawn,
    network.external
  ]

  produces [
    WebhookSignatureVerified
  ]
}

governance WebhookGovernance {
  effects [
    secret.read,
    audit.write
  ]

  capabilities [
    webhook.verify
  ]

  resources [
    SecretVault,
    AuditLog
  ]

  denies [
    filesystem.write,
    process.spawn,
    network.external
  ]
}

secure flow verifyWebhookSignature(
  payload:           Bytes,
  providedSignature: Bytes unsafe unvalidated
) -> Result<VerifiedWebhook, WebhookError>
effects [secret.read, audit.write] {
  let signingSecret: SecureString = env.secret("WEBHOOK_SIGNING_SECRET")

  let expectedSignature: SecureBytes = crypto.hmacSha256(
    key:  signingSecret,
    data: payload
  )

  // Do not use:
  //   expectedSignature == providedSignature
  // Correct: explicit constant-time comparison.
  let valid: Bool = expectedSignature.constantTimeEquals(providedSignature)

  if !valid {
    return Err(WebhookError.InvalidSignature)
  }

  let verified: VerifiedWebhook safe validated = VerifiedWebhook(payload)

  AuditLog.write({ event: "WebhookSignatureVerified" })

  return Ok(verified)
}
```

---

## 7. Negative Guarantee — Filesystem Write Blocked by Intent

A report-view flow whose intent explicitly denies `filesystem.write`. Any
attempt to write a file is rejected at compile time with `SPORE-INTENT-001`.

```galerina
intent ViewReportOnly {
  purpose "Generate a report for viewing only"

  requires [
    report.read
  ]

  denies [
    filesystem.write,
    network.external,
    process.spawn
  ]

  produces [
    ReportViewed
  ]
}

governance ViewReportGovernance {
  effects [
    database.read
  ]

  capabilities [
    report.read
  ]

  resources [
    ReportsDB
  ]

  denies [
    filesystem.write,
    network.external,
    process.spawn
  ]
}

secure flow viewReport(reportId: ReportId) -> Result<ReportView, ReportError>
effects [database.read] {
  let report: Report = ReportsDB.findById(reportId)?

  // REJECTED at compile time:
  //   FileSystem.write("/tmp/report.csv", report.csv)
  //   → SPORE-INTENT-001: filesystem.write denied by ViewReportOnly

  return Ok(ReportView(report))
}
```

---

## 8. Local AI Inference — Governed Compute Target

Fraud scoring using a local model. The intent explicitly denies
`remote.execution` — this becomes a negative guarantee enforced at runtime and
confirmed in the audit proof.

```galerina
intent LocalFraudScoring {
  purpose "Calculate fraud risk score locally without remote inference"

  requires [ai.inference, fraud.score]

  // Negative guarantee: cloud inference is not permitted.
  denies [
    remote.execution,
    network.external,
    filesystem.write,
    process.spawn
  ]

  produces [FraudScoreCalculated]
}

governance LocalFraudGovernance {
  effects [
    ai.inference,
    npu.compute,
    audit.write
  ]

  capabilities [
    fraud.score,
    compute.npu
  ]

  resources [
    LocalFraudModel,
    AuditLog
  ]

  denies [
    remote.execution,
    network.external,
    process.spawn
  ]
}

secure flow scoreFraud(transaction: Transaction) -> Result<FraudScore, FraudError>
effects [ai.inference, npu.compute, audit.write] {
  compute target best {
    prefer [npu, gpu, cpu]

    // Remote fallback is intentionally absent.
    // The deny matches the intent's negative guarantee.
    deny [remote.execution]

    let score: FraudScore = LocalFraudModel.run(transaction)
  }

  AuditLog.write({ event: "FraudScoreCalculated" })

  return Ok(score)
}
```

**Audit evidence:**

```yaml
audit:
  intent:          LocalFraudScoring
  selectedTarget:  npu
  provider:        apple_ane
  remoteExecution: none
  networkAccess:   none
  governanceViolations: none
```

---

## 9. Native Image Processing — FFI Boundary

An unsafe FFI call to a native C image library is wrapped in a secure governed
flow. Application code calls only the safe wrapper. The FFI boundary is
declared through the `effects [unsafe.native]` annotation and isolated from
the rest of the governance model.

```galerina
intent ResizeUserAvatar {
  purpose "Resize an uploaded user avatar image"

  requires [image.process, filesystem.temp]

  denies [network.external, payment.charge, secret.read]

  produces [AvatarResized]
}

governance AvatarGovernance {
  effects [
    filesystem.temp,
    image.process,
    audit.write
  ]

  capabilities [
    image.process
  ]

  resources [
    TempImageBuffer,
    AuditLog
  ]

  denies [
    network.external,
    payment.charge,
    secret.read
  ]
}

// Crosses into native image library code.
// effects [unsafe.native] declares the FFI boundary in the governance model.
// Must be isolated — call only from the safe wrapper below.
secure flow resizeImageNative(
  image:  Bytes,
  width:  Int,
  height: Int
) -> Result<Bytes, ImageError>
effects [unsafe.native, filesystem.temp, image.process] {
  // Result from native is unsafe until validated.
  let raw: Bytes unsafe unvalidated = NativeImage.resize(image, width, height)?

  let resized: Bytes safe validated = validate.imageBytes(raw)?

  return Ok(resized)
}

// Safe wrapper — validates input constraints before crossing the native boundary.
// Application code always calls this, never resizeImageNative directly.
secure flow resizeUserAvatar(upload: UploadedFile) -> Result<AvatarImage, ImageError>
effects [filesystem.temp, image.process, audit.write] {
  if upload.sizeBytes > 2_000_000 {
    return Err(ImageError.FileTooLarge)
  }

  let resized: Bytes = resizeImageNative(
    image:  upload.bytes,
    width:  256,
    height: 256
  )?

  AuditLog.write({ event: "AvatarResized" })

  return Ok(AvatarImage(resized))
}
```

---

## 10. User Profile Update — Explicit Mutation

Shows explicit `mut` for a draft object. Mutations are visible because `draft`
is declared with `mut`, not `let`.

```galerina
intent UpdateUserProfile {
  purpose "Update safe editable fields on a user profile"

  requires [user.write]

  denies [payment.charge, secret.read, process.spawn]

  produces [UserProfileUpdated]
}

governance UserProfileGovernance {
  effects [
    database.read,
    database.write,
    audit.write
  ]

  capabilities [
    user.write
  ]

  resources [
    UsersDB,
    AuditLog
  ]

  denies [
    payment.charge,
    secret.read,
    process.spawn
  ]
}

secure flow updateUserProfile(request: UpdateUserProfileRequest) -> Result<UserProfileResponse, UserError>
effects [database.read, database.write, audit.write] {
  let existing: UserProfile = UsersDB.findById(request.userId)?

  // Explicit mutable draft — mutations are visible at the declaration site.
  mut draft: UserProfile = existing.profile

  draft.displayName = sanitize.text(request.displayName)?
  draft.bio         = sanitize.text(request.bio)?

  let saved: UserProfile = UsersDB.updateProfile(request.userId, draft)?

  AuditLog.write({
    event:  "UserProfileUpdated",
    userId: request.userId
  })

  return Ok(UserProfileResponse(saved))
}
```

---

## 11. Package Governance — Authority Propagation from Import

Importing a package introduces its authority into the calling module. The
governance diff shows exactly what authority enters with the import.

```galerina
intent UsePaymentAdapter {
  purpose "Charge a payment using approved payment adapter"

  requires [payment.charge]

  denies [filesystem.write, process.spawn]
}

// Package manifest exposes governance metadata — visible to the intent graph.
package "@galerina/stripe-adapter" {
  effects      [network.external, secret.read, payment.charge]
  capabilities [payment.charge]
  resources    [StripeAPI, SecretVault]
}

import StripeAdapter from "@galerina/stripe-adapter"

governance PaymentAdapterGovernance {
  effects [
    network.external,
    secret.read,
    payment.charge,
    audit.write
  ]

  capabilities [
    payment.charge
  ]

  resources [
    StripeAPI,
    SecretVault,
    AuditLog
  ]

  denies [
    filesystem.write,
    process.spawn
  ]
}

secure flow chargeCustomer(payment: PaymentRequest) -> Result<PaymentReceipt, PaymentError>
effects [network.external, secret.read, payment.charge, audit.write] {
  let receipt: PaymentReceipt = StripeAdapter.charge(payment)?

  AuditLog.write({
    event:     "PaymentCharged",
    paymentId: receipt.id
  })

  return Ok(receipt)
}
```

**Governance diff on adding this import:**

```text
Importing @galerina/stripe-adapter introduces:
  + network.external
  + secret.read
  + payment.charge
  + StripeAPI resource access
  + SecretVault resource access
```

---

## 12. Audit Proof Record

What the runtime generates after executing `saveContactForm` (example 3):

```yaml
auditProof:
  flow:   saveContactForm
  intent: SaveContactForm

  values:
    unsafeInputs:
      - request.name    (unsafe unvalidated)
      - request.email   (unsafe unvalidated)
      - request.message (unsafe unvalidated)

    validatedValues:
      - form.name    (safe validated)
      - form.email   (safe validated)
      - form.message (safe validated)

  capabilitiesUsed:
    - forms.create
    - database.write

  effectsExecuted:
    - database.write
    - audit.write

  resourcesAccessed:
    - ContactFormsDB
    - AuditLog

  deniedEffectsTriggered:
    none

  unsafeBoundaries:
    none

  governanceViolations:
    none

  status:
    verified
```

---

## Summary

These examples show all major Galerina governance concepts in combination:

| Concept | Demonstrated in |
|---|---|
| `intent` block | All examples |
| `governance` block | 1, 2, 3, 6, 7, 8, 9, 10, 11 |
| `secure flow` | 1, 2, 3, 5, 6, 7, 8, 9, 10, 11 |
| `pure flow` (zero effects) | 3, 4 |
| Value-state annotations (`unsafe unvalidated`, `safe validated`) | 2, 3, 6, 9 |
| `mut` explicit mutation | 3, 10 |
| Unsafe input sanitization via pure flow | 3 |
| Guard-style decision flow | 5 |
| Constant-time secret comparison | 6 |
| Negative guarantee (`denies`) | 1, 4, 7, 8 |
| `compute target best` (runtime target planning) | 8 |
| FFI boundary (`effects [unsafe.native]`) | 9 |
| Package authority propagation | 11 |
| Audit proof record | 12 |

---

## Key Syntax Corrections

Replace these patterns:

```galerina
// WRONG — safe/unsafe/guard are not flow prefixes in v0.1
safe flow getOrderStatus(...)
unsafe flow readDesktopUserFromHost()
guard flow validateAccess(...)
safe pure flow sanitize(...)

// WRONG — let mut is not the mutation syntax
let mut status: FormStatus = PendingReview
```

With the correct forms:

```galerina
// CORRECT — use secure flow, pure flow, or flow
secure flow getOrderStatus(...)
secure flow readDesktopUserFromHost()
secure flow validateAccess(...) -> Result<Decision, AuthError>
pure flow sanitize(...)

// CORRECT — mut at declaration
mut status: FormStatus = FormStatus.PendingReview

// CORRECT — unsafe/safe on values, not flow names
let rawUser: HostUser unsafe unvalidated = Host.currentUser()?
let user: DesktopUser safe validated = validate.desktopUser(rawUser)?
```

---

## Related Documents

| Document | Notes |
|---|---|
| [galerina-concept-intent.md](galerina-concept-intent.md) | Full intent specification |
| [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md) | Governed execution plan specification |
| [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md) | Audit proof specification |
| [galerina-governance-architecture.md](galerina-governance-architecture.md) | Full 23-stage governance pipeline |
| [compiler-diagnostics.md](compiler-diagnostics.md) | `SPORE-INTENT-*`, `SPORE-SAFETY-*` diagnostic codes |
| [v1-reserved-keywords.md](v1-reserved-keywords.md) | V1 keyword table and lexer rules |
