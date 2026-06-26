# Async, Dart and Flutter Syntax

Status: Draft.

This file defines the syntax direction for explicit async flows and Dart/Flutter
target configuration.

Galerina is a language and compiler/toolchain. Dart is a target language. Flutter is an
external UI framework that Galerina may target through generated Dart packages.

---

## Purpose

```text
keep normal Galerina synchronous by default
allow explicit async flows
support Dart Future lowering
support Flutter package output without making Galerina a Flutter framework
support platform-channel and FFI syntax as explicit boundaries
reserve Flutter component syntax as a later optional layer
keep Bytes portable while allowing Dart.Uint8List interop
keep async separate from vector compute
```

---

## Grammar Direction

```text
flow_decl       = async_marker? flow_modifier? flow_marker identifier params return_type? effects? block
async_marker    = "async"
flow_modifier   = "secure" | "pure"
flow_marker     = "flow"
await_expr      = "await" expression
target_dart     = target "dart" block
target_flutter  = target "flutter" block
platform_chan   = "platform" "channel" identifier block
component_decl  = "component" identifier block
```

Rule:

```text
await is valid only inside async flow bodies.
```

---

## Minimal Examples

Synchronous by default:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}
```

Explicit async:

```Galerina
async flow loadUser(id: UserId) -> Result<User, ApiError>
effects [network.outbound] {
  let response = await api.get("/users/{id}")
  return User.fromJson(response)
}
```

Secure async boundary:

```Galerina
async secure flow enrichOrder(input: CreateOrderRequest) -> Result<EnrichedOrder, ApiError>
effects [network.outbound] {
  let order = await OrdersApi.load(input.id)
  return Ok(order)
}
```

Async flows do not need to appear first in a file. The compiler should resolve
flows by module/dependency graph, not by source order.

---

## Dart and Flutter Target Syntax

Global language setting:

```Galerina
language {
  async default off
}
```

```Galerina
target dart {
  output package

  async {
    enabled true
    default off
  }

  bytes {
    portable Bytes
    dart Uint8List
    conversion explicit
  }
}
```

```Galerina
target flutter {
  language dart
  output package

  async {
    enabled true
    default off
  }

  render {
    framework flutter
    drawing dart_ui
    backend auto
    supports skia
    supports impeller
  }

  reports {
    async true
    bytes true
    render true
    compute true
  }
}
```

Platform-channel contract:

```Galerina
platform channel BatteryApi {
  flow getBatteryLevel() -> Result<Int, PlatformError>
  requires permission battery
}
```

FFI target:

```Galerina
target flutter-ffi {
  language dart
  native output library

  reports {
    ffi true
    source_maps true
    permissions true
  }
}
```

Optional later UI syntax:

```Galerina
component CounterPage {
  state count: Int = 0

  view {
    Flutter.Column {
      Flutter.Text("Count: {count}")
      Flutter.Button("Add") {
        count = count + 1
      }
    }
  }
}
```

Component syntax is research/later-stage. It should compile to normal Flutter
widgets if implemented, but it should not become a separate Galerina mobile framework.

---

## Security Rules

```text
await outside async flow is a compile error
unawaited async work must be explicit and structured
async flows must declare effects for file, network, database and platform access
Dart.Uint8List may appear only at Dart/Flutter interop boundaries
Bytes to Uint8List conversion must be explicit unless the compiler proves it is safe
render backend assumptions must be reported, not guessed silently
platform channels must declare permissions and error mapping
FFI boundaries must declare platform support and native memory ownership
component syntax must not force a Flutter state-management package
```

---

## Report Output

Recommended reports:

```text
async-report.json
bytes-interop-report.json
render-target-report.json
graphics-backend-report.json
performance-risk-report.json
platform-channel-report.json
ffi-report.json
permissions-report.json
```

Report fields should include:

```text
async flows
await sites
unawaited async work
Bytes to Dart.Uint8List conversions
copy versus zero-copy decisions
Flutter drawing interop usage
Skia/Impeller assumptions
compute auto and vector regions
platform-channel APIs and permissions
FFI bindings and unsupported platforms
source-map links from generated Dart/native bindings to .spore source
```

---

## Open Parser and Runtime Work

```text
parse async flow (prototype support exists)
reject await outside async flow
lower async flow to target-specific future/promise/runtime form
add Dart Future lowering
add Dart.Uint8List interop type
add target dart and target flutter report support
add Flutter package output layout
add platform channel parser/report support
add flutter-ffi target planning
add generated package/plugin layout reports
add permission metadata output
add source-map metadata for generated Dart and FFI bindings
defer component syntax until lower Flutter support levels are stable
add render backend report generation
```
