# Auth, Token and Verification Examples

Status: Draft.

These examples show how Galerina should support JWT, bearer tokens, OAuth, proof of
possession, mTLS, capability tokens and request proofs without inventing new
cryptography or becoming an identity provider.

---

## Good Examples

Bearer token route:

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

Sensitive route with DPoP and idempotency:

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

Capability-bound request:

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

Hybrid post-quantum policy:

```Galerina
crypto_policy {
  signatures {
    classical ["EdDSA", "ES256"]
    post_quantum ["ML-DSA"]
    hybrid_allowed true
  }
}
```

---

## Bad Examples

Logging bearer token:

```Galerina
log.info("token", token)
```

Expected diagnostic:

```text
token_logging_denied
```

Reason:

```text
BearerToken and JwtToken are SecureString values and must not be logged.
```

---

Trusting unverified JWT claims:

```Galerina
let claims = jwt.decode<AccessClaims>(token)
return claims.sub
```

Expected diagnostic:

```text
jwt_claims_used_without_verification
```

Reason:

```text
JWT claims are not trusted until issuer, audience, expiry, signature, algorithm
and key checks pass.
```

---

Allowing algorithm none:

```Galerina
jwt {
  algorithms ["none", "RS256"]
}
```

Expected diagnostic:

```text
jwt_alg_none_denied
```

Reason:

```text
Unsecured JWTs are denied by default for application auth.
```

---

Sensitive mutation without replay protection:

```Galerina
api PaymentsApi {
  POST "/payments/capture" {
    request CapturePaymentRequest
    response CapturePaymentResponse
    handler capturePayment

    auth {
      bearer required
      scopes ["payments.capture"]
    }
  }
}
```

Expected diagnostic:

```text
sensitive_route_missing_replay_protection
```

Reason:

```text
High-risk mutating routes should use idempotency, nonce/replay protection,
DPoP/mTLS or request proof policy.
```

---

Treating hardware proof as cryptography replacement:

```Galerina
verify {
  hardware_proof {
    type "photonic_puf"
    required true
  }
}
```

Expected diagnostic:

```text
hardware_proof_requires_standard_crypto
```

Reason:

```text
Photonic PUF or other hardware proof is experimental and must not replace
standard token verification and signatures.
```

---

## Expected Reports

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

Reports should explain:

```text
which auth providers are declared
which token types are used
which JWT algorithms are allowed or denied
which issuer/audience/scope checks exist
which routes require DPoP or mTLS
which routes require idempotency or request proof
which replay/nonce policy exists
which hardware proof settings are experimental
which post-quantum or hybrid crypto policy exists
which report entries map back to .spore source
```

