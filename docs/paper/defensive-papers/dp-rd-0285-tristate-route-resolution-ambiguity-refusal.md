# Defensive Publication — Tri-state route resolution: refusing ambiguous HTTP dispatch as a governed hold, over signed route manifests

**Disclosure ID:** DP-RD-0285 · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — specified in KB RD-0285 §3; the existing reference dispatcher
(`galerina-api-protocol-rest`, deny-by-default 404/405, signed `.wasm` + `.lmanifest`, fused
capability-bounded) implements the two-outcome half; the ambiguity arm and the `route_overlap` build lint
are **not yet implemented**. This document timestamps the design as prior art.

## 1. What is disclosed

A three-valued (Kleene K3) route-resolution semantics for API dispatch, applied over **signed route
manifests** (the deployed artifact and the route inventory are the same signed object):

| Resolution outcome | K3 | Behaviour |
|---|---|---|
| exactly one route matches | +1 | dispatch to the route's governed flow |
| no route matches | −1 | explicit reject (`404`/`405`), deny-by-default (shipped) |
| **ambiguous match** — overlapping patterns, percent-encoding/normalisation divergence, conflicting duplicate headers, method-override games | **0** | **governed HOLD: refuse (4xx) + audit — never first-match-wins, never precedence rules** |

With two companions: (a) a **build-time `route_overlap` lint** — static pattern-overlap analysis over the
signed manifest; two routes whose match sets can intersect must be explicitly disambiguated or the build is
rejected (same checker class as match-exhaustiveness); (b) **materialise-once request handling** — the
request is parsed exactly once into a frozen snapshot every middleware/handler consumes (the
*authenticated-bytes = executed-bytes* rule of DP-RD-0247 applied to the HTTP seam), so parser differentials
(duplicate `Content-Length`/`Transfer-Encoding`, header-vs-body divergence) cannot yield two views of one
request. Response semantics mirror the algebra: ALLOW → 2xx, DENY → explicit 4xx, AMBIGUOUS/undecidable →
a governed hold (challenge / 202-task / retry-after), never a silent success.

## 2. What it prevents

**Route-confusion dispatch** — the fail-open every mainstream router ships by design: Express/nginx-style
first-match-wins plus precedence rules turn pattern overlap into an attack surface (path-normalisation
confusion, shadowed routes, method-override bypass). Refusing ambiguity converts the entire class into a
visible build failure or an audited runtime refusal. The materialise-once companion removes request-smuggling
/ TOCTOU-on-representation at the same seam.

## 3. Honest scope and bounds

- Ambiguity detection at build time is decidable for the manifest's pattern language (closed, no runtime
  route registration); runtime ambiguity (e.g. conflicting duplicate headers) is detected at the
  materialise-once parse. No claim is made for open/dynamic routing tables.
- This is dispatch governance, not authentication: admission remains the signed capability inside the flow.
- No performance claim; the lint is one static pass over the manifest.

## 4. Prior art acknowledged (novelty disclaimed)

Kleene three-valued logic (1938); deny-by-default dispatch (`404`/`405`, RFC 9110); routers that *warn* on
duplicate routes; grammar-ambiguity detection; request-smuggling literature and its single-parser mitigations
(normalisation, HTTP/2 framing); canonicalisation-confusion prior art catalogued in DP-RD-0247/RFC 8785. The
disclosed composition — *ambiguity as a first-class third verdict with a governed hold, enforced by a
build-time overlap lint over a signed route manifest, paired with materialise-once request snapshots* — is
published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage; the −1/deny half is shipped in the reference adapter).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB
  RD-0285, the `galerina-api-protocol-rest` README, and DP-RD-0247.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0285-…` §2–§3; shipped reference
  dispatcher in `packages-galerina/galerina-api-protocol-rest/`. Lint and ambiguity arm not yet implemented.
- **Licence:** Apache-2.0.
