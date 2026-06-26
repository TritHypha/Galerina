# @galerina/auth

> **APP-LAYER FRAMEWORK PACKAGE — auth as a standalone unit.**
> `galerina-auth` lifts the authentication/authorization FACTORS out of the App
> Kernel into their own package — the way Spring ships `spring-security`, Django
> ships `contrib.auth`, and NestJS ships `passport` separately from the framework
> core. It sits **above** the Galerina language + core runtime, beside
> `galerina-framework-app-kernel` and `galerina-core-network`.

`galerina-auth` computes the **auth/identity FACTORS** that the App Kernel folds at
its fixed, non-bypassable admission gate. Each factor is a Kleene-K3 verdict
(`@galerina/tower-citizen`):

```text
+1 ALLOW          proof discharged — the factor may authorize
 0 INDETERMINATE  no positive evidence / un-provable → fail-closed neutral
−1 DENY           definite refusal (annihilator under conjunction)
```

## The boundary: FACTORS here, the DECISION stays in the kernel

This is the load-bearing design rule. **galerina-auth provides the factors; the App
Kernel still decides admission.** Every function in this package returns a
*verdict* (or composes verdicts) — none of them make the admission call. The
kernel keeps its fail-closed K3 admission fold exactly as it is: it collapses the
composed `channelVerdict` at its gate, and **only an explicit `+1` admits** (`0`
and `−1` both refuse; an `unknown` is `0` by the algebra, not a flag).

```text
   ┌─────────────────── galerina-auth (FACTORS) ───────────────────┐
   │ channelIdentityVerdict(certInput)   → Verdict   (TLSTP S1)   │
   │ headerPresenceVerdict(headers, …)   → Verdict   (posture)    │
   │ scopeVerdict(required, granted)     → Verdict   (RBAC)       │
   │ composeAuthVerdict([ … ])           → Verdict                │
   └───────────────────────────┬─────────────────────────────────┘
                               │  hand the verdict over, as-is
                               ▼
   ┌──────────────── galerina-framework-app-kernel (DECISION) ──────┐
   │ req.channelVerdict = <the composed Verdict>                  │
   │ auth gate: decideAtBoundary(channelVerdict).authorized       │
   │   → only +1 admits; 0 / −1 → 401, handler NEVER runs         │
   └─────────────────────────────────────────────────────────────┘
```

We deliberately stop at the verdict. `previewAdmission()` exists for transport-side
logging only — it interprets what the kernel *will* decide; it is not the decision.

## The factors

### Channel / identity — TLSTP S1 (`channel.ts`)
`channelIdentityVerdict(input)` is the certificate/channel-validation verdict,
**delegated verbatim** to the shipped cert-gate in `@galerina/core-network`
(`certGate`). It folds chain validity, pin match, the validity window, and OCSP/CRL
revocation freshness into one K3 verdict. Headline property: a **revocation-UNKNOWN
factor collapses the channel to non-ALLOW**, closing the public web's soft-fail
hole. Every missing / errored / un-provable input defaults to `0`, never `+1`.

> **Crypto stays Binary.** The cert-gate is a *pure governance fold* over a TLS
> library's outputs — no ASN.1 parsing, path-building, or signature math. galerina-auth
> adds no crypto of its own.

### Required-auth posture — "presence is NOT authentication" (`credential.ts`)
`headerPresenceVerdict(headers, opts)` encodes the tightened required-auth posture
the kernel adopted (owner decision 2026-06-23; see the kernel auth step and
`AuthPolicy.allowHeaderPresenceFallback`). **By default it is always `0`
(INDETERMINATE)** — a present `Authorization` header is *not* proof of anything, so
this factor can never authorize on its own. The weaker presence-as-proof behaviour
survives only behind the explicit `allowHeaderPresenceFallback` opt-in (and even
then this factor treats an empty header value as absent — stricter than the kernel's
legacy key-presence branch).

### Scope authorization — request-time RBAC (`authorization.ts`)
`scopeVerdict(required, granted)` checks an authenticated identity's granted scopes
against a route's required scopes (the surface `AuthPolicy.scopes` already declares).
ALLOW iff every required scope is granted; DENY on any missing required scope;
INDETERMINATE for an empty requirement (deny-by-default — omit the factor instead of
passing `[]`). Exact match, no wildcard broadening. Additive: it does not move any
existing kernel behaviour.

### Composition (`compose.ts`)
`composeAuthVerdict(factors)` folds the factors **conjunctively** (`allOf` = K3
`min`): ALLOW iff every factor is ALLOW, DENY if any is DENY, else INDETERMINATE.
Empty → INDETERMINATE (deny-by-default). The result is the single verdict you hand
the kernel.

## Usage

```ts
import {
  channelIdentityVerdict,
  scopeVerdict,
  composeAuthVerdict,
} from "@galerina/auth";

// 1. Compute the auth factors for an inbound request (from your transport adapter).
const channel = channelIdentityVerdict({
  chainOutcome: "valid",
  pinnedDigests: ["sha256:…"],
  presentedDigest: "sha256:…",
  notBefore, notAfter, now,
  revocation: "good", revocationProducedAt, revocationFreshnessMs: 300_000,
});
const rbac = scopeVerdict(["orders.create"], identity.scopes);

// 2. Compose them into the one verdict the kernel folds.
const channelVerdict = composeAuthVerdict([channel, rbac]);

// 3. Hand it to the App Kernel — the KERNEL decides admission, fail-closed.
const res = await kernel.handle({ ...req, channelVerdict });
```

## Security posture

- **Deny-by-default / fail-closed.** Every factor maps "no positive proof" to
  `0` (INDETERMINATE), never `+1`. Empty compositions and empty scope requirements
  are INDETERMINATE, not vacuous ALLOW.
- **Single source of truth.** The channel factor *delegates* to the shipped
  `certGate`; the verdict algebra is *re-exported* from `@galerina/tower-citizen`.
  Nothing is re-implemented, so the K3-conformance oracle keeps covering it.
- **Crypto stays Binary** — no new cryptography is introduced here.
- **The kernel keeps the decision.** galerina-auth never collapses a verdict to an
  admission; the App Kernel's fixed gate does, exactly as before.

## Build & test

```sh
npm run build    # tsc -p tsconfig.json  → dist/
npm test         # typecheck + build + node --test tests/*.test.mjs
```

This package builds with `tsc` and imports its sibling packages via their built
`dist/` (the in-repo convention until workspaces land, #155). Build
`@galerina/core-network` and `@galerina/tower-citizen` first; the kernel-integration
test additionally exercises `@galerina/framework-app-kernel` when its `dist/` is
present (and skips cleanly when it is not).

## Layout

```text
package.json          @galerina/auth descriptor (file: deps on core-network + tower-citizen)
tsconfig.json         strict TS, NodeNext
src/verdict.ts        K3 verdict algebra (re-exported vocabulary)
src/channel.ts        TLSTP S1 channel/identity factor (delegates to certGate)
src/credential.ts     required-auth posture: header presence is NOT auth
src/authorization.ts  scope authorization factor (request-time RBAC)
src/compose.ts        fold factors → the one verdict the kernel folds
tests/                node --test suites, incl. the kernel-integration proof
```

## See also

- `packages-galerina/galerina-framework-app-kernel` — the kernel that folds these factors
- `packages-galerina/galerina-core-network` — the shipped `certGate` (TLSTP S1)
- `packages-galerina/galerina-tower-citizen` — the K3 verdict algebra
- `docs/Knowledge-Bases/galerina-tlstp-s1-cert-gate.md` — the cert-gate spec
