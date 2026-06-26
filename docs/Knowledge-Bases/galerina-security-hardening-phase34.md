# Galerina — Security Hardening: Phase 34 HTTP Endpoint

**Version: 1.0 — 2026-06-01**
**Status: Pre-Phase-34 Gate Document**
**Author: Security Review (Phase 28 codebase audit)**

---

## Scope

Phase 34 will introduce the first real governed HTTP endpoint: `verifyPassword` served
via the Node.js `http` module through `route-dispatcher.ts`. This document identifies
seven attack surfaces that must be resolved before external HTTP traffic is accepted.

Each finding includes:

- **Severity:** Critical / High / Medium
- **Current state:** what the code does today
- **Gap:** what is missing
- **Concrete fix:** file, function, code sketch
- **Phase:** when to implement

---

## Finding 1 — HTTP Header Injection

**Severity: High**

### Current State

`hydrateRequest()` in `route-dispatcher.ts` (line 142) copies every raw header value
into the request `GalerinaValue` record without taint marking:

```typescript
for (const [key, value] of Object.entries(req.headers)) {
  if (typeof value === "string") headers.set(key, { __tag: "string", value });
}
```

The resulting `headers` field is placed in the request record under the name `"headers"`.

`TAINT_SOURCES` in `taint-checker.ts` (line 84) includes `"headers"` as a bare identifier.
This means a flow parameter named `headers` IS tracked as tainted. However, the taint
source detection is identifier-name-based at the AST level and fires only when the
Galerina source code explicitly names a parameter `headers`, `request`, or `req`.

### Gap

1. **`Log.write` and `Log.info` are not in `INJECTION_SINKS`** (taint-checker.ts, lines 70–81).
   The catalogue lists `Log.escapeLine` as the untaint boundary producing `SafeFor<LogLine>`,
   but no corresponding log sink is registered. A flow that does:

   ```galerina
   let ua = request.headers["user-agent"]
   Log.write(ua)   // <-- not checked: Log.write is not in INJECTION_SINKS
   ```

   will not fire `SPORE-TAINT-001`. An attacker can inject CRLF sequences, ANSI escape
   codes, or log-forging payloads into the audit trail.

2. **`network.inbound` effect does NOT automatically taint header values at the runtime
   level.** Declaring `network.inbound` marks the flow as accepting inbound traffic but
   there is no corresponding step in `hydrateRequest()` or the interpreter that stamps
   the produced `GalerinaValue` with a taint marker. Taint is only tracked statically by
   the compiler at the AST level, and only for identifier names that appear in
   `TAINT_SOURCES`. A developer who binds `let token = request.headers["authorization"]`
   and then passes `token` to a log call will only be protected if the compiler sees
   that `token` was assigned from a member expression whose receiver is named `request`
   — which the current `memberExpr` handler in `taintOf()` does cover. But if the
   value travels through an intermediate function or is passed as a field of a record,
   the taint state is lost (taint is not propagated through record field reads).

### Concrete Fix

**File: `src/taint-checker.ts`**

Add `Log.write`, `Log.info`, `Log.error`, `Log.debug`, `Log.audit` to `INJECTION_SINKS`
requiring `SafeFor<LogLine>`:

```typescript
export const INJECTION_SINKS: ReadonlyMap<string, SinkContext> = new Map([
  // existing entries ...
  ["Log.write",   "LogLine"],   // ADD
  ["Log.info",    "LogLine"],   // ADD
  ["Log.error",   "LogLine"],   // ADD
  ["Log.debug",   "LogLine"],   // ADD
  ["Log.audit",   "LogLine"],   // ADD
  ["Http.respond","HtmlContent"], // ADD for response body sinks
]);
```

**File: `src/route-dispatcher.ts` — `hydrateRequest()`**

Mark header values with a runtime taint tag so that dynamic taint analysis (Phase 35+)
can track them even after record-field reads:

```typescript
for (const [key, value] of Object.entries(req.headers)) {
  if (typeof value === "string") {
    headers.set(key, { __tag: "string", value, __taint: "network.inbound" });
  }
}
```

(This requires extending `GalerinaValue` with an optional `__taint` field, which is
a Phase 34B task — but the hydrateRequest change should land in Phase 34A as a
forward-compatible annotation.)

**Phase: 34A (before first external request)**

---

## Finding 2 — SSRF via URL Allowlist: Private IP Check is Hostname-String-Only

**Severity: Critical**

### Current State

`security-policy.ts` correctly defines `PRIVATE_IP_RANGES` (RFC 1918, loopback, link-local,
IPv6 ULA) and exports `isHostAllowed()`. The capability host (`capabilityHost.ts`, line 66)
implements a `looksLikePrivateIp()` function that checks **string prefixes** of the hostname:

```typescript
const PRIVATE_PREFIXES = ["10.", "172.16.", ..., "127.", "169.254.", "::1", "fc", "fd"];

function looksLikePrivateIp(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  return PRIVATE_PREFIXES.some((prefix) => h.startsWith(prefix));
}
```

The comment in the file itself acknowledges this: `// Phase R4A — full IP resolution in R4B`.

### Gap

**DNS rebinding is not defended against.** An attacker controls a DNS server that answers
`allowed-domain.example.com → 1.2.3.4` for the initial check, then switches the record
to `192.168.1.1` for the actual TCP connection. The hostname passes `looksLikePrivateIp()`
because it is not a numeric IP, and the policy check in `isHostAllowed()` only checks the
hostname string against the allowlist, not the resolved address.

Additionally, `Url.parseAndAllowlist` is listed in `UNTAINT_BOUNDARIES` as producing
`SafeFor<SafeUrl>` (taint-checker.ts, line 53), but there is no runtime implementation
of `Url.parseAndAllowlist` visible in `stdlib.ts`. The untaint boundary exists at the
type-system level only. At runtime, a flow calling `Url.parseAndAllowlist(userUrl, policy)`
receives a value but the actual DNS resolution + private-IP check is not performed by that
function — it falls through to the capability host network check, which only operates at
the `network.outbound` effect level, not during URL construction.

### Concrete Fix

**File: `src/runtime/capabilityHost.ts` — `checkNetworkDestination()`**

Replace the string-prefix check with a real DNS resolution + CIDR check before the
outbound connection is made. This requires Phase R4B to be implemented:

```typescript
import { promises as dns } from "node:dns";
import { isIPv4, isIPv6 } from "node:net";

async function resolveAndCheckPrivate(hostname: string): Promise<boolean> {
  if (isIPv4(hostname) || isIPv6(hostname)) {
    return looksLikePrivateIp(hostname); // direct IP — check immediately
  }
  try {
    const { address } = await dns.lookup(hostname);
    return looksLikePrivateIp(address); // check RESOLVED address, not hostname
  } catch {
    return true; // fail-closed: DNS failure = deny
  }
}
```

This function must be called inside `checkNetworkDestination()` AFTER the allowlist check
and BEFORE the connection is established, using the resolved IP, not the hostname string.

**File: `src/stdlib.ts` — implement `Url.parseAndAllowlist` runtime function**

The function must:
1. Parse the URL (reject malformed URLs immediately)
2. Extract scheme — deny non-https unless explicitly permitted
3. Call `resolveAndCheckPrivate(hostname)` on the extracted host
4. Check the host against the caller's declared network allowlist policy
5. Return `SafeFor<SafeUrl, String>` only if all checks pass

Until this is implemented, flows that call `Url.parseAndAllowlist` receive compile-time
clearance (the taint checker marks it clean) but no actual runtime SSRF protection.

**Phase: 34A (Critical — must be done before Phase 34 ships)**

---

## Finding 3 — Request Body Size Limits: Enforcement Occurs After Route Match

**Severity: High**

### Current State

`route-dispatcher.ts` (lines 66–80) implements body size enforcement:

```typescript
let bodySize = 0;
let settled = false;

req.on("data", (chunk: Uint8Array) => {
  if (settled) return;
  bodySize += chunk.length;
  if (bodySize > maxBodyBytes) {
    settled = true;
    res.statusCode = 413;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Request body too large" }));
    req.destroy();
    return;
  }
  chunks.push(chunk);
});
```

The default `maxBodyBytes` is `1_048_576` (1 MiB), configurable via `ServerConfig.maxBodyBytes`.

### Gap

1. **The size limit only applies after a route match.** If the route does not match
   (404 or 405 branch, lines 53–64), the response is sent immediately and `req.destroy()`
   is NOT called. Node.js will buffer the incoming data internally until the socket is
   closed by the client. An attacker sending a 2 GB body to an unknown path will cause
   Node.js to accumulate data in kernel/socket buffers and apply memory pressure to the
   process before the route-not-found response flushes.

2. **`req.destroy()` after 413 is correct but the `settled` flag is set only after the
   first oversized chunk is received.** If multiple chunks arrive in the same I/O tick
   before the `settled` flag propagates, the subsequent `if (settled) return` guard in
   the data handler prevents further accumulation but the first oversized chunk is still
   pushed to `chunks` before the size check fires on the NEXT chunk. The sequence is:
   `bodySize += chunk.length` → `if (bodySize > max)` → at this point the oversized chunk
   has already been pushed in the PREVIOUS iteration. This is an off-by-one: the actual
   buffer can reach `maxBodyBytes + (singleChunkSize - 1)` bytes before rejection.

3. **No governance check runs before body accumulation begins.** If the flow requires
   `strict` or `high_integrity` profile, that check happens after `req.on("end")`, after
   the entire body has been buffered. A governance-rejected request still buffers its body.

### Concrete Fix

**File: `src/route-dispatcher.ts` — before the `req.on("data", ...)` handler**

Apply size enforcement before accumulation AND before body is pushed:

```typescript
req.on("data", (chunk: Uint8Array) => {
  if (settled) return;
  // Check BEFORE pushing: reject if adding this chunk would exceed the limit
  if (bodySize + chunk.length > maxBodyBytes) {
    settled = true;
    res.statusCode = 413;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Request body too large" }));
    req.destroy();
    return;
  }
  bodySize += chunk.length;
  chunks.push(chunk);
});
```

**For the 404/405 path:** call `req.destroy()` after sending the 404/405 response:

```typescript
if (match === null) {
  res.setHeader("Content-Type", "application/json");
  if (pathExists) {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not Found", path }));
  }
  req.destroy(); // ADD: prevent body accumulation on unmatched routes
  return;
}
```

**Phase: 34A (before first external request)**

---

## Finding 4 — Timing Side-Channels: `Crypto.timingSafeEqual` Is Not Enforced at the Verifier Level

**Severity: High**

### Current State

`stdlib.ts` implements `Crypto.timingSafeEqual` correctly using `node:crypto`'s
`timingSafeEqual` with length-normalised padding (lines 2166–2187). The implementation
is sound.

However, there is **no governance rule** that requires `Crypto.timingSafeEqual` when a
`secure` or `protected` value is compared. A developer writing:

```galerina
secure flow verifyPassword(input: String, stored: ProtectedSecret<String>) -> Bool {
  return input == stored   // plain equality — timing leak
}
```

will not receive any diagnostic. The taint checker tracks `SafeFor<Context>` but does
not track value-state tags (`secure`, `protected`) as requiring a specific comparison
function.

The `SPORE-BLOCK-004` diagnostic for `ProtectedSecret` in content blocks exists
(index.ts, line 1316) but is marked as a TODO and is not implemented:

```typescript
// TODO SPORE-BLOCK-004: detect ProtectedSecret references interpolated into script blocks.
```

There is no `SPORE-SECURITY-001` diagnostic in the verifier or taint checker that fires
when a `ProtectedSecret<T>` or `secure`-tagged value is compared with `==` or `!=`.

### Gap

The `verifyPassword` flow is the canonical Phase 34 endpoint. It compares a user-supplied
password against a stored hash. If the developer uses `==` instead of `Crypto.timingSafeEqual`,
the runtime will use JavaScript's `===` operator, which short-circuits on the first
differing byte. An attacker making repeated requests can distinguish "wrong at byte 0" from
"wrong at byte 10" and recover the hash one byte at a time via a timing oracle.

### Concrete Fix

**File: `src/taint-checker.ts` or a new `src/secret-checker.ts`**

Add a new diagnostic `SPORE-SECURITY-001` and a checker that fires when a `secure` or
`protected` binding is the operand of a `binaryExpr` with operator `==` or `!=`:

```typescript
export const SPORE_SECURITY_001 = {
  code: "SPORE-SECURITY-001",
  name: "PlainEqualityOnProtectedSecret",
  severity: "error" as const,
  message: "Plain equality (==) used on a ProtectedSecret or secure value. " +
    "Use Crypto.timingSafeEqual(a, b) to prevent timing side-channel attacks.",
} as const;
```

The checker must walk the flow body. When it encounters a `binaryExpr` with `op == "=="
or op == "!="`, it checks whether either operand's taint/value-state is `secure` or
`protected`. If so, emit `SPORE-SECURITY-001` as an error.

This requires the taint checker to be aware of value-state tags from the value-state
checker (`value-state-checker.ts`). The two passes can be combined in `fused-pass.ts`
or the secret checker can run as a separate post-taint pass.

**In `src/governance-verifier.ts`:** For flows declared as `secureFlowDecl`, add a check
that any flow handling password comparison calls `Crypto.timingSafeEqual`. This can be
implemented as a structural pattern check on the flow body — if the flow's name contains
`password`, `secret`, `token`, `hmac`, or `hash` AND it contains a `binaryExpr` with `==`,
raise `SPORE-SECURITY-001`.

**Phase: 34A (must land before verifyPassword endpoint ships)**

---

## Finding 5 — ProofGraph Integrity: No GovernanceSignature Before Phase 39

**Severity: Medium**

### Current State

`proof-graph.ts` defines `ProofGraph.governanceSignature` as an optional field (line 275):

```typescript
readonly governanceSignature?: {
  readonly algorithm: "lln.gov.sig.v1";
  readonly signerKeyId: string;
  readonly signature: string;
  readonly signedAt: string;
};
```

The comment marks this as Phase 39 (ML-DSA / FIPS 204). Until then, `governanceSignature`
is always `undefined`.

`buildProofGraph()` and `buildProofGraphCached()` do not populate this field.

The `signatureHash` field is a SHA-256 of the `ExecutionSignature` struct — it proves
that the governance shape of the flow has not changed, but it does NOT prove that the
ProofGraph itself was produced by a trusted compiler run. An attacker with access to the
process (or a compromised dependency) can construct a `ProofGraph` with `verified: true`
and arbitrary `obligations: []` (zero obligations always satisfies
`obligations.every(...)` — vacuously true) and inject it into the `proofGraphs` map.

Confirmed: `buildProofGraph()` sets `verified = obligations.length > 0 && ...`. If
`obligations` is `[]`, `verified` is `false`. But `buildProofGraphCached()` returns
the cached shape's `verified` value — if the cache was poisoned with a
`{ obligations: [], verified: true }` shape, every subsequent flow with the same
`signatureHash` receives `verified: true`.

The PROOF_SHAPE_CACHE (line 342) is a module-level `Map` with no integrity protection.

### Gap

Between now and Phase 39, a fake ProofGraph with fabricated `verified: true` status
could be injected into `GovernanceVerifyResult.proofGraphs`. Any consumer that checks
`proofGraph.verified` without also checking `obligations.length > 0` will be deceived.

This also means the current `verified` logic has a latent vacuous-truth bug: an empty
obligations list produces `false` correctly from `buildProofGraph`, but the
PROOF_SHAPE_CACHE does not prevent a poisoned entry from propagating.

### Concrete Fix

**Immediate (Phase 34 — interim guard, no crypto needed):**

1. In `buildProofGraph()`, change the `verified` invariant to require both non-empty
   obligations AND that each obligation has a corresponding passing evidence entry:

   ```typescript
   // Current:
   const verified = obligations.length > 0 && obligations.every(...);

   // Hardened: add runtime integrity assertion
   const verified = obligations.length > 0 &&
     obligations.every(ob =>
       evidence.some(ev => ev.obligationKind === ob.kind && ev.checkerPassed),
     );
   // Post-condition: verify no vacuous truth
   if (verified && obligations.length === 0) {
     throw new Error("ProofGraph invariant violated: verified=true with empty obligations");
   }
   ```

2. In `buildProofGraphCached()`, before returning a cached shape, validate that the
   cached `verified` value is consistent with the cached `obligations`:

   ```typescript
   // Integrity check on cache hit
   if (cached.verified && cached.obligations.length === 0) {
     // Cache is corrupt — rebuild
     PROOF_SHAPE_CACHE.delete(sigHash);
     return buildProofGraph(flowName, sig, obligations, evidence, generatedAt);
   }
   ```

3. Add an `HMAC-SHA256` content fingerprint to `ProofGraph` signed with a process-local
   ephemeral key (generated at startup). This is not ML-DSA (Phase 39) but it prevents
   in-process injection:

   ```typescript
   // In type-registry or proof-graph.ts — generate once at module load
   const PROCESS_PROOF_KEY = crypto.randomBytes(32);

   function signProofGraphLocally(pg: ProofGraph): string {
     const payload = JSON.stringify({
       flowName: pg.flowName,
       signatureHash: pg.signatureHash,
       verified: pg.verified,
       obligationCount: pg.obligations.length,
     });
     return createHmac("sha256", PROCESS_PROOF_KEY).update(payload).digest("hex");
   }
   ```

   Add `readonly localIntegrityTag: string` to `ProofGraph` and verify it at every
   consumption point in `governance-verifier.ts`.

**Phase: 34B (before production deployment; 34A can ship with the vacuous-truth fix only)**

---

## Finding 6 — Input Taint at the HTTP Boundary: Opt-In, Not Opt-Out

**Severity: High**

### Current State

`hydrateRequest()` in `route-dispatcher.ts` builds a `GalerinaValue` record from the
incoming request. The fields `headers`, `body`, `params`, `query`, and `jsonBody` all
contain values from the network with no taint annotation at the runtime value level.

The taint checker in `taint-checker.ts` operates at the **compile-time AST level**.
It marks a binding as tainted if its initializer expression is a member access on a
name in `TAINT_SOURCES` (lines 84–87: `"request"`, `"req"`, `"input"`, `"params"`,
`"query"`, `"body"`, `"headers"`).

### Gap

**Taint is opt-in at the parameter naming level, not automatic at the HTTP boundary.**

Consider:

```galerina
flow verifyPassword(req: HttpRequest) -> Bool {
  let payload = req.jsonBody     // taintOf sees memberExpr: receiver=req → tainted ✓
  let pw = payload.password      // taintOf sees memberExpr: receiver=payload → BUT payload
                                 // is stored in bindings as tainted, so pw = tainted ✓
  return Crypto.timingSafeEqual(pw, storedHash)   // OK, but only because the chain holds
}
```

This works. But:

```galerina
flow verifyPassword(data: RequestPayload) -> Bool {
  // data arrives from HTTP but its parameter name is "data", NOT in TAINT_SOURCES
  let pw = data.password   // taintOf: receiver=data → NOT in TAINT_SOURCES → clean!
  return pw == storedHash  // no taint diagnostic fires
}
```

The developer declares the parameter as `data: RequestPayload` (a custom type). The
taint checker does not know that `data` was populated from `req.jsonBody`. The
parameter name `data` is not in `TAINT_SOURCES`. All values derived from `data` are
considered clean. No taint diagnostics fire for any sink.

This is the **default case** for any real-world Galerina HTTP handler that uses a typed
request body parameter with a custom name.

### Concrete Fix

**Short term — extend `TAINT_SOURCES` with a type-annotation mechanism (Phase 34A):**

When a flow is declared with a route handler (i.e., is referenced by a `routeDecl`),
ALL of its parameters should be treated as tainted unless explicitly annotated as
`trusted`. This can be implemented in `checkTaint()` in `taint-checker.ts`:

```typescript
// In checkTaint(), when processing a flow that is an HTTP handler:
// (determined by cross-referencing the route registry)
const isHttpHandler = httpHandlerFlowNames.has(flow.name);

for (const p of (flowNode.children ?? []).filter(c => c.kind === "paramDecl")) {
  const pname = ((p.value ?? "").split(":")[0] ?? "").trim();
  if (isHttpHandler) {
    // ALL parameters of an HTTP handler are tainted by default
    bindings.set(pname, { kind: "tainted" });
  } else if (TAINT_SOURCES.has(pname)) {
    bindings.set(pname, { kind: "tainted" });
  }
}
```

**Long term — add a `tainted` qualifier to parameter declarations (Phase 34B "Phase 28B"
as noted in taint-checker.ts line 258):**

```galerina
secure flow verifyPassword(tainted data: RequestPayload) -> Bool { ... }
```

The `tainted` keyword in the parameter declaration explicitly marks the binding tainted
regardless of its name. The compiler should require this qualifier on any parameter of
an HTTP handler flow in `strict` or `high_integrity` profile.

**Phase: 34A (the automatic taint-by-route fix); 34B (the tainted keyword)**

---

## Finding 7 — Cache Poisoning via Crafted Args in the Pure Flow LRU Cache

**Severity: Medium**

### Current State

`pure-flow-cache.ts` uses the key format `flowName + ":" + canonicalHash(args)`:

```typescript
export function pureFlowCacheKey(
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag?: string,
): string {
  const argsObj: Record<string, unknown> = {};
  for (const [k, v] of args) argsObj[k] = v;
  const base = `${flowName}:${canonicalHash(argsObj)}`;
  return sourceTag ? `${sourceTag}:${base}` : base;
}
```

`canonicalHash` produces a SHA-256 of the JSON-serialised args. The `SESSION_CACHE`
is a process-level LRU with 1000 entries, never cleared between requests.

### Gap

**Cache scope is process-wide, not per-user or per-session.** The LRU cache is shared
across all concurrent HTTP requests. A pure flow that is logically user-scoped (e.g.
`getUserProfile(userId)`) can be cached with the output from User A and returned to
User B if User B sends the same `userId` value.

More specifically, the attack surface is:

1. **User A** requests `verifyEmailFormat("user-a@example.com")`.
   Result is cached at key `verifyEmailFormat:<hash of "user-a@example.com">`.

2. **Attacker** crafts a JSON body such that `canonicalHash(attackerArgs)` collides with
   or equals `canonicalHash(userAArgs)`. SHA-256 collisions are infeasible, but the
   attacker does not need a hash collision — they need to send the SAME args, which is
   the intended design. The issue is that **the same args from a different request
   principal return the same cached result**.

3. For flows that incorporate PII into their pure computation (e.g. a pure validation
   flow that takes an email address and returns whether it matches a known-good pattern),
   the cache makes the output observable: if User B knows User A's email and sends the
   same args, User B gets a cache hit and observes the same `true`/`false` outcome. This
   is a timing-based information leak — a cache hit is faster than a miss.

4. **Cache eviction can be triggered by an attacker** sending 1000 unique arg combinations,
   evicting legitimate cached entries and forcing cache misses for all users (cache
   thrashing / denial-of-service).

### Concrete Fix

**Immediate — enforce that only truly pure, non-PII flows are cached (Phase 34A):**

Add a governance check: flows with `GovernanceFlags.ContainsPII` set must not be
stored in the pure flow cache regardless of their `pureFlowDecl` declaration:

```typescript
// In the cache key builder or at the call site in interpreter.ts:
if (governanceMask & GovernanceFlags.ContainsPII) {
  // Never cache PII-touching flows, even if they are pure
  return; // skip setCachedPureFlow
}
```

**Scope the cache to a request context (Phase 34B):**

Pass a `requestId` (UUID generated per incoming HTTP request in `route-dispatcher.ts`)
as the `sourceTag` to `pureFlowCacheKey()`. Pure flow results are then scoped to the
request lifecycle, not the process lifetime. The LRU becomes a per-request memoisation
store, not a cross-request cache.

For flows that are genuinely safe to cache across requests (stateless transforms with
no PII, e.g. `parseEmailFormat`), the flow author explicitly opts in with a
`cache: global` annotation in the contract.

```typescript
// In route-dispatcher.ts, generate a requestId per request:
import { randomUUID } from "node:crypto";
const requestId = randomUUID();
// Pass requestId as sourceTag when building pure flow cache keys
```

**For cache thrashing:** apply a minimum TTL of 100ms per unique `flowName:argsHash`
pair to rate-limit the rate at which an attacker can fill the cache, and add a maximum
per-IP entry rate using the existing `SPORE-RUNTIME-006` rate-limiting infrastructure.

**Phase: 34A (PII guard + requestId scoping); governance annotation in 34B**

---

## Summary Table

| # | Attack Surface | Severity | Phase |
|---|---|---|---|
| 1 | HTTP header injection — `Log.write` not in `INJECTION_SINKS`; runtime taint not stamped | High | 34A |
| 2 | SSRF — `looksLikePrivateIp` is string-prefix only; DNS rebinding; `Url.parseAndAllowlist` has no runtime implementation | **Critical** | 34A |
| 3 | Body size — limit fires after first oversized chunk; 404/405 path does not destroy socket | High | 34A |
| 4 | Timing side-channel — no `SPORE-SECURITY-001` diagnostic for `==` on `secure`/`ProtectedSecret` values | High | 34A |
| 5 | ProofGraph integrity — `GovernanceSignature` is Phase 39; PROOF_SHAPE_CACHE has no integrity check; vacuous-truth in `verified` | Medium | 34A (vacuous fix) + 34B (HMAC tag) |
| 6 | Input taint — only opt-in by parameter name; typed request params with custom names are clean by default | High | 34A |
| 7 | Cache poisoning — SESSION_CACHE is process-wide; PII flows can leak timing; cache thrashing DoS | Medium | 34A (PII guard) + 34B (request scoping) |

---

## Phase 34 Gate Checklist

Before Phase 34 ships (first external HTTP request accepted):

- [ ] `Log.write` / `Log.info` / `Log.error` added to `INJECTION_SINKS` (Finding 1)
- [ ] `hydrateRequest()` calls `req.destroy()` on 404/405 (Finding 3)
- [ ] Body size check reordered to fire BEFORE `chunks.push(chunk)` (Finding 3)
- [ ] DNS resolution + CIDR check implemented in `capabilityHost.ts` (Finding 2)
- [ ] `Url.parseAndAllowlist` has a real runtime implementation with private-IP guard (Finding 2)
- [ ] `SPORE-SECURITY-001` diagnostic fires on `==` with `secure`/`protected` operands (Finding 4)
- [ ] `buildProofGraph()` vacuous-truth invariant hardened (Finding 5)
- [ ] PROOF_SHAPE_CACHE poison-cache integrity check added (Finding 5)
- [ ] HTTP handler flows auto-taint all parameters in `strict`/`high_integrity` profile (Finding 6)
- [ ] Pure flow cache blocks PII-tagged flows (`GovernanceFlags.ContainsPII`) (Finding 7)

---

## Deferred to Phase 34B

- Runtime taint annotation (`__taint: "network.inbound"` on `GalerinaValue`) — requires interpreter extension
- `tainted` keyword on parameter declarations (Phase 28B backlog item)
- `requestId`-scoped pure flow cache
- HMAC-SHA256 process-local ProofGraph integrity tag
- `cache: global` opt-in annotation for cross-request pure flow caching
- Full ML-DSA / GovernanceSignature implementation remains Phase 39

---

## See Also

- `src/taint-checker.ts` — TAINT_SOURCES, INJECTION_SINKS, UNTAINT_BOUNDARIES
- `src/security-policy.ts` — PRIVATE_IP_RANGES, isHostAllowed, parseNetworkDestinationPolicy
- `src/route-dispatcher.ts` — hydrateRequest, startServer, body size enforcement
- `src/runtime/capabilityHost.ts` — checkNetworkDestination, looksLikePrivateIp (Phase R4A)
- `src/pure-flow-cache.ts` — SESSION_CACHE, pureFlowCacheKey
- `src/proof-graph.ts` — ProofGraph, buildProofGraph, buildProofGraphCached, PROOF_SHAPE_CACHE
- `docs/Knowledge-Bases/galerina-taint-catalogue.md` — OWASP-aligned untaint boundaries
- `docs/Knowledge-Bases/runtime-profiles.md` — strict, high_integrity, deterministic profiles
