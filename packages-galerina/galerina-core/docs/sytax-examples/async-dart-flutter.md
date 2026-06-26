# Async, Dart and Flutter Examples

Status: Draft.

These examples show the intended Galerina syntax for explicit async flows and
Dart/Flutter target support.

---

## Good Examples

Synchronous flow:

```Galerina
flow add(a: Int, b: Int) -> Int {
  return a + b
}
```

Async file read:

```Galerina
async flow getPhoto(path: String) -> Result<ImageData, FileError>
effects [file.read] {
  let bytes: Bytes = await files.readBytes(path)
  return image.decode(bytes)
}
```

Secure async API boundary:

```Galerina
async secure flow loadUser(id: UserId) -> Result<User, ApiError>
effects [network.outbound] {
  let response = await api.get("/users/{id}")
  return User.fromJson(response)
}
```

Async caller:

```Galerina
async flow main() -> Result<Void, AppError>
effects [file.read] {
  let photo = await getPhoto("photo.jpg")
  image.show(photo)
  return Ok()
}
```

Dart interop boundary:

```Galerina
use target.dart

flow toFlutterBytes(bytes: Bytes) -> Dart.Uint8List
effects [interop.dart] {
  return dart.toUint8List(bytes)
}
```

Async plus vector compute:

```Galerina
async flow analysePhoto(path: String) -> Result<ImageResult, ImageError>
effects [file.read] {
  let bytes = await files.readBytes(path)
  let imageData = image.decode(bytes)
  let result = compute auto vector image.detectEdges(imageData)
  return Ok(result)
}
```

Flutter target:

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
}
```

Platform-channel contract:

```Galerina
platform channel BatteryApi {
  flow getBatteryLevel() -> Result<Int, PlatformError>
  requires permission battery
}
```

Flutter FFI target:

```Galerina
target flutter-ffi {
  language dart
  native output library

  reports {
    ffi true
    permissions true
    source_maps true
  }
}
```

Later-stage Flutter component syntax:

```Galerina
component BasketTotal {
  prop items: Array<BasketItem>

  computed total: Money {
    return items.sum(item => item.price)
  }

  view {
    Flutter.Text("Total: {total}")
  }
}
```

This syntax is valid only when the project enables a future Flutter UI layer. The
first Flutter target should generate Dart logic packages and bindings.

---

## Bad Examples

`await` inside a synchronous flow:

```Galerina
flow loadUser(id: UserId) -> Result<User, ApiError> {
  let response = await api.get("/users/{id}")
  return User.fromJson(response)
}
```

Expected diagnostic:

```text
await_outside_async_flow
```

Reason:

```text
The flow uses await but is not marked async.
```

---

Calling an async flow and treating it as a finished value:

```Galerina
flow boot() -> Result<Void, AppError> {
  let photo = getPhoto("photo.jpg")
  image.show(photo)
  return Ok()
}
```

Expected diagnostic:

```text
async_result_not_awaited
```

Reason:

```text
getPhoto returns async work. The caller must await it inside an async flow or
start it as structured async work.
```

---

Using Dart-specific bytes in normal portable Galerina code:

```Galerina
flow hashFile(path: String) -> Hash {
  let bytes: Dart.Uint8List = files.readBytesSync(path)
  return crypto.hash(bytes)
}
```

Expected diagnostic:

```text
target_specific_type_outside_interop
```

Reason:

```text
Dart.Uint8List is target-specific. Normal Galerina code should use Bytes.
```

---

Treating Flutter as a native Galerina framework:

```Galerina
flutter app MyApp {
  route "/"
  widget HomeScreen
}
```

Expected diagnostic:

```text
framework_syntax_not_core_language
```

Reason:

```text
Flutter routing, widgets and application structure belong in Flutter packages or
generated Dart package integration, not in core Galerina syntax.
```

---

Using an undeclared device permission:

```Galerina
platform channel CameraApi {
  flow takePhoto() -> Result<Bytes, PlatformError>
}
```

Expected diagnostic:

```text
missing_platform_permission
```

Reason:

```text
Platform-channel contracts that access device capabilities must declare their
permission requirements so generated Flutter and platform reports are complete.
```

---

Assuming FFI works on every Flutter target:

```Galerina
target flutter-ffi {
  language dart
  native output library
  platforms ["android", "ios", "web"]
}
```

Expected diagnostic:

```text
ffi_target_not_supported
```

Reason:

```text
Flutter/Dart FFI support is platform-dependent. The compiler must report
unsupported targets instead of implying universal support.
```

---

## Expected Reports

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

Reports should explain:

```text
which flows are async
which await sites exist
which async calls are not awaited
which Bytes conversions target Dart.Uint8List
whether each conversion copies or is zero-copy
which Flutter drawing APIs are used
which rendering backend assumptions exist
which platform-channel APIs and permissions exist
which FFI bindings and platforms are generated
which generated Dart/native locations map back to .spore source
```
