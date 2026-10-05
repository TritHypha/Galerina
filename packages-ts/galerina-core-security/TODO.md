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
[x] Define policy definition, effective policy and conflict report schemas -- src/policy-contracts.ts readPolicyDefinition / readEffectivePolicy / readPolicyConflict (Grok 2026-10-05; zero-trust defaults, owner may revisit): schemas galerina.security.policy-definition/v1, effective-policy/v1, policy-conflict/v1; FUNGI-SEC-POL-001..005; deny-default only; kinds align with core-reports policy family (authored excludes unknown); never throws; never echoes ids/tokens; SecretReference v0.2 still do-not-invent; tests/policy-contracts.test.mjs
[x] Define capability boundary and grant report schemas -- src/capability-contracts.ts readCapabilityBoundary / readCapabilityGrantReport (Grok 2026-10-05; zero-trust defaults, owner may revisit): schemas galerina.security.capability-boundary/v1, capability-grant-report/v1; FUNGI-SEC-CAP-001..005; deny-default only; admitted/denied and granted/refused disjoint ascending tokens; never throws; never echoes ids/tokens; SecretReference v0.2 still do-not-invent; lease/attenuation/approver-chain still open; tests/capability-contracts.test.mjs
[x] Define capability lease, attenuation and approver-chain diagnostics (closed-shape CapabilityLease / CapabilityAttenuation / ApproverChain; FUNGI-SEC-CLA-001..005; Grok 2026-10-05; owner may revisit)
[x] Define AI self-grant and trust-root modification diagnostics (closed-shape AiAuthorityRequest / TrustRootModification; FUNGI-SEC-ASG-001..005; Grok 2026-10-05; owner may revisit)
[ ] Define malicious data validation and taint-flow diagnostics
[x] Define OWASP/CWE baseline diagnostic mapping (closed-shape OwaspCweMapping + OWASP_CWE_BASELINE_MAPPING for the 12 in-package Galerina_SECURITY_* codes; OWASP Top 10 2021 ids + CWE ids; FUNGI-SEC-OWC-001..005; Grok 2026-10-05; owner may revisit)
[ ] Define hardware-risk security report inputs
[x] Define security diagnostic format
[x] Define security report contract
[x] Define safe token, cookie and header handling helpers
[x] Define cryptographic policy types
[x] Define crypto inventory and post-quantum readiness report schemas (closed-shape CryptoInventoryReport / CryptoInventoryUse + CRYPTO_ALGORITHM_BASELINE_LABELS; LABELS ONLY, no PQ readiness claim; FUNGI-SEC-CIV-001..005; Grok 2026-10-05; owner may revisit)
[x] Define SecureRandom versus Random diagnostic examples -- src/secure-random-examples.ts readSecureRandomExamples / lookupSecureRandomExample / SECURE_RANDOM_DIAGNOSTIC_EXAMPLES (EXAMPLES ONLY; FUNGI-SEC-SRN-001..005; Grok 2026-10-05; owner may revisit)
[x] Add examples
[x] Add tests
```

## Notes (Grok 2026-10-05 capability lease)
- Closed `src/capability-lease-contracts.ts`: `readCapabilityLease` / `readCapabilityAttenuation` / `readApproverChain`.
- Schemas: `galerina.security.capability-lease/v1`, `capability-attenuation/v1`, `approver-chain/v1`.
- Deny-first: active lease needs capabilities; denied lease empty; allow chain needs approvers; child ⊆ parent.
- Epoch seconds finite safe ints only; SecretReference v0.2 still do-not-invent; no live lease runtime.

## Notes (Grok 2026-10-05 AI authority / trust-root)
- Closed `src/ai-authority-contracts.ts`: `readAiAuthorityRequest` / `readTrustRootModification`.
- Schemas: `galerina.security.ai-authority-request/v1`, `trust-root-modification/v1`.
- Deny-first: selfGrantAttempt requires deny; allow needs capabilities and not self-grant; trust-root allow needs externalGovernance + human|service actor (ai_agent/tool allow refused).
- SecretReference v0.2 still do-not-invent; no live AI grant / trust-root mutation runtime.

## Notes (Grok 2026-10-05 OWASP / CWE baseline)
- Closed `src/owasp-cwe-mapping.ts`: `readOwaspCweMapping` / `lookupOwaspCweBaseline` / `OWASP_CWE_BASELINE_MAPPING`.
- Schema: `galerina.security.owasp-cwe-mapping/v1`; owaspEdition `2021` only (A01:2021..A10:2021).
- Descriptive metadata only: no new rules, no severity changes, no OWASP coverage claim. Hygiene-only codes recorded `unmapped` (DUPLICATE_GRANT, REDACTION_RULE_INVALID, REDACTION_RULE_NAME_EMPTY) rather than guessed.
- Test pins entries to exactly the Galerina_SECURITY_* codes in src/index.ts (drift guard).
- Not covered: FUNGI-SEC-* reader codes, FUNGI-CRYPTO-* provider codes, later OWASP editions, ASVS/CVSS. SecretReference v0.2 / taint types still do-not-invent.

## Notes (Grok 2026-10-05 crypto inventory / PQ readiness)
- Closed `src/crypto-inventory.ts`: `readCryptoInventory` / `lookupCryptoAlgorithmLabel` / `CRYPTO_ALGORITHM_BASELINE_LABELS`.
- Schema: `galerina.security.crypto-inventory/v1`. Algorithm vocabulary = CryptoAlgorithm + WeakCryptoAlgorithm (src/index.ts) + ml-dsa-65; test pins it to DEFAULT_CRYPTOGRAPHIC_POLICY (drift guard).
- LABELS ONLY: `postQuantumReadiness` (not_assessed|not_ready|ready) is the caller's declared policy state; the reader refuses `ready` only when its own inventory contradicts it (incomplete, empty, or any unassessed / quantum_vulnerable / legacy_weak use). Accepting a report does not certify readiness.
- Deny-first: weak algorithms must be legacy_weak + denied; unassessed and hard-coded uses can never be approved; quantum_vulnerable / legacy_weak need a migration-path state; post_quantum needs not_applicable.
- Owner may revisit: baseline labels (symmetric AEAD / hash / argon2id counted as symmetric_or_hash and admissible for `ready`; ed25519 / x25519 quantum_vulnerable; ml-dsa-65 post_quantum); purpose vocabulary; schema id vs doc example `reportType: galerina.crypto.inventory` / boolean `postQuantumReady`.
- Not covered: library / deployment / fingerprint fields, key sizes, hybrid pair records, post-quantum-readiness-report.json / quantum target / measurement / fallback reports, SecureRandom diagnostics, scanners, report writers. SecretReference v0.2 / taint types still do-not-invent.

## Notes (Grok 2026-10-05 SecureRandom versus Random diagnostic examples)
- Closed `src/secure-random-examples.ts`: `readSecureRandomExamples` / `lookupSecureRandomExample` / `SECURE_RANDOM_DIAGNOSTIC_EXAMPLES`.
- Schema: `galerina.security.secure-random-examples/v1`.
- Purpose vocab = rule list only: key|nonce|salt|secret|token. Sources: SecureRandom|Random.
- Deny-first matrix: Random → denied/error/`example.random.forbidden`; SecureRandom → allowed/info/`example.secure-random.required`.
- EXAMPLES ONLY: no CSPRNG, scanner, report writer, or new Galerina_SECURITY_* codes. SecretReference v0.2 / taint / hardware-risk still open or do-not-invent.
