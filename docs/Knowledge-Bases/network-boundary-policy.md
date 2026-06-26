# Network Boundary Policy

## Status

```
Status: Active — governing policy
Scope:  TCP/UDP port policy, boot network declarations, named boundaries
See also: galerina-core-network-governance.md, layered-rate-limits.md, deny-by-default-risk-features.md
```

## Definition

Galerina treats TCP/UDP network access as **runtime network policy** — not normal application logic. Ports are closed and protocols denied by default. Only declared listeners may open network boundaries.

```text
Ports closed by default.
Protocols denied by default.
Only declared listeners may open network boundaries.
```

## Separation of Layers

```text
TCP/UDP port policy  = what can connect to the runtime
HTTP routes          = what the app allows after connection
permissions          = what code may do
```

These are distinct concerns at distinct layers. Application routes cannot substitute for network policy.

## Boot Network Policy Example

```galerina
boot main {
  network policy {
    default deny

    allow tcp port 80 purpose http
    allow tcp port 443 purpose https

    deny udp all
  }
}
```

## Named Network Boundary

Routes can explicitly attach to a named network boundary:

```galerina
network boundary WebServer {
  protocol tcp
  ports [80, 443]
  tls required on 443
  default deny
}

route GET "/hello" {
  boundary WebServer
  request Hello.get
  response Hello.response
  flow sayHello
}
```

## Network Silence

To reduce fingerprinting:

```galerina
network policy {
  default deny
  allow tcp port 443 purpose https
  deny server_banner
  deny verbose_tls_info
}
```

## Core Principle

```text
Firewall/network boundary protects entry.
Route declares application intent.
Permission grants authority.
```

All three layers work together but are governed independently.
