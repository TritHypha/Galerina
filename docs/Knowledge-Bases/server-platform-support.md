# Server Platform Support

## Status

```
Status: Active — platform tier decisions
Scope:  Linux/container (Tier 1), bare metal (Tier 2), Windows/IIS (Tier 3),
        shared hosting (Tier 4), serverless (Tier 5)
See also: galerina-core-network-governance.md, quiet-runtime-secure-defaults.md, bootstrap-runtime-roadmap.md
```

## Principle

Galerina targets **Linux first** but not Linux-only. Its security model lives inside Galerina itself — not inside the web server or reverse proxy configuration.

```text
Galerina should run behind any serious server,
but its security model must live inside Galerina itself.
```

## Platform Tiers

### Tier 1 — Primary Target

**Linux + container + Galerina API server**

Best distributions:

```text
Ubuntu Server LTS
Debian
AlmaLinux / Rocky Linux
Fedora Server
Amazon Linux
```

Container targets:

```text
Docker
Podman
Kubernetes
```

Recommended production model:

```text
Galerina app -> container -> Linux host -> reverse proxy
```

Benefits: repeatable deployment, clear permissions, resource limits, network isolation, audit-friendly setup.

### Tier 2

Linux bare metal or VM service.

### Tier 3

Windows Server behind IIS reverse proxy.

IIS provides: TLS termination, reverse proxy, Windows auth integration, request forwarding, process management.

Galerina still enforces: route allow-list, typed request validation, rate limits, auth policy, permission checks, secret-safe errors, deny-by-default behaviour.

### Tier 4

Shared hosting / PHP-style hosting. Not an early optimisation target.

### Tier 5

Serverless / edge runtime. Future target.

## Best Architecture

```text
Internet
  -> reverse proxy (Nginx, Caddy, Apache, IIS, Cloudflare Tunnel, AWS ALB)
  -> Galerina API server
  -> Secure App Kernel
  -> typed handlers
```

## Key Rule

Galerina must assume the server may be misconfigured. Even if `.htaccess`, IIS rules, or Nginx config are wrong, Galerina must still deny:

```text
.env
source files
core files
private config
internal routes
build artifacts
logs
secrets
debug reports
```

## v1 Recommendation

```text
Linux first
container first
reverse-proxy friendly
Windows/IIS compatible later
never dependent on web-server config for core security
```
