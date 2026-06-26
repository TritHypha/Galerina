# Auth, Token and Verification Syntax

Status: Draft.

This file defines syntax direction for JWT, bearer tokens, OAuth, DPoP, mTLS,
capability tokens, request proof envelopes, hardware proof and post-quantum
policy.

Galerina should support safer typed verification workflows around proven
cryptography. It must not invent new cryptographic algorithms.

---

## Purpose

```text
treat tokens as SecureString values
verify JWTs before trusting claims
declare OAuth providers and security requirements
declare route auth requirements
support DPoP and mTLS sender constraints
support request proof and replay protection
support optional capability tokens
support experimental hardware proof policy
support post-quantum/hybrid crypto policy
generate auth and proof reports
```

---

## Grammar Direction

```text
auth_policy       = "auth_policy" block
auth_provider     = "auth_provider" identifier block
auth_block        = "auth" block
verify_block      = "verify" block
crypto_policy     = "crypto_policy" block
proof_envelope    = "proof_envelope" block
capability_token  = "capability" "required" block
request_proof     = "request_proof" block
hardware_proof    = "hardware_proof" block
```

---

## Minimal Examples

Bearer route:

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

JWT verification:

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

OAuth provider:

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
}
```

DPoP:

```Galerina
auth {
  bearer required
  dpop required
  scopes ["payments.capture"]
}
```

mTLS:

```Galerina
auth {
  mtls {
    required true
    bind_access_token true
    trusted_ca env.secret("CLIENT_CA_CERT")
  }
}
```

Request proof:

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

---

## Security Rules

```text
BearerToken and JwtToken are SecureString values
tokens cannot be logged
tokens cannot be stored in localStorage
tokens cannot cross into client_safe flows
JWTs must be verified before claims are trusted
algorithm none is denied by default
issuer, audience, expiry and signature checks are required by policy
OAuth authorization code flows should require PKCE
DPoP and mTLS sender constraints must be reported
request proofs must bind method/path/body where policy requires it
nonce/replay protection must be reportable
hardware proofs are experimental and cannot replace standard crypto
post-quantum crypto must use standard provider algorithms
```

---

## Report Output

Recommended reports:

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

---

## Open Parser and Runtime Work

```text
parse auth_policy
parse auth_provider
parse auth route blocks
parse verify request_proof blocks
parse capability token constraints
parse crypto_policy
check bearer/JWT SecureString handling
reject logging or client_safe export of tokens
reject JWT algorithms not allowed by policy
check OAuth PKCE requirements
emit auth, token, JWT, OAuth and proof reports
mark hardware proof and photonic PUF support as experimental
keep identity-provider products and new cryptographic algorithms out of Galerina core
```

