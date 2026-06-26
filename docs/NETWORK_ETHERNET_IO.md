# Network and Ethernet I/O

Galerina should not claim to make Ethernet hardware faster.

Ethernet speed is determined by hardware, drivers, network cards, cables,
switches, operating systems and standards. IEEE 802.3 work continues across
200 Gb/s, 400 Gb/s, 800 Gb/s and 1.6 Tb/s Ethernet directions, so Galerina should
be designed for future high-speed networks instead of assuming ordinary 1 Gb/s
or 10 Gb/s servers.

The honest Galerina position is:

```text
Galerina cannot change the physical Ethernet speed.
Galerina cannot make packets invisible.

Galerina can improve how applications use the network:
- fewer copies
- better buffering
- safer protocols
- stricter permissions
- faster packet handling
- better observability
- automatic fallback
- security rules before deployment
```

At code-language level, Galerina cannot stop routers, switches, ISPs, Wi-Fi access
points, cloud providers or attackers on the path from observing that packets
exist. Galerina can make useful packet contents encrypted, authenticated,
permissioned, minimised and auditable.

The safe-networking rule is:

```text
Galerina should not trust the network.
Galerina should assume packets can be observed, copied, delayed, blocked or modified.
Therefore Galerina must encrypt, authenticate, validate, minimise and report network communication.
```

## Package Direction

Core network contracts belong in:

```text
packages-galerina/galerina-core-network/
```

That package should own typed, permissioned and reportable network I/O
contracts. It should not become a full web framework, firewall product, TLS
implementation, DNS resolver, packet driver or DPDK runtime.

Protocol-specific packages can be added later only when they have a clear owner
and boundary:

```text
galerina-core-network       core network policy, profiles and reports
galerina-network-http       optional HTTP protocol client/server contracts
galerina-network-tls        optional TLS policy adapter contracts
galerina-network-dns        optional DNS resolver policy contracts
galerina-network-quic       optional QUIC transport contracts
galerina-network-tcp        optional TCP transport contracts
galerina-network-udp        optional UDP transport contracts
galerina-network-websocket  optional WebSocket contracts
```

For now, `galerina-core-network` is enough.

## Safe Networking

Galerina should deny plaintext networking by default. TLS 1.3 is the baseline
production transport policy for application traffic, and QUIC should be treated
as a secure transport only when its TLS 1.3 security model is active.

Bad default:

```text
http://api.example.com
```

Better Galerina default:

```text
https://api.example.com
```

Production Galerina applications should require:

```text
TLS
certificate validation
hostname validation
no plaintext fallback
no protocol downgrade
no secrets in URLs
no unsafe debug proxying
no unknown outbound hosts
no packet capture unless explicitly approved
safe logging and redaction
generated network security reports
```

For enterprise systems, Galerina should also support:

```text
mutual TLS
service identity
host allowlists
package-level network permissions
application-layer encryption for sensitive payloads
metadata minimisation where possible
```

## Network Runtime Model

Galerina networking should be typed, permissioned and reportable.

```text
network {
    default: deny

    allow outbound https to ["api.example.com"]
    allow inbound https on port 443
    deny http
    deny plaintextTcp
    deny rawSocket
    deny shellNetworkTools
    require tls
    require rateLimits
}
```

The Secure App Kernel and API server packages can consume this policy, but the
policy shape belongs in `galerina-core-network` and the permission enforcement
must integrate with `galerina-core-security`.

Production builds should fail if plaintext transport is used without an
explicit non-production override:

```text
Build failed:
Plain HTTP is not allowed in production.
Route: http://api.example.com
Use HTTPS/TLS.
```

## Network Auto

Galerina should support a `network auto` planning concept similar to `compute
auto`. It chooses the safest available network I/O strategy for the platform.

```text
route "/upload" {
    method: POST
    input: FileUpload

    network auto {
        prefer zeroCopy
        prefer ioUring
        maxBodyMb: 500
        timeoutMs: 30000
        fallback buffered
    }
}
```

Possible runtime choices:

```text
Linux + io_uring available       -> use io_uring-capable backend
Linux + zero-copy send available -> use zero-copy send path
Windows                          -> use IOCP-style backend
macOS                            -> use kqueue-style backend
basic platform                   -> use safe async sockets
unsupported advanced feature     -> use buffered fallback
```

This keeps platform-specific network mechanics out of normal application code.

## Zero-Copy and Buffering

Galerina should support zero-copy networking where available, but it must keep
fallback behavior explicit and safe. Linux supports zero-copy send paths such as
`MSG_ZEROCOPY` for selected socket use cases, and newer Linux work includes
zero-copy receive paths around `io_uring`. These are platform capabilities, not
portable language guarantees.

```text
network io {
    mode: auto
    preferZeroCopy: true
    fallback: buffered
    maxBufferMb: 256
}
```

The intended decision model is:

```text
small request       -> normal buffered I/O
large upload        -> zero-copy if supported and safe
streaming response  -> zero-copy or sendfile-style path where supported
unsupported system  -> safe buffered fallback
```

Zero-copy paths must not bypass validation, auth, rate limits, TLS policy,
redaction rules or backpressure.

## eBPF and XDP

Galerina may support optional eBPF/XDP adapters for advanced edge filtering and
observability. XDP can run programs early in packet processing, before the full
kernel network stack handles the packet.

Use cases:

```text
DDoS filtering
rate limiting
IP allow and deny lists
malformed packet dropping
early protocol filtering
traffic metrics
load balancing
network tracing
```

Example direction:

```text
network edgeFilter {
    target: xdp
    allow tcp ports [443]
    deny privateAdminPorts
    rateLimit ip: "1000/minute"
    drop malformedPackets
    report: true
}
```

XDP/eBPF support is advanced and optional. Normal Galerina apps must not require
kernel packet filters.

## DPDK Adapter

Galerina may support DPDK through a specialist adapter for data-plane systems.
DPDK belongs to packet processing, firewalls, routers, telecom systems, load
balancers, network appliances and custom protocol gateways. It is not a default
web application path.

```text
network target dpdk {
    useFor: ["packet_processing", "firewall", "load_balancer"]
    requireDedicatedCores: true
    requireHugePages: true
    fallback: kernelNetworkStack
}
```

DPDK use must require explicit production policy, host capability checks,
dedicated resource reporting and a fallback plan.

## Protocol-Safe APIs

Galerina should avoid raw untyped protocol strings at application boundaries.

```text
Header<Authorization>
Header<ContentType>
JsonBody<UserLoginSchema>
IpAddress
Port
TlsCertificate
JwtToken
SessionId
```

Example:

```text
route Login {
    method: POST
    path: "/login"

    input: LoginRequest
    output: LoginResponse

    security {
        require tls
        rateLimit: "5/minute/ip"
        denyBodyOver: "32KB"
        redactLogs: ["password"]
    }
}
```

Build-time failures should catch unsafe public routes:

```text
Build failed:
POST /login has no rate limit.

Build failed:
Route /admin allows HTTP without TLS.

Build failed:
Request body has no maximum size.
```

## Network Permissions

Network access should be denied by default.

```text
permissions {
    deny network.any

    allow network.outbound.https to [
        "api.stripe.com",
        "api.company.com"
    ]

    allow network.inbound.http port 8080
}
```

This helps block malicious packages, secret exfiltration, unsafe telemetry,
unexpected remote calls, supply-chain attacks and debug ports left open.

Package-level policy can be narrower:

```text
package imageProcessor {
    allow file.read
    deny network.open
}
```

Runtime behavior should fail closed:

```text
Runtime blocked:
Package imageProcessor attempted network.open to unknown host.
```

## TLS and Certificate Policy

Galerina should require secure transport by default for production networked
applications.

```text
tls {
    require: true
    minVersion: "TLS1.3"
    verifyCertificates: true
    denySelfSignedInProduction: true
    certificatePinning: optional
}
```

Example diagnostics:

```text
Warning:
Development certificate used in production profile.

Build failed:
TLS verification disabled in production.
```

Strict production network profiles should also deny weak ciphers, expired
certificates, hostname-validation bypasses, debug proxies and plaintext
fallback:

```text
production network {
    require tls
    require certificateValidation
    require hostnameValidation
    deny selfSignedCertificates
    deny expiredCertificates
    deny weakCiphers
    deny plaintextFallback
    deny debugProxy
}
```

Protocol downgrade must be blocked by default:

```text
tls {
    minVersion: "TLS1.3"
    allowDowngrade: false
    allowPlaintextFallback: false
}
```

If a dependency tries to downgrade, the runtime should fail closed:

```text
Runtime blocked:
TLS downgrade attempted.
Plaintext fallback is denied by policy.
```

## Mutual TLS and Service Identity

Normal TLS proves the server identity to the client. Mutual TLS proves both
sides: the client proves identity to the server, and the server proves identity
to the client.

```text
service PaymentsApi {
    network {
        require tls
        require mutualTls

        clientCertificate: secret "PAYMENTS_CLIENT_CERT"
        clientKey: secret "PAYMENTS_CLIENT_KEY"

        allowHosts: ["payments.internal.company"]
    }
}
```

Enterprise services should also be able to declare service identity and allowed
internal calls:

```text
service OrdersApi {
    identity: "orders-api"

    allow calls to [
        "payments-api",
        "stock-api"
    ]

    deny calls to [
        "admin-api",
        "secrets-service"
    ]

    require mutualTls
}
```

This prevents services from randomly calling anything on the internal network.

## Application-Layer Encryption

TLS protects traffic between network endpoints. Highly sensitive data may still
pass through load balancers, reverse proxies, gateways, queues, cloud services,
logs or internal services. Galerina should support application-layer encryption
for sensitive payloads when transport encryption is not enough.

```text
payload CustomerRecord {
    encryption: endToEnd
    decryptOnlyAt: "trusted-service.customer-api"
}
```

Intermediate infrastructure can route the payload, but sensitive fields remain
encrypted until they reach the trusted service.

## Metadata Minimisation

Even encrypted traffic exposes some metadata: source IP, destination IP, packet
size, timing, connection frequency, domain names in some cases and traffic
volume. Galerina cannot remove all metadata, but it can reduce avoidable leaks.

```text
network privacy {
    minimiseMetadata: true
    batchSmallMessages: true
    avoidSensitiveDataInUrls: true
    denyQueryStringSecrets: true
}
```

Galerina should block sensitive tokens in URLs:

```text
GET /reset-password?token=secret-token
```

and require a safer shape:

```text
POST /reset-password
body: encrypted/validated payload
```

## Secret-Aware Networking

Secrets must not appear in URLs, logs or unapproved outbound traffic. Headers
that carry credentials must be typed and redacted in reports and logs.

```text
secret API_KEY from env

request ExternalApi {
    method: POST
    url: "https://api.example.com/data"

    headers {
        Authorization: Bearer(API_KEY)
    }

    logging {
        redact headers.Authorization
        redact body.personalData
    }
}
```

Build-time checks should block unsafe secret flows:

```text
Build failed:
Secret API_KEY is used in a URL query string.
Secrets must not be transmitted in URLs.
```

## Backpressure

Galerina should make network backpressure a first-class runtime contract.

```text
stream HttpRequestBody {
    maxInFlightMb: 64
    backpressure: required
    onOverflow: reject
}
```

This helps prevent memory exhaustion, slow-client attacks, queue overload,
unbounded request buffering and crashes under load.

## Raw Socket Restrictions

Raw sockets, packet capture and promiscuous mode are powerful and dangerous.
They should be denied by default.

```text
deny rawSocket
deny packetCapture
deny promiscuousMode
```

Only explicit security or network tooling should request them:

```text
networkTool PacketMonitor {
    allow rawSocket
    allow packetCapture
    require admin
    require auditLog
}
```

## Reports

Galerina should generate network reports that can be inspected before deployment.

```text
app.network-report.json
app.tls-report.json
app.secret-flow-report.json
app.package-network-report.json
app.port-report.json
app.rate-limit-report.json
app.firewall-report.json
app.packet-filter-report.json
app.network-performance-report.json
```

Example:

```json
{
    "network": {
    "plaintextAllowed": false,
    "inboundPorts": [8080],
    "outboundHosts": ["api.company.com"],
    "tlsRequired": true,
    "minimumTlsVersion": "TLS1.3",
    "certificateValidation": "required",
    "secretsInUrls": "denied",
    "rawSockets": "denied",
    "zeroCopy": "available",
    "ioBackend": "io_uring",
    "rateLimits": [
      {
        "route": "POST /login",
        "limit": "5/minute/ip"
      }
    ],
    "warnings": []
  }
}
```

## Network Profiles

Galerina should support deployment-aware network profiles.

```text
networkProfile default
networkProfile webApi
networkProfile lowLatency
networkProfile highThroughput
networkProfile aiCluster
networkProfile edgeGateway
networkProfile firewall
```

Example:

```text
network profile highThroughput {
    prefer ioUring
    prefer zeroCopy
    prefer batching
    prefer connectionReuse
    maxConnections: 100000
    backpressure: required
}
```

For AI clusters:

```text
network profile aiCluster {
    prefer rdma where available
    prefer opticalIo where available
    prefer ethernetScaleOut
    require encryptedControlPlane
    report topology
}
```

This connects network planning with optical I/O and accelerator-cluster
planning without turning those targets into ordinary app syntax.

## Network Benchmarking

Network-aware benchmarks should be owned by `galerina-tools-benchmark`.

```text
Galerina benchmark --network --light
Galerina benchmark --network --full
```

Test areas:

```text
TCP latency
HTTP throughput
TLS handshake cost
zero-copy send
streaming upload
WebSocket throughput
packet filtering overhead
rate limit overhead
JSON API throughput
small packet handling
large payload handling
```

Example report:

```json
{
  "networkBenchmark": {
    "backend": "io_uring",
    "zeroCopySend": true,
    "requestsPerSecond": 82500,
    "p95LatencyMs": 4.8,
    "tlsEnabled": true,
    "bottleneck": "JSON validation"
  }
}
```

## Required Positioning

The short positioning is:

```text
Galerina can be stronger for network and Ethernet I/O by making the network layer
faster through zero-copy, batching and async I/O; safer through deny-by-default
permissions and TLS policy; more reliable through backpressure and timeouts;
more enterprise-ready through reports and deployment profiles; and more
future-ready through XDP, DPDK, optical I/O and AI-cluster networking support.
```

Galerina should understand and govern network movement before the app runs.

## References

- IEEE 802.3 Ethernet Working Group: <https://www.ieee802.org/3/>
- TLS 1.3, RFC 8446: <https://datatracker.ietf.org/doc/html/rfc8446>
- OWASP Transport Layer Security Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html>
- Linux `MSG_ZEROCOPY`: <https://docs.kernel.org/networking/msg_zerocopy.html>
- Linux `io_uring` zero-copy receive: <https://docs.kernel.org/networking/iou-zcrx.html>
- eBPF XDP program type: <https://docs.ebpf.io/linux/program-type/BPF_PROG_TYPE_XDP/>
- Red Hat XDP and eBPF overview: <https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/10/html/configuring_firewalls_and_packet_filters/getting-started-with-xdp-and-ebpf>
- DPDK overview: <https://www.dpdk.org/about/>
- DPDK programmer guide overview: <https://doc.dpdk.org/guides/prog_guide/overview.html>
