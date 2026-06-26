# Galerina Dart and Flutter Target Support

Status: Draft.

This document defines how Galerina should support Dart and Flutter as target outputs
without turning Galerina into a Flutter framework.

Galerina is a programming language and compiler/toolchain. Flutter is an external UI
framework written in Dart. Galerina should generate safe Dart and Flutter-compatible
packages, but normal Flutter UI structure, routing, state management, widgets,
plugins and app architecture should remain Flutter/package concerns.

Reference facts checked against official Dart and Flutter documentation on
2026-05-06:

```text
Dart async code uses Future, Stream, async and await.
Dart await is used inside async functions.
File.readAsBytes() returns Future<Uint8List>.
Flutter developers normally interact with Flutter through Dart framework APIs.
Flutter exposes low-level engine primitives through dart:ui.
Impeller is the default rendering engine on iOS and Android API 29+.
Flutter web currently offers CanvasKit and Skwasm renderers.
Flutter UI is described with widgets; widget state changes rebuild widget descriptions.
Flutter supports platform-specific code through platform channels and Pigeon.
Flutter mobile and desktop apps can use native FFI APIs.
Flutter package/plugin projects can target android, ios, web, linux, macos and windows.
```

References:

```text
https://dart.dev/libraries/async/async-await
https://api.dart.dev/dart-io/File/readAsBytes.html
https://docs.flutter.dev/resources/architectural-overview
https://docs.flutter.dev/perf/impeller
https://docs.flutter.dev/ui
https://docs.flutter.dev/platform-integration/platform-channels
https://docs.flutter.dev/platform-integration/android/c-interop
https://docs.flutter.dev/packages-and-plugins/developing-packages
```

---

## Core Rule

```text
Galerina supports Flutter by targeting Dart and Flutter-compatible package outputs.
Galerina does not become a Flutter framework.
```

The target layers should be:

```text
target dart            = generated Dart library output
target flutter         = generated Dart prepared for Flutter apps
target flutter-package = reusable package output
target flutter-plugin  = package output with platform-channel/interop boundary
target flutter-ffi     = explicit native interop boundary
```

The first practical target should be:

```text
Galerina business logic -> generated Dart package
```

Full Flutter UI generation should not be the first target.

---

## Recommended Support Levels

Flutter support should be layered.

```text
Level 1: Logic package support
Level 2: Native compute support through FFI
Level 3: Platform-channel generator
Level 4: Flutter UI syntax
```

Level 1 should be first:

```text
Galerina writes safe business logic, validation, models, JSON parsing, API clients,
security rules and calculations.
Flutter keeps control of UI.
The Galerina compiler generates Dart files that a Flutter app can import.
```

Level 2 should support compute-heavy code:

```text
Galerina source -> native library -> Dart FFI wrapper -> Flutter app
```

Good use cases:

```text
image processing
audio processing
AI preprocessing
large data operations
math-heavy compute
encryption
offline validation engines
```

Level 3 should generate typed platform-channel contracts where a Flutter app
needs host-platform APIs.

Level 4 should be optional and later. If Galerina ever describes Flutter UI directly,
it should map to Flutter widgets instead of inventing a separate Galerina mobile UI
system.

---

## Dart Type Mapping

Draft mapping direction:

| Galerina type | Dart / Flutter equivalent |
|---|---|
| `String` | `String` |
| `Int` | `int` |
| `Float` | `double` |
| `Bool` | `bool` |
| `Array<T>` | `List<T>` |
| `Map<K, V>` | `Map<K, V>` |
| `Json` | typed JSON wrapper or `Map<String, dynamic>` at explicit boundaries |
| `Option<T>` | nullable value only at Dart boundary, or generated sealed wrapper |
| `Result<T, E>` | generated sealed result class |
| `Stream<T>` | `Stream<T>` |
| async `T` | `Future<T>` |
| `Bytes` | `Uint8List` only at Dart/Flutter boundary |

Normal generated Dart should avoid careless `dynamic` and unsafe null usage.

Recommended null-safety model:

```text
T         = cannot be null
Option<T> = may be missing
Result<T> = success or error
Undefined = not allowed unless explicit
```

---

## Async Policy

Galerina should be synchronous by default.

Recommended rule:

```text
sync by default
async only when declared
await only allowed inside async flows
async flows may appear anywhere normal flow declarations are allowed
```

Example:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}

async flow loadUser(id: UserId) -> Result<User, ApiError>
effects [network.outbound] {
  let response = await api.get("/users/{id}")
  return User.fromJson(response)
}
```

For Dart output, an async Galerina flow should lower to a Dart function that returns a
`Future`.

Example direction:

```dart
Future<LoResult<User, ApiError>> loadUser(UserId id) async {
  final response = await api.get("/users/$id");
  return User.fromJson(response);
}
```

Async dependency rule:

```text
If a flow uses await, that flow must be marked async.
If a flow waits for an async flow, it must use await and must itself be async.
Calling an async flow without awaiting it must be explicit, structured and reported.
```

Async streams are a planned extension for Dart `Stream<T>` interop and Flutter
event/data sequences.

---

## Flutter-Friendly Error Handling

Galerina should avoid hidden exceptions crossing into Flutter UI code.

Preferred pattern:

```Galerina
flow saveProfile(data: ProfileForm) -> Result<Profile, ProfileError> {
  if data.name.isEmpty() {
    return Err(ProfileError.NameRequired)
  }

  return Ok(Profile(data))
}
```

Generated Dart should expose a predictable result shape, such as a generated
sealed `LoResult<T, E>`, instead of throwing unpredictable runtime exceptions
through widget callbacks.

---

## Bytes Policy

Galerina should keep its own portable byte types.

Recommended model:

```text
Bytes          = portable immutable Galerina byte data
MutableBytes   = portable mutable Galerina byte buffer
ByteView       = safe view into byte data
Dart.Uint8List = Dart-specific external/platform type
```

Normal Galerina code should use:

```Galerina
let fileBytes: Bytes = await files.readBytes("photo.jpg")
```

Dart/Flutter interop code may expose:

```Galerina
use target.dart

flow sendToFlutter(bytes: Bytes) -> Dart.Uint8List
effects [interop.dart] {
  return dart.toUint8List(bytes)
}
```

Compilation rule:

```text
Use Bytes in normal Galerina code.
Use Dart.Uint8List only in Dart/Flutter interop code.
Conversions must be explicit at target boundaries.
The compiler may use zero-copy conversion only when lifetime and mutability rules make it safe.
Otherwise it must copy or reject the conversion with a source-mapped diagnostic.
```

This matters for images, audio, video frames, encrypted payloads, model data and
network packets.

---

## Vector and Compute Policy

Async and vector compute must remain separate language features.

```text
async  = waiting for IO, platform events or delayed results
vector = operating over many values together
```

Example:

```Galerina
async flow analysePhoto(path: String) -> Result<ImageResult, ImageError>
effects [file.read] {
  let bytes = await files.readBytes(path)
  let image = image.decode(bytes)

  let result = compute auto vector image.detectEdges(image)

  return Ok(result)
}
```

`await files.readBytes(path)` is async IO. `compute auto vector` is compute
planning. They can appear in the same flow, but they should be checked and
reported independently.

---

## Flutter Rendering Policy

Galerina should not define Flutter as "Dart plus Skia".

Recommended wording:

```text
Flutter rendering may use Impeller, Skia-backed web renderers or other engine
paths depending on platform and build mode.
```

Galerina should support rendering at three levels:

```text
1. Dart/Flutter package output.
2. Optional Flutter drawing interop through dart:ui and CustomPainter-style APIs.
3. Skia/Impeller-aware reports for performance and backend risk.
```

Galerina should not bypass Flutter's normal rendering path unless the target is an
explicit advanced native rendering or FFI target.

Example direction:

```Galerina
draw flow paintChart(canvas: Flutter.Canvas, chart: ChartData) -> Void {
  canvas.drawLine(chart.axisStart, chart.axisEnd)
  canvas.drawText(chart.title, chart.titlePosition)
}
```

Reports should explain render assumptions:

```text
render-target-report.json
graphics-backend-report.json
performance-risk-report.json
```

---

## Optional Flutter UI Syntax

Flutter UI is widget-based. If Galerina later supports direct Flutter UI authoring, Galerina
should map to Flutter's widget system and generated Dart, not create a new
mobile framework.

Example direction only:

```Galerina
component LoginPage {
  state email: String = ""
  state password: String = ""

  view {
    Flutter.Scaffold {
      Flutter.AppBar(title: "Login")

      Flutter.Column {
        Flutter.TextField(value: email)
        Flutter.TextField(value: password, secret: true)

        Flutter.Button("Sign in") {
          submitLogin(email, password)
        }
      }
    }
  }
}
```

Status:

```text
Research / later-stage.
Do not implement before Dart logic packages, FFI and platform-channel boundaries.
```

State rule:

```text
Galerina may model local component state, immutable data, controlled mutation,
computed values and event-triggered updates.
Galerina must not force one Flutter state-management package.
```

Generated Dart should be neutral enough to work with:

```text
setState
ValueNotifier
ChangeNotifier
Riverpod
Bloc
Provider
custom architectures
```

---

## Platform Channels and Pigeon

Flutter can communicate with host-platform code through platform channels, and
Pigeon can generate type-safe platform APIs. Galerina should be able to describe and
report these boundaries without making device APIs native Galerina features.

Example direction:

```Galerina
platform channel BatteryApi {
  flow getBatteryLevel() -> Result<Int, PlatformError>
  requires permission battery
}
```

Possible generated output:

```text
Dart interface
Pigeon schema or equivalent typed message contract
Android Kotlin binding stub
iOS Swift binding stub
permission report
error mapping
platform-channel-report.json
```

Galerina should not directly access camera, microphone, Bluetooth, contacts or other
device APIs in the language core. It should make permission and platform
requirements visible, typed and checkable.

---

## FFI and Native Library Output

Galerina may support a Flutter FFI target for native compute and native library
interop.

Example direction:

```text
Galerina source
-> native library
-> Dart FFI wrapper
-> Flutter app
```

Possible outputs:

```text
liblo_app_logic.so
liblo_app_logic.a
Galerina_app_logic.dll
Galerina_app_logic.dylib
Galerina_bindings.dart
ffi-report.json
```

Rules:

```text
FFI must be explicit.
FFI must be permission-checked and source-mapped.
FFI must report platform support and unsupported targets.
Native memory ownership must be documented in generated bindings.
Web support must not be implied where Flutter/Dart FFI cannot support the target.
```

---

## Flutter Package and Plugin Output

Galerina tooling should be able to generate Flutter-compatible package/plugin layouts.

Example commands:

```text
Galerina build --target dart
Galerina build --target flutter
Galerina build --target flutter-package
Galerina build --target flutter-plugin
Galerina build --target flutter-ffi
Galerina watch --target flutter
```

Possible package output:

```text
my_Galerina_package/
  pubspec.yaml
  lib/
    my_Galerina_package.dart
    src/
      generated_bindings.dart
      generated_models.dart
      generated_results.dart
  android/
  ios/
  macos/
  windows/
  linux/
  web/
```

Galerina should generate Dart before Flutter compiles, then normal Flutter commands
such as `flutter pub get` and `flutter run` remain Flutter-side workflow.

---

## Permissions, Source Maps and Reports

Mobile and desktop apps often need explicit permissions.

Example direction:

```Galerina
requires permission camera
requires permission microphone
requires permission network
```

Recommended generated files:

```text
permissions-report.json
android-permissions.md
ios-permissions.md
flutter-plugin-report.json
platform-channel-report.json
ffi-report.json
```

If Galerina compiles to Dart or native libraries, debugging must map generated failures
back to `.spore` source.

Example:

```text
Flutter error:
  generated_login_page.dart:184

Mapped Galerina source:
  src/pages/login.spore:42
```

Required debug output:

```text
.spore source maps
Flutter debug metadata
compiler warnings
type reports
security reports
FFI reports
platform-channel reports
```

---

## Target Configuration

Example direction:

```Galerina
language {
  async default off
}

target flutter {
  language dart

  async {
    enabled true
    default off
  }

  bytes {
    portable Bytes
    dart Uint8List
    conversion explicit
    zero_copy when_safe
  }

  render {
    framework flutter
    drawing dart_ui
    backend auto
    supports skia
    supports impeller
  }

  compute {
    vector enabled
    compute auto
    cpu fallback
  }

  reports {
    permissions true
    async true
    bytes true
    render true
    compute true
    ffi true
    platform_channels true
    source_maps true
  }
}
```

This configuration enables a Flutter target, but it does not make every flow
async and it does not make Flutter a native Galerina framework.

---

## Out of Scope for Core Galerina

These should remain package/framework/application concerns:

```text
Flutter widget hierarchy generation
Flutter routing frameworks
Flutter state management frameworks
Flutter theme systems
Flutter plugin business logic
Flutter app lifecycle
Flutter package manager
Flutter build system
Android Studio
Xcode
pub.dev
Material widgets
Cupertino widgets
Skia-native application framework design
Impeller-native application framework design
camera/media packages
payment packages
webview packages
```

Galerina should provide strict types, effects, permissions, target reports and safe
interop boundaries that those packages can use.
