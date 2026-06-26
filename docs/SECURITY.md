
---

# `docs/SECURITY.md`

```md
# Security

## Security Summary

Galerina's strongest security position is secure web runtime policy. The project
should make permissions, typed API boundaries, package effects, memory-safe
values, secrets, interop, production rules and AI-readable reports visible
before code runs. See `docs/SECURE_WEB_RUNTIME_FIRST.md` for the runtime-first
direction.

## Core Rules

- Treat everything as untrusted by default within reason. External input,
  dependency output, generated AI content, cached data, network data, database
  data, uploaded files, environment-derived values, headers, cookies, tokens,
  runtime metadata and build artifacts must earn trust through validation,
  typing, provenance, policy checks or explicit reviewed boundaries.
- Do not commit secrets.
- Use environment variables for runtime configuration.
- Validate all user input.
- Handle errors safely.
- Avoid exposing internal error details to users.
- Log enough detail for debugging without logging sensitive data.
- Deny file, network, database, shell, AI, GPU and interop effects unless they
  are explicitly declared by package and application policy.
- Deny silent package/module loading. Imports and package references are not
  trust. Packages must be resolved, verified, permissioned, effect-checked and
  linked into Governed IR before use.
- Treat package registry certification as evidence, not unrestricted authority.
  Installed does not mean trusted, and certified does not mean unrestricted.
- Treat raw SQL, raw shell execution, unsafe interop and untrusted
  deserialization as denied-by-default production risks.
- Treat cached execution plans as contextual verified results, not authority.
  A cached plan may be reused only when policy, permission, actor scope, view
  scope, runtime zone, hardware trust, package, vault and audit tags still
  match.
- Treat network access as a security-sensitive capability. Inbound ports,
  outbound hosts, raw sockets, packet capture, promiscuous mode and shell
  network tools must be denied unless declared and reported.
- Require TLS policy, route-level rate limits, timeout policy and backpressure
  for production public network routes unless a reviewed override exists.
- Require routes to have compiled, typed and policy-checked security rules
  before deployment. Route policy must include method/path, typed input/output,
  auth, authorization, CSRF/CORS where relevant, rate limits, resource limits,
  declared effects, response filtering and audit policy.
- Require HTTP responses to have declared status codes, body types, content
  types, cache policy, security headers, cookie policy where relevant and
  safe error exposure policy.
- Require CSRF protection for cookie-authenticated state-changing browser
  routes. State-changing routes must prove user intent through CSRF tokens,
  Fetch Metadata, Origin/Referer checks and SameSite cookie policy unless a
  safe non-cookie auth model explicitly exempts the route.
- Deny state-changing `GET`, `HEAD` and `OPTIONS` routes.
- Require crash boundaries for routes, webhooks, workers and scheduled tasks
  that perform state-changing work, call external systems or handle sensitive
  operations.
- Deny plaintext fallback, silent TLS downgrade, disabled certificate
  validation, disabled hostname validation, debug proxying and secrets in URLs
  for production networked apps.
- Generate security reports that show risky permissions, secret flows, package
  effects, route policy gaps and production overrides.
- Design around security invariants, not isolated exploit patches. Declared
  policy must be part of program meaning, and compiler/runtime reports should
  prove or deny whether flows can expose classified data, use effects, call
  packages, cross boundaries or run unsafe behaviour.

## Default Trust Model

Galerina should use a practical zero-trust baseline:

```text
untrusted until typed
untrusted until validated
untrusted until permissioned
untrusted until provenance is known
untrusted until policy allows it
untrusted until reports can explain it
```

This does not mean every internal value needs expensive runtime checks forever.
It means trust should be earned at clear boundaries and then represented in
types, policies and reports.

At value level, `unsafe` means untrusted rather than memory-unsafe. Unsafe
values must be inert until converted or explicitly declared safe. They must not
be used in arithmetic, string helpers, array helpers, business logic, query
interpolation, shell execution, worker handoff, `GlobalVault` access or runtime
APIs. The approved conversion operations are `validate`, `guard` and
`sanitize`; `encode.*` requires an already-safe input and returns a
context-specific safe output.

Syntax follows the same rule. A syntax form is not trusted merely because it
parses. New syntax must be governed by type contracts, effect declarations,
permissions, policy, diagnostics, source maps, tests or generated reports before
it can be treated as safe.

Monkey patching is denied by default. Galerina must not allow normal source to
modify built-ins, imported package internals, framework methods, runtime
functions, response serializers or security behaviour after load. Behaviour
changes must use explicit adapters, interfaces/protocols, pipelines, test-only
mocks or signed hotfix packages, and must appear in reports.

Examples:

| Source | Default status | How it earns trust |
| --- | --- | --- |
| API request body | Untrusted | Typed request decoding, schema validation, size limits |
| Headers/cookies/tokens | Untrusted | Signature, expiry, issuer, audience and policy checks |
| Proxy headers | Untrusted | Accepted only from declared trusted proxies |
| Network responses | Untrusted | TLS policy, host allowlist, schema validation |
| Database rows | Untrusted-ish | Typed mapping, migration/version checks, validation before sensitive use |
| Dependency output | Untrusted-ish | Package permissions, typed contracts, reportable effects |
| AI/model output | Untrusted | Typed schema validation and deterministic policy review |
| Cache entries | Untrusted-ish | Content hash, version key, TTL, invalidation, sensitive-data denial |
| Build artifacts | Untrusted until verified | Hash/signature, source ref, build report and policy checks |
| Runtime machine facts | Untrusted until detected on target | Capability detection and report metadata |

Trusted boundaries should be narrow, explicit and reviewable. If a module or
adapter is allowed to produce trusted values, it must declare why, what it
validated, what it redacted and what report proves it.

## Security Invariants

Galerina should compile through security-aware IR that carries permissions,
capabilities, classifications, exposure levels, ownership, actor identity,
trust boundaries, side effects, audit requirements, package authority and
isolation requirements.

The following should be denied or gated by default:

- ambient authority
- runtime monkey patching
- hidden behaviour injection
- arbitrary runtime reflection
- dynamic property injection
- runtime type rewriting
- unsafe blocks without explicit capability and audit
- unsigned external plugins or packages in hardened mode
- raw string database queries
- shell execution in hardened mode

Sensitive flows should produce mandatory audit semantics, not optional logs.
Enterprise hardened mode should be able to disable runtime reflection, unsafe
blocks, shell execution, unsigned plugins/packages and nondeterministic server
execution.

## Cache Security

Galerina caches must remember work, not grant trust. Authority Control decides
whether a cached parser result, Governed IR, policy decision, view rule, vault
read, compute plan, schedule lane, audit buffer or verified execution plan can
be reused.

Context-tagged cache entries should miss and reverify when policy, permission,
actor scope, view scope, runtime zone, hardware trust, vault version, package
version, audit level, expiry or revocation state changes.

Secrets, raw private data, authorization decisions, admin decisions, AI outputs,
cross-user responses and hardware trust decisions must not be cached freely.

## Environment Variables

Real environment variables should be stored in `.env`.

Example variables should be stored in `.env.example`.

`.env` values must be treated as secrets. Application code should read them
through declared secret policy and protected secret types, not as ordinary
strings. Secret values must not be logged, cached, sent to AI, returned in
errors, compiled into artifacts, written to reports or sent to undeclared
external hosts.

Secret reports may include names, scopes, required flags, allowed destinations
and fingerprints, but must never include values. See `docs/ENV_SECRETS.md`.

## Input Validation

All external input should be validated before use.

API inputs should decode into strict typed request contracts before application
handler logic runs. Unknown fields, oversized JSON, invalid types and unsafe
payload shapes should fail at the boundary.

Routes should be represented as a compiled security graph, not loose runtime
strings. See `docs/SECURE_FAST_ROUTING.md`.

HTTP responses should be represented as typed response contracts, not raw
objects or mutable header maps. See `docs/SECURE_HTTP_RESPONSES.md`.

## CSRF Protection

Galerina should make CSRF protection a default route policy for browser apps that
use automatic cookie authentication.

Core rule:

```text
Any route that changes state must prove user intent.
```

State-changing methods such as `POST`, `PUT`, `PATCH` and `DELETE` should
require CSRF protection when session cookies or other automatically attached
browser credentials are used. `GET`, `HEAD` and `OPTIONS` routes must not call
state-changing handlers.

Galerina should support synchronizer tokens for stateful apps, signed
double-submit cookies for stateless apps, custom CSRF headers for API-driven
frontends, Fetch Metadata checks, Origin/Referer checks, SameSite cookie
defaults and CSRF report output. CSRF does not replace XSS prevention, auth,
authorization, CORS, rate limits or request validation.

See `docs/CSRF_PROTECTION.md`.

## Error Handling

Errors should be handled in a controlled way.

User-facing errors should be safe and simple.

Internal logs may include more detail, but must not include passwords, API keys or sensitive tokens.

## Crash Handling

Application crashes should cross an explicit crash boundary instead of leaking
raw runtime failures to users. Expected problems should use typed errors such as
`Result<T, E>`. External failures and unexpected crashes should produce
structured, source-mapped and secret-safe reports.

Crash reports and AI-readable crash context must not include raw secrets,
cookies, authorization headers, payment credentials, private customer data or
unredacted request/response payloads. See `docs/APP_CRASH_HANDLING.md`.

## Secrets

The following must never be committed:

- API keys
- Database passwords
- Private keys
- Access tokens
- Production `.env` files

## Core Security Primitives

`packages-galerina/galerina-core-security/` owns reusable security primitives. Redaction
must fail closed by default: malformed rules, oversized inputs or replacements
that can re-emit matched secrets must produce redacted output instead of leaking
raw text. Permission models must deny by default, and matching deny grants must
win over matching allow grants.

`galerina-core-security` also owns protected secret references such as `Secret<T>`
or equivalent metadata-only handles, secret-derived taint tracking, secret
fingerprints, safe sink decisions and report shapes for secret use. The app
kernel and compiler should use those primitives to deny secret flow into logs,
errors, cache, LLM input, build output and undeclared network destinations.

`packages-galerina/galerina-core-logic/` owns `Tri` and `Galerina` semantics used by core
policy checks. `Tri` unknown states must not implicitly convert to `Bool` or
security decisions; callers must choose an explicit conversion policy and should
use `unknown_as_error` or `unknown_as_false` for security-sensitive decisions.

`packages-galerina/galerina-core-compiler/` must catch the same risks before execution when
source text is available. The interim syntax safety scan reports direct Tri
branch conditions, implicit Tri/Decision/Bool conversions, non-exhaustive Tri
matches, risky `unknown_as: true` use in secure flows, raw secret-like literals
and unsafe dynamic execution patterns.

NPM and `package.json` are host tooling only in this beta. Galerina package graph
selection, runtime profiles, compiler target policy and production package
overrides must not be hidden inside host manifests. Use the future
`package-galerina.json`/`Galerina.lock.json` boundary for Galerina packages once those schemas are
implemented.

The governed Package Resolver should check identity, version, lockfile,
hash/signature, source registry, declared capabilities, declared effects,
licence/policy, trusted status, dependency graph and conflicts before loading or
linking a package. Dynamic package loading should be denied by default in
production and routed through Authority Control when a profile explicitly
allows it.

The Certified Package Registry should publish package evidence including
publisher, signature, approved version, capabilities requested, effects used,
runtime targets, audit requirements, risk rating, security review status and
certification level. Production policy may deny uncertified packages and require
verified/certified/enterprise/regulated levels where appropriate.

## AI Inference

AI model output is untrusted by default.

AI output must not directly approve security, payment, access-control or other
high-impact decisions. Route AI output through deterministic application policy
before taking action.

Local AI inference packages such as `galerina-ai-lowbit` must use declared model paths,
memory limits, context limits, output token limits, thread limits and timeouts.
Prompts and reports must be redacted before logging when they may contain
secrets or user-sensitive data.

AI-readable project context must be generated from redacted summaries and
machine-readable reports. It must not leak secrets, private data, credentials or
unsafe runtime controls.

## Production Policy

Production builds should fail when core application security controls are
missing. Required release checks include typed input, auth on private routes,
rate limits for sensitive endpoints, HTTPS or equivalent transport policy,
secret-safe logging and a passing security report.

Production policy must deny debug mode, unsafe interop, raw SQL, shell
execution and wildcard network access unless an explicit, reviewed and reported
override exists.

Network policy should be defined through `galerina-core-network` contracts and
enforced with `galerina-core-security`, `galerina-framework-app-kernel` and the
HTTP/API transport layer. Network reports should show inbound ports, outbound
hosts, TLS posture, rate limits, selected I/O backend, zero-copy availability
raw socket or packet-filter permissions, secret URL checks, certificate
validation, hostname validation and plaintext fallback posture.

Galerina cannot prevent packets from being physically observed on a network. It
must assume packets can be observed, copied, delayed, blocked or modified, then
encrypt, authenticate, validate, minimise and report network communication.

## Security Checklist

- [ ] `.env` is ignored by Git.
- [ ] `.env.example` exists.
- [ ] `.env` values are declared as secrets, not read as normal strings.
- [ ] Secret values are denied from logs, errors, cache, LLM input, build output
      and reports.
- [ ] Inputs are validated.
- [ ] Errors are handled safely.
- [ ] Routes, webhooks, workers and scheduled tasks have crash boundaries.
- [ ] Secrets are not logged.
- [ ] Crash reports and AI-readable crash context are redacted.
- [ ] Build output does not contain secrets.
- [ ] AI output cannot directly authorize high-impact actions.
- [ ] Package and application effects are explicitly declared.
- [ ] Raw SQL, shell execution and unsafe interop are denied or covered by a
      reviewed production override.
- [ ] Security reports pass before production release.
- [ ] AI-readable project context is redacted before use.
- [ ] Network ports, outbound hosts, TLS policy, raw socket permissions and
      backpressure are declared and reported.
- [ ] Plaintext fallback, TLS downgrade, debug proxying and secrets in URLs are
      denied in production.
- [ ] Cookie-authenticated state-changing routes require CSRF protection.
- [ ] `GET`, `HEAD` and `OPTIONS` routes do not change server state.
