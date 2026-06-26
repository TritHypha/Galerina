# Galerina Core Network

`galerina-core-network` is the package for Galerina network governance, destination policy, transport validation, AI-provider network control and audit-safe network contracts.

## Coverage Reconciliation Status

This package owns the canonical v0.2 network and webhook contracts referenced by
`docs/COVERAGE.md`.

Current canonical choices:

```text
NetworkProtocol = "http" | "https" | "tcp" | "udp" | "grpc" | "websocket" | "quic"
WebhookVerificationConfig.secret: string | Uint8Array
ReplayStore.has(key) / put(key, ttlSeconds)
IdempotencyStore.get(key) / put(IdempotencyRecord, ttlSeconds?)
```

Older `ws`/`wss`, `sharedSecret`, `exists/save` and `has/store` wording is
legacy or adapter-specific unless explicitly mapped to these package contracts.

It belongs in:

```text
/packages-galerina/galerina-core-network
```

## Position

Galerina does not claim to make Ethernet hardware faster.

Galerina's responsibility is governed network behavior:

```text
typed network APIs
deny-by-default network permissions
TLS and certificate policy
mutual TLS and service identity policy
secret-safe networking
AI-provider governance
runtime-aware destination validation
network audit evidence
safe retry and idempotency contracts
```

The package defines policy and validation contracts. It does not own:

```text
HTTP framework behavior
TLS implementation
DNS resolver implementation
kernel networking drivers
vendor SDK bindings
firewall products
application route handlers
```

`galerina-framework-api-server` owns HTTP server behavior.
`galerina-framework-app-kernel` owns request lifecycle enforcement.
`galerina-core-security` owns permission and secret-safe sink policy.

## Governance Model

Networking is a governed runtime capability.

The runtime must always know:

```text
which destination was contacted
which capability allowed it
which policy approved it
whether TLS was required
which AI provider was used
which diagnostics explain the decision
```

Governance rules:

```text
policy-governed
capability-controlled
runtime-validated
auditable
AI-aware
deny-by-default
SSRF-safe
```

## Core Governance Types

### NetworkProtocol + quic

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

### NetworkDestinationReference

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

### NetworkPolicy

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

### productionNetworkPolicy (SSRF-safe)

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

Always deny:

```text
metadata services
loopback addresses
internal admin endpoints
wildcard production egress
unknown AI providers
```

## AI Provider Governance

### AiProviderNetworkPolicy

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

### OPENAI_POLICY

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

AI systems must not silently exfiltrate prompts, secrets or personal data.

## GovernedNetworkRuntime

```ts
export interface GovernedNetworkRuntime {
    policy: NetworkPolicy

    validate(
        destination: NetworkDestinationReference
    ): NetworkDiagnostic[]

    validateDestination(
        destination: NetworkDestinationReference
    ): NetworkDiagnostic[]

    validateTlsRequirement(
        destination: NetworkDestinationReference
    ): NetworkDiagnostic[]

    validateCapability(
        capability: string
    ): NetworkDiagnostic[]

    request(
        input: SafeHttpRequestInput
    ): Promise<SafeHttpResponse>
}
```

## SafeHttpRequest Types

```ts
export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"

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

## Validation Helpers

```ts
export function validateDestination(
    destination: NetworkDestinationReference,
    policy: NetworkPolicy
): NetworkDiagnostic[]

export function validateTlsRequirement(
    destination: NetworkDestinationReference,
    policy: NetworkPolicy
): NetworkDiagnostic[]

export function validateCapability(
    capability: string,
    policy: NetworkPolicy
): NetworkDiagnostic[]
```

Validation must reject:

```text
undeclared destinations
SSRF targets
plaintext production traffic
missing capabilities
unknown AI providers
wildcard production egress
```

## safeHttpRequest()

```ts
export async function safeHttpRequest(
    input: SafeHttpRequestInput,
    runtime: GovernedNetworkRuntime
): Promise<SafeHttpResponse>
```

`safeHttpRequest()` combines:

```text
destination validation
TLS validation
capability validation
timeout checks
rate-limit policy checks
secret-safe header handling
audit evidence generation
```

## Webhook Security Contracts

See full specification: `docs/Knowledge-Bases/galerina-core-network-webhook.md`

### WebhookVerificationConfig (v0.2)

```ts
export interface WebhookVerificationConfig {
    /** Human-readable provider name. Used in reports; never log the secret. */
    provider: string

    /** Shared signing secret — string or raw bytes. */
    secret: string | Uint8Array

    /** HMAC algorithm. Default: "sha256". */
    algorithm?: "sha256" | "sha384" | "sha512"

    /** Header containing the HMAC signature (e.g. x-hub-signature-256). */
    signatureHeader: string

    /** Optional header containing a provider timestamp. */
    timestampHeader?: string

    /** Optional header containing a delivery or event ID. */
    deliveryIdHeader?: string

    /** Prefix stripped from the signature value (e.g. "sha256="). */
    signaturePrefix?: string

    /** Maximum allowed clock skew in seconds. Default: 300. */
    toleranceSeconds?: number

    /** Encoding of the received signature. */
    signatureEncoding?: "hex" | "base64" | "base64url"

    /** Separator used when provider signs timestamp + body together. */
    signedPayloadSeparator?: string
}
```

Webhook verification must use constant-time signature comparison.

### ReplayStore

```ts
export interface ReplayStore {
    has(key: string): Promise<boolean> | boolean
    put(key: string, ttlSeconds: number): Promise<void> | void
}
```

### IdempotencyRecord and IdempotencyStore (v0.2)

```ts
export interface IdempotencyRecord {
    key: string
    provider: string
    status: "processing" | "processed" | "failed"
    createdAtMs: number
    expiresAtMs?: number
}

export interface IdempotencyStore {
    get(key: string): Promise<IdempotencyRecord | undefined> | IdempotencyRecord | undefined
    put(record: IdempotencyRecord, ttlSeconds?: number): Promise<void> | void
}
```

### Validation Functions

```ts
// verifyWebhookHmac(VerifyWebhookHmacInput): VerifyWebhookHmacResult
// validateWebhookTimestamp(ValidateWebhookTimestampInput): ValidateWebhookTimestampResult
// validateReplayProtection(ValidateReplayProtectionInput): Promise<ValidateReplayProtectionResult>
// validateIdempotency(ValidateIdempotencyInput): Promise<ValidateIdempotencyResult>
```

## validateAiPrompt()

```ts
export function validateAiPrompt(
    prompt: string,
    policy: AiProviderNetworkPolicy
): NetworkDiagnostic[]
```

Prompt validation should enforce:

```text
prompt size policy
secret restrictions
PII restrictions
provider allowlists
redaction requirements
audit requirements
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

## Diagnostic Codes (SPORE-NETWORK-001–008)

| Code | Meaning |
| --- | --- |
| `SPORE-NETWORK-001` | undeclared network destination |
| `SPORE-NETWORK-002` | capability missing for network operation |
| `SPORE-NETWORK-003` | insecure transport denied |
| `SPORE-NETWORK-004` | raw socket denied |
| `SPORE-NETWORK-005` | destination not allowlisted |
| `SPORE-NETWORK-006` | secret flow to unapproved destination |
| `SPORE-NETWORK-007` | AI provider not approved |
| `SPORE-NETWORK-008` | runtime network policy unavailable, replay violation or governance metadata missing |

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
galerina-core-security decides permissions and secret-safe policy.
galerina-framework-app-kernel enforces app policy.
galerina-framework-api-server serves HTTP.
galerina-tools-benchmark measures network behavior.
```
