# Galerina Legacy and Compatibility Boundaries

Galerina should not copy unsafe legacy behaviour from older languages.

However, Galerina must still interoperate with existing systems.

The rule is:

```text
Support old ecosystems through explicit boundaries.
Do not import old unsafe behaviour into Galerina Core.
```

This keeps Galerina modern at the core and practical at the edges.

---

## Current Baseline

Galerina is a v0.1 prototype. The practical execution baseline is strict, checked,
CPU-compatible execution.

GPU, photonic, ternary, wavelength and Omni outputs should remain target plans,
fallback reports or simulation artefacts until real backends exist.

Compatibility features should be:

```text
explicit
typed
permission-checked
source-mapped
reported
auditable
denied by default when unsafe
```

---

## Boundary Categories

Galerina should use three categories.

```text
1. Deprecated / migration only
   Old Galerina ideas that should not continue.

2. Compatibility boundary
   Old or external ecosystem features that Galerina supports safely because real
   systems use them.

3. External package / provider only
   Specialist systems that Galerina should never make native.
```

Do not call compatibility-boundary items "Galerina Core features".

---

## Deprecated Galerina Ideas

| Old idea                | Status                     | Replacement                                |
| ----------------------- | -------------------------- | ------------------------------------------ |
| `.language` files       | Deprecated / not supported | `.spore`                                      |
| `main.spore` only projects  | Compatibility only         | `boot.spore` for full projects                |
| photonic-only execution | Rejected                   | CPU baseline with optional target planning |
| hidden runtime magic    | Rejected                   | source maps, reports and explicit policy   |
| unreported target jumps | Rejected                   | target compatibility and fallback reports  |

Migration tools may diagnose old source names and suggest `.spore`, but normal Galerina
should not support old source extensions.

---

## Legacy Behaviours Galerina Rejects

Galerina should reject these behaviours in normal Galerina code:

```text
undefined
silent null
truthy/falsy control flow
loose implicit type coercion
implicit imports
ambient globals
monkey patching
prototype mutation
unchecked raw pointers
unchecked native bindings
hidden exceptions as normal error flow
unsafe regex by default
runtime reflection by default
runtime code generation by default
eval
provider-specific syntax in core
framework-native syntax in core
kernel/driver/raw hardware access in normal code
```

These are not rejected because they are old. They are rejected because they
weaken static analysis, source maps, security reports, memory safety or explicit
control flow.

---

## Not Supported In Normal Galerina

| Feature / behaviour          | Galerina position                            | Reason                                              |
| ---------------------------- | -------------------------------------- | --------------------------------------------------- |
| `undefined`                  | Not supported                          | Ambiguous missing state; use `Option` or `Result`   |
| silent `null`                | Not supported                          | Hidden failure path; decode at boundaries           |
| truthy/falsy branching       | Not supported                          | Only `Bool` should control normal conditions        |
| loose string/number coercion | Not supported                          | Avoid JavaScript-style coercion bugs                |
| `eval`                      | Not supported in normal Galerina runtime     | Remote code execution and broken static analysis    |
| monkey patching              | Not supported                          | Breaks type and security guarantees                 |
| prototype mutation           | Not supported                          | Imports JavaScript object-model risks               |
| ambient globals              | Not supported                          | Hidden dependencies and hard-to-audit state         |
| implicit imports             | Not supported                          | Package use must be explicit and reportable         |
| unchecked raw pointers       | Not supported in normal code           | Memory corruption and unsafe aliasing risks         |
| unchecked native bindings    | Not supported                          | Sandbox escape, memory and secret-handling risks    |
| unsafe regex by default      | Not supported                          | ReDoS and unpredictable performance                 |
| provider syntax in core      | Not supported                          | Providers belong behind packages/adapters           |
| framework syntax in core     | Not supported                          | Frameworks belong behind generators/adapters        |
| kernel/driver work           | Not supported in early normal Galerina       | High-risk, platform-specific, late-stage capability |

---

## Monkey Patching Policy

Monkey patching is not a compatibility feature for normal Galerina. It is hidden
runtime mutation and should be denied.

Monkey patching means changing existing behaviour after the original code has
loaded. This includes modifying built-ins, imported modules, package internals,
framework methods, response serializers, security policy functions or third-party
provider functions.

Rule:

```text
Runtime modification of existing behaviour is denied by default.
Behaviour changes must be explicit, typed, permissioned, source-mapped and reported.
```

Rejected normal Galerina patterns:

```galerina
patch String {
  flow isEmail() -> Bool
}
```

```galerina
replace galerina.http.Response.send {
  // changed globally
}
```

```galerina
override imported PaymentProvider.charge {
  // hidden runtime behaviour change
}
```

These patterns are rejected because they break source-level contracts. The code
that calls `String`, `Response.send` or `PaymentProvider.charge` can no longer be
understood from imports, types, effects, permissions or reports.

Use explicit extension points instead:

| Need | Galerina-safe alternative | Why |
|---|---|---|
| Replace a provider | Adapter package | Provider choice is declared and reportable. |
| Share behaviour | Interface/protocol/trait contract | Callers depend on a typed contract, not hidden mutation. |
| Add API processing | Pipeline or middleware declaration | Order and effects are visible. |
| Mock a dependency | Test-only mock binding | Cannot leak into production if gated by test mode. |
| Apply emergency security fix | Signed hotfix package | Replacement is versioned, audited and reported. |

Example adapter direction:

```galerina
adapter StripePaymentAdapter implements PaymentProvider {
  secure flow charge(request: PaymentRequest)
    -> Result<PaymentResponse, PaymentError>
  effects [network.outbound] {
    return Err(PaymentError.ProviderUnavailable)
  }
}
```

Example test-only mock direction:

```galerina
test mock PaymentProvider with FakePaymentProvider
```

This must be valid only in test mode and must be reported if any mock binding is
present in a production build.

Example hotfix direction:

```galerina
hotfix package security_patch_2026_05 {
  replaces galerina-framework-api-server@0.1.4
  reason "security fix"
  signed true
  audit required
}
```

Hotfix packages are not monkey patches. They are explicit package replacement
contracts that can be locked, reviewed, signed, source-mapped and reported.

Compiler diagnostics should reject:

```text
modifying imported package internals
modifying built-in types
replacing runtime functions
changing response serialization globally
changing auth/security behaviour at runtime
adding undeclared properties to existing models
using eval-like dynamic code mutation
allowing test mocks in production
```

Suggested diagnostic:

```json
{
  "code": "SPORE-SEC-PATCH-001",
  "severity": "error",
  "message": "Runtime patching is not allowed. Use an adapter, interface, pipeline, test mock or signed hotfix package.",
  "safeToShow": true
}
```

For JavaScript output, generated Galerina code must avoid prototype mutation. Do
not generate:

```js
Array.prototype.first = function () {
  return this[0];
};
```

Generate ordinary functions or modules instead:

```js
export function first(array) {
  return array[0];
}
```

Production JavaScript runtimes may freeze critical generated runtime objects, but
that must be target-policy controlled and reported because it can break some host
ecosystem packages.

---

## Eval Policy

`eval` is not a compatibility feature for normal Galerina. It is an unsafe dynamic code
execution feature and should be denied.

Reason:

```text
eval allows code to be created and executed at runtime.
```

Risks:

```text
remote code execution
injection attacks
unpredictable optimisation
harder static analysis
harder security reporting
broken source maps
broken trust boundaries
```

Recommended policy:

```Galerina
runtime_policy {
  dynamic_code {
    eval "deny"
    dynamic_import "deny_by_default"
    runtime_code_generation "deny"
  }
}
```

If dynamic code is ever researched, it should be treated as unsafe engine-lab
work, not normal Galerina:

```Galerina
unsafe dynamic_code
reason "Sandboxed engine-lab experiment only" {
  eval "deny"
  sandbox required
  timeout 100ms
  memory 16mb
  report true
}
```

Production default:

```text
eval denied
```

---

## Compatibility Features Galerina May Support

Galerina may support these because existing systems use them:

```text
XML
GraphQL
CommonJS
PCRE-style regex
JSON null at boundaries
exceptions at interop/system boundaries
Native ABI
FFI
native bindings
SQL drivers
NoSQL drivers
SMTP
IMAP
email providers
payment providers
cloud and storage provider SDKs
JavaScript browser interop
DOM/browser APIs
cookies
session storage
localStorage
Node target
WebAssembly
React adapters
React Native adapters
Angular adapters
Dart/Flutter interop
platform channels
Pigeon-style typed APIs
Uint8List at Dart boundaries
hardware vendor target plugins
```

These features should be explicit boundaries, packages, adapters, generated
outputs or deployment profiles. They should not become implicit Galerina Core
behaviour.

---

## Compatibility Support Table

| Feature / idea                     | Current Galerina position                  | Keep because                              | Recommendation                                      |
| ---------------------------------- | ------------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| `.language` source files           | Deprecated / migration only          | Historical Galerina design path                 | Do not support except migration diagnostics         |
| `main.spore` entry file               | Simple-script compatibility          | Common language convention                | Keep for scripts; prefer `boot.spore` for projects     |
| JSON `null`                        | Boundary value only                  | APIs and databases use it                 | Decode to `Option` or `JsonNull`                    |
| JavaScript `undefined`             | Rejected                             | JavaScript compatibility pressure         | Do not support; emit migration diagnostics          |
| truthy/falsy logic                 | Rejected                             | Familiar in dynamic scripting styles      | Do not support; require `Bool`                      |
| hidden exceptions                  | Rejected as normal error flow        | External ecosystems use exceptions        | Use only for unrecoverable/system/interop cases     |
| PCRE-style regex                   | Unsafe compatibility boundary        | Legacy patterns may require it            | Allow only as audited `UnsafeRegex`                 |
| XML                                | Compatibility package/stdlib feature | Enterprise APIs and config formats        | Support safe XML with entity limits                 |
| GraphQL                            | Package/contract boundary            | Existing APIs use it                      | Support typed contracts, not core syntax            |
| CommonJS                           | Optional JS target compatibility     | Older Node/npm packages use it            | Keep optional; ESM default                          |
| JavaScript output                  | Frontend target                      | Browsers run JavaScript                   | Keep as first browser target                        |
| WebAssembly                        | Compute-heavy target                 | Browser/Node support WASM                 | Keep for compute blocks, not DOM/UI work            |
| DOM/browser APIs                   | Browser package/effects boundary     | Web apps require DOM, fetch and events    | Keep safe primitives and reports                    |
| browser storage                    | Browser boundary                     | Existing apps use it                      | Deny secrets and `SecureString` storage             |
| React/Angular adapters             | Generated package output             | Existing frontend ecosystems              | Keep as generators, not Galerina Core                     |
| React Native adapters              | Generated mobile package output      | Existing mobile ecosystem                 | Keep like Dart/Flutter interop, not Galerina Core UI      |
| Node target                        | Backend target                       | Existing backend ecosystem                | Keep ESM/WASM/worker-compatible output              |
| Dart/Flutter target                | Generated package/plugin output      | Flutter ecosystem                         | Keep as interop output, not Flutter-native core     |
| `Dart.Uint8List`                   | Boundary-only type                   | Dart APIs use it                          | Use `Bytes` in Galerina, convert at Dart boundary         |
| Flutter platform channels          | Generated boundary contracts         | Flutter native APIs use them              | Keep as reports/contracts                           |
| FFI / native ABI / native bindings | Unsafe explicit boundary             | Existing system libraries matter          | Permissioned, audited and source-mapped only        |
| SQL / NoSQL                        | Driver/package boundary              | Real apps need databases                  | Typed drivers, not built-in DB engine/ORM           |
| SMTP / IMAP / email                | Provider package boundary            | Existing systems need email               | Typed payloads and network permissions              |
| payment providers                  | Provider package boundary            | Real apps use payment systems             | Typed providers and `SecureString` handling         |
| cloud/storage SDKs                 | Provider package boundary            | AWS/Azure/GCP/Firebase/S3 exist           | Packages/providers, never hard-coded in core        |
| CUDA/ROCm/TPU                      | Target plugin/deployment profile     | Real accelerators are vendor-specific     | Optional plugins only                               |
| kernel/drivers/raw hardware access | Blocked by default                   | High-risk specialist work                 | Late-stage only with maintainer approval            |

---

## Tri, Ternary and Undefined

`-1` must not mean `undefined`.

The distinction is:

```text
-1 is a value.
undefined is not a value.
```

Recommended Galerina meaning for `Tri`:

```text
Tri.false   = -1
Tri.unknown =  0
Tri.true    = +1
```

Recommended decision mapping:

```text
Deny   = -1
Review =  0
Allow  = +1
```

Example:

```Galerina
logic SecurityDecision {
  Deny
  Review
  Allow
}

match decision {
  Deny   => denyAccess()
  Review => holdForReview()
  Allow  => allowAccess()
}
```

This should be rejected:

```Galerina
let state: Tri = undefined
```

Use these instead:

```text
unknown       -> valid Tri value
none          -> Option<T>
Err(...)      -> Result<T, E>
missing       -> JSON/API boundary value
uninitialised -> compiler error
```

For photonic or signal-style compute, `-1` may mean opposite phase, negative
signed value, inverse signal direction, destructive contribution or a decoded
false/deny state. It must still be defined.

---

## Package and Provider Boundary Rules

Compatibility packages must declare:

```text
package name
version
permissions
effects
network access
filesystem access
native binding use
secret handling
memory limits
timeout limits
target support
source-map/report output
```

Provider-specific behaviour should live behind:

```text
typed packages
provider adapters
generated clients
OpenAPI/JSON schema contracts
permission reports
security reports
target reports
```

Provider-specific syntax should not be added to Galerina Core.

---

## Things To Remove From Core Proposals

When reviewing older docs or future proposals, remove or move these out of Galerina
Core:

```text
eval
runtime code generation
provider-specific syntax
framework-native syntax
unrestricted reflection
prototype/object mutation
native bindings without permissions
raw pointers in normal code
driver/kernel features
vendor-specific accelerator syntax
database engine or ORM features
email protocol implementation details
payment provider details
cloud SDK details
UI framework details
mobile framework details
```

Move them to:

```text
deprecated / migration only
compatibility boundary
external package / provider only
engine lab / future research
```

---

## Main Rule

```text
Compatibility is allowed.
Unsafe behaviour is not inherited.
```

---

## Final Principle

Galerina should be modern at the core and practical at the edges.

Use strict Galerina values internally. Convert legacy and ecosystem values only at
typed, permissioned and reported boundaries.
