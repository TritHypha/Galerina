# Galerina Core Network: Governance Model

## Package

```text
packages-galerina/galerina-core-network
```

`galerina-core-network` defines the governance-first network policy model for Galerina. It does not implement a full HTTP framework, TLS stack, DNS resolver, socket driver, firewall, vendor SDK or API server. Its job is to describe and validate whether network communication is allowed before traffic occurs.

The core rule is:

```text
network request -> declared capability -> destination validation -> TLS and policy checks -> governed request -> audit/report evidence
```

Network I/O is treated as a governed capability, not an ambient runtime privilege.

## Governance Principles

Network behavior must be:

```text
policy-governed
capability-controlled
deny-by-default
runtime-validated
secret-safe
audit-ready
AI-aware
SSRF-resistant
```

The runtime must be able to answer:

```text
who initiated the request
which capability allowed it
which destination was contacted
which policy approved it
which data categories were sent
whether TLS was required
whether the request was denied
which diagnostic explains the decision
```

The runtime must never allow:

```text
silent outbound traffic
undeclared network effects
wildcard production egress
hidden AI provider calls
plaintext fallback in production
raw socket access by default
secrets in URLs or logs
metadata-service SSRF
```

## Relationship to Other Packages

```text
galerina-core-network
  network policy contracts, destination allowlists, governed request types, network diagnostics and reports

galerina-core-security
  capability decisions, permission primitives, secret redaction, secret-safe sink policy

galerina-core-config
  environment-aware policy loading and runtime configuration

galerina-core-runtime
  runtime execution and enforcement hooks

galerina-core-compiler
  network effect and boundary validation

galerina-framework-api-server
  HTTP server implementation and request parsing

galerina-framework-app-kernel
  application request lifecycle and app policy enforcement
```

## NetworkProtocol

`quic` is included as a governed protocol option for HTTP/3 and modern edge transport planning.

```ts
export type NetworkProtocol =
  | "http"
  | "https"
  | "tcp"
  | "udp"
  | "grpc"
  | "websocket"
  | "quic"
```

## NetworkDestinationReference

A network destination is a stable governance reference, not an arbitrary URL string.

```ts
export interface NetworkDestinationReference {
  name: string
  protocol: NetworkProtocol
  host: string
  port?: number
  tlsRequired: boolean
  provider?: string
  category?: "ai" | "payment" | "analytics" | "internal" | "public" | "webhook" | "database" | "custom"
  dataCategories?: string[]
}
```

Example:

```json
{
  "name": "openai-api",
  "protocol": "https",
  "host": "api.openai.com",
  "port": 443,
  "tlsRequired": true,
  "provider": "openai",
  "category": "ai",
  "dataCategories": ["prompt", "metadata"]
}
```

## NetworkPolicy

`NetworkPolicy` is the central allow/deny contract.

```ts
export interface NetworkPolicy {
  default: "allow" | "deny"
  allowDestinations: NetworkDestinationReference[]
  denyDestinations: string[]
  requireTls: boolean
  allowRawSockets: boolean
  allowPlainHttp: boolean
  aiProviders: AiProviderNetworkPolicy[]
  requireTimeouts: boolean
  requireRateLimits: boolean
}
```

Production policy should always use deny-by-default behavior.

```ts
export const productionNetworkPolicy: NetworkPolicy = {
  default: "deny",
  requireTls: true,
  allowRawSockets: false,
  allowPlainHttp: false,
  requireTimeouts: true,
  requireRateLimits: true,
  denyDestinations: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.azure.internal"
  ],
  allowDestinations: [],
  aiProviders: []
}
```

## SSRF-Safe Defaults

Always deny these destinations unless a specialised non-production test policy explicitly overrides them:

```text
localhost
127.0.0.1
0.0.0.0
::1
169.254.169.254
metadata.google.internal
metadata.azure.internal
internal admin endpoints
unknown wildcard destinations
```

This protects cloud metadata services, loopback services and internal-only administrative endpoints from accidental server-side request forgery.

## AiProviderNetworkPolicy

AI provider traffic must be explicit and auditable.

```ts
export interface AiProviderNetworkPolicy {
  provider: string
  allowedEndpoints: string[]
  requireApiKeyCapability: string
  dataCategories: string[]
  auditRequired: boolean
  allowSecretsInPrompt: boolean
  allowPii: boolean
  allowedRegions?: string[]
  maxPromptBytes?: number
  requireRedaction: boolean
}
```

```ts
export const OPENAI_POLICY: AiProviderNetworkPolicy = {
  provider: "openai",
  allowedEndpoints: ["api.openai.com"],
  requireApiKeyCapability: "OpenAiApiKey",
  dataCategories: [],
  auditRequired: true,
  allowSecretsInPrompt: false,
  allowPii: false,
  allowedRegions: ["eu-west"],
  maxPromptBytes: 1024 * 1024,
  requireRedaction: true
}
```

AI calls must not silently send prompts, secrets, credentials or personal data to unknown providers.

## GovernedNetworkRuntime

The governed runtime validates destination, TLS, capability and request shape before allowing network I/O.

```ts
export interface GovernedNetworkRuntime {
  policy: NetworkPolicy
  validate(destination: NetworkDestinationReference): NetworkDiagnostic[]
  validateDestination(destination: NetworkDestinationReference): NetworkDiagnostic[]
  validateTlsRequirement(destination: NetworkDestinationReference): NetworkDiagnostic[]
  validateCapability(capability: string): NetworkDiagnostic[]
  request(input: SafeHttpRequestInput): Promise<SafeHttpResponse>
}
```

## SafeHttpRequest Types

```ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface SafeHttpRequestInput {
  destination: NetworkDestinationReference
  method: HttpMethod
  path: string
  headers?: Record<string, string>
  body?: unknown
  timeoutMs: number
  capability: string
}

export interface SafeHttpResponse {
  status: number
  headers: Record<string, string>
  body: unknown
  destination: NetworkDestinationReference
  receivedAt: string
  durationMs: number
}
```

## validateDestination()

```ts
export function validateDestination(
  destination: NetworkDestinationReference,
  policy: NetworkPolicy
): NetworkDiagnostic[]
```

Validation rules:

```text
explicit deny list wins
host must not be an SSRF-protected destination
allowlist must match host and protocol when default is deny
wildcard production egress is forbidden
unknown AI providers are denied
```

## validateTlsRequirement()

```ts
export function validateTlsRequirement(
  destination: NetworkDestinationReference,
  policy: NetworkPolicy
): NetworkDiagnostic[]
```

Validation rules:

```text
production policy requires TLS
plain HTTP is denied unless explicitly allowed
TLS-required destinations must use TLS-capable protocols
plaintext fallback is denied
```

## validateCapability()

```ts
export function validateCapability(
  capability: string,
  policy: NetworkPolicy
): NetworkDiagnostic[]
```

A network request must declare the capability that allows it. The capability can be evaluated against the surrounding `galerina-core-security` permission model and the runtime policy.

## safeHttpRequest()

```ts
export async function safeHttpRequest(
  input: SafeHttpRequestInput,
  runtime: GovernedNetworkRuntime
): Promise<SafeHttpResponse>
```

`safeHttpRequest()` must combine:

```text
destination validation
TLS validation
capability validation
timeout validation
rate-limit requirement checks
secret-safe header handling
audit evidence creation
```

If any validation emits an error, the request is denied before transport is attempted.

## WebhookVerificationConfig

Webhook verification belongs to the network governance boundary because inbound webhook traffic is a network trust transition.

```ts
export interface WebhookVerificationConfig {
  provider: "stripe" | "github" | "clerk" | "custom"
  signatureHeader: string
  algorithm: "sha256" | "sha512" | "hmac-sha256"
  headerName?: string
  timestampHeader?: string
  maxAgeSeconds?: number
  maxTimestampAgeSeconds?: number
  requireTimestamp: boolean
  requireRawBody: boolean
  requireReplayProtection: boolean
}

export interface WebhookVerificationResult {
  verified: boolean
  valid?: boolean
  timestampValid: boolean
  signatureValid: boolean
  replayDetected: boolean
  reason?: string
  diagnostics: NetworkDiagnostic[]
}
```

Webhook verification must use constant-time signature comparison when comparing HMAC values.

## ReplayStore

```ts
export interface ReplayStore {
  has(key: string): Promise<boolean>
  put(key: string, ttlSeconds: number): Promise<void>
  insertOnce?(id: string, expiresAt: Date): Promise<boolean>
}

export async function validateReplayProtection(input: {
  replayStore: ReplayStore
  replayKey: string
  ttlSeconds: number
}): Promise<NetworkDiagnostic[]>
```

Replay protection should reject duplicate webhook or callback events within the configured time window.

## IdempotencyStore

```ts
export interface IdempotencyStore {
  has(idempotencyKey: string): Promise<boolean>
  put(idempotencyKey: string, ttlSeconds: number): Promise<void>
  getOrSet?(key: string, value: string): Promise<string>
}

export async function validateIdempotency(input: {
  store: IdempotencyStore
  key: string
  ttlSeconds: number
}): Promise<NetworkDiagnostic[]>
```

Idempotency protects retry-safe outbound and inbound request handling.

## validateAiPrompt()

```ts
export function validateAiPrompt(
  prompt: string,
  policy: AiProviderNetworkPolicy
): NetworkDiagnostic[]
```

Validation rules:

```text
prompt size must respect maxPromptBytes
secrets are denied unless explicitly allowed
PII is denied unless explicitly allowed
redaction is required when policy requires it
provider endpoint must be approved
AI traffic must be auditable when auditRequired is true
```

## NetworkDiagnostic

```ts
export interface NetworkDiagnostic {
  code:
    | "SPORE-NETWORK-001"
    | "SPORE-NETWORK-002"
    | "SPORE-NETWORK-003"
    | "SPORE-NETWORK-004"
    | "SPORE-NETWORK-005"
    | "SPORE-NETWORK-006"
    | "SPORE-NETWORK-007"
    | "SPORE-NETWORK-008"
  severity: "error" | "warning" | "info"
  message: string
  destination?: string
  capability?: string
  suggestion?: string
}
```

## Diagnostic Codes

| Code | Meaning |
| --- | --- |
| `SPORE-NETWORK-001` | undeclared network destination |
| `SPORE-NETWORK-002` | capability missing for network operation |
| `SPORE-NETWORK-003` | insecure transport denied |
| `SPORE-NETWORK-004` | raw socket denied |
| `SPORE-NETWORK-005` | destination not allowlisted |
| `SPORE-NETWORK-006` | secret flow to unapproved destination |
| `SPORE-NETWORK-007` | AI provider not approved |
| `SPORE-NETWORK-008` | runtime network policy unavailable, replay/idempotency violation or governance metadata missing |

## NetworkPolicyReport

```ts
export interface NetworkPolicyReport {
  schemaVersion: "galerina.network.policy.report.v1"
  generatedAt: string
  policy: NetworkPolicy
  validatedDestinations: NetworkDestinationReference[]
  deniedDestinations: string[]
  diagnostics: NetworkDiagnostic[]
  webhookPolicies: WebhookVerificationConfig[]
}
```

Reports should be safe for logs, build artefacts and AI-readable project context. They must not contain raw secrets, credentials, tokens or unredacted request bodies.

## Internal File Layout

```text
packages-galerina/galerina-core-network/src/

  policy/
    network-protocol.ts
    network-destination-reference.ts
    network-policy.ts
    ai-provider-policy.ts

  runtime/
    governed-network-runtime.ts
    safe-http-request.ts
    validate-destination.ts
    validate-tls-requirement.ts
    validate-capability.ts

  webhook/
    webhook-verification-config.ts
    verify-webhook-hmac.ts
    validate-webhook-timestamp.ts
    replay-store.ts
    validate-replay-protection.ts
    idempotency-store.ts
    validate-idempotency.ts

  reports/
    network-policy-report.ts

  diagnostics/
    network-diagnostics.ts
```

## Final Rule

```text
galerina-core-network defines network contracts.
galerina-core-security decides permissions and secret safety.
galerina-framework-app-kernel enforces application policy.
galerina-framework-api-server serves HTTP.
galerina-tools-benchmark measures network behavior.
```
