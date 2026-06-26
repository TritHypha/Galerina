# Galerina Logic, Compute Types and Secure Runtime Proposal

Galerina, short for **Galerina**, is a strict, memory-safe, security-first programming
language and compiler/toolchain.

Galerina source files use the `.spore` extension.

Example files:

```text
boot.spore
main.spore
routes.spore
models.spore
compute.spore
security.spore
```

This document proposes how Galerina should support deterministic logic, three-state
logic, multi-state logic, probabilistic values, AI confidence values, fuzzy
values, distributions, photonic compute concepts, neuromorphic/event logic,
quantum-inspired compute, secure runtime boundaries, JavaScript/browser/Node
interop and experimental engine research.

The goal is to keep Galerina useful, secure and realistic while still allowing
advanced future compute targets.

---

## Summary

Galerina should not try to become a full JavaScript engine, browser engine, AI
framework or hardware runtime in its first version.

Instead, Galerina should be designed as:

```text
a secure language first
a strict typed data language second
a safe API processing language third
a compute-planning language fourth
an experimental engine research platform later
```

Galerina should support advanced logic and compute values, but they must be separated
into clear levels:

```text
Core language:
  Bool
  Tri
  Galerina
  Result
  Option

Standard library:
  Probability
  Confidence
  Distribution<T>
  Fuzzy

Compute packages:
  PBit
  PBitArray
  Sampler
  Wavelength
  Phase
  Amplitude
  OpticalSignal
  EventSignal<T>
  AnalogSignal

Experimental packages:
  QBit
  QState
  QuantumCircuit
  Spike
  SpikeTrain
  PhotonicMode
```

The main rule:

```text
Uncertain, probabilistic, fuzzy, quantum, photonic or hardware-level values must
never silently collapse into Bool.
```

---

## Core Principle

Galerina should follow this design rule:

```text
Secure by default.
Strict by default.
Small core.
Powerful packages.
Dangerous features disabled unless explicitly enabled.
Everything reportable.
```

This means:

```text
unknown must not silently become true
probability must not silently become allow
confidence must not silently become safe
fuzzy match must not silently become approved
photonic output must not silently become a security decision
quantum state must not silently become normal program control flow
```

---

## Recommended Galerina Levels

Galerina should be separated into language and runtime levels.

```text
Level 0: Galerina Core Language
Level 1: Galerina Standard Library
Level 2: Galerina Secure App Kernel
Level 3: Galerina Compute and Data Acceleration
Level 4: Galerina JavaScript / Node / Browser Interop
Level 5: Galerina Engine Lab / Experimental Runtime Research
```

### Level 0: Galerina Core Language

This is the language itself. It should remain small, strict and secure.

Core should support:

```text
strict types
Bool
Tri
Galerina
Result
Option
pure flow
secure flow
effects
match exhaustiveness
no hidden global variables
memory-safe local lifetimes
read-only references
explicit clone()
copy-on-write rules
source maps
compiler diagnostics
security reports
AI-readable guide generation
```

Core should not directly include CMS features, web framework features, template
engine features, ORM features, AI platform features, JavaScript engine
compatibility, browser engine compatibility or V8 replacement features.

### Level 1: Galerina Standard Library

The standard library should provide safe common primitives.

It should support:

```text
Json
Xml
Text
SafeHtml
Url
SafeUrl
File
Stream
Bytes
SecureString
Money
Decimal
DateTime
Duration
Request
Response
Hash
Signature
Pattern
Probability
Confidence
Distribution<T>
Fuzzy
```

Safe defaults should make safe behaviour easier than unsafe behaviour:

```text
Use SafeHtml instead of raw String for renderable HTML.
Use SecureString for tokens and secrets.
Use Pattern instead of unsafe regex by default.
Use Json.decode<T>() instead of raw untyped JSON.
Use Confidence for AI scores.
Use Distribution<T> for uncertain model output.
```

### Level 2: Galerina Secure App Kernel

The secure app kernel should be an optional runtime boundary, not a full web
framework.

It should support typed API declarations, typed request decoding, content-type
validation, request body limits, unknown-field policy, strict schema validation,
JWT verification, Bearer token handling, OAuth/OIDC declarations, DPoP/mTLS,
idempotency, webhook replay protection, rate limits, concurrency limits, memory
budgets, queue handoff, backpressure, API security reports and load-control
reports.

Important production defaults:

```text
duplicate JSON keys denied
unknown JSON fields denied
expired JWTs denied
JWT alg:none denied
bearer token logging denied
unbounded request bodies denied
raw request bodies denied unless explicitly allowed
webhook replay protection required for webhooks
idempotency required for payment/order/webhook side effects
```

### Level 3: Galerina Compute and Data Acceleration

This is where Galerina can offer practical performance benefits.

It should support:

```text
large JSON validation
typed API request processing
schema checking
security scanning
stream processing
batch data processing
large numeric arrays
matrix multiplication
vector search
text embeddings
image embeddings
audio embeddings
video embeddings
AI inference
compute auto
CPU vector planning
GPU planning
AI accelerator planning
future photonic target planning
```

The key idea:

```text
Galerina describes the work safely.
The compiler/runtime decides the safest available compute target.
```

Example:

```Galerina
pure compute flow analyseVectors(input: Array<Vector>) -> VectorReport {
  compute auto fallback cpu {
    return vector.analyse(input)
  }
}
```

Compute rules:

```text
compute targets cannot bypass type validation
GPU results must return to strict Galerina values
AI accelerator results must return to strict Galerina values
photonic results must return to strict Galerina values
large data must stream or use bounded memory
compute fallback must be reportable
```

### Level 4: JavaScript / Node / Browser Interop

Galerina should support modern app targets without becoming JavaScript.

It should support JavaScript output, TypeScript declaration output, ESM modules,
WASM output, Node adapters, browser adapters, source maps, typed API clients,
JSON schema output, OpenAPI output, safe DOM primitives, SafeHtml, safe browser
effects and framework helper generation through packages.

Important browser rules:

```text
browser eval denied
inline script injection denied
raw HTML DOM write denied unless SafeHtml
localStorage for secrets denied
camera access denied by default
microphone access denied by default
geolocation denied by default
```

Galerina can compile to JavaScript or WASM, but Galerina should not copy JavaScript's unsafe
behaviour.

### Level 5: Galerina Engine Lab

This is experimental research. It may explore ECMAScript parser experiments,
JavaScript AST support, galerina-IR lowering, bytecode generation, interpreter
support, runtime type checks, object model helpers, parser helpers, optimisation
passes, diagnostics, memory reports, security boundary reports and
deoptimisation reports.

It should not be early core. Early Galerina should not attempt full ECMAScript
compatibility, full browser embedding, full Node API compatibility, a full
garbage collector, a full JIT compiler, inline caches, a deoptimisation engine,
a register allocator, debugger/profiler integration or full sandbox
implementation.

Reason:

```text
A JavaScript engine is a very large and high-risk system.
Galerina should become secure and useful before trying to become engine-level research.
```

---

## Logic and Compute Value Groups

Galerina should group logic and compute values like this:

```text
Deterministic logic:
  Bool
  Tri
  Galerina

Probabilistic logic:
  PBit
  Probability
  Distribution<T>
  Sampler

Quantum-inspired / quantum:
  QBit
  QState
  QuantumCircuit

Neuromorphic/event logic:
  Spike
  SpikeTrain
  EventSignal<T>

Photonic/wavelength logic:
  Wavelength
  OpticalSignal
  Phase
  Amplitude

Fuzzy/uncertain logic:
  Fuzzy
  Confidence
  Belief
```

---

## Core Logic Types

### Bool

`Bool` is normal two-state logic.

```Galerina
let active: Bool = true
```

Allowed values:

```text
true
false
```

Use for ordinary yes/no decisions, safe deterministic branching, simple flags
and validated conditions. `Bool` is the only type that should directly control a
normal `if`.

### Tri

`Tri` is deterministic three-state logic.

```Galerina
let verified: Tri = unknown
```

Allowed values:

```text
false
unknown
true
```

Use for validation not yet checked, security review states, unknown API status,
allow/review/deny flows, incomplete data and partial processing.

Important rule:

```text
Tri must not silently convert to Bool.
```

Bad:

```Galerina
if verified {
  allowAccess()
}
```

Good:

```Galerina
match verified {
  true => allowAccess()
  unknown => holdForReview()
  false => denyAccess()
}
```

### Galerina

`Galerina` is deterministic multi-state logic. It can support named finite-state
decisions.

```Galerina
logic PaymentDecision {
  Allow
  Review
  Deny
}

let decision: PaymentDecision = policy.checkPayment(input)

match decision {
  Allow => allowPayment()
  Review => holdForReview()
  Deny => denyPayment()
}
```

Important rule:

```text
Galerina should use exhaustive match checking.
```

---

## Uncertainty and AI-Friendly Types

### Probability

`Probability` is a decimal value from `0.0` to `1.0`.

```Galerina
let chance: Probability = probability(0.72)
```

Recommended type rule:

```text
Probability must be range checked.
```

### Confidence

`Confidence` is a developer-friendly type for model confidence.

```Galerina
type Confidence = Decimal range 0.0..1.0
```

Use for AI model outputs, moderation, speech recognition, search ranking, OCR
confidence and entity matching.

Important rule:

```text
Confidence is not Bool.
```

Bad:

```Galerina
if result.confidence {
  approve()
}
```

Good:

```Galerina
if result.confidence >= 0.95 {
  approve()
} else {
  holdForReview()
}
```

### Fuzzy

`Fuzzy` represents partial truth or membership.

```Galerina
let matchScore: Fuzzy = fuzzy(0.82)
```

Difference between `Fuzzy` and `PBit`:

```text
Fuzzy:
  degree of truth or membership

PBit:
  probabilistic sample that may resolve to 0 or 1
```

Security rule:

```text
Fuzzy must not directly become Allow.
```

### Distribution<T>

`Distribution<T>` represents probability spread across possible values.

```Galerina
type Distribution<T>
```

Example:

```Galerina
let risk: Distribution<RiskLevel> = model.predictRisk(input)
let decision: RiskDecision = policy.decide(risk)

match decision {
  Allow => allowPayment()
  Review => holdForReview()
  Deny => denyPayment()
}
```

Important rule:

```text
Distribution<T> must not directly control security-sensitive branching.
```

---

## Probabilistic Compute Types

### PBit

`PBit` is a probabilistic bit.

```Galerina
let risk: PBit = pbit(probability: 0.72)
```

Recommended package location:

```text
package: Galerina.compute.probabilistic
default: optional
core: no
```

Security rule:

```text
PBit must not directly control security decisions.
```

### PBitArray

`PBitArray` is an array of probabilistic bits.

```Galerina
let samples: PBitArray = pbits(size: 1024, probability: 0.50)
```

Security rule:

```text
PBitArray output must be converted into typed deterministic results before app
decisions.
```

### Sampler

`Sampler` should be the safe interface for probabilistic sampling.

```Galerina
let sampler: Sampler<RiskLevel> = Sampler.fromDistribution(riskDistribution)
let sample: RiskLevel = sampler.sample(seed: secureSeed)
```

Rules:

```text
seed handling must be explicit
security-sensitive randomness must use secure random sources
simulation randomness must be reproducible when requested
sampling must be reportable
```

---

## Quantum-Inspired and Quantum Types

`QBit`, `QState` and `QuantumCircuit` should belong to experimental quantum
packages, not Galerina Core.

Security rule:

```text
QBit is not Bool and cannot be used in normal if statements.
```

Good:

```Galerina
let result: QuantumResult = quantum.measure(q)

match result.state {
  Zero => handleZero()
  One => handleOne()
}
```

Recommended package:

```text
package: Galerina.compute.quantum
default: disabled
status: experimental
```

---

## Neuromorphic and Event Logic

`Spike` and `SpikeTrain` should be experimental neuromorphic package types.
`EventSignal<T>` may be useful in the standard streaming library or a streaming
package.

```Galerina
stream events: EventSignal<SensorReading>
```

Security rule:

```text
Spike values should be processed into deterministic typed results before app
decisions.
```

---

## Photonic, Wavelength and Signal Types

Photonic and signal types should be specialist packages, not beginner syntax.

Examples:

```Galerina
let lambda: Wavelength = 1550 nm
let phase: Phase = phase(90 deg)
let amp: Amplitude = amplitude(0.75)

type OpticalSignal {
  wavelength: Wavelength
  phase: Phase
  amplitude: Amplitude
}
```

Security rule:

```text
OpticalSignal is a compute/signal value, not an application decision value.
```

`PhotonicMode` can describe a photonic execution plan:

```Galerina
logic PhotonicMode {
  Simulated
  HardwarePlanned
  HardwareAvailable
  FallbackCpu
}
```

`AnalogSignal` may belong in signal/audio packages:

```Galerina
type AnalogSignal
```

---

## Recommended Support Table

| Type              | Should Galerina support? | Location                      | Default? |
| ----------------- | -----------------: | ----------------------------- | -------: |
| `Bool`            |                Yes | Core                          |      Yes |
| `Tri`             |                Yes | Core                          |      Yes |
| `Galerina`        |                Yes | Core / advanced               |      Yes |
| `Probability`     |                Yes | Standard library              |      Yes |
| `Confidence`      |                Yes | Standard library              |      Yes |
| `Distribution<T>` |                Yes | Standard library / AI         |      Yes |
| `Fuzzy`           |                Yes | Standard library / AI         |    Maybe |
| `PBit`            |                Yes | Probabilistic compute package |       No |
| `PBitArray`       |                Yes | Probabilistic compute package |       No |
| `Sampler`         |                Yes | Probabilistic compute package |       No |
| `QBit`            |              Maybe | Experimental quantum package  |       No |
| `QState`          |              Maybe | Experimental quantum package  |       No |
| `QuantumCircuit`  |              Maybe | Experimental quantum package  |       No |
| `Spike`           |          Yes later | Neuromorphic package          |       No |
| `SpikeTrain`      |          Yes later | Neuromorphic package          |       No |
| `EventSignal<T>`  |                Yes | Streaming/sensor package      |    Maybe |
| `Wavelength`      |                Yes | Units / photonic package      |       No |
| `Phase`           |                Yes | Units / photonic package      |       No |
| `Amplitude`       |                Yes | Units / photonic package      |       No |
| `OpticalSignal`   |          Yes later | Photonic compute package      |       No |
| `AnalogSignal`    |              Maybe | Signal/audio package          |       No |

---

## Best Naming Model

Recommended names:

```Galerina
Bool
Tri
Galerina

Probability
Confidence
Distribution<T>
Fuzzy

PBit
PBitArray
Sampler

QBit
QState
QuantumCircuit

Spike
SpikeTrain
EventSignal<T>

Wavelength
Phase
Amplitude
OpticalSignal
PhotonicMode

AnalogSignal
```

Avoid overly vague names such as:

```text
MaybeBit
MagicLogic
OmniValue
LightBool
SmartBool
```

Reason:

```text
Galerina should be ambitious internally but clear externally.
```

---

## What Should Be Core?

Keep Galerina Core small.

Core should include:

```text
Bool
Tri
Galerina
Result
Option
```

The standard library should include:

```text
Probability
Confidence
Distribution<T>
Fuzzy
```

Specialist compute packages should include:

```text
PBit
PBitArray
Sampler
QBit
QState
QuantumCircuit
Spike
SpikeTrain
Wavelength
Phase
Amplitude
OpticalSignal
AnalogSignal
```

---

## Security Rule for Logic Values

These types must not silently collapse into `Bool`:

```text
Tri
Galerina
PBit
QBit
Fuzzy
Distribution<T>
Confidence
Probability
OpticalSignal
AnalogSignal
Spike
EventSignal<T>
```

Bad:

```Galerina
if riskScore {
  allow()
}
```

Good:

```Galerina
let decision: Decision = policy.fromRisk(riskScore)

match decision {
  Deny => deny()
  Review => holdForReview()
  Allow => allow()
}
```

Example compiler error:

```text
LO0301: Cannot use Confidence as Bool.

riskScore has type Confidence.
Security-sensitive branch requires Bool or explicit policy conversion.

Suggested fix:
  let decision = policy.fromConfidence(riskScore)
  match decision { ... }
```

---

## Policy Conversion

Uncertain values should be converted through explicit policies.

```Galerina
policy FraudPolicy {
  allow when risk < 0.20
  review when risk >= 0.20 and risk < 0.80
  deny when risk >= 0.80
}

let risk: Confidence = fraudModel.score(payment)
let decision: PaymentDecision = FraudPolicy.decide(risk)

match decision {
  Allow => allowPayment()
  Review => holdForReview()
  Deny => denyPayment()
}
```

This gives Galerina a strong security model:

```text
uncertainty can inform decisions
uncertainty cannot directly become decisions
```

---

## Dangerous Features Policy

Some features should be unsupported in normal Galerina or disabled by default.

Not supported in normal Galerina:

```text
eval
untrusted dynamic code
direct unsafe memory
engine-level unsafe object access
```

Disabled by default:

```text
raw SQL
raw NoSQL filters
raw HTML rendering
unsafe regex
shell execution
native bindings
browser camera access
browser microphone access
browser geolocation
full filesystem access
unbounded request bodies
unbounded batch jobs
unbounded queue growth
JIT machine code generation
```

Reason:

```text
These features increase the risk of remote code execution, injection, memory
corruption, data exfiltration, denial of service and sandbox escape.
```

---

## Eval Policy

`eval` should not be supported in normal Galerina runtime.

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
broken trust boundaries
```

Recommended Galerina policy:

```Galerina
runtime_policy {
  dynamic_code {
    eval "deny"
    dynamic_import "deny_by_default"
    runtime_code_generation "deny"
  }
}
```

If a project really needs dynamic code, it should be treated as unsafe research
or a sandboxed development-only experiment, not normal production Galerina:

```Galerina
unsafe dynamic_code
reason "Sandboxed plugin experiment in development only" {
  eval "deny"
  dynamic_import "deny_by_default"
  runtime_code_generation "deny"
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

## RegExp and Pattern Policy

Galerina should support safe patterns.

Default:

```text
safe Pattern engine enabled
linear-time matching required
timeouts required
memory limits required
unsafe regex disabled
```

Example safe use:

```Galerina
let emailPattern: Pattern = pattern.email()
```

Advanced unsafe regex must be explicit:

```Galerina
unsafe regex LegacyPattern
reason "Legacy import format requires lookbehind" {
  engine "pcre2_jit"
  pattern "..."
  timeout 10ms
  max_input_length 1kb
}
```

Security rule:

```text
Unsafe regex must be explicit, limited and reported.
```

---

## Exceptions vs Result

Galerina should prefer `Result` over exceptions for recoverable errors.

```Galerina
secure flow createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, ApiError> {
  ...
}
```

Reason:

```text
Result makes errors visible in function signatures.
Exceptions can hide failure paths.
Security-sensitive systems benefit from explicit errors.
```

---

## Garbage Collection

Galerina should not require a general-purpose garbage collector in early versions.

Early Galerina should prefer safe local lifetimes, ownership/borrowing-like rules,
request-scoped cleanup, explicit `clone()`, copy-on-write, resource scopes,
bounded memory and streaming large data.

Future Engine Lab may explore garbage collection for JavaScript engine
experiments, dynamic object runtime, scripting VMs and plugin sandboxes.

Security rule:

```text
GC roots and unsafe memory must be reportable.
```

---

## JIT and Machine Code Generation

JIT should not be part of early Galerina.

Reason:

```text
JIT engines are complex and risky.
```

Risks include wrong-code bugs, sandbox escapes, executable memory, code
injection, CPU-specific bugs and harder audits.

Early alternatives:

```text
native ahead-of-time compilation
WASM target
CPU vector
GPU packages
AI accelerator packages
compute auto planning
photonic simulation/planning
```

---

## Sandboxing

Galerina should support app-level sandboxing early.

Early support:

```text
package permissions
file restrictions
network restrictions
shell denied
native bindings denied
browser permissions
request memory limits
queue limits
compute target limits
```

Example:

```Galerina
permissions {
  network allow ["api.example.com"]
  filesystem deny_all
  shell deny
  camera deny
  microphone deny
  geolocation deny
}
```

Engine-level sandboxing belongs in future Engine Lab.

---

## Debugging, Diagnostics and Source Maps

These should be first-class Galerina features.

Galerina should support source maps, structured errors, file/line/function reporting,
console diagnostics, memory reports, security reports, target reports and AI
guide output.

Security rule:

```text
debug output must never print SecureString unless explicitly redacted.
```

Example:

```text
token: SecureString(redacted)
```

---

## Deoptimisation and Fallback Reports

Deoptimisation reports are useful, but they should not be early core.

Early Galerina should focus on practical fallback reporting:

```text
why compute target changed
why GPU fallback happened
why photonic fallback happened
why CPU vector was selected
why memory streaming was used
why validation failed
why a security policy blocked execution
```

Example compute report:

```json
{
  "flow": "analyseVectors",
  "requested": "compute auto",
  "selected_target": "cpu_vector",
  "fallback": true,
  "reason": "GPU unavailable",
  "memory_strategy": "streamed",
  "security_policy": "passed"
}
```

---

## Recommended Development Priority

### Phase 1: Practical Secure Galerina

Focus on strict types, `Bool`, `Tri`, `Galerina`, `Result`, `Option`, `pure
flow`, `secure flow`, effects, JSON validation, typed API request processing,
safe SQL/NoSQL primitives, memory model, source maps, security reports and
AI-readable guide generation.

### Phase 2: Secure App Kernel

Add JWT/Bearer/OAuth support, rate limits, idempotency, webhook replay
protection, queues, request memory budgets, load control, SafeHtml, safe pattern
matching and secure logging.

### Phase 3: AI and Uncertainty Types

Add:

```text
Probability
Confidence
Distribution<T>
Fuzzy
policy conversion
AI classification result types
safe decision boundaries
model output reports
```

### Phase 4: Compute and Data Acceleration

Add large numeric arrays, matrix multiplication, vector search, embeddings, AI
inference through packages, CPU vector planning, GPU planning, compute auto
reports, streaming validation and batch processing with limits.

### Phase 5: Specialist Compute Packages

Add optional packages for:

```text
PBit
PBitArray
Sampler
EventSignal<T>
AnalogSignal
Wavelength
Phase
Amplitude
OpticalSignal
PhotonicMode
```

### Phase 6: Framework Interop

Add TypeScript declarations, ESM output, WASM output, Node adapter, browser
adapter, OpenAPI output, JSON schema output and framework helper generators.

### Phase 7: Engine Lab

Only later explore JavaScript AST, galerina-IR lowering, bytecode generation,
interpreter support, object model helpers, GC experiments, inline caches,
deoptimisation, JIT research and sandbox experiments.

---

## Final Recommended Scope

Galerina should support this early:

```text
Bool
Tri
Galerina
Result
Option
Probability
Confidence
Distribution<T>
large JSON validation
typed API request processing
schema checking
security scanning
stream processing
batch data processing with limits
large numeric arrays
matrix multiplication
vector search through packages
embeddings through packages
AI inference through packages
source maps
memory reports
security reports
target reports
AI-readable documentation
```

Galerina should support this through optional packages:

```text
Fuzzy
PBit
PBitArray
Sampler
EventSignal<T>
AnalogSignal
Wavelength
Phase
Amplitude
OpticalSignal
PhotonicMode
```

Galerina should treat this as experimental:

```text
QBit
QState
QuantumCircuit
Spike
SpikeTrain
JavaScript engine experiments
bytecode runtime experiments
garbage collector experiments
JIT experiments
engine-level sandboxing
```

Galerina should delay this:

```text
full ECMAScript compatibility
dynamic JS object runtime
prototype system
WeakMap/WeakSet compatibility
full garbage collector
full JIT compiler
inline caches
deoptimisation engine
browser embedding
full Node API compatibility
```

Galerina should deny or disable this by default:

```text
eval
raw SQL
raw NoSQL filters
raw HTML
unsafe regex
shell access
native bindings
unbounded memory
unbounded request bodies
untrusted dynamic code
browser camera access
browser microphone access
browser geolocation
```

---

## Final Design Rule

Use:

```text
Bool for deterministic yes/no.
Tri for deterministic true/false/unknown.
Galerina for named multi-state decisions.
Confidence for AI certainty.
Fuzzy for soft truth or similarity.
Distribution<T> for probability over possible values.
PBit for probabilistic sampling.
QBit only for experimental quantum packages.
Spike only for neuromorphic/event compute packages.
Wavelength and OpticalSignal only for specialist photonic packages.
```

Never allow:

```text
uncertain values to silently become Bool
probabilistic values to directly make security decisions
hardware-level compute values to bypass policy
experimental compute values to control normal app logic
```

Final principle:

```text
Build the secure language first.
Build the safe app boundary second.
Build AI and uncertainty types third.
Build compute acceleration fourth.
Build framework interop fifth.
Treat engine replacement as research only.
Disable dangerous features by default.
Generate reports for everything.
```

---

## References

P-bit computing:

```text
Probabilistic computing with p-bits
Applied Physics Letters
https://pubs.aip.org/aip/apl/article/119/15/150503/40486/Probabilistic-computing-with-p-bits
```

Neuromorphic computing:

```text
Exploring Neuromorphic Computing Based on Spiking Neural Networks
ACM Digital Library
https://dl.acm.org/doi/full/10.1145/3571155
```

Photonic matrix multiplication:

```text
Photonic matrix multiplication lights up photonic accelerator research
Nature
https://www.nature.com/articles/s41377-022-00717-8
```
