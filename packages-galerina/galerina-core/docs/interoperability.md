# Interoperability

Galerina should interoperate with existing systems without weakening its core safety rules.

## Planned Areas

```text
JSON
REST APIs
webhooks
OpenAPI
galerina-framework-api-server
XML
GraphQL
environment variables
native bindings
foreign package calls
generated clients
JavaScript ESM modules
TypeScript declarations
Node packages
React adapter packages
Angular adapter packages
React Native adapter packages
browser/Node WASM bridges
worker modules
Dart packages
Flutter packages
Dart Uint8List byte interop
Flutter plugin and FFI boundaries
Flutter platform channels
Pigeon-style typed platform APIs
React Native native-module boundaries
React Native device permission reports
native ABI imports and exports
native-compatible layout declarations
device capability packages
mobile platform APIs
sensor/native hardware bindings
text AI packages
LLM/model providers
external NLP package interop
```

## Rule

Interop boundaries should be explicit, typed, permission-checked and reported.

`galerina-framework-api-server` is the built-in HTTP serving boundary for Galerina APIs. It should
load route manifests, normalise HTTP requests, apply server-level limits and
delegate application security decisions to `galerina-framework-app-kernel`.

Dart and Flutter interop should use normal Galerina types in portable code and expose
target-specific types only at explicit boundaries.

Rule:

```text
Bytes is portable Galerina byte data.
Dart.Uint8List is Dart/Flutter-specific interop data.
Conversions must be explicit, source-mapped and reported.
```

Flutter platform channels and FFI are interop boundaries, not core device API
features.

Rule:

```text
Platform-channel contracts must declare permissions and error mapping.
FFI bindings must declare platform support and native memory ownership.
Unsupported Flutter targets must be reported, not silently generated.
```

Device capability interop should stay package/platform based.

Rule:

```text
Camera, microphone, Bluetooth, GPS/location, sensors, notifications and media
features are not core Galerina APIs.
Packages and platform bindings provide those capabilities.
Galerina provides permissions, effects, safe buffers, streams, native boundary checks
and reports.
```

JavaScript/TypeScript framework interop should use generated modules,
declarations, schemas and adapter manifests.

Rule:

```text
ESM should be the preferred JavaScript module output for modern framework interop.
TypeScript declarations should describe generated JS/WASM APIs.
React and Angular adapters should be optional package/generator outputs.
React Native adapters should be optional mobile package/generator outputs.
client_safe, server_only and worker_safe markers must control what adapters expose.
Worker outputs must report structured-clone, transfer and shared-memory decisions.
```

React Native interop should follow the same boundary model as Dart/Flutter:

```text
React Native is an external mobile framework.
Generated adapters may expose Galerina API clients, hooks, schemas and native-boundary
metadata.
React Native components, JSX/TSX, navigation, state management, Metro/Babel and
app lifecycle stay outside Galerina Core.
Native modules, JSI/TurboModule-style bindings and device capabilities require
explicit permissions, source maps and reports.
```

Interop must not use monkey patching as a compatibility strategy.

Rule:

```text
Adapters may wrap external systems.
Adapters may not mutate external systems globally.
```

For JavaScript/TypeScript output, generated Galerina code must not mutate
`Array.prototype`, `Object.prototype`, framework prototypes, imported package
objects or global response/security behaviour. Compatibility must be expressed
through generated modules, adapters, manifests, explicit imports and reports.

## Native ABI Boundary

Native ABI interop should be available eventually, but only as an audited
boundary. It is not a reason to make normal Galerina application code low-level.

Draft shape:

```Galerina
interop native sqlite {
  allow library "sqlite3"
  allow function "sqlite3_open"
  memory checked
  ownership explicit
}

extern native function sqlite3_open(
  filename: NativeString,
  db: Out<NativeHandle>
) -> NativeInt
```

Rules:

```text
Native ABI use is denied by default.
Every imported symbol must be declared.
String encoding must be explicit.
Nullability must use Option or a named nullable interop type.
Pointer ownership must be Borrowed, Owned, Out or Unsafe and source-mapped.
Returned buffers must declare allocator and free policy.
Errors must map into Result or a named diagnostic type.
Timeouts, blocking calls and thread-safety must be reported.
```

Native-compatible layout should be explicit and narrow:

```Galerina
layout native struct Point {
  x: Float32
  y: Float32
}
```

Rules:

```text
layout native is for ABI and generated backend boundaries.
Normal domain models should use ordinary Galerina records.
Packed layout, alignment overrides and raw pointer fields require an unsafe or
systems profile plus an ABI report.
```

Text AI interop should remain package/provider based.

Rule:

```text
Text generation, summarisation, embeddings, moderation, translation, document AI
and NLP tasks are not core Galerina APIs.
Packages and providers expose those capabilities.
Galerina provides typed boundaries, permissions, safe secrets, text validation,
redaction policy, prompt safety policy, compute-auto reports and source maps.
```

## Kernel and Driver Boundary

Kernel modules, operating-system drivers, privileged native bindings, vendor SDK
driver bindings and raw hardware access are not normal interoperability work.

They are last-stage, blocked by default and require explicit maintainer or
project permission before design, examples, bindings or implementation are
added.
