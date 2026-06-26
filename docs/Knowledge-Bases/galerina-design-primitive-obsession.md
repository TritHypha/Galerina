# Galerina Design Principle: Primitive Obsession

## Definition

Primitive obsession is a design anti-pattern where security-critical or
governance-critical domain concepts are represented as raw primitive types
(`string`, `number`, `boolean`) instead of typed, named wrappers.

For Galerina, this is particularly dangerous because the entire runtime
depends on accurate type identity for effects, capabilities, boundaries,
secrets, routes and policy decisions.

## Status

```text
Design principle — documented.
Applied in: galerina-core-security, galerina-core-compiler, galerina-core-network
Requires: consistent enforcement across all galerina-core-* packages
```

---

## The Problem

Using raw primitives for governed concepts allows values to be confused,
misused, or accidentally serialised.

Bad examples:

```ts
type Capability = string
type Effect = string
type Secret = string
type RoutePath = string
type Permission = string
```

This is dangerous because `"network"`, `"secret.access"`, `"admin"`,
`"/orders"`, and `"STRIPE_API_KEY"` all become "just strings". The compiler
cannot reliably protect boundaries if everything collapses into primitives.

### What Goes Wrong

```ts
// All of these pass the same type check:
grantCapability("STRIPE_API_KEY")   // secret name used as capability
declareEffect("admin")              // permission used as effect
validateRoute("network")            // effect used as route
```

Without strong types, the compiler cannot distinguish between a
capability name, an effect name, a secret name, or a route path.

---

## The Solution

Branded types give primitive values distinct identities at the type level:

```ts
type EffectId = Branded<string, "EffectId">
type CapabilityId = Branded<string, "CapabilityId">
type RoutePath = Branded<string, "RoutePath">
type SecretReferenceId = Branded<string, "SecretReferenceId">
type HttpMethod = Branded<string, "HttpMethod">
type ManifestId = Branded<string, "ManifestId">
type DiagnosticCode = Branded<string, "DiagnosticCode">
type PolicyDecision = Branded<string, "PolicyDecision">
type SinkId = Branded<string, "SinkId">
type RuntimeTarget = Branded<string, "RuntimeTarget">
```

And typed wrapper interfaces give concepts their own structure:

```ts
interface EffectReference {
  id: EffectId
  category: EffectCategory
  unsafe: boolean
}

interface ProtectedSecret<T> {
  reference: SecretReference
  unwrapForApprovedSink(sink: SecretSafeSink): T
}

interface BoundaryDescriptor {
  id: string
  type: BoundaryType
  trustLevel: TrustLevel
  allowedEffects: EffectId[]
  deniedEffects: EffectId[]
}
```

---

## The Key Rule

```text
Primitives are fine at the edges.
Core governed concepts need named, typed wrappers.
```

### Where Primitives Are OK

```text
parsing raw source         — reading user input, source files
JSON input / output        — serialisation / deserialisation
manifest serialisation     — writing artefact files
CLI flags                  — command-line string arguments
external adapter boundaries — third-party APIs, HTTP headers, env vars
```

At these boundaries, values arrive as raw strings. The parse/decode
step is where you validate and lift them into typed governed concepts.

### Where Primitives Must Be Rejected

After parsing, these concepts must use typed wrappers, not raw strings:

```text
Effect                — what code does
Capability            — what authority is required
Permission            — what is explicitly allowed
Boundary              — where trust changes
SecretReference       — a protected sensitive value
SecureString          — a string with security sensitivity
RoutePath             — a validated API route
HttpMethod            — GET, POST, DELETE, PATCH, PUT
ManifestId            — runtime manifest identifier
DiagnosticCode        — compiler diagnostic code
PolicyDecision        — allow / deny / unknown / conflict
SinkId                — approved secret sink
RuntimeTarget         — cpu / gpu / wasm / edge / etc.
```

---

## Branded Type Pattern

The Branded type helper creates nominal type safety over structural types:

```ts
type Branded<T, Brand extends string> = T & { readonly __brand: Brand }
```

Creating a branded value requires a constructor that validates the raw input:

```ts
function effectId(raw: string): EffectId {
  if (raw.trim() === "") {
    throw new Error("EffectId must not be empty")
  }
  return raw as EffectId
}
```

This ensures only validated, intentional values can be branded.

---

## Galerina Rule

```text
No raw primitive for governed concepts after parsing.
```

This rule applies from the first pass of the compiler pipeline through
to runtime execution, audit logging, and manifest generation.

---

## Practical Examples

### Effect Declaration

```ts
// Bad
const effects: string[] = ["network", "storage"]

// Good
const effects: Effect[] = [
  { id: effectId("network"), category: "network", unsafe: false },
  { id: effectId("storage"), category: "database", unsafe: false }
]
```

### Capability Request

```ts
// Bad
function evaluateCapability(capability: string): boolean { ... }

// Good
function evaluateCapability(
  request: CapabilityRequest
): Decision { ... }

interface CapabilityRequest {
  subjectId: string
  capability: CapabilityId
  resource?: string
  context: PolicyContext
}
```

### Route Registration

```ts
// Bad
routes["POST /orders"] = handler

// Good
const route: LogicnRouteManifest = {
  id: "route-create-order",
  method: "POST" as HttpMethod,
  path: "/orders" as RoutePath,
  handler: "createOrder",
  effects: ["storage"],
  auth: { required: true },
}
```

### Secret Reference

```ts
// Bad
const apiKey: string = process.env.STRIPE_KEY ?? ""

// Good
const stripeKey: SecretReference = {
  id: "stripe-api-key",
  name: "STRIPE_API_KEY",
  source: { kind: "env", variableName: "STRIPE_API_KEY" },
  category: "payment_provider_token",
  allowedSinks: ["stripe-auth-header-sink"],
  deniedSinks: ["log-sink", "api-response-sink"],
  redaction: { mode: "full", replacement: "[REDACTED_SECRET]" }
}
```

---

## Enforcement

The effect checker and boundary checker both benefit from strong types.
With branded types, the compiler can statically reject:

```text
passing an EffectId where a CapabilityId is expected
assigning a raw string as a SecretReference
routing an HttpMethod to a path validator
```

Runtime validation becomes a second line of defence, not the only line.

---

## Relationship to Other Systems

```text
galerina-core-compiler    → uses typed Effect, Boundary, CheckedFunction
galerina-core-security    → uses SecretReference, ProtectedSecret, SecretSafeSink
galerina-core-network     → uses NetworkDestinationReference, NetworkProtocol
galerina-core-logic       → uses Decision, PolicyDecision
galerina-core-config      → uses EnvironmentMode, ConfigValue
galerina-framework-api-server → uses HttpMethod, RoutePath, LogicnRouteManifest
```

See also: `effect-checker-and-boundary-checker.md`,
`galerina-core-config-environment-secrets.md`,
`galerina-core-network-governance.md`.
