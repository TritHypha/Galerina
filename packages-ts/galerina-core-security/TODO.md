# Galerina Security TODO

Scan/Q1–Q2 continuation (2026-09-22) is owned by Tower Citizen + compiler
runtime (`grantedEffects`), not this v0.2 secret-model backlog. Do not invent
a full secret subsystem from the unchecked items below.
See `docs/reports/security-q1q2-continuation-2026-09-22.md`.

```text
[x] Canonical ProtectedSecret<T> unwrap API resolved: unwrapForApprovedSink(sink); private revealUnsafeForRuntimeOnly() for internal use only (2026-05-26)
[x] Create /packages-ts/galerina-core-security
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define SecureString helper model
[x] Define redaction primitive rules
[x] Define permission model types
[ ] Upgrade SecretReference to v0.2: add id, source (SecretSource), category, provider?, environmentScope, allowedSinks, deniedSinks, allowDerivation, redaction
[ ] Define SecretSource discriminated union: env|vault|kms|runtime|oauth|token
[ ] Define SecretCategory union: api_token|oauth_client_secret|jwt_signing_key|webhook_signing_secret|database_password|private_key|session_secret|encryption_key|payment_provider_token|smtp_password|cloud_access_key|ai_provider_token|custom
[ ] Define SecretRedactionPolicy: mode (full|partial|hashOnly), replacement, showPrefixChars?, showSuffixChars?, allowFingerprint
[ ] Upgrade SecretDerivedReference: add id, parentSecretId, name, derivation (SecretDerivation)
[ ] Define SecretDerivation discriminated union: hmac|hash|tokenExchange|keyDerivation
[ ] Upgrade SecureStringReference: add id, source (7 values), category (8 values), lifetime (request|job|process|persistent)
[ ] Upgrade ProtectedSecret<T> class: unwrapForApprovedSink(sink) throws FUNGI-SECRET-001; toString/toJSON return "[REDACTED_SECRET]"; toJSON also redacts
[ ] Upgrade SecretSafeSink: add type (14 values), transport (none|http|https|internal|native), productionSafe, redactedOnly; define LOG_SINK, API_RESPONSE_SINK, STRIPE_AUTH_HEADER_SINK
[ ] Implement canSendSecretToSink(secret, sink): boolean — deny-first (redactedOnly→false, !productionSafe→false, http→false, deniedSinks→false, allowedSinks→true, provider-aware check)
[ ] Implement redactSecretValue(secret: ProtectedSecret): string — fails closed
[ ] Implement createSecretFingerprint(rawSecret, runtimeSalt): string — HMAC-SHA256, first 16 hex chars
[ ] Define SecretDiagnostic: code FUNGI-SECRET-001|FUNGI-SECRET-002, severity, message, secretName?, sinkId?, sourceLocation?, suggestion?
[ ] Implement FUNGI-SECRET-001 (unsafe sink flow), FUNGI-SECRET-002 (unsafe conversion/exposure)
[ ] Define SecretTaint discriminated union: none|secret|derivedSecret|secureString with referenceId
[ ] Implement combineTaint(left, right): SecretTaint
[ ] Implement checkStringConcat(input): SecretDiagnostic[] — emits FUNGI-SECRET-002 on tainted concat
[ ] Implement checkSecretSink(input): SecretDiagnostic[] — emits FUNGI-SECRET-001 on unsafe sink
[ ] Implement safeLog(message, fields): void — redacts ProtectedSecret values recursively
[ ] Implement buildAuthorizationHeader(secret, sink): Record<string,string> — uses unwrapForApprovedSink
[ ] Create secrets/ dir: secret-reference.ts, secret-derived-reference.ts, secure-string-reference.ts, protected-secret.ts, secret-safe-sink.ts, secret-policy.ts, secret-redaction.ts, secret-diagnostics.ts, secret-report.ts
[ ] Create checks/ dir: check-secret-sink.ts, check-secret-string-conversion.ts, secret-taint.ts
[ ] Create runtime/ dir: secret-resolver.ts, safe-log.ts, safe-json.ts
[ ] Ensure SecretReference protected marker prevents accidental string serialization
[ ] Define policy definition, effective policy and conflict report schemas
[ ] Define capability boundary and grant report schemas
[ ] Define capability lease, attenuation and approver-chain diagnostics
[ ] Define AI self-grant and trust-root modification diagnostics
[ ] Define malicious data validation and taint-flow diagnostics
[ ] Define OWASP/CWE baseline diagnostic mapping
[ ] Define hardware-risk security report inputs
[x] Define security diagnostic format
[x] Define security report contract
[x] Define safe token, cookie and header handling helpers
[x] Define cryptographic policy types
[ ] Define crypto inventory and post-quantum readiness report schemas
[ ] Define SecureRandom versus Random diagnostic examples
[x] Add examples
[x] Add tests
```
