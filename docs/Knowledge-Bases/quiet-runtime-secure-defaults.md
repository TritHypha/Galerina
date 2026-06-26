# Quiet Runtime and Secure Defaults

## Definition

The **Quiet Runtime** principle means Galerina's web runtime actively hides its identity, only exposes declared routes, and protects core files — regardless of web server configuration.

```text
Remain quiet.
Deny by default.
Expose only declared routes.
```

Security must not depend entirely on web server configuration (Apache, Nginx, .htaccess).

## 1. Quiet Runtime Mode

Galerina must not leak:

```text
Galerina version
runtime version
server framework
package names
stack traces
file paths
debug headers
powered-by headers
default error pages
```

```galerina
boot main {
  web security {
    quiet true
    hide runtime_version
    hide server_signature
    hide stack_trace
    hide file_paths
    remove header "X-Powered-By"
  }
}
```

## 2. Route Allow-List Only

Only declared routes are reachable. Everything else returns `404` or `403`.

```text
no directory listing
no file serving for undeclared paths
no framework information
```

## 3. Core File Deny by Default

Galerina must never expose internal files — even if the web server is misconfigured:

```text
.env
/config
/boot
/runtime
/vendor
/packages
/src
/tests
/.git
galerina.lock
galerina.policy
main.boot
*.vault
*.key
```

```galerina
boot main {
  web files {
    default deny

    deny path ".env"
    deny path ".git/**"
    deny path "boot/**"
    deny path "runtime/**"
    deny path "src/**"
    deny path "packages/**"
    deny path "galerina.lock"
    deny path "galerina.policy"

    allow public from "public/**"
  }
}
```

## 4. Safe Project Structure

```text
/public        = only exposed folder
/boot          = never web exposed
/runtime       = never web exposed
/src           = never web exposed
/packages      = never web exposed
/.env          = never web exposed
```

```text
Only /public may serve files.
Routes must be explicitly declared.
Everything else is denied.
```

## Secure Runtime Contract

Any official Galerina runtime or framework must guarantee:

```text
deny-by-default routing
quiet headers (no version or server banners)
safe public root
core file protection
safe error handling (no stack traces, no version hints)
rate limiting
request validation
response gating
```

## Language vs Framework Responsibility

| Layer | Responsibility |
|---|---|
| Core language | defines permissions, routes, views, vaults, profiles, governance rules |
| Framework/runtime | implements HTTP, TLS, headers, file serving, route dispatch, rate limiting |

The core language declares: "only declared routes exist."
The framework enforces it at HTTP/TCP/file level.

## Core Principle

```text
The web server may be misconfigured.
Galerina must still refuse to expose undeclared files, routes, or runtime identity.
```

```text
Security must not depend entirely on web server configuration.
```
