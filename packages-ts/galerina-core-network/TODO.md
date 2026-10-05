# Galerina Core Network TODO

## Package-install boundary — 2026-09-26

The runtime imports `/governance`, but extracting this package's Tower
installation remains an RD-1295 architecture HOLD. A subpath import is not
proof that the dependency or its package graph can be removed. No package
split or production admission is claimed by this TODO refresh.

## Graph integration follow-up — 2026-09-22

- [x] Admitted `@galerina/tower-citizen/governance` (not the barrel).
      Live `--check` PASS. Barrel import remains a distinct FAIL.

V1 freeze rule: this package defines network policy and report contracts only.
HTTP serving belongs in `galerina-framework-api-server`; application request
policy belongs in `galerina-framework-app-kernel`.

```text
[x] Audit docs for legacy ws/wss, sharedSecret, exists/save and has/store wording and map or replace with canonical v0.2 names — README has canonical names; TODO items below corrected to canonical webhook KB API (2026-05-26)
[x] Create /packages-ts/galerina-core-network
[x] Add README.md
[x] Add package metadata
[x] Add TODO.md
[x] Add typed network policy exports
[x] Define TLS policy contract
[x] Define endpoint allow/deny rules
[x] Define backend capability and safe auto-selection contract
[x] Define network report contract
[x] Add tests
[x] Add examples
[ ] Wire network reports into compiler/runtime reports
[ ] Extend NetworkProtocol to add "quic": "http"|"https"|"tcp"|"udp"|"grpc"|"websocket"|"quic"
    (2026-09-29 correction: the live union at src/index.ts:5-12 is
    https|http|tls|tcp|udp|websocket|rawSocket. It has no `grpc` and does have `tls` and
    `rawSocket`, so adding `quic` alone does not produce the union above. Whether
    `grpc` belongs here is an open decision.)
[x] Upgrade NetworkDestinationReference: add provider, category, dataCategories (defined from the README shape with these optional fields; it was planned-only before) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[ ] Upgrade NetworkPolicy: add default (allow|deny), allowPlainHttp, aiProviders[], requireTimeouts, requireRateLimits (2026-10-05: left open; productionNetworkPolicy is a frozen current-schema value and `defaultEffect`/`requireTimeouts` already exist, so this is a schema decision)
[x] Implement frozen current-schema productionNetworkPolicy with SSRF-safe deny list, HTTPS/443-only egress, and runtime-guard regression (declarative policy does not itself dial or resolve DNS)
[x] Define AiProviderNetworkPolicy: provider, allowedEndpoints, requireApiKeyCapability, dataCategories, auditRequired, prompt/privacy controls
[x] Define immutable OPENAI_POLICY const and regression (declarative only; no credential or network authority)
[x] Define GovernedNetworkRuntime interface: policy, validate(), request() (plus validateDestination/validateTlsRequirement/validateCapability per README) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Define SafeHttpRequestInput: destination, method, headers, body?, timeoutMs, capability (+ path, per README) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Define SafeHttpResponse: status, headers, body, destination (+ receivedAt, durationMs, per README) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Implement validateDestination(destination, policy): NetworkDiagnostic[] (exact host/protocol/port allow rule required; deny beats allow; '*' never matches; SSRF via guardOutboundHost; raw sockets 004) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Implement validateTlsRequirement(destination, policy): NetworkDiagnostic[] (https/tls only under a TLS policy or tlsRequired destination) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Implement validateCapability(capability, policy): NetworkDiagnostic[] (NetworkPolicy has no grants, so an explicit `granted` list is a third argument defaulting to none: deny unless granted; owner may revisit) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Implement safeHttpRequest(input, runtime): Promise<SafeHttpResponse> (never dials: validates then delegates to runtime.request; package checks always run and a runtime's own validators can only refuse more; method/path/timeout/header/query-secret checks; malformed or redirected response refused; rate-limit and audit-evidence hooks not added) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Define WebhookVerificationConfig: secret, algorithm, headerName, timestampHeader?, maxAgeSeconds (sha256 only, secret >= 32 bytes, maxAgeSeconds 1..600) -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Define WebhookVerificationResult: valid, reason?, diagnostics[] -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Implement verifyWebhookHmac(payload, signature, config): WebhookVerificationResult (dependency-free HMAC-SHA256 cross-checked with node:crypto; constant-time compare; timestamp bound into the MAC when timestampHeader is set) -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Implement validateWebhookTimestamp(timestamp, maxAgeSeconds): WebhookVerificationResult (takes an explicit nowSeconds: no clock is chosen here; future timestamps refuse) -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Bound webhook helper work to 1 MiB payloads and 4,096 UTF-8-byte secrets; refuse over-limit or malformed runtime inputs before HMAC/replay admission. HTTP adapters must enforce the payload cap during body reads because helper-level checks cannot undo an upstream allocation -- src/webhook.ts, tests/webhook-verification.test.mjs (Codex 2026-10-05)
[x] Define canonical ReplayStore interface: has(key: string): Promise<boolean> | boolean, put(key: string, ttlSeconds: number): Promise<void> | void
[x] Implement validateReplayProtection(id, store): Promise<NetworkDiagnostic[]> (store is AtomicAdmissionStore: one atomic claim, never read-then-write; fails closed on store errors) -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Define canonical IdempotencyRecord and IdempotencyStore interfaces; storage, clock, and ordering semantics remain runtime-owned
[!] Reconcile observational IdempotencyStore get/put with the app-kernel atomic
    IdempotencyStore.seen gate before wiring; never implement admission as an
    unprotected read-then-write pair
[x] Implement validateIdempotency(key, store): Promise<NetworkDiagnostic[]> (atomic claim in its own scope; not wired to app-kernel, the [!] reconciliation row above stays open) -- src/webhook.ts, tests/webhook-verification.test.mjs (Grok 2026-10-05)
[x] Implement validateAiPrompt(prompt, policy): NetworkDiagnostic[] (heuristic, fail-closed: byte cap 007, secret-shaped 006, e-mail/phone 006; bounded linear-time patterns with a ReDoS regression) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Define NetworkDiagnostic: code, message, severity, destination? (exists at src/index.ts:29-34
    as { code, severity, message, path? }; `path` is used in place of `destination`. Ticked 2026-09-29, Grok Bot)
[x] Define NetworkPolicyReport with schemaVersion "galerina.network.report.v1" (TODO id kept over the README draft "galerina.network.policy.report.v1"; generatedAt passed in; webhook secrets stripped) -- src/reports/network-policy-report.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[x] Define FUNGI-NETWORK-001 through FUNGI-NETWORK-008 diagnostic codes -- src/diagnostics/network-codes.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05). Existing Galerina_NETWORK_* policy diagnostics are unchanged.
[ ] Create internal dir: policy/, runtime/, webhook/, reports/, diagnostics/ (2026-10-05: runtime/, reports/, diagnostics/ exist for the new contracts; moving the existing policy and webhook code is left so the frozen RD-0361 fixtures and imports stay stable)
[x] Implement deny-by-default rule (FUNGI-NETWORK-001 for undeclared destinations; stays 001 even under defaultEffect "allow", owner may revisit) -- src/runtime/governed-network.ts, tests/governed-network-runtime.test.mjs (Grok 2026-10-05)
[ ] Integrate with boundary checker for FUNGI-BOUNDARY-008 (network allowlist violation)
```
