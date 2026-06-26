# Excluded Features

## Definition

Galerina deliberately excludes certain common programming features to keep the language:

```text
secure
predictable
auditable
fast to analyse
easier for AI to understand
easier for the runtime to govern
```

The purpose is not to remove power. The purpose is to remove features that create hidden behaviour, unsafe authority, performance unpredictability, or confusing runtime paths.

## Core Principle

```text
If a feature makes runtime behaviour harder to prove,
harder to audit,
harder to secure,
or slower to govern,
Galerina should avoid it.
```

## Excluded Features Table

| Feature Galerina Should Not Have | Reason | Security / Speed Concern | Recommended Galerina Alternative |
| --- | --- | --- | --- |
| Classes | Can hide state and behaviour inside objects | Harder to audit authority and side effects | Use `type`, `flow`, and `fn` |
| Inheritance | Creates hidden behaviour through parent/child chains | Harder to reason about permissions, data flow, and overrides | Use composition and explicit functions |
| Polymorphic inheritance | Same call can execute different hidden implementations | Makes runtime authority harder to prove | Use explicit `match` or typed flow dispatch |
| Method overriding | Child logic can silently replace parent logic | Dangerous for security-critical flows | Use named flows and explicit selection |
| Magic methods | Hidden behaviour triggered automatically | Hard to audit and easy to misuse | Use explicit runtime functions |
| Reflection | Code can inspect or manipulate runtime structures dynamically | Can bypass governance if unrestricted | Use explicit metadata generated at compile time |
| Dynamic eval | Executes generated code at runtime | Major code injection risk | Use signed packages, validated flows, and build-time compilation |
| Runtime code generation | Creates unverified execution paths | Hard to sign, audit, and prove | Generate code at build time only |
| Monkey patching | Changes existing behaviour at runtime | Can silently weaken security | Use governed runtime extension points |
| Unrestricted plugins | Third-party code may access sensitive data | Data leakage and authority bypass risk | Use sandboxed WASM plugins with declared permissions |
| Open-ended hooks | Plugins may attach anywhere | Can expose data and create unpredictable execution | Use approved runtime extension points |
| Global mutable variables | Shared state can change unpredictably | Race conditions and hidden authority | Use explicit runtime state or GlobalVault |
| Direct access to environment variables | Secrets may leak or be used unsafely | Secret exposure risk | Use `GlobalVault` |
| Raw pointers | Manual memory access | Memory corruption risk | Use memory-safe values only |
| Manual memory free/delete | Use-after-free, double-free, leaks | Memory safety risk | Use automatic cleanup and `release` |
| Unchecked casts | Treats data as another type without proof | Type confusion and unsafe trust promotion | Use validators and explicit conversion |
| Unsafe promotion | Turning `unsafe` into `safe` manually | Breaks trust model | Use approved `validate`, `clean`, `encode.*` |
| Unsafe string interpolation into queries | SQL/query injection risk | External boundary compromise | Use `Query` with safe parameters |
| Raw SQL as `Text` | Runtime cannot govern it as a query | Query safety lost | Use `Query` blocks |
| Shell command strings from user input | Command injection risk | High-risk execution boundary | Use `safe ShellArg` and restricted shell runtime |
| Implicit network access | Code can call external systems without declaration | Hidden data-in-motion risk | Use declared APIs and runtime-governed communication |
| Hidden file access | Filesystem becomes uncontrolled boundary | Data leakage / path traversal risk | Use declared file permissions |
| Implicit database access | Query execution hidden inside helpers | Hard to audit data flow | Use `uses database.*` and `Query` |
| Multiple inheritance | Complex behaviour resolution | Very hard to analyse and audit | Do not support inheritance |
| Operator overloading | Operators can hide arbitrary logic | Confusing behaviour and side effects | Keep operators simple and predictable |
| Exceptions as hidden control flow | Execution jumps are harder to audit | Can bypass cleanup or validation paths | Use explicit `Result` / `else` / `attempt` model |
| `elseif` | Encourages long branch chains | Harder to read than structured matching | Use `if/else` or `match` |
| `switch` | Duplicates `match` behaviour | Extra syntax surface | Use `match value { ... }` |
| `case` | Duplicates `match` behaviour | Unneeded syntax complexity | Use `match` |
| Public mutable object state | State can be changed anywhere | Hard to audit ownership | Use explicit values and controlled flows |
| Hidden constructors | Object setup can perform side effects | Runtime authority may be hidden | Use explicit factory flows/functions |
| Destructors with side effects | Cleanup may secretly perform logic | Hard to reason about runtime actions | Use `release` and end-of-flow cleanup |
| Implicit type coercion | Values change type unexpectedly | Bugs and security confusion | Use explicit conversion |
| Null by default | Null errors and unsafe assumptions | Runtime instability | Prefer `none` or typed optional values |
| Unbounded recursion | Stack/memory exhaustion risk | Performance and denial-of-service risk | Use bounded recursion or iteration limits |
| Unbounded loops | Runtime can hang | DoS and resource exhaustion | Require runtime budgets/timeouts |
| Unbounded arrays/strings | Memory pressure risk | DoS and performance risk | Use runtime limits |
| Hidden async behaviour | Work happens outside visible flow | Harder to audit and clean up | Use Scheduler, triggers, and workers |
| Background tasks without runtime registration | Invisible execution | Audit/provenance gaps | Use scheduled actions and triggers |
| Direct thread control | Race conditions and unsafe concurrency | Harder to govern | Use workers and Scheduler |
| Shared mutable concurrency | Data races and unpredictable state | Security and correctness risk | Use isolated workers and message passing |
| Runtime identity written manually everywhere | Developers will misconfigure it | False sense of security | Use runtime-managed identity |
| Manual route definitions in normal app code | Too much infrastructure burden | Configuration drift and mistakes | Use automatic runtime route governance |
| Manual channel definitions in normal app code | Developers may configure incorrectly | Weak communication security | Use automatic secure channels by default |
| Manual provenance records | Developers will forget or fake records | Audit weakness | Runtime-generated provenance |
| Manual transparency logging in app code | Too much ceremony | Inconsistent supply-chain proof | Tooling/runtime-generated logs |
| Manual build attestation in app code | Not realistic for normal developers | Configuration burden | CI/runtime generated attestations |
| AI-generated code with privileged access by default | AI may create unsafe logic | Security and authority risk | Use automatic risk scoring and human approval only for high risk |
| Third-party plugins receiving full data | Plugin can exfiltrate sensitive data | Major data exposure risk | Metadata-only by default |
| Plugins that modify core runtime | Runtime can be weakened | Security boundary collapse | Additive sandboxed runtime extension points only |

## Features Galerina Should Prefer

| Preferred Feature | Purpose |
| --- | --- |
| `flow` | Main authorised executable unit |
| `fn` | Pure helper logic with no authority |
| `safe` / `unsafe` | Trust-state tracking |
| `validate` | Prove data shape/type/range |
| `clean` | Remove dangerous content |
| `encode.*` | Context-specific output safety |
| `Query` | Protected query artifact |
| `GlobalVault` | Secure secret/config access |
| `release` | Optional early cleanup |
| End-of-flow cleanup | Automatic runtime cleanup |
| `match` | Multi-branch logic |
| `if/else` | Simple boolean logic |
| `task` / `wait` | Governed async work in flows |
| `attempt ... else error {}` | Error handling without hidden jumps |
| `none` | Absence of value (not null) |
| `each` | Iteration (not for) |
| Scheduler | Runtime timing engine |
| Trigger | Activation rule |
| Scheduled action | Flow run by Scheduler |
| Runtime extension point | Approved plugin attachment point |
| WASM plugin sandbox | Safe plugin execution |

## Summary

Galerina avoids features that create:

```text
hidden behaviour
hidden authority
hidden state
hidden execution
hidden communication
hidden trust changes
```

Galerina prefers:

```text
explicit flow
explicit permissions
explicit trust conversion
explicit boundaries
automatic runtime governance
```

## Core Principle

```text
Galerina should be powerful through governance,
not through unrestricted runtime freedom.
```
