# R&D — Phase 34B boundary param auto-taint: verified state + build-ready spec

**Date:** 2026-06-24 · **Finding:** `34B-paramtaint` (dedup of 0031 / 0043 / 0067) · **Severity:** HIGH (boundary fail-open, CWE-501 trust-boundary / OWASP A03) · **Status:** verify-before-build — **build-ready spec; the strict-profile escalation is owner-gated**
**Posture:** fail-closed / deny-by-default at the boundary; reuse existing SPORE-VALUESTATE codes (no new codes).
**Bench:** `Galerina-R-AND-D/tri-encription/bench/boundary-flow-paramtaint.mjs` (drives the real shipped pipeline; Part B documents the gap, red-as-correct today).

> This records what is **already shipped**, isolates the **exact remaining gap**, and gives a **build-ready design**. It does NOT make the semantic change — 34B is owner-gated (the bench says so), and an unsanctioned change to the security-critical value-state pass is out of scope for an autonomous tick.

---

## 1) Verified SHIPPED state (do not rebuild)

The "validate untrusted input at the edge, refuse tainted data at build time" behaviour is ~90% already shipped in `value-state-checker.ts` (`registerParamBinding`, ~:1177-1224):

- **34A `tainted` opt-in** — an explicit `tainted` param qualifier → `safetyPrefix:"unsafe"` → fires SPORE-VALUESTATE-003/004/005 at governed sinks. Bare params stay trusted (opt-in, non-breaking).
- **`source_from` auto-taint** (Phase 4.4) — a param `T source_from Network.*/External.*` (or any unknown origin — `isUntrustedSourceFromOrigin` is **deny-by-default**) → `unsafe`.
- **R&D 0093 "34B hole" partial fix** — a BARE param of a `secureFlowDecl` / `guardedFlowDecl` → `safetyPrefix:"boundary-untrusted"`, inert everywhere except a governed sink, where it fires **SPORE-VALUESTATE-008 (warning)**. Closes the param-trusted-by-default hole at the secure/guarded tier without the false positives of a full taint flip. `pure`/plain `flow` stay trusted-by-default.

## 2) The EXACT remaining gap

A **plain `flow`** used as an **HTTP route handler** still has bare params **trusted-by-default** → fail-OPEN. The bench's Part B proves it: `flow verifyPassword(data: RequestPayload)` using `data.password` at a governed sink emits **ZERO** diagnostics today, because the route handler is a plain `flowDecl` (not secure/guarded), so the 0093 `boundary-untrusted` path never triggers.

**The route→flow binding** (`parser.ts:parseRouteDecl` :3758-3842): `route METHOD "/path" { request T response T flow flowName }` produces a `routeDecl` whose children carry `identifier "flow:flowName"` + `typeRef requestType`. The handler is a **separate** `flowDecl` (its name = `flowDecl.value`, per `value-state-checker.ts:645`). The value-state checker walks each `flowDecl` independently and **never learns it is a route handler** — so it cannot treat its params as boundary-untrusted.

## 3) BUILD-READY DESIGN

**Two-pass, reusing the shipped `boundary-untrusted` mechanism + SPORE-VALUESTATE-008 (no new codes):**

1. **Pre-pass — collect route-handler flow names.** Before the walk, scan top-level `routeDecl` nodes; for each, read the `flow:NAME` child into `this.routeHandlerFlows: Set<string>`. (Mirror the existing flow-name collector at `value-state-checker.ts:632-646`.)
2. **Track the current flow name.** In the `flowDecl` case (:1020-1042), set `this.currentFlowName = node.value` alongside `this.currentFlowKind` (save/restore like `prevFlowKind`).
3. **Extend `registerParamBinding`** (:1212-1221): a bare (non-`tainted`, non-`source_from`) param is `boundary-untrusted` when the current flow is secure/guarded **OR** `this.routeHandlerFlows.has(this.currentFlowName)`. This makes a route-handler plain flow's bare params behave exactly like the shipped secure/guarded case → SPORE-VALUESTATE-008 (warning) at governed sinks. **Non-breaking** (warning, not error; only route handlers reaching governed sinks with bare params).
4. **`trusted` opt-out qualifier.** Parse a leading `trusted` qualifier (sibling to 34A's `tainted`) in `registerParamBinding`; a `trusted` param stays `safetyPrefix:undefined` even in a route/secure/guarded flow (the explicit escape hatch for a pre-validated param).

**The OWNER-GATED escalation (do not build without sign-off):** thread an optional `DeploymentProfile` into `checkValueStates(ast, opts?)` (default omitted → current behaviour, so the bench's default-mode Part-B absence stays valid). Under `strict` / `high_integrity`, a `boundary-untrusted` bare param (route + secure/guarded) is promoted from `boundary-untrusted` (VALUESTATE-008 warning) to full `unsafe` (VALUESTATE-003 **error**) unless marked `trusted` — i.e. the boundary becomes deny-by-default at build time. This is the profile-gated, build-breaking half that needs an owner decision on the profile semantics + a migration sweep of existing route examples.

## 4) Test plan

- Extend `boundary-flow-paramtaint.mjs` Part B: assert that, with the pre-pass wired, `flow verifyPassword(data: RequestPayload)` **referenced by a `route … { flow verifyPassword }`** emits ≥1 SPORE-VALUESTATE-008 at the governed sink (flips the red-as-correct gap assertion to green-as-closed).
- Add value-state tests: (a) route-handler bare param → VALUESTATE-008 warning; (b) `trusted` param in a route handler → 0 diagnostics; (c) a non-route plain flow → still 0 (non-breaking); (d) under the owner-gated `strict` profile, the warning becomes a VALUESTATE-003 error.
- Regression: ensure existing route examples don't gain unexpected **errors** (warnings are acceptable, build-preserving).

## 5) Status & recommendation

- **Buildable-now, non-breaking slice (steps 1–4 at warning level):** extends the shipped, already-accepted 0093 `boundary-untrusted` approach to the genuine HTTP boundary (route handlers). Reuses SPORE-VALUESTATE-008, adds only warnings. **Recommended for owner greenlight** — it closes the route-handler fail-open without breaking any build.
- **Owner-gated escalation (the `strict`/`high_integrity` profile → VALUESTATE-003 error):** the build-breaking, profile-gated half. Needs an owner decision on profile semantics + a route-example migration sweep before building.

**Key files:** `value-state-checker.ts` (`registerParamBinding` :1177-1224, flowDecl case :1020-1042, flow-name collector :632-646, `boundary-untrusted` :685-691) · `parser.ts` (`parseRouteDecl` :3758-3842) · bench `boundary-flow-paramtaint.mjs`. No new SPORE codes.
