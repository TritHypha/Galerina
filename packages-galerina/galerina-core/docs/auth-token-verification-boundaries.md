# Galerina Auth, Token and Verification Boundaries

Status: Draft.

Galerina should support modern authentication, authorisation and token verification
standards safely, without becoming an identity provider, authentication product
or cryptography framework.

Core rule:

```text
Do not invent new cryptography.
Do create safer language-level patterns around proven cryptography.
```

Reference facts checked against primary sources on 2026-05-07:

```text
JWT is a compact claims format that can be signed/MAC-protected or encrypted.
OAuth bearer tokens are access tokens where possession is enough to use them.
OAuth 2.0 Security Best Current Practice is RFC 9700.
DPoP is defined by RFC 9449.
OAuth mTLS client authentication and certificate-bound access tokens are defined by RFC 8705.
NIST finalised the first three post-quantum cryptography standards in 2024.
```

References:

```text
https://datatracker.ietf.org/doc/html/rfc7519
https://datatracker.ietf.org/doc/html/rfc6750
https://datatracker.ietf.org/doc/rfc9700/
https://www.rfc-editor.org/rfc/rfc9449.html
https://www.rfc-editor.org/rfc/rfc8705.html
https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-encryption-standards
```

---

## Concept Separation

Galerina should separate:

```text
Authentication = who are you?
Authorisation  = what are you allowed to do?
Token          = proof/credential presented with a request
Session        = server/browser relationship over time
Capability     = narrow permission to perform a specific action
Verification   = proof that the request, token, client, device or runtime is genuine
```

Galerina should support typed security boundaries and reports. Identity provider
implementation, login screens, account recovery, MFA products and admin role
dashboards remain packages, frameworks or external services.

The optional Galerina Secure App Kernel may enforce declared auth provider, bearer,
scope, mTLS, DPoP, webhook signature and capability-token requirements at
runtime. Galerina core should define the contract and reports; the kernel and adapters
should perform runtime verification.

---

## Bearer Tokens

Bearer tokens should be supported, but treated as sensitive.

```Galerina
type BearerToken = SecureString
```

Example:

```Galerina
secure flow getBearerToken(req: Request) -> Result<BearerToken, AuthError>
effects [network.inbound] {
  return auth.bearer.fromHeader(req.headers.Authorization)?
}
```

Rules:

```text
BearerToken is SecureString.
BearerToken cannot be logged.
BearerToken cannot be stored in localStorage.
BearerToken cannot be passed to client_safe flows.
BearerToken must have expiry validation.
BearerToken use must appear in auth/security reports.
```

Route example:

```Galerina
api OrdersApi {
  GET "/orders" {
    request OrderListRequest
    response OrderListResponse
    handler listOrders

    auth {
      bearer required
      scopes ["orders.read"]
    }
  }
}
```

---

## JWT

Galerina should support JWT as a typed, verified token boundary.

```Galerina
type JwtToken = SecureString
```

A JWT should not be trusted until verified:

```Galerina
type VerifiedJwt<TClaims> {
  claims: TClaims
  issuer: String
  audience: String
  expiresAt: DateTime
}
```

Example claims:

```Galerina
type AccessClaims {
  sub: UserId
  iss: String
  aud: String
  exp: DateTime
  scope: Array<String>
}
```

Verification:

```Galerina
secure flow verifyAccessJwt(token: JwtToken) -> Result<VerifiedJwt<AccessClaims>, AuthError>
effects [crypto.verify] {
  return jwt.verify<AccessClaims>(token) {
    issuer env.string("AUTH_ISSUER")
    audience "api://orders"
    jwks_url env.string("AUTH_JWKS_URL")
    algorithms ["RS256", "ES256", "EdDSA"]
    require_exp true
    require_iat true
    clock_skew 60s
  }
}
```

Dangerous defaults should be rejected:

```text
algorithm "none" denied
expired token denied
wrong issuer denied
wrong audience denied
missing signature denied
unknown algorithm denied
untrusted key denied
missing required claims denied
```

---

## OAuth

Galerina should support OAuth through declarations and safe policy, not by becoming an
identity provider.

OAuth support should include:

```text
OAuth client declarations
issuer metadata
authorization code + PKCE
token introspection
JWKS validation
scope checks
audience checks
refresh-token restrictions
OAuth security reports
```

Example:

```Galerina
auth_provider MainIdentity {
  type "oauth2"

  issuer env.string("AUTH_ISSUER")
  jwks_url env.string("AUTH_JWKS_URL")

  flows {
    authorization_code {
      pkce required
    }
  }

  token_validation {
    audience "api://main"
    require_exp true
    require_issuer true
    require_signature true
  }
}
```

Route:

```Galerina
api AccountApi {
  GET "/account" {
    request AccountRequest
    response AccountResponse
    handler getAccount

    auth {
      provider MainIdentity
      bearer required
      scopes ["account.read"]
    }
  }
}
```

---

## Proof of Possession: DPoP and mTLS

Bearer tokens have a weakness: whoever holds the token can use it. Galerina should
support sender-constrained tokens where the client proves it holds a private key
or certificate.

Important standards:

```text
DPoP = proof-of-possession at application level
mTLS-bound tokens = token bound to client TLS certificate
```

DPoP route example:

```Galerina
api PaymentsApi {
  POST "/payments/capture" {
    request CapturePaymentRequest
    response CapturePaymentResponse
    handler capturePayment

    auth {
      bearer required
      dpop required
      scopes ["payments.capture"]
    }

    idempotency {
      key header "Idempotency-Key"
      ttl 24h
      payload_mismatch "reject"
    }
  }
}
```

mTLS example:

```Galerina
auth {
  mtls {
    required true
    bind_access_token true
    trusted_ca env.secret("CLIENT_CA_CERT")
  }
}
```

---

## Verified Capability Token

Galerina may define a **Verified Capability Token** structure for high-security
systems. This must not be a new cryptographic algorithm. It should be a safer
token pattern using proven signing/encryption algorithms.

Example concept:

```Galerina
type VerifiedCapability {
  subject: SubjectId
  action: Action
  resource: ResourceId
  expiresAt: DateTime
  nonce: Nonce
  requestHash: Hash
  proof: Proof
}
```

Usage:

```Galerina
api OrdersApi {
  POST "/orders/{id}/cancel" {
    request CancelOrderRequest
    response CancelOrderResponse
    handler cancelOrder

    verify {
      capability required {
        action "orders.cancel"
        resource path.id
        bind_request_body true
        nonce required
        expires_within 2m
      }
    }
  }
}
```

Security properties:

```text
token is for one action
token is for one resource
token is short-lived
token is bound to request body
token is bound to nonce
token cannot be replayed easily
```

---

## Request Proof Envelope

Galerina may support a signed request proof envelope for sensitive APIs, queues,
webhooks and internal service calls.

Example envelope:

```Galerina
proof_envelope {
  method POST
  path "/orders/123/cancel"
  body_hash "sha256:..."
  nonce "..."
  timestamp "..."
  key_id "client-key-123"
  signature "..."
}
```

Route verification:

```Galerina
verify {
  request_proof {
    required true
    bind_method true
    bind_path true
    bind_body true
    max_age 30s
    replay_cache true
  }
}
```

This is similar in spirit to proof-of-possession, but broader. Galerina should make it
a typed verification workflow, not a new cryptographic primitive.

---

## Hardware Proof and Photonic PUFs

Photonic chips should not replace cryptographic standards by themselves. Future
hardware may support stronger proof of device identity.

One candidate area is physical unclonable functions (PUFs), including research
into silicon photonic PUFs and optical PUF authentication schemes.

Example direction:

```Galerina
verify {
  hardware_proof {
    type "photonic_puf"
    challenge required
    response required
    freshness 30s
    fallback "software_key"
  }
}
```

Concept:

```text
server sends challenge
device/chip produces response using physical behaviour
server verifies response
request proceeds only if token + proof + policy match
```

Status:

```text
Experimental / research.
Requires real hardware, expert cryptographic review and threat modelling.
Must not replace JWT/OAuth/DPoP/mTLS or standard signatures.
```

---

## Post-Quantum Option

Galerina may prepare for post-quantum verification policy. It should use standardised
algorithms and provider libraries, not invent new cryptography.

Example policy:

```Galerina
crypto_policy {
  signatures {
    classical ["EdDSA", "ES256"]
    post_quantum ["ML-DSA"]
    hybrid_allowed true
  }

  key_exchange {
    classical ["X25519"]
    post_quantum ["ML-KEM"]
    hybrid_allowed true
  }
}
```

Sensitive API example:

```Galerina
verify {
  request_proof {
    signature ["EdDSA", "ML-DSA"]
    mode "hybrid"
  }
}
```

---

## Recommended Security Stack

Normal APIs:

```text
Bearer token or JWT
issuer/audience/scope checks
expiry checks
rate limits
idempotency
typed request validation
```

Sensitive APIs:

```text
JWT/OAuth
DPoP or mTLS
request body hash
nonce/replay protection
short token lifetime
idempotency
audit logging
```

Future/high-security hardware:

```text
JWT/OAuth or capability token
proof envelope
hardware attestation
optional photonic PUF proof
hybrid/post-quantum signature option
```

---

## Auth Policy

Example:

```Galerina
auth_policy {
  bearer {
    secure_string true
    log "deny"
  }

  jwt {
    require_signature true
    require_exp true
    require_issuer true
    require_audience true
    deny_alg_none true
  }

  oauth2 {
    pkce required
    token_endpoint_auth "required_for_confidential_clients"
  }

  proof_of_possession {
    dpop allow
    mtls allow
  }

  capability_tokens {
    enabled true
    bind_action true
    bind_resource true
    bind_request_hash true
    max_ttl 5m
  }

  hardware_proof {
    photonic_puf "experimental"
    fallback "software_key"
  }

  reports {
    auth_report true
    token_report true
    proof_report true
    security_report true
    ai_guide true
  }
}
```

---

## Reports

Recommended generated reports:

```text
auth-report.json
token-report.json
jwt-validation-report.json
oauth-security-report.json
proof-report.json
capability-token-report.json
request-proof-report.json
hardware-proof-report.json
crypto-policy-report.json
security-report.json
app.ai-guide.md
```

Reports should include:

```text
auth providers
token types
JWT algorithms allowed/rejected
issuer/audience/scope checks
expiry and clock-skew policy
PKCE requirements
DPoP and mTLS requirements
request proof binding rules
nonce/replay cache policy
capability token constraints
hardware proof status and fallback
post-quantum/hybrid crypto policy
source-map links back to .spore files
```

---

## Non-Goals

Galerina should not provide:

```text
new cryptographic algorithms
an identity provider implementation
login screens
password reset workflows
MFA products
passkey product implementation
session database product
admin permissions dashboards
OAuth provider implementation
OIDC provider implementation
provider-specific SDK logic in core
```

---

## Final Rule

```text
Galerina should support JWT, bearer tokens and OAuth as standard secure primitives.

Galerina should also support proof-of-possession, mTLS, idempotency and replay
protection for high-risk APIs.

For future verification, Galerina may define Verified Capability Token and Request
Proof Envelope workflows, optionally backed by hardware proof such as photonic
PUFs or post-quantum signatures.

Do not invent new cryptographic algorithms.
Do create safer typed verification workflows around proven cryptography and
future hardware proofs.
```

