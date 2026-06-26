> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Network v0.2

## Formal Specification — Governance Model, Safe Networking, AI Policy

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-network`.

See also: `galerina-core-network-governance.md` (prior KB).

---

## Core Philosophy

```text
all outbound networking is untrusted by default
```

Every network request must pass:
- destination validation
- capability checks
- protocol checks
- TLS enforcement
- governance policy evaluation

---

## NetworkProtocol

```ts
type NetworkProtocol =
    | "http"
    | "https"
    | "ws"
    | "wss"
    | "grpc"
    | "quic";
```

| Protocol | Purpose               |
| -------- | --------------------- |
| http     | Legacy/insecure       |
| https    | Secure HTTP           |
| ws       | WebSocket             |
| wss      | Secure WebSocket      |
| grpc     | Service RPC           |
| quic     | Low-latency transport |

---

## NetworkDestinationReference

```ts
interface NetworkDestinationReference {
    protocol: NetworkProtocol;

    hostname: string;

    port?: number;

    path?: string;
}
```

---

## TlsRequirement Enum

```ts
enum TlsRequirement {
    Required,
    Optional,
    Forbidden
}
```

| Requirement | Meaning        |
| ----------- | -------------- |
| Required    | TLS mandatory  |
| Optional    | TLS preferred  |
| Forbidden   | TLS prohibited |

---

## Capability Enum

```ts
enum Capability {
    NetworkRead,
    NetworkWrite,
    WebhookReceive,
    AiProviderAccess,
    InternalServiceAccess
}
```

---

## NetworkPolicy

```ts
interface NetworkPolicy {
    allowedProtocols:
        NetworkProtocol[];

    allowedHosts: string[];

    tlsRequirement:
        TlsRequirement;

    capabilities:
        Capability[];

    allowPrivateNetworks: boolean;
}
```

---

## productionNetworkPolicy()

```ts
function productionNetworkPolicy():
    NetworkPolicy {

    return {
        allowedProtocols: [
            "https"
        ],

        allowedHosts: [],

        tlsRequirement:
            TlsRequirement.Required,

        capabilities: [
            Capability.NetworkRead
        ],

        allowPrivateNetworks:
            false
    };
}
```

Production runtimes block access to: localhost, internal metadata
endpoints, RFC1918 private networks, container bridge networks.

---

## SSRF Protection

### validateDestination()

```ts
function validateDestination(
    destination:
        NetworkDestinationReference,

    policy: NetworkPolicy
): boolean {

    if (
        !policy.allowedProtocols
            .includes(
                destination.protocol
            )
    ) {
        return false;
    }

    if (
        destination.hostname ===
            "localhost"
    ) {
        return false;
    }

    return true;
}
```

---

## AI Provider Governance

### AiProviderNetworkPolicy

```ts
interface AiProviderNetworkPolicy
    extends NetworkPolicy {

    provider: string;

    maxPromptSizeBytes: number;

    allowSensitiveData: boolean;
}
```

---

### OPENAI_POLICY

```ts
const OPENAI_POLICY:
    AiProviderNetworkPolicy = {

    provider: "openai",

    allowedProtocols: [
        "https"
    ],

    allowedHosts: [
        "api.openai.com"
    ],

    tlsRequirement:
        TlsRequirement.Required,

    capabilities: [
        Capability.AiProviderAccess
    ],

    allowPrivateNetworks:
        false,

    maxPromptSizeBytes:
        1024 * 1024,

    allowSensitiveData:
        false
};
```

---

### validateAiPrompt()

```ts
function validateAiPrompt(
    prompt: string
): boolean {

    if (
        prompt.includes(
            "PRIVATE_KEY"
        )
    ) {
        return false;
    }

    return true;
}
```

---

## GovernedNetworkRuntime

```ts
class GovernedNetworkRuntime {

    constructor(
        readonly policy:
            NetworkPolicy
    ) {}

    request(
        req: SafeHttpRequest
    ): Promise<Response> {

        validateDestination(
            req.destination,
            this.policy
        );

        return executeRequest(req);
    }
}
```

---

## SafeHttpRequest

```ts
interface SafeHttpRequest {
    method: string;

    destination:
        NetworkDestinationReference;

    headers:
        Record<string, string>;

    body?: unknown;

    capability:
        Capability;
}
```

Every request declares its required `Capability`.

---

## Webhook Verification

### WebhookVerificationConfig

```ts
interface WebhookVerificationConfig {
    algorithm: string;

    headerName: string;

    sharedSecret: string;
}
```

---

## Replay Protection

### ReplayStore

```ts
interface ReplayStore {
    has(id: string): boolean;

    store(id: string): void;
}
```

---

## Idempotency Protection

### IdempotencyStore

```ts
interface IdempotencyStore {
    exists(key: string): boolean;

    save(key: string): void;
}
```

---

## Capability Validation

```ts
function validateCapability(
    request: SafeHttpRequest,
    policy: NetworkPolicy
): boolean {

    return policy.capabilities
        .includes(
            request.capability
        );
}
```

---

## NetworkDiagnostic

```ts
interface NetworkDiagnostic {
    code: string;

    message: string;

    severity: string;
}
```

---

## NetworkPolicyReport

```ts
interface NetworkPolicyReport {
    policy: string;

    allowedRequests: number;

    deniedRequests: number;

    diagnostics:
        NetworkDiagnostic[];
}
```

---

## Diagnostic Codes (v0.2)

| Code           | Meaning                           |
| -------------- | --------------------------------- |
| SPORE-NETWORK-001 | SSRF-protected destination denied |
| SPORE-NETWORK-002 | Sensitive data in AI prompt       |
| SPORE-NETWORK-003 | Missing capability                |
| SPORE-NETWORK-004 | TLS required                      |
| SPORE-NETWORK-005 | Unsupported protocol              |
| SPORE-NETWORK-006 | Replay attack detected            |
| SPORE-NETWORK-007 | Invalid webhook signature         |
| SPORE-NETWORK-008 | Unsafe network boundary           |

---

## File Layout

```text
galerina-core-network/

  policies/
    NetworkPolicy.ts
    AiProviderPolicy.ts     (AiProviderNetworkPolicy, OPENAI_POLICY)
    productionPolicy.ts     (productionNetworkPolicy)

  runtime/
    GovernedNetworkRuntime.ts
    safeHttpRequest.ts
    validation.ts           (validateDestination, validateCapability)

  webhook/
    verification.ts
    ReplayStore.ts
    IdempotencyStore.ts

  diagnostics/
    NetworkDiagnostic.ts
    codes.ts                (SPORE-NETWORK-001–008)

  ai/
    validateAiPrompt.ts
    OPENAI_POLICY.ts
```

---

## Planned v0.3 Features

| Feature                       | Purpose                  |
| ----------------------------- | ------------------------ |
| Distributed Policy Federation | Cluster governance       |
| Mutual TLS Policies           | Service authentication   |
| AI Prompt Sandboxing          | Runtime prompt isolation |
| Dynamic Runtime Policies      | Adaptive governance      |
| Secure Network Replay Proofs  | Cryptographic auditing   |
| Capability Delegation         | Temporary permissions    |
