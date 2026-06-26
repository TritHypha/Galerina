# Galerina Security Risk Feature Ranking

Galerina has two linked goals:

```text
1. Be a clear, pleasant language for developers to write.
2. Be structured enough for AI tools to understand, review and safely change.
```

The security goal should be close to fail-closed by default:

```text
Make unsafe behaviour hard to write.
Make risky behaviour explicit.
Make every risky boundary reportable.
Make generated code traceable back to Galerina source.
```

No language can honestly promise perfect security, but Galerina can reduce preventable
security defects by combining strict syntax, memory safety, typed effects,
permissions, reports, checked execution and AI-readable diagnostics.

---

## Risk Scale

| Rank | Name        | Meaning                                      | Default stance                                  |
| ---: | ----------- | -------------------------------------------- | ----------------------------------------------- |
| 0    | Protective  | Reduces security risk                        | Core/default                                    |
| 1    | Low         | Safe when implemented normally               | Core/default                                    |
| 2    | Medium      | Needs compiler checks and clear diagnostics  | Allowed with checks                             |
| 3    | High        | Needs explicit policy, limits and reports    | Allowed only with guardrails                    |
| 4    | Critical    | Can break isolation, memory safety or trust  | Denied by default; explicit boundary only       |
| X    | Unsupported | Should not exist in normal Galerina                | Reject; migration or engine-lab discussion only |

Rule:

```text
Risk rank 3 or higher must produce a report.
Risk rank 4 must require explicit permission.
Risk X must be rejected in normal Galerina code.
```

## Deny By Default Top Risks

The following features are denied by default in normal Galerina code:

```text
1. Dynamic eval / runtime code execution
2. Unrestricted shell execution
3. Hidden network access
4. Raw filesystem access
5. Global mutable variables
6. Unsafe native interop
7. Raw pointers / unchecked memory
8. Monkey patching
9. Reflection that bypasses policy
10. AI self-granting capabilities
```

If supported at all, they require:

```text
declared effect
+ capability
+ policy approval
+ audit record
```

Complexity features to leave out of the core runtime include inheritance-heavy
object models, multiple inheritance, heavy reflection, dynamic typing as the
main model, hidden magic decorators, automatic global dependency injection,
unbounded runtime background work, implicit async behaviour and a large default
framework bundled into the runtime.

The design rule is:

```text
No hidden power.
No hidden mutation.
No hidden execution.
No hidden cost.
```

---

## Security Baseline

Every feature should be assessed against these baseline requirements:

```text
strict types
no undefined
no silent null
no truthy/falsy branching
no loose implicit coercion
no unbounded memory by default
no hidden global state
no secret logging
source maps for generated output
machine-readable diagnostics
security reports
target/fallback reports
AI-readable guide output
```

---

## Core Language Feature Ranking

| Feature                         | Risk | Main risk                              | Galerina default                              | Required checks / failsafes                         |
| ------------------------------- | ---: | -------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| Readable `.spore` syntax           | 0    | Ambiguous syntax can hide intent       | Core                                    | Stable grammar, formatter, parser diagnostics       |
| AI-readable structure           | 0    | AI may misunderstand implicit behaviour | Core                                    | Explicit effects, source maps, generated summaries  |
| Strict static types             | 0    | Type confusion                         | Core                                    | No implicit narrowing or unsafe coercion            |
| `Bool`                          | 1    | Incorrect branch condition             | Core                                    | Only `Bool` controls normal `if`                    |
| `Tri`                           | 2    | Unknown treated as allow/true          | Core                                    | No implicit `Bool`; exhaustive `match`                |
| `Galerina`                      | 2    | Missing state handling                 | Core / advanced                        | Exhaustive `match`, no silent narrowing               |
| `Option<T>`                     | 0    | Missing value bugs                     | Core                                    | Must unwrap with `match` explicitly                   |
| `Result<T, E>`                  | 0    | Hidden failure paths                   | Core                                    | Unhandled `Result` warning/error                    |
| `null` at boundaries            | 3    | Null dereference, bypassed validation  | Boundary only                           | Decode to `Option`, `JsonNull` or reject            |
| `undefined`                     | X    | Ambiguous missing state                | Unsupported                             | Reject; suggest `Option`, `Result` or compiler error |
| Numeric types                   | 2    | Overflow, precision loss               | Core                                    | Sized types, overflow policy, decimal where needed  |
| `Decimal` / `Money`             | 2    | Financial rounding mistakes           | Standard library                        | Exact decimal, currency rules, no float money       |
| String concatenation            | 2    | Coercion bugs, injection               | Explicit string concat only             | No JS-style loose `+`; escape by context            |
| `Text`                          | 2    | Encoding and injection mistakes        | Standard library                        | UTF checks, context-aware escaping                  |
| `SafeHtml`                      | 0    | HTML injection                         | Standard library/browser boundary       | Only safe constructors, sanitizer reports           |
| `SecureString`                  | 3    | Secret leakage                         | Standard library                        | Redacted logs, no implicit `String`, memory clearing |
| Mutable local variables         | 2    | State confusion                        | Allowed                                 | Definite assignment and scope checks                |
| Shared mutable state            | 4    | Races, stale state, data leaks         | Denied or explicit                      | Ownership, locks/effects, concurrency reports       |
| Ambient globals                 | X    | Hidden dependencies                    | Unsupported                             | Use explicit globals registry                       |
| Implicit imports                | X    | Hidden dependencies and package risk   | Unsupported                             | Explicit `import` / `use` and package reports       |

---

## Memory and Resource Safety Ranking

Memory safety deserves several independent failsafes. A single check is not
enough.

| Feature / area                  | Risk | Main risk                                  | Galerina default                         | Required checks / failsafes                          |
| ------------------------------- | ---: | ------------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| Ownership / lifetime rules      | 0    | Use-after-free, leaks, alias bugs          | Core design goal                   | Borrow/escape checks, no dangling references         |
| Automatic request cleanup       | 0    | Request-scoped leaks                       | Secure App Kernel                  | Resource scopes, cleanup reports                     |
| Heap allocation                 | 3    | Leaks, memory pressure                     | Allowed with limits                | Allocation budgets, pressure reports, leak checks    |
| Large arrays / vectors          | 3    | Unbounded memory, target transfer leaks    | Allowed with bounds                | Shape checks, memory budgets, fallback reports       |
| Streams                         | 3    | Unclosed handles, backpressure failure     | Allowed                            | `Result`, cancellation, close-on-scope-exit          |
| Files                           | 3    | Leaked handles, path traversal             | Permissioned boundary              | File permissions, path policy, scope cleanup         |
| Network sockets                 | 4    | Resource leak, exfiltration                | Permissioned boundary              | Host allowlist, timeout, close-on-scope-exit         |
| Caches                          | 3    | Unbounded growth, stale secrets            | Explicit only                      | Max size, TTL, eviction reports, no `SecureString`   |
| Queues                          | 3    | Unbounded growth, replay, stuck jobs       | Explicit only                      | Queue limits, backpressure, idempotency              |
| Disk spill                      | 4    | Secret leakage to disk                     | Denied unless explicit             | Encryption, redaction, TTL, spill report             |
| FFI handles                     | 4    | Leaks across native boundary               | Denied by default                  | Ownership wrappers, destructors, audit reports       |
| Raw pointers                    | X    | Memory corruption                          | Unsupported in normal Galerina           | Engine-lab/native boundary only                      |
| Native buffers                  | 4    | Bounds errors, lifetime mismatch           | Boundary only                      | Bounds checks, ownership, platform report            |
| General-purpose GC              | 3    | Hidden pauses, root leaks, hard reporting  | Not required early                 | If added later: GC reports, roots report, leak mode  |

### Required Memory Failsafes

Galerina should layer memory checks:

```text
1. Compile-time lifetime and escape checks.
2. Definite assignment checks.
3. No raw pointers in normal code.
4. Resource scopes for files, sockets, streams and FFI handles.
5. Per-flow and per-request memory budgets.
6. Bounded collections by default for API, queue and batch work.
7. Leak detection in checked Run Mode.
8. Memory-pressure reports in build/dev output.
9. Source-mapped allocation diagnostics.
10. FFI ownership reports for native boundaries.
11. Cache size and TTL policies.
12. Fail-closed behaviour when memory budgets are exceeded.
```

Recommended compiler/runtime error shape:

```text
galerina-MEM-LEAK-001: Resource may escape its cleanup scope.

Resource:
  uploadStream

Source:
  src/uploads/process.spore:18:5

Suggested fix:
  keep the stream inside a resource scope or return Bytes/Result instead.
```

---

## API, Data and App Kernel Ranking

| Feature                         | Risk | Main risk                                 | Galerina default                         | Required checks / failsafes                         |
| ------------------------------- | ---: | ----------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Typed request decoding          | 0    | Untyped input confusion                   | Secure App Kernel                  | Schema validation, source-mapped errors             |
| Raw request body                | 4    | Injection, memory pressure                | Denied unless explicit             | Size limit, content-type check, report              |
| JSON decode                     | 3    | Duplicate keys, null, unknown fields      | Typed decode                       | Deny duplicates/unknowns by default                 |
| XML                             | 4    | XXE, entity expansion, deep nesting       | Compatibility package              | External entities denied, size/depth limits         |
| GraphQL                         | 3    | Query complexity, auth bypass             | Package/contract boundary          | Depth/complexity limits, typed resolvers            |
| OpenAPI / JSON Schema output    | 1    | Wrong generated contract                  | Generated report                   | Contract tests and source maps                      |
| Webhooks                        | 4    | Replay, forged signatures                 | Secure package boundary            | Signature verification, replay window, idempotency  |
| Idempotency                     | 0    | Duplicate side effects                    | Required for side effects          | Idempotency keys and duplicate reports              |
| Rate limits                     | 0    | Abuse and DoS                             | Secure App Kernel                  | Route limits and load-control reports               |
| Queue handoff                   | 3    | Lost or duplicated work                   | Explicit                           | Idempotency, retry policy, dead-letter reports      |
| Authentication                  | 4    | Account takeover                          | Explicit boundary                  | Typed claims, expiry, alg denylist, reports         |
| JWT                             | 4    | `alg:none`, expiry, audience bugs         | Explicit verifier                  | Deny `alg:none`, require exp/aud/iss policy         |
| OAuth/OIDC                      | 4    | Token substitution, redirect bugs         | Explicit package boundary          | State/nonce, issuer checks, SecureString handling   |
| DPoP / mTLS                     | 4    | Broken proof binding                      | Advanced boundary                  | Proof validation and auth reports                   |
| Payment providers               | 4    | Money loss, replay, secret leakage        | Provider boundary                  | SecureString, idempotency, audit logs               |
| Email providers                 | 3    | Injection, secret leakage, spoofing       | Provider boundary                  | Typed payloads, outbound policy, redaction          |
| Cloud/storage providers         | 4    | Data exfiltration                         | Provider boundary                  | Permissions, bucket policy, secret redaction        |

---

## Browser, JavaScript and Framework Ranking

| Feature                         | Risk | Main risk                                 | Galerina default                         | Required checks / failsafes                         |
| ------------------------------- | ---: | ----------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| JavaScript output               | 3    | JS coercion and runtime mismatch          | Target output                      | Source maps, no loose semantics, target reports     |
| TypeScript declarations         | 1    | Contract drift                            | Generated output                   | Declaration tests                                   |
| ESM output                      | 2    | Module resolution bugs                    | Preferred JS module target         | Explicit exports/imports                            |
| CommonJS                        | 3    | Older ecosystem boundary                  | Optional compatibility target      | Explicit target only                                |
| WASM                            | 4    | Memory boundary, host calls               | Compute/browser target             | Memory reports, host permission checks              |
| DOM effects                     | 4    | XSS, unsafe HTML writes                   | Browser boundary                   | SafeHtml, effect permissions, browser reports       |
| `localStorage` / cookies        | 3    | Secret leakage                            | Boundary only                      | Deny `SecureString`, storage policy reports         |
| Camera/microphone/location      | 4    | Privacy breach                            | Denied by default                  | Explicit permissions and platform reports           |
| React/Angular adapters          | 3    | Framework injection and lifecycle bugs    | Generated package output           | Safe props, SafeHtml, source maps                   |
| React Native adapters           | 3    | Mobile framework injection/lifecycle bugs | Generated package output           | Permission reports, native boundary reports         |
| React Native native modules     | 4    | Native permission and memory boundary     | Explicit boundary only             | Ownership, platform and source-map reports          |
| Flutter platform channels       | 4    | Native permission and platform mismatch   | Generated boundary contracts       | Permission reports, unsupported-platform reports    |
| `Dart.Uint8List`                | 3    | Mutable binary boundary confusion         | Dart boundary only                 | Convert from/to Galerina `Bytes`                          |

---

## Compute, AI and Target Ranking

| Feature                         | Risk | Main risk                                  | Galerina default                         | Required checks / failsafes                         |
| ------------------------------- | ---: | ------------------------------------------ | ---------------------------------- | --------------------------------------------------- |
| Pure compute blocks             | 2    | Hidden side effects                        | Allowed                            | Effects checker, deterministic report               |
| Vector/SIMD planning            | 3    | Shape mismatch, precision changes          | Planning/checked fallback          | Shape checks, CPU fallback, target reports          |
| GPU planning                    | 4    | Memory transfer, nondeterminism, precision | Planning first                     | CPU reference, fallback, precision report           |
| AI accelerator planning         | 4    | Model/provider mismatch                    | Package/target boundary            | Provider reports, fallback, data policy             |
| Photonic/wavelength planning    | 3    | Hardware assumptions                       | Planning/simulation only early     | CPU reference, target capability report             |
| Real photonic hardware          | 4    | Hardware-specific unsafe assumptions       | Future target plugin only          | Validation, fallback, deployment profile            |
| `Tri`/ternary target lowering   | 3    | Wrong state mapping                        | Explicit conversion only           | `-1/0/+1` mapping report, no `undefined`            |
| Probabilistic values            | 4    | Uncertainty used as security decision      | Package/advanced only              | Policy conversion, no direct `Bool`                 |
| AI model output                 | 4    | Prompt injection, unsafe confidence        | Package/provider boundary          | Confidence policy, redaction, review thresholds     |
| Embeddings/vector search        | 3    | Data leakage, wrong similarity threshold   | Package/provider boundary          | Data policy, threshold reports                      |
| Image/audio/video AI            | 4    | Privacy, unsafe media parsing              | Package/provider boundary          | Permissions, content limits, provider reports       |
| Quantum/neuromorphic packages   | 4    | Experimental result misuse                 | Experimental packages              | Simulation reports, explicit conversion             |
| Kernel/driver work              | X    | Privilege escalation and system damage     | Not normal Galerina                      | Late-stage maintainer-approved research only        |

---

## Interop and Unsafe Boundary Ranking

| Feature                         | Risk | Main risk                                  | Galerina default                         | Required checks / failsafes                         |
| ------------------------------- | ---: | ------------------------------------------ | ---------------------------------- | --------------------------------------------------- |
| Package `use` registry          | 0    | Untracked dependency risk                  | Required for packages              | Version, permissions, package reports               |
| Native bindings                 | 4    | Sandbox escape, memory corruption          | Denied by default                  | Trusted package, audit, ownership report            |
| FFI / native ABI                | 4    | ABI mismatch, pointer bugs                 | Explicit boundary only             | Layout types, ownership, platform report            |
| SQL drivers                     | 4    | Injection, transaction bugs                | Typed driver boundary              | Parameterisation, transaction reports               |
| NoSQL drivers                   | 4    | Filter injection, permission bypass        | Typed driver boundary              | Typed filters, permission reports                   |
| Shell execution                 | X    | Remote code execution                      | Unsupported in normal Galerina           | Explicit admin/tooling boundary only                |
| `eval`                          | X    | Remote code execution                      | Unsupported in normal Galerina           | Reject; engine-lab only                             |
| Unsafe regex                    | 4    | ReDoS                                      | Denied by default                  | Timeout, max input, audit reason, report            |
| Runtime reflection              | 4    | Bypasses reports and type model            | Denied by default                  | Limited metadata only                               |
| Dynamic imports                 | 4    | Untracked code loading                     | Denied by default                  | Package registry and lockfile                       |

---

## AI-Readable Security Requirements

Galerina should be easy for AI to understand without making security weaker.

AI-friendly features should be ranked as protective only when they preserve exact
semantics.

Required AI safety rules:

```text
syntax should be regular and explicit
formatter should produce stable layout
diagnostics should have stable IDs
errors should include suggested safe fixes
generated code should preserve source maps
security reports should be machine-readable
AI summaries should not include secrets
AI guides should distinguish implemented features from proposals
AI-generated changes should be checkable by compiler reports
```

Unsupported AI shortcuts:

```text
silent source rewriting
hidden framework magic
implicit imports
automatic permission grants
automatic unsafe boundary creation
invented provider capabilities
secret printing in AI summaries
```

---

## Fail-Closed Rules

Galerina should fail closed when a feature is risky and unclear.

```text
If memory ownership is unclear, reject.
If null handling is unclear, reject.
If a secret may be logged, reject.
If a compute target cannot prove fallback, reject or report unsupported.
If a package requests native bindings silently, reject.
If browser storage receives SecureString, reject.
If JSON has duplicate keys, reject by default.
If a webhook lacks replay protection, reject by default.
If an AI confidence controls security directly, reject.
If eval or shell execution appears in normal Galerina, reject.
```

---

## Minimum Reports By Risk Level

| Risk | Required output                                      |
| ---: | ---------------------------------------------------- |
| 0-1  | Normal diagnostics                                   |
| 2    | Diagnostics for unsafe use                           |
| 3    | Security or target report entry                      |
| 4    | Explicit permission, source map and audit report     |
| X    | Compiler error with migration/safe alternative notes |

Example report fields:

```json
{
  "feature": "native_bindings",
  "risk": 4,
  "status": "denied_by_default",
  "source": "boot.spore:22",
  "reason": "Native bindings can bypass Galerina memory safety.",
  "required_policy": "trusted package, ownership report, platform report"
}
```

---

## Implementation Priority

Security implementation should follow this order:

```text
1. Strict parser and clear diagnostics.
2. No undefined, no silent null and no truthy/falsy checks.
3. Option and Result enforcement.
4. Memory scope and resource cleanup checks.
5. SecureString redaction and no-log checks.
6. JSON duplicate/unknown/null policy.
7. API body, route, webhook and idempotency checks.
8. Package permissions and native binding denial.
9. Target and fallback reports.
10. Leak detection in checked Run Mode.
11. FFI ownership reports.
12. AI-readable security summaries.
```

---

## Final Rule

Galerina should be nice to write because safe code is the shortest path.

Galerina should be easy for AI to understand because every risky feature is explicit,
typed, source-mapped and reported.

The core rule:

```text
Developer-friendly syntax.
AI-readable structure.
Security-first semantics.
Fail-closed boundaries.
Multiple memory-safety checks.
```
