# Outbound egress: force-HTTPS boot setting + local-dev loopback exception

**Owner asks (2026-06-27):** "add something in the main/boot settings to force https on http" + "be a bit
smart and not block local development like `http://localhost`." Shipped: `5f73cb2` (force-HTTPS) + the
loopback-dev exception this session. Source of truth: `@galerina/core-config` `resolveEgressTls`
(`packages-galerina/galerina-core-config/src/posture.ts`); enforced at the outbound dial
(`galerina-core-compiler/src/stdlib.ts` `networkAsync`) over the `@galerina/core-network` egress guard.

## Behaviour (fail-secure on every axis)

| Outbound target | Default (no env) | Dev signal* | Production | Plaintext opt-out** |
|---|---|---|---|---|
| `https://public:443` | ✅ allow | ✅ | ✅ | ✅ |
| `https://public:8443` (odd port) | ❌ port denied | ❌ | ❌ | ✅ (ports unlocked) |
| `http://public` (plaintext) | ❌ TLS required | ❌ | ❌ | ✅ |
| `http://localhost:3000` (loopback) | ❌ SSRF | ✅ **allow** | ❌ | ✅ (plaintext) |
| `http://10.0.0.5` / `169.254.169.254` (private/metadata) | ❌ SSRF | ❌ SSRF | ❌ SSRF | ❌ SSRF |

\* **Dev signal** = `NODE_ENV=development` OR `GALERINA_PROFILE=development` OR `GALERINA_ALLOW_LOCALHOST=true`.
Opens **loopback ONLY** (localhost / 127.0.0.0/8 / ::1) — never private LAN, metadata, or link-local — and
**never in production**. A localhost dev server is local IPC, so TLS + port checks are skipped for it.

\** **Plaintext opt-out** = `GALERINA_ALLOW_PLAINTEXT_EGRESS=true` (operator override; relaxes force-HTTPS
entirely — not for production). Surfaced (`relaxed: true`), never silent.

## Why this shape
- **Force-HTTPS** stops payload/credential leakage over plaintext to anything that leaves the machine, and the
  `[443]` port lock is egress filtering against exfiltration to non-web service ports (22/3306/6379/…).
- **Loopback-dev** keeps `http://localhost` working for local development without weakening SSRF for any
  remote target — the most-secure default (deny loopback) holds unless an explicit development signal is present.
- Ordering: the SSRF host-category denial runs FIRST, so a plaintext URL to an internal host is still reported
  as the SSRF finding; force-HTTPS / port checks apply only to an otherwise-allowed PUBLIC host.

## Tests
`galerina-core-network/tests/egress-guard.test.mjs` (guard + allowLoopback) · `galerina-core-config/tests/
egress-tls.test.mjs` (resolveEgressTls) · `galerina-core-compiler/tests/stdlib/force-https-egress.test.mjs`
(dial: force-HTTPS, loopback-dev, fail-secure, production-denies-loopback). Full suite 60/60 · 5,938.

## Follow-up (owner-gated)
Thread the egress policy fully through `StdlibContext`→interpreter→cli for per-route / per-config control +
audit (today it's an env knob + the core-config SoT). See [outstanding-rd-and-todos](galerina-outstanding-rd-and-todos-2026-06-23.md).
