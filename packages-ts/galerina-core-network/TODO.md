# Galerina Core Network TODO

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
[ ] Upgrade NetworkDestinationReference: add provider, category, dataCategories
[ ] Upgrade NetworkPolicy: add default (allow|deny), allowPlainHttp, aiProviders[], requireTimeouts, requireRateLimits
[x] Implement frozen current-schema productionNetworkPolicy with SSRF-safe deny list, HTTPS/443-only egress, and runtime-guard regression (declarative policy does not itself dial or resolve DNS)
[x] Define AiProviderNetworkPolicy: provider, allowedEndpoints, requireApiKeyCapability, dataCategories, auditRequired, prompt/privacy controls
[x] Define immutable OPENAI_POLICY const and regression (declarative only; no credential or network authority)
[ ] Define GovernedNetworkRuntime interface: policy, validate(), request()
[ ] Define SafeHttpRequestInput: destination, method, headers, body?, timeoutMs, capability
[ ] Define SafeHttpResponse: status, headers, body, destination
[ ] Implement validateDestination(destination, policy): NetworkDiagnostic[]
[ ] Implement validateTlsRequirement(destination, policy): NetworkDiagnostic[]
[ ] Implement validateCapability(capability, policy): NetworkDiagnostic[]
[ ] Implement safeHttpRequest(input, runtime): Promise<SafeHttpResponse>
[ ] Define WebhookVerificationConfig: secret, algorithm, headerName, timestampHeader?, maxAgeSeconds
[ ] Define WebhookVerificationResult: valid, reason?, diagnostics[]
[ ] Implement verifyWebhookHmac(payload, signature, config): WebhookVerificationResult
[ ] Implement validateWebhookTimestamp(timestamp, maxAgeSeconds): WebhookVerificationResult
[x] Define canonical ReplayStore interface: has(key: string): Promise<boolean> | boolean, put(key: string, ttlSeconds: number): Promise<void> | void
[ ] Implement validateReplayProtection(id, store): Promise<NetworkDiagnostic[]>
[x] Define canonical IdempotencyRecord and IdempotencyStore interfaces; storage, clock, and ordering semantics remain runtime-owned
[!] Reconcile observational IdempotencyStore get/put with the app-kernel atomic
    IdempotencyStore.seen gate before wiring; never implement admission as an
    unprotected read-then-write pair
[ ] Implement validateIdempotency(key, store): Promise<NetworkDiagnostic[]>
[ ] Implement validateAiPrompt(prompt, policy): NetworkDiagnostic[]
[ ] Define NetworkDiagnostic: code, message, severity, destination?
[ ] Define NetworkPolicyReport with schemaVersion "galerina.network.report.v1"
[ ] Define FUNGI-NETWORK-001 through FUNGI-NETWORK-008 diagnostic codes
[ ] Create internal dir: policy/, runtime/, webhook/, reports/, diagnostics/
[ ] Implement deny-by-default rule (FUNGI-NETWORK-001 for undeclared destinations)
[ ] Integrate with boundary checker for FUNGI-BOUNDARY-008 (network allowlist violation)
```
