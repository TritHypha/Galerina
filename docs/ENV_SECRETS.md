# LogicN Environment Secrets

LogicN should treat `.env` values as secrets, not normal strings.

Core rule:

```text
Secrets are values that can be used, but not seen.
```

A secret may be used by an approved operation, but it must not be copied,
logged, cached, compiled into output, sent to AI, returned in errors or sent to
undeclared hosts unless LogicN has an explicit safe rule for that use.

## Central Declaration

Secrets should be declared centrally, usually in `boot.lln` or the app security
policy, instead of being read ad hoc throughout the application.

```LogicN
secrets {
  PAYMENT_API_KEY {
    source env
    required true
    used_for ["payment_provider"]
    expose_to ["PaymentsService"]
  }

  WEBHOOK_SECRET {
    source env
    required true
    used_for ["webhook_hmac"]
    expose_to ["WebhookVerifier"]
  }

  DATABASE_PASSWORD {
    source env
    required true
    used_for ["database_connection"]
    expose_to ["Database"]
  }
}
```

This gives LogicN a map of:

```text
what secrets exist
where they come from
which code may use them
what they are used for
whether they are required
```

## Secret Types

Environment secrets should not become ordinary strings.

Denied pattern:

```LogicN
let key: String = Env.get("PAYMENT_API_KEY")
```

Preferred pattern:

```LogicN
let key: Secret<ApiKey> = Env.secret("PAYMENT_API_KEY")
```

`Secret<ApiKey>` is a protected type. It can be passed to approved secret-aware
APIs, but it cannot be logged or converted to a normal string.

Denied:

```LogicN
let key = Env.secret<ApiKey>("PAYMENT_API_KEY")

Log.safe("Using key", key)
```

Compiler error:

```text
LOGICN-SECRET-001
Cannot log Secret<ApiKey>.

File: payments.lln
Line: 12

Use a non-sensitive reference such as Secret.name(key) or Secret.fingerprint(key).
```

Safe:

```LogicN
Log.safe("Using payment provider key", {
  secret: Secret.name(key)
})
```

Output:

```json
{
  "message": "Using payment provider key",
  "secret": "PAYMENT_API_KEY"
}
```

## Safe Use

Secret values should be usable only through safe functions and approved sinks.

Allowed:

```LogicN
let key = Env.secret<ApiKey>("PAYMENT_API_KEY")

Payments.charge({
  apiKey: key,
  orderId: order.id,
  amount: order.amount
})
```

Denied:

```LogicN
let key = Env.secret<ApiKey>("PAYMENT_API_KEY")

let copied = key.toString()
```

Compiler error:

```text
LOGICN-SECRET-002
Secret<ApiKey> cannot be converted to String.

Reason:
Secrets may not be copied into normal memory or returned from functions.
```

## Secret Taint Tracking

If a value touches a secret, LogicN should remember that it is secret-derived.

```LogicN
let secret = Env.secret<ApiKey>("PAYMENT_API_KEY")

let header = "Bearer " + secret
```

`header` should become:

```LogicN
SecretDerived<AuthHeader>
```

This must fail:

```LogicN
Log.safe("Header is", header)
```

Safe usage should flow through a secret-aware helper:

```LogicN
Http.post("https://api.payment-provider.com/charge", {
  headers: {
    Authorization: Secret.bearer(secret)
  },
  body: chargeRequest
})
```

LogicN allows the secret to enter a permitted HTTP header for an approved
service, but not logs, cache, errors, AI context, build output or reports.

## Secret-Safe Sinks

LogicN should classify where values are going.

| Sink | Secret allowed? | Rule |
|---|---:|---|
| `Log.safe()` | No | Redact or block |
| `Error.message` | No | Never expose secrets |
| HTTP request headers | Sometimes | Only to approved domains/services |
| Database | Usually no | Only with encrypted secret storage policy |
| LLM input | No by default | Use redacted metadata or fingerprints |
| Cache | No by default | Only encrypted, secret-safe cache with explicit policy |
| Build output | Never | Secrets must not compile into artifacts |
| Reports | No values | Names, scopes and fingerprints only |

Allowed:

```LogicN
Http.post(PaymentProvider.chargeUrl, {
  headers: {
    Authorization: Secret.bearer(PAYMENT_API_KEY)
  }
})
```

Denied:

```LogicN
Http.post("https://random-site.example", {
  headers: {
    Authorization: Secret.bearer(PAYMENT_API_KEY)
  }
})
```

Compiler or runtime error:

```text
LOGICN-SECRET-HTTP-004
Secret PAYMENT_API_KEY may not be sent to undeclared external host.

Allowed hosts:
- api.payment-provider.com
```

## Runtime-Only Values

`.env` data must be loaded at runtime only.

```text
.env values are never compiled into app.bin, app.wasm, app.js, reports,
source maps or AI context files.
```

Example build report:

```json
{
  "secrets": {
    "compiledIntoOutput": false,
    "envRequired": [
      "PAYMENT_API_KEY",
      "WEBHOOK_SECRET",
      "DATABASE_PASSWORD"
    ],
    "valuesIncluded": false
  }
}
```

Deployment tools can then verify which secrets are required without seeing their
values.

## Fingerprints

Sometimes operators need to know whether a secret changed. LogicN may expose a
safe fingerprint, not the value.

```LogicN
Secret.fingerprint(PAYMENT_API_KEY)
```

Output:

```json
{
  "secret": "PAYMENT_API_KEY",
  "fingerprint": "sha256:7b31...c91a"
}
```

Fingerprints can help detect a wrong key, an old key, a staging/production
mismatch or a missing secret without revealing the value.

## Secret Use Report

LogicN should generate a `secret-report.json`.

```json
{
  "secretReport": {
    "valuesIncluded": false,
    "secrets": [
      {
        "name": "PAYMENT_API_KEY",
        "source": "env",
        "required": true,
        "usedBy": [
          "PaymentsService.charge",
          "PaymentsService.refund"
        ],
        "allowedDestinations": [
          "https://api.payment-provider.com"
        ],
        "logged": false,
        "sentToLLM": false,
        "cached": false,
        "compiledIntoOutput": false
      },
      {
        "name": "WEBHOOK_SECRET",
        "source": "env",
        "required": true,
        "usedBy": [
          "WebhookVerifier.verifyPaymentWebhook"
        ],
        "allowedOperations": [
          "hmac_sha256_verify"
        ],
        "logged": false,
        "sentToLLM": false,
        "cached": false
      }
    ]
  }
}
```

Reports must include metadata only. They must never include secret values.

## Webhook Secrets

A webhook secret should not be visible to app code as a string.

```LogicN
let webhookSecret = Env.secret<HmacKey>("WEBHOOK_SECRET")

let verified = Hmac.verifySha256({
  secret: webhookSecret,
  payload: ctx.rawBody,
  signature: ctx.headers.required("X-Signature-SHA256")
})
```

The secret is used inside `Hmac.verifySha256`, but the developer never needs to
print, copy or convert it.

Denied:

```LogicN
Log.safe("Webhook secret", webhookSecret)

LLM.ask({
  input: webhookSecret
})

Cache.set("debug-webhook-secret", webhookSecret)
```

## Secrets and LLM Cache

LogicN should block LLM calls and passive LLM cache entries when input contains
secrets.

Denied:

```LogicN
let key = Env.secret<ApiKey>("PAYMENT_API_KEY")

let result = LLM.ask<DebugHelp>({
  input: "Why is this API key failing? " + key,
  output: DebugHelp
})
```

Diagnostic:

```text
LOGICN-LLM-SECRET-001
Secret PAYMENT_API_KEY cannot be sent to an LLM.

Suggestion:
Use Secret.fingerprint(PAYMENT_API_KEY), provider name or a redacted diagnostic instead.
```

Safe:

```LogicN
let result = LLM.ask<DebugHelp>({
  input: {
    provider: "PaymentProvider",
    keyFingerprint: Secret.fingerprint(PAYMENT_API_KEY),
    errorCode: paymentError.code
  },
  output: DebugHelp
})
```

## Secret Scopes

Secrets should have narrow access.

```LogicN
secret PAYMENT_API_KEY {
  source env
  allow only PaymentsService
}
```

Allowed:

```LogicN
PaymentsService.charge(order)
```

Denied:

```LogicN
AdminDashboard.showSecret(PAYMENT_API_KEY)
```

Compiler error:

```text
LOGICN-SECRET-SCOPE-003
PAYMENT_API_KEY is not available in AdminDashboard.

Allowed scope:
- PaymentsService
```

## Secret Lifetime

LogicN should avoid keeping secrets in memory longer than needed.

```LogicN
with secret PAYMENT_API_KEY as key {
  Payments.charge({
    apiKey: key,
    amount: order.amount
  })
}
```

The `with secret` block means:

```text
load secret
use it inside this block
do not allow it outside the block
clear the reference afterwards where possible
```

Denied:

```LogicN
let savedKey

with secret PAYMENT_API_KEY as key {
  savedKey = key
}
```

The secret cannot escape its safe lifetime.

## Default Redaction

LogicN should automatically redact known sensitive names:

```text
password
passwd
secret
token
api_key
apikey
authorization
cookie
session
private_key
client_secret
stripe_key
firebase_key
database_url
```

Example:

```LogicN
Log.safe("Config loaded", Env.all())
```

Output:

```json
{
  "PAYMENT_API_KEY": "[REDACTED]",
  "DATABASE_PASSWORD": "[REDACTED]",
  "APP_ENV": "production"
}
```

## Hard-Coded Secret Detection

LogicN should scan source files for likely secrets.

Denied:

```LogicN
let key = "sk_live_abc123456789"
```

Compiler warning or error:

```text
LOGICN-SECRET-HARDCODED-001
Possible hard-coded secret detected.

File: payments.lln
Line: 8

Move this value to .env and declare it in boot.lln.
```

## Syntax Pattern

Recommended pattern:

```LogicN
secret PAYMENT_API_KEY: ApiKey {
  source env "PAYMENT_API_KEY"
  required true
  scope PaymentsService
  allow_send_to PaymentProvider
  deny_log true
  deny_cache true
  deny_llm true
}
```

Usage:

```LogicN
secure flow chargeCustomer(order: Order) -> Result<PaymentResult, PaymentError>
  effects [secret.read, network.outbound, Log.safe]
{
  with secret PAYMENT_API_KEY as key {
    let payment = PaymentProvider.charge({
      apiKey: key,
      orderId: order.id,
      amount: order.amount
    })
      Err(error) => return Err(PaymentFailed)

    return Ok(payment)
  }
}
```

## Design Summary

LogicN should identify `.env` keys using:

```text
declared secret blocks
Secret<T> types
taint tracking
safe sinks
scope rules
secret lifetime blocks
compile-time scanning
runtime secret reports
automatic redaction
```

The useful reportable outcome is:

```text
This app uses PAYMENT_API_KEY.
It is required.
It is only used by PaymentsService.
It is only sent to the payment provider.
It was not logged.
It was not cached.
It was not sent to an LLM.
It was not compiled into the build.
```

## Encrypted-at-Rest Secrets: `env.tmf`

Everything above governs how `.env` *values* flow through the app once loaded.
But a plaintext `.env` file is still readable by anyone who can read the file on
disk. For the cases where the secrets file itself must be encrypted at rest,
LogicN ships an **optional** drop-in replacement: `env.tmf`, provided by the
`@logicn/ext-secrets-tmf` package.

`env.tmf` is the SOPS / Sealed-Secrets / age pattern built on the `.tmf`
container. It is a **thin layer** over `@logicn/ext-tmf` (it owns no crypto and
no container bytes of its own — every byte primitive comes from the engine's
`writeTmf`/`readTmf` and KEM-DEM `seal`/`open`). Each secret is sealed under a
recipient public key; the file on disk is ciphertext only.

```text
.env       -> plaintext key=value, readable by anyone with file access
env.tmf    -> per-secret KEM-DEM sealed sections, encrypted at rest,
              opened only in-memory under the recipient key
```

`env.tmf` is **opt-in**. Plain `.env` (with all the taint, scope, sink and
report rules above) remains the default. Reach for `env.tmf` when the secrets
file must survive on shared disk, in a repo, or in a backup without exposing
values.

### Governed In-Memory CLI

Secrets in `env.tmf` are managed through a governed CRUD/shell CLI
(`logicn secrets-tmf` / `logicn-secrets-tmf`) that decrypts only into an arena
buffer and never leaves plaintext where it can be scraped:

```text
logicn-secrets-tmf init  --pub HEX        create an empty encrypted env.tmf
logicn-secrets-tmf set   NAME --pub HEX   value from STDIN or no-echo prompt
logicn-secrets-tmf get   NAME             in-arena -> stdout (piped only)
logicn-secrets-tmf list                   names + metadata, NEVER values
logicn-secrets-tmf rm    NAME --pub HEX   remove a section
logicn-secrets-tmf rotate-recipient --new-pub HEX
logicn-secrets-tmf shell --pub HEX        in-arena REPL
```

The CLI enforces the same "used, not seen" rule on the editing surface itself:

```text
no temp file        edits happen in an arena buffer, re-sealed via an
                    atomic ciphertext-only write — plaintext never lands on disk
no $EDITOR / FIFO   the `shell` REPL never spawns an external editor, opens a
                    FIFO, or writes /tmp or a .swp
no secret in argv   `set NAME value` is REFUSED — the value must come from STDIN
                    or a no-echo prompt (argv leaks via ps / proc / shell history)
no TTY echo         `get` refuses to print to a terminal without --force
                    (shoulder-surf / scrollback); piped `get` is allowed
arena-only          the recipient secret and decrypted values live only in
                    arena buffers that are zero-wiped after use
```

### Fail-Closed Reading

Reading an `env.tmf` verifies before it decrypts: the engine recomputes the
container's integrity root over the **ciphertext** leaves and fail-closes on any
tamper or bounds violation *before* any section is opened. A signed-v0 file is
rejected. There is no path where a corrupted or partial `env.tmf` yields a
secret.

### Production Read-Back

Local editing through the CLI is distinct from production read-back. Production
hosts do not use the editing CLI; they anchor the recipient key through the
existing `kms` / `vault` `SecretConfigSource` and load secrets through the
runtime loader. The unsolved secret-zero problem (where the recipient key itself
lives) is delegated to that external custody anchor, exactly as for plain `.env`
secret sources.
