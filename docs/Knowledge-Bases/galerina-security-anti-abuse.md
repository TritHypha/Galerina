# Galerina — Security: Anti-Abuse Architecture

## Principle

```
Galerina should make botnet behaviour impossible to hide.
```

It may not stop every malicious developer. But it stops:
- Accidental network fan-out
- Supply-chain abuse via hidden capabilities
- Uncontrolled background execution
- Unaudited network destinations
- Covert process spawning

---

## What's Already Implemented

| Protection | Status | Code |
|---|---|---|
| Deny network by default | ✅ | SPORE-EFFECT-001 fires if network.outbound undeclared |
| No dynamic code execution | ✅ | SPORE-SOURCE-ESCAPE-001 (eval, Function, dynamic import) |
| No monkey patching | ✅ | SPORE-SEC-020/021 (Runtime.patch, prototype mutation) |
| Signed packages | ✅ | SPORE-PKG-005, runtime policy: require signature |
| Runtime identity | ✅ | AuditLog.write, contract.context: require actor |
| Rate limits declared | ✅ | contract.limits { request_time network_requests } parsed |
| Production deny switch | ✅ | runtime policy: security { default deny } |
| Stdlib capability enforcement | ✅ | SPORE-STDLIB-001 (File.readText needs filesystem.read) |

---

## Gaps and Additions Needed

### 1. `process.spawn` as a declared effect

Background workers that aren't declared are an ungoverned attack surface.

```galerina
effects {
  process.spawn   // required to spawn child processes or background tasks
}
```

Without this declaration, the compiler blocks any attempt to spawn. This covers:
- Background workers
- Cron-style scheduled tasks
- Worker threads
- Child process execution

**Status:** ✅ Phase R4 — `process.spawn`, `worker.spawn`, and `event.schedule` added to
`CANONICAL_EFFECTS` in `effect-checker.ts`. SPORE-EFFECT-001 now fires if any of these
effects are used without declaration.

### 2. Network destination policy (most important gap)

`network.outbound` is currently binary: yes or no. That's insufficient.

```galerina
contract {
  network {
    allow host "api.stripe.com"     // exact hostname only
    allow host "api.openai.com"
    deny wildcard                    // no *.example.com
    deny private_ranges              // deny 10.x, 172.16.x, 192.168.x, 127.x, ::1
  }
}
```

Rules:
- `deny wildcard` — no `*` or dynamic hostname construction
- `deny private_ranges` — SSRF protection: block RFC 1918 + loopback
- Destination rules apply to **resolved IP address**, not just hostname (DNS rebinding defence)

**New contract sub-block:** `network { allow host deny wildcard deny private_ranges }`
**New diagnostic:** `SPORE-NET-001` (NetworkDestinationDenied) — called host not in allowlist
**New diagnostic:** `SPORE-NET-002` (PrivateRangeAccess) — resolved IP is in private range

### 3. Rate limit enforcement (Phase 11C gap)

`contract.limits` is parsed and stored but NOT enforced at runtime. The policies are declared but silent.

```galerina
contract {
  limits {
    network_requests 10 per minute
    concurrent_tasks 4
    request_time 5s
    memory 128mb
  }
}
```

These need wiring into `timeoutPolicy.ts`, `retryPolicy.ts`, `limitPolicy.ts` (Phase 11C skeletons exist).

**Enforcement gap:** `SPORE-RUNTIME-006` (RateLimitExceeded) — for when limits fire at runtime.

### 4. Memory limits against DoS

A flow allocating a 2GB array crashes the host process. `contract.memory { arena 32mb }` + WASM `maxPages` addresses this, but needs enforcing.

```galerina
contract {
  memory {
    arena 32mb
    hard_limit 128mb
  }
}
```

`hard_limit` triggers interpreter abort + audit event if exceeded.

---

## Anti-Abuse Contract Pattern

A maximally-locked-down production flow:

```galerina
secure flow processWebhook(readonly request: Request) -> WebhookResult
contract {
  intent { "Process an inbound webhook from Stripe." }

  effects {
    network.inbound    // receiving HTTP only
    database.write
    audit.write
  }

  network {
    deny wildcard
    deny private_ranges
    // no allow host — this flow receives inbound, does not call out
  }

  limits {
    request_time 5s
    memory 16mb
    network_requests 0     // explicitly zero outbound calls
    concurrent_tasks 1
  }

  privacy {
    pii payment_method_id
    require redaction before audit.write
  }

  audit {
    require runtime report
    require actor
    require trace_id
  }
}
```

The compiler can then prove:
- No outbound network (network_requests 0 + no network.outbound effect)
- No process spawning (process.spawn not declared)
- No dynamic code (SPORE-SOURCE-ESCAPE-001)
- No monkey patching (SPORE-SEC-020/021)
- PII redacted before audit
- Request bounded at 5 seconds and 16MB

---

## DNS Rebinding Defence

Allow-listing by hostname is necessary but not sufficient. DNS rebinding attacks make `evil.com` resolve to `192.168.1.1`.

The `deny private_ranges` rule MUST apply to the RESOLVED IP, not just the hostname string.

Implementation: the capability host checks the resolved IP against RFC 1918 ranges before allowing the network call.

```
RFC 1918 private ranges:  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
Link-local:               169.254.0.0/16
Loopback:                 127.0.0.0/8, ::1
```

---

## Devtools: getAntiAbuseReport()

A devtools function that reports the anti-abuse governance posture of a compiled program.
Returns a structured report covering all spawn effects, network destination rules, rate
limit declarations, and any gaps detected.

```galerina
// Usage (devtools only — not available in production mode)
let report = getAntiAbuseReport()
// report.spawnEffects        — list of flows declaring process.spawn / worker.spawn
// report.networkPolicies     — destination allow/deny rules per flow
// report.rateLimitGaps       — flows with network.outbound but no limits declared
// report.undeclaredSpawns    — flows that call spawn without declaring the effect (SPORE-EFFECT-001)
```

**Status:** ✅ Phase R4 — `getAntiAbuseReport()` available in `galerina check --devtools` output.

---

## Implementation Status

| Feature | Status |
|---|---|
| process.spawn as declared effect | ✅ Phase R4 (added to CANONICAL_EFFECTS) |
| worker.spawn as declared effect | ✅ Phase R4 (added to CANONICAL_EFFECTS) |
| event.schedule as declared effect | ✅ Phase R4 (added to CANONICAL_EFFECTS) |
| getAntiAbuseReport() devtools function | ✅ Phase R4 |
| network.contract sub-block (destination policy) | 📋 Phase R4 (in progress) |
| SPORE-NET-001 (NetworkDestinationDenied) | 📋 Phase R4 (in progress) |
| SPORE-NET-002 (PrivateRangeAccess / SSRF) | 📋 Phase R4 (in progress) |
| Rate limit enforcement (timeoutPolicy wired) | 📋 Phase 26 (Phase 11C gap) |
| SPORE-RUNTIME-006 (RateLimitExceeded) | 📋 Phase 26 |
| Memory hard_limit enforcement | 📋 Phase 26 |
| DNS rebinding defence in capability host | 📋 Phase 26 |
| Anti-abuse example (processWebhook) | 📋 Phase R4 (in progress) |

---

## See Also

- `galerina-hybrid-wasm-architecture.md` — 8 native governance rules
- `galerina-explicitness-principles.md` — nothing important hidden
- `galerina-static-capability-proofs.md` — capability enforcement architecture
- `runtime-policy-config.md` — system-level governance contract
