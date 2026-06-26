# Device Capability Boundary Syntax

Status: Draft.

This file defines syntax direction for device-capability boundaries. Galerina should
support safe foundations for phone and device features, not built-in camera,
radio, media-player or mobile-framework features.

---

## Purpose

```text
declare device permissions explicitly
represent device data with portable types
use streams for live data
use compute targets for CPU/GPU/NPU/DSP-style work
use capability detection without hard-coding devices
make native/platform calls explicit
report risky device-facing boundaries
```

---

## Grammar Direction

```text
requires_perm   = "requires" "permission" permission_name
effect_name     = identifier ("." identifier)*
capability_call = "system.capabilities" "(" ")"
compute_target  = "compute" ("auto" | "use" identifier)
external_decl   = unsafe_marker? "external" identifier params return_type effects?
stream_type     = "Stream" "<" type ">"
buffer_type     = "Buffer" "<" type ">"
```

Device feature calls such as `camera.capture()` must resolve to packages,
platform bindings or framework APIs, not core Galerina functions.

---

## Minimal Examples

Permission-aware package use:

```Galerina
use Galerina.camera
use Galerina.image
use Galerina.compute

requires permission camera

flow analyseCameraFrame() -> Result<ImageAnalysis, CameraError>
effects [camera.read] {
  let frame = camera.captureFrame()
  let result = compute auto image.detectObjects(frame)
  return Ok(result)
}
```

Safe stream values:

```Galerina
let frames: Stream<ImageFrame> = camera.preview()
let samples: Stream<AudioSample> = microphone.listen()
```

Capability detection:

```Galerina
let caps = system.capabilities()

if caps.supports("gpu.compute") {
  compute use gpu
} else {
  compute use cpu
}
```

Native/platform boundary:

```Galerina
unsafe external androidCameraCapture() -> NativeImage
effects [camera.read, native.call]
```

---

## Security Rules

```text
device APIs are package/platform/framework calls, not core Galerina functions
camera, microphone, location, contacts, Bluetooth, photos and notifications require explicit permissions
native/platform calls must be explicit and effect-checked
privileged device access and drivers remain blocked by default
Stream<T> and Buffer<T> must be memory-safe and cancellation-safe
compute target selection must report fallback and precision assumptions
capability detection must not silently weaken security expectations
```

---

## Report Output

Recommended reports:

```text
device-capability-report.json
device-privacy-report.json
permissions-report.json
native-bindings-report.json
compute-target-report.json
```

Report fields should include:

```text
declared device permissions
used device effects
package/platform bindings used
unsafe native calls
streaming data types
buffer and byte movement
compute target selection
hardware capability assumptions
fallback decisions
source-map links back to .spore files
```

---

## Open Parser and Runtime Work

```text
parse requires permission for device permission names
check device effects against declared permissions
reject core calls that pretend to be built-in camera/radio/media APIs
report platform package permissions
report native bindings and unsafe external calls
add device-capability-report.json
add device-privacy-report.json
connect compute target reports to hardware capability detection
keep mobile UI, notifications, media players, Bluetooth stacks and GPS navigation out of core Galerina
```

