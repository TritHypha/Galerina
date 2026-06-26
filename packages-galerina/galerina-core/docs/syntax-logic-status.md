# Galerina Syntax And Logic Status

This table gives a compact status view of common programming concepts in
Galerina. It is a planning aid, not a claim of full language maturity.

Status key:

| Status | Meaning |
|---|---|
| Implemented prototype | Covered by current `.spore` examples and prototype checks. |
| Documented draft | Described in language docs, but parser/checker coverage is incomplete. |
| Package-owned | Belongs in a reusable package, not the core language. |
| TODO | Needed for v1 or production maturity, but not yet implemented. |
| Not core | Intentionally excluded from core syntax. |

Security risk key:

| Risk | Meaning | Colour hint |
|---|---|---|
| High | Common source of injection, memory unsafety, secret leakage, unsafe I/O or hidden control flow. | Red |
| Potential | Safe if designed carefully, but needs parser/checker/runtime rules before production use. | Orange |
| Managed | Security-relevant, but Galerina has an explicit safer design direction or prototype check. | Blue |
| OK | Low direct security risk; mostly syntax, documentation or compile-time structure. | Green |
| N/A | Not core syntax or not applicable to normal Galerina source. | Grey |

Plain Markdown does not reliably preserve table-cell colours across GitHub,
editors and generated docs. Use the text grade as the stable source of truth;
HTML or CSS badges may be added later by the documentation renderer.

| Concept | Galerina form or decision | Status | Security risk | Short reason |
|---|---|---|---|---|
| Source file | `.spore` | Implemented prototype | OK | Galerina source examples and prototype CLI use `.spore`. |
| Entry point | `boot.spore` / `secure flow main()` | Implemented prototype | Managed | Keeps startup explicit and policy-checkable. |
| Function | `flow name(...) -> Type` | Implemented prototype | Managed | Flows may carry effects, reports and target planning. |
| Syntax governance | every syntax feature starts untrusted until typed, effect-checked, permissioned and reportable | Documented draft | Managed | Prevents parser acceptance from becoming implicit trust. |
| Secure function | `secure flow` | Implemented prototype | Managed | Security-sensitive work is visible in the signature. |
| Deny-by-default permissions | missing allow means deny | Documented draft | Managed | Security policy should be source-visible and fail closed. |
| Explicit authority | risky actions require `allow` entries | Documented draft | Managed | Database, file, network, secret, AI/tool, compute, shell and external APIs must not be implicit. |
| Built-in view levels | `Runtime.View { public internal private confidential secret restricted regulated }` | Documented draft | Managed | Field `view:` labels should map to standard runtime exposure levels. |
| Standard view behaviour | `runtime view private { expose when owner == actor }` | Documented draft | Managed | Common view rules should be defined once and inherited by permission references. |
| Input contracts | `request Name { field: Type required }` plus future limits | Documented draft | Managed | Input shape, required fields and ranges should be known before execution. |
| Output target | `response Name target: json` direction | Documented draft | Managed | Encoding, escaping and redaction depend on the sink target. |
| Pure function | `pure flow` | Documented draft | Potential | Pure flows need effect checking before production claims. |
| Async function | `async flow` | Documented draft | Potential | Runtime and cancellation semantics are still pending. |
| Vector function | vector flow direction plus package contracts | Documented draft/package-owned | Potential | Vector execution needs fallback and target reports. |
| Return type | `-> Type` | Implemented prototype | OK | Return types are mandatory for clarity and checking. |
| Variables | `let name: Type = value` | Implemented prototype | Managed | Explicit types avoid hidden coercion and missing-value ambiguity. |
| Mutable variables | `mut name = ...` / `mut name++` direction | TODO | Potential | Mutation must be explicit and fit the ownership and borrowing model. |
| `if` | `if condition { ... }` | Documented draft | Potential | Requires strict condition typing. |
| Loops | `for`, `while`, `wait until` | Documented draft | Potential | Needs bounds, termination and resource diagnostics. |
| For-each | typed collection iteration | Documented draft | Potential | Element types and mutation rules must be checked. |
| Pattern matching | `match value { Case => ... }` | Implemented prototype | Managed | Used for enums, `Option`, `Result`, `Tri` and `Decision`. Replaces `match`, `switch`, `case`. |
| Result match | `match result { Ok(value) => ... Err(error) => ... }` | Implemented prototype | Managed | Covered by `examples/result.spore`. |
| Option match | `match value { Some(v) => ... None => ... }` | Implemented prototype | Managed | Makes missing values explicit. |
| Enum match | `match enumValue { Case => ... }` | Implemented prototype | Managed | Exhaustiveness diagnostics are part of the checker direction. |
| Boolean | `Bool` | Documented draft | Potential | Full conversion rules are still being finalised. |
| Ternary logic | `Tri` | Implemented prototype/package-owned | Managed | `galerina-core-logic` owns tested operations and conversion policy. |
| Decision logic | `Decision` with `ALOw`, `Deny`, `Review` | Implemented prototype/package-owned | Managed | Avoids reducing approval states to unsafe booleans. |
| Omni logic | bounded Omni logic definitions | Package-owned | Potential | Belongs to `galerina-core-logic`; unbounded spaces are rejected. |
| Enums | `enum Name { Case }` | Implemented prototype | OK | Used by examples and match exhaustiveness checks. |
| Records | `type Name { field: Type }` | Implemented prototype | OK | Keeps data shape explicit and reportable. |
| Type alias | `type Id = String` | Implemented prototype | OK | Useful for IDs and domain-specific scalar names. |
| Optional value | `Option<T>`, `Some`, `None` | Implemented prototype | Managed | Avoids silent missing values. |
| Recoverable error | `Result<T, E>`, `Ok`, `Err` | Implemented prototype | Managed | Errors are visible in function signatures. |
| Exceptions | not the default error model | Documented draft | Potential | Readable `try` may exist only as syntax over explicit `Result`. |
| Arrays/lists | `Array<T>` | Implemented prototype | Potential | Generic collection shape is explicit; bounds checks remain required. |
| Maps | `Map<K, V>` | Documented draft | Potential | Full parser/checker coverage is pending. |
| Sets | `Set<T>` | Documented draft | OK | Full parser/checker coverage is pending. |
| Printing simple text | `print("text")` | Implemented prototype | Potential | Production output needs redaction policy. |
| Raw object dump | no native raw dump; use future safe debug/report output | TODO / Not core | High | Dumps must respect redaction, size limits and secret-safe values. |
| Logging | planned `console.*` / reports | TODO | High | Production logging needs redaction and policy checks. |
| Secret-safe output | `view: secret` denied from normal returns/logs/AI/cache | Documented draft | Managed | Secret exposure must require a narrow safe sink and audit trail. |
| JSON decode | `json.decode<T>(input)` | Implemented prototype | Managed | JSON must decode into a declared type. |
| JSON encode | `json.encode` | Documented draft | Potential | Planned as typed JSON support. |
| API route | `api Name { POST "/path" { ... } }` | Implemented prototype | Managed | API boundaries are typed contracts. |
| Resource budget | `budget { cpu: small memory: small time: 100ms }` direction | Documented draft | Managed | Budgets limit resource exhaustion and expensive abuse paths. |
| Audit declaration | `audit required event "..."` | Documented draft | Managed | Security-relevant flows should produce explicit audit evidence. |
| Audit actor attribution | runtime-owned actor/request/permission context | Documented draft | Managed | Audit identity should inherit governed runtime context and not be spoofed by app code. |
| Multi-actor audit metadata | `affected_actor`, `delegated_actor`, `source_actor`, `system_actor`, `ai_actor` | Documented draft | Managed | Extra actors may be metadata, but primary actor remains runtime-owned. |
| Webhook | `webhook` syntax/docs | Implemented prototype/draft | High | Deeper verification remains package/kernel work. |
| Effects | `effects [network.inbound]` | Implemented prototype/draft | Managed | Effects are visible for security and target planning. |
| Raw SQL | gated by `allow db.raw_sql` | Documented draft | High | Typed queries are preferred; raw SQL is high-risk authority. |
| Field read rules | `fields: [id, owner]`, `fields: all except [...]`, `fields: all current except [...]` | Documented draft | Managed | Explicit allow lists are safest; broad reads need warnings and future-field controls. |
| Parallel work | `parallel`, workers, channels | Implemented prototype/draft | High | Production scheduler and safety checks are future work. |
| Memory ownership | hybrid ownership/borrowing model | TODO | High | Required before production safety claims. |
| Manual pointer-like access | not core Galerina syntax | Not core | High | Unsafe memory access must go through audited interop/trusted modules. |
| Native-compatible layout | `layout native struct` at ABI/systems boundaries | Documented draft | High | Must declare alignment, ownership and report risk. |
| Systems profile | future `profile systems_safe` / `profile interop_native` | TODO | High | Low-level buffers and ABI work need memory model maturity first. |
| Machine profile bridge | runtime/tooling bridge from checked source to local machine capability profile | Documented draft | Managed | Keeps app syntax high-level while setup adapts to the deployment machine. |
| Dynamic code execution | rejected or gated | Implemented prototype check | High | Avoids code injection and AI-generated executable text risks. |
| Runtime mutation | forbidden in normal code; use adapters, interfaces, pipelines, test mocks or signed hotfix packages | Documented draft | High | Hidden mutation breaks type, effect, source-map and report guarantees. |
| Imports/modules | `imports { use ... }` direction | Documented draft | Potential | Final module syntax remains open. |
| Packages | package registry/lock/profile docs | TODO | High | Package resolution must be reproducible and permissioned. |
| Classes/inheritance | disallowed in normal Galerina source | Not core | High | Use records, enums, flows, contracts and explicit composition instead; inherited authority is not allowed. |
| Contract polymorphism | contracts plus explicit implementations/adapters | Documented draft | Managed | Allows different implementations without hiding authority. |
| Variant polymorphism | sealed variants plus exhaustive `match` | TODO | Managed | Needed for safe domain variation without inheritance chains. |
| Generics | `Array<T>`, `Result<T,E>`, typed contracts | Documented draft | Potential | Generic constraints/protocols remain production-readiness work. |
| Protocols/interfaces | protocol/constraint model pending | TODO | Potential | Needed before mature generic libraries and contract polymorphism. |
| Native interop | `interop native` with explicit `abi` and audited contracts | TODO | High | Interop must declare ownership, nullability, layout and audit reports. |
| Systems backend output | generated backend artifacts from checked IR | TODO/package-owned | High | Future output target, not normal unsafe source style. |
| Vector/matrix/tensor | `Vector`, `Matrix`, `Tensor` contracts | Package-owned | Potential | `galerina-core-vector` owns validation and reports. |
| AI inference | `ai.infer` package contracts, generic targets | Package-owned | High | AI is package/runtime work, not normal app control-flow syntax. |
| NPU target | `prefer npu`, explicit fallback reports | Package-owned | Potential | NPU is a compute target for model inference, not general-purpose code. |
| Unsafe regex/patterns | `Pattern`, `UnsafeRegex` policy docs | Documented draft | High | Unsafe regex must be named and gated. |
| Tests | `Galerina test`, future test syntax | Implemented prototype/draft | Managed | CLI has prototype tests; source-level test syntax remains pending. |

## Detailed Syntax Checklist

This checklist is intentionally broad. Some entries are active v1 work, some are
package-owned, and some are listed specifically so they are not accidentally
invented as core syntax later.

| Area | Item | Galerina status | Galerina decision |
|---|---|---|---|
| Functions | normal function | Implemented prototype | Use `flow name(...) -> Type`. |
| Functions | secure function | Implemented prototype | Use `secure flow` for security-sensitive work. |
| Functions | pure function | Documented draft | Use `pure flow`; needs full effect checker. |
| Functions | async function | Documented draft | Use `async flow`; runtime/checker still pending. |
| Functions | vector function | Documented draft/package-owned | Use vector flow direction and package contracts. |
| Functions | generic function | TODO | Needs generic constraints/protocol rules. |
| Functions | lambda/closure | TODO | Deferred until capture, lifetime and effect rules are clear. |
| Branching | `if` / `else` | Documented draft | Must preserve strict condition rules. |
| Branching | pattern matching | Implemented prototype | Used for enums, `Option`, `Result`, `Tri`, `Decision`. |
| Branching | `match result` | Implemented prototype | `examples/result.spore` uses `Ok` and `Err`. |
| Branching | `match option` | Implemented prototype | `examples/option.spore` uses `Some` and `None`. |
| Branching | catch-all arm (`_ => ...`) | Documented draft | `_ =>` inside the match block is the catch-all; security-sensitive fallbacks must be explicit, observable and safe. |
| Loops | counted `for` | Documented draft | Planned with bounds and mutation checks. |
| Loops | foreach | Documented draft | Prefer explicit collection iteration with element type checks. |
| Loops | `while` | Documented draft | Planned with termination/resource diagnostics. |
| Loops | `break` / `continue` | TODO | Needs cleanup/defer/rollback semantics. |
| Waiting | `wait until` | Documented draft | Needs runtime scheduling and timeout policy. |
| Waiting | `await`, `await all`, `await race` | Documented draft | Must report cancellation and partial failure. |
| Concurrency | `parallel`, worker, channel | Implemented prototype/draft | Production scheduler is pending. |
| Data | primitive scalar types | Implemented prototype/draft | Parser coverage varies. |
| Data | fixed-width integers | Documented draft | Needed for deterministic reports and interop. |
| Data | secure string | Documented draft | Must be redacted and blocked from unsafe sinks. |
| Data | bytes | Documented draft | Needed for binary, crypto and I/O boundaries. |
| Data | record type | Implemented prototype | Use `type Name { field: Type }`. |
| Data | enum type | Implemented prototype | Used by examples and match checks. |
| Data | variant/sealed union | TODO | Needed for mature domain modelling. |
| Data | destructor/finalizer | TODO | Deterministic cleanup model must come first. |
| Data | protocol/interface | TODO | Needed later for generic packages. |
| Data | explicit polymorphism | Documented draft | Use contracts, adapters, constrained generics and variant matches; selected implementations must be reportable. |
| Values | immutable binding | Implemented prototype | Immutable-by-default direction. |
| Values | explicit mutation | TODO | Use `mut` for mutation operations; assignment, increment and decrement without `mut` should fail. |
| Values | readonly value | Documented draft | `readonly` replaces `const` for v0.1 values that cannot change after creation. |
| Values | constant | Not core for v0.1 | Add `const` later only if compile-time constants need semantics distinct from `readonly`. |
| Values | assignment | TODO | Needs explicit `mut`, ownership and borrow checks. |
| Values | destructuring | TODO | Useful later, but can obscure ownership/moves. |
| Values | type inference | Documented draft | Public boundaries should remain explicit. |
| Operators | arithmetic/comparison/boolean | Documented draft | Needs overflow and strict compatibility rules. |
| Errors | `Result` | Implemented prototype | Primary recoverable error model. |
| Errors | `Option` | Implemented prototype | Primary missing-value model. |
| Errors | `try` over Result | Documented draft | Syntax sugar only over explicit `Result`. |
| Errors | panic/fatal/assert | TODO | Needs build-mode and security policy semantics. |
| I/O | print | Implemented prototype | Simple output exists for examples/run mode. |
| I/O | safe debug/report dump | TODO | Must redact and limit size. |
| I/O | file/environment/network/database | Documented draft/package-owned | Must be permissioned and effect-checked. |
| API | route, handler, webhook | Implemented prototype/draft | Security checks must be explicit and reportable. |
| API | middleware | Documented draft/package-owned | Kernel/framework package owns lifecycle policy. |
| JSON | decode/encode | Implemented prototype/draft | Strict typed contracts by default. |
| Security | permissions/security blocks | Documented draft | Policy should be source-visible and reportable. |
| Security | secret literal scan | Implemented prototype check | Raw secret-like literals are flagged. |
| Security | dynamic execution scan | Implemented prototype check | Unsafe dynamic execution is rejected or gated. |
| Memory | ownership/borrow/move | TODO | Core v1 maturity blocker. |
| Memory | clone | Documented draft | Large clone warnings are part of the direction. |
| Memory | managed cleanup | Not decided | Must not hide resource cleanup. |
| Memory | native-compatible layout | Documented draft | Use `layout native` with explicit ABI only for ABI/generated backend boundaries. |
| Profiles | secure app profile | Documented draft | Normal app code should deny unsafe effects. |
| Profiles | systems-safe profile | TODO | Needed later for runtime internals, ABI and buffers. |
| Profiles | native interop profile | TODO | Requires ownership, nullability, allocator and ABI report rules. |
| Modules | import/use, visibility | Documented draft | Module/visibility docs exist; parser work pending. |
| Metaprogramming | reflection/code generation | TODO/package-owned | Must be strict, source-mapped and reportable. |
| Targets | CPU/runtime target | Documented draft/package-owned | Target packages own detailed contracts. |
| Targets | secure web runtime | Documented draft | Main v1 milestone through `galerina serve`. |
| Targets | machine profile bridge | Documented draft | Runtime setup adapts boot/main plans to local capabilities without changing source meaning. |
| Targets | native executable target | TODO/package-owned | Future `galerina-target-native` target after ABI rules stabilise. |
| Targets | WASM target | TODO/package-owned | Needs target plans. |
| Targets | GPU/NPU/photonic targets | Package-owned | Planning/report targets, not normal control flow. |
| Vector | vector/matrix/tensor | Package-owned | Vector and AI packages own shape/precision checks. |
| AI | inference, embeddings, prompts | Package-owned | Package-owned with privacy/report policy. |
| Testing | CLI tests | Implemented prototype | Prototype test command exists. |
| Testing | source test syntax | TODO | Needs test model and report schemas. |
| Tooling | formatter | Implemented prototype | Prototype formatter/check exists. |
| Tooling | linter/debugger/source maps | TODO/draft | Needs compiler and runtime integration. |

## Not Core For V1

These constructs are listed separately so they are visible without cluttering the
active syntax checklist. They are not part of the v1 core surface. Some may be
reconsidered later after the parser, checker, memory model, effect system and
package boundaries are stable.

| Area | Item | Security risk | Reason not in v1 core |
|---|---|---|---|
| Functions | variadic function | Potential | Weakens typed API contracts unless carefully constrained. |
| Branching | ternary expression | Potential | `match` and explicit `if` are clearer for strict logic. |
| Loops | infinite `loop` | High | Too easy to hide runaway work; require explicit `while` or worker policy. |
| Loops | `do while` | Potential | Avoid extra loop forms until core grammar is stable. |
| Loops | comprehensions | Potential | Can hide allocation, iteration cost and effects. |
| Concurrency | detached task | High | Unstructured tasks weaken cleanup, cancellation and auditability. |
| Data | class | Potential | Use records plus flows first; class syntax can wait. |
| Data | method | Potential | Prefer namespaced flows until the object model is designed. |
| Data | constructor | Potential | Prefer typed values and validation flows. |
| Data | inheritance | High | Disallowed in normal Galerina source; use contracts, adapters, variants and generics. |
| Values | global variable | High | Conflicts with strict global registry and effect visibility. |
| Values | `const` as separate v0.1 syntax | Potential | `readonly` is enough for now; compile-time constants can be reconsidered later. |
| Values | static local | High | Hidden state should be explicit and reported. |
| Operators | null coalescing | Potential | Prefer explicit `Option` matching. |
| Operators | operator overloading | Potential | Can hide work/effects; reconsider after protocols. |
| Metaprogramming | compile-time function execution | High | Too much complexity before parser/checker maturity. |
| Runtime mutation | monkey patching | High | Hidden runtime mutation is incompatible with Galerina contracts and reports. |

## Practical Rule

When a feature is ordinary control flow or type safety, it can belong in
`galerina-core`. When a feature talks to a device, framework, model, database,
network provider or native library, it should usually be package-owned and
reported instead of becoming permanent core syntax.
