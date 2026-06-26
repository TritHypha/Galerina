# Galerina Target and Capability Model

Ownership note: `galerina-core` may document target declaration syntax and compiler
report contracts. Binary/native target planning belongs in
`packages-galerina/galerina-target-native/`; future systems output planning may start
there and split only after the ABI and memory rules stabilise;
photonic backend target planning belongs in
`packages-galerina/galerina-target-photonic/`; compute target selection belongs in
`packages-galerina/galerina-core-compute/`.

This document defines the proposed **Target and Capability Model** for **Galerina / Galerina**.

It is the foundation for browser targets, server targets, WebAssembly, native output, GPU planning, vector execution, offload nodes and future accelerator support.

---

## Purpose

Before Galerina can safely compile code for browser, server, native, WASM, GPU or future hardware, it must know:

```text
What target is this code compiling for?
What imports are aLOwed?
What capabilities are aLOwed?
What output is expected?
What security checks must run?
What fallback is aLOwed?
```

The target model prevents Galerina from treating all code as if it can run everywhere.

---

## Status Labels

Galerina docs should use clear status labels.

```text
Implemented = works in the current prototype or repository as described
Prototype   = partially working; useful for experiments but not production-ready
Draft       = documented design direction, syntax or policy may still change
Planned     = intended future work, not implemented yet
Research    = exploratory, hardware/backend-dependent or uncertain
Blocked     = cannot progress until another feature or decision is completed
```

Recommended rule:

```text
Every target capability should say whether it is Implemented, Prototype, Draft, Planned, Research or Blocked.
```

The project-wide feature matrix lives in `docs/feature-status.md`.

---

## Core Rule

```text
Target decides capability.
Capability decides aLOwed imports.
ALOwed imports decide what code may compile.
Fallback decides what happens when the preferred target cannot run the code.
Reports explain every decision.
```

This keeps Galerina security-first and prevents server-only behaviour from leaking into browser or client-side builds.

---

## Hardware Feature Detection

Target planning should also be able to detect and report relevant hardware
features when the selected output depends on them.

Examples:

```text
CPU vector support
CPU matrix/AI support
GPU tensor support
control-flow protection
confidential runtime support
GPU confidential compute support
GPU isolation support
```

Recommended rule:

```text
Hardware features may improve target selection, but they must not remove safe fallback.
Detected hardware features should be recorded in target reports.
Unavailable hardware features should not silently change security expectations.
```

Detailed planning lives in `docs/hardware-feature-detection-and-security.md`.

---

## Target Types

Recommended early target types:

```text
browser
server
native
javascript
typescript
node
react-adapter
angular-adapter
dart
flutter
wasm
worker
mobile-native
gpu
ai-accelerator
photonic
memory-interconnect
ternary-sim
omni-sim
wavelength
```

### v0.1 Boundary

The smallest useful v0.1 target boundary should be:

```text
browser = JavaScript output planning and import security checks
server  = normal trusted backend runtime planning
native  = CPU-compatible baseline output
javascript = generated ESM JavaScript module output
typescript = generated TypeScript declaration or TS-compatible output
node    = Node-compatible ESM/WASM/worker output
react-adapter = optional React-friendly wrapper output
react-native-adapter = optional React Native-friendly wrapper output
angular-adapter = optional Angular-friendly wrapper output
wasm    = WebAssembly output planning
worker  = browser/Node worker-compatible compute output
mobile-native = mobile native package/binding output target, not mobile framework syntax
dart    = generated Dart package output
flutter = generated Dart prepared for Flutter package/app integration
```

Later targets:

```text
gpu        = planned accelerator report
ai         = planned AI accelerator target category report
photonic   = research/future target report
memory     = memory/interconnect planning report
ternary    = simulation
omni       = configurable logic-width simulation
wavelength = future analogue photonic maths planning
```

Wavelength compute is research-stage and should be treated as a pure compute
planning target only. It must not allow file, network, database, environment or
secret access, and results must return to strict Galerina values before business or
security decisions.

Backend compute targets should use generic target categories in Galerina core:
`cpu`, `cpu_vector`, `gpu`, `ai_accelerator`, `photonic_auto`,
`photonic_candidate`, `accelerator_auto`, `memory_interconnect` and `safe_cpu`.
Vendor-specific targets such as CUDA, ROCm, TPU, Trainium, Inferentia, cloud
confidential compute mappings or photonic MZI/WDM backends belong in target
plugins or deployment profiles.

Dart and Flutter targets are language/package output targets. They must not turn
Galerina into a Flutter framework. Flutter support should be layered: generated Dart
business logic first, optional Flutter package/plugin output next, and explicit
render/interop reports where Flutter drawing or platform boundaries are used.

Flutter FFI and platform-channel targets are explicit interop targets. They must
declare platform support, permissions, generated bindings, source maps and
unsupported-platform diagnostics.

JavaScript, TypeScript, Node, React adapter, React Native adapter and Angular
adapter targets are framework-facing output targets. They must keep Galerina
framework-neutral: generated ESM, declarations, schemas, source maps, WASM
bridges and adapter manifests are allowed; native React/React Native/Angular
component syntax and framework routing are not core Galerina features.

React Native targets should be treated like Dart/Flutter interop: generated
mobile package output plus explicit native-module, permission, storage and
platform capability reports. React Native screens, JSX/TSX, navigation, Metro,
Babel and app lifecycle are host-framework concerns.

Mobile-native targets and device capability packages must not turn Galerina into a
mobile framework or operating-system API layer. They should expose explicit
permissions, effects, native bindings, compute target reports and source maps.

Systems output targets should lower checked Galerina IR into portable backend
artifacts or native ABI bindings after type, effect, memory and layout checks
have run. They must not import low-level unsafe defaults into normal Galerina
source.

Rules:

```text
Systems output is a backend target, not a core coding style.
layout native is explicit and limited to interop or systems profiles.
Native ABI bindings require ownership, nullability, allocator and error mapping.
Generated systems output requires source maps, ABI reports, memory reports and security reports.
Raw pointer arithmetic remains denied outside audited unsafe/systems boundaries.
```

---

## Example Configuration

Example:

```Galerina
boot {
  target browser {
    output js
    wasm optional
    fallback js
  }

  capabilities {
    allow dom
    allow fetch
    allow storage
    block environment
    block server_database
    block secrets
  }
}
```

Meaning:

```text
compile for browser
emit JavaScript
allow optional WebAssembly only where safe
fallback to JavaScript
allow DOM/fetch/storage
block environment variables
block server database access
block secrets
```

---

## Browser Target

Status: Prototype.

Browser output is public code.

### Syntax

Recommended `target browser` syntax:

```Galerina
boot {
  target browser {
    output js
    wasm optional
    fallback js
    source_maps true
  }
}
```

ALOwed `output` values:

```text
js      = generate JavaScript only
wasm    = generate WebAssembly plus required host wrapper
hybrid  = generate JavaScript for browser integration and WebAssembly for safe compute
```

ALOwed `wasm` values:

```text
disabled
optional
required
```

ALOwed `fallback` values:

```text
js
scalar
none
```

Recommended defaults:

```text
output js
wasm optional
fallback js
source_maps true
```

Rules:

```text
browser output is public
JavaScript is the default browser integration layer
WebAssembly is for heavy browser-safe compute
server-only imports are blocked
private environment access is blocked
secrets are blocked
source maps should be generated
target and security reports should be generated
```

ALOwed capabilities:

```text
dom
forms
events
fetch
storage
router
public_config
browser_crypto_public
wasm_compute_optional
```

Blocked capabilities:

```text
environment
server_database
server_filesystem
server_secrets
payment_private_keys
private_network
admin_credentials
raw_secret_access
```

ALOwed imports:

```Galerina
import browser.dom
import browser.forms
import browser.events
import browser.http
import browser.storage
import browser.router
import math
```

Blocked imports:

```Galerina
import environment
import server.database
import server.filesystem
import server.secrets
import payment.private
```

Required checks:

```text
block server-only imports
block private environment access
block secret access
block private file paths
block database credentials
require source maps
generate browser security report
```

---

## Server Target

Status: draft/planned.

Server output can access trusted backend capabilities, but only when declared.

ALOwed capabilities may include:

```text
network.inbound
network.outbound
database.read
database.write
filesystem.restricted
environment.restricted
secrets.secure
queue.read
queue.write
worker_pool
offload_nodes
```

Server code should still deny unsafe behaviour by default.

Rules:

```text
secrets must use SecureString
environment access must be declared
filesystem access must be restricted
database writes must be source-mapped
network calls must support timeout
webhooks must declare verification policy
```

---

## Native Target

Status: implemented as CPU-compatible placeholder output in the v0.1 prototype.

Native output is the baseline production target.

Expected outputs:

```text
app.bin
app.source-map.json
app.security-report.json
app.target-report.json
app.memory-report.json
app.build-manifest.json
```

Native should be the safest fallback target for:

```text
normal application logic
server flows
security checks
scalar fallback
vector fallback
offload scheduling
```

Native target support does not imply kernel, driver, privileged runtime or raw
hardware support.

Kernel and driver development is last-stage work, blocked by default and
requires explicit maintainer or project permission before design or
implementation starts.

---

## WASM Target

Status: implemented as placeholder output; frontend WASM behavior is planned.

WASM is useful for:

```text
portable compute
browser-safe heavy calculations
plugin/runtime sandboxing
maths-heavy code
vector or SIMD planning
```

WASM should not directly handle:

```text
DOM updates
server database access
private environment access
raw secret access
filesystem-private operations
```

Recommended rule:

```text
WebAssembly does compute.
JavaScript or host runtime connects it to the outside world.
```

---

## GPU and Accelerator Targets

Status: planned/research.

GPU, photonic and other accelerator targets should be capability reports first.

They should describe:

```text
supported operation classes
unsupported operation classes
precision limits
memory transfer costs
fallback target
source map back to Galerina
confidence/risk notes
```

They must not silently accept server-only side effects or security-sensitive operations.

---

## Import Classes

Galerina should classify imports by target safety.

```text
browser-safe
server-only
compute-safe
runtime-only
test-only
research-target
```

### Browser-Safe

```Galerina
import browser.dom
import browser.forms
import browser.events
import browser.http
import browser.storage
import browser.router
```

### Server-Only

```Galerina
import server.database
import server.filesystem
import server.secrets
import environment
import payment.private
```

### Compute-Safe

```Galerina
import math
import tensor
import crypto.public
import image.processing
import data.buffer
```

---

## Capability Rules

Capabilities should be explicit.

Status: Prototype.

### Syntax

Recommended `capabilities` syntax:

```Galerina
boot {
  capabilities {
    allow dom
    allow fetch
    allow storage

    block environment
    block filesystem
    block server_database
    block secrets
    block native_bindings
  }
}
```

Rules:

```text
allow grants a named capability when the selected target supports it
block denies a named capability even if an import requests it
blocked capability always wins over aLOwed imports
unknown capability is denied by default
target may provide default denies
security profile may add stricter denies
compiler reports all capability decisions
```

Recommended browser defaults:

```Galerina
capabilities {
  allow dom
  allow forms
  allow events
  allow fetch
  allow storage
  allow router

  block environment
  block filesystem
  block server_database
  block server_secrets
  block secrets
  block native_bindings
}
```

Recommended server defaults:

```Galerina
capabilities {
  allow network.inbound
  allow network.outbound
  allow environment.restricted
  allow secrets.secure

  block native_bindings
}
```

Common capability names:

```text
dom
forms
events
fetch
storage
router
environment
environment.restricted
filesystem
filesystem.restricted
server_database
server_secrets
secrets
secrets.secure
native_bindings
network.inbound
network.outbound
database.read
database.write
worker_pool
offload_nodes
wasm_compute
gpu_compute
```

---

## Security Blocks

Example:

```Galerina
security {
  block_server_imports true
  block_env_access true
  block_secret_access true
  require_source_maps true
  fail_on_target_fallback false
}
```

Browser target should normally use:

```text
block_server_imports true
block_env_access true
block_secret_access true
```

Server target may allow environment and secrets only through declared secure APIs.

---

## Fallback Rules

Targets should define fallback explicitly.

Example:

```Galerina
target browser {
  output hybrid
  js enabled
  wasm optional
  fallback js
}
```

Fallback examples:

```text
wasm -> js
gpu -> cpu
photonic -> gpu -> cpu
vector -> scalar
omni logic -> simulation
offload node -> primary lane or fail, based on policy
```

Required rule:

```text
Fallback must be reported.
```

Warning example:

```text
galerina-WARN-TARGET-003: Accelerator target unavailable. Falling back to CPU.
```

Error example:

```text
galerina-ERR-TARGET-IMPORT-002: Import "server.database" is not aLOwed for browser target.
```

---

## Output Expectations

Target declarations should imply expected output files.

Browser JavaScript:

```text
dist/app.js
dist/app.js.map
dist/Galerina.browser-report.json
dist/Galerina.security-report.json
```

Browser hybrid:

```text
dist/app.js
dist/app.wasm
dist/app.js.map
dist/app.wasm.map
dist/Galerina.browser-report.json
dist/Galerina.wasm-report.json
dist/Galerina.security-report.json
```

Native production:

```text
build/app.bin
build/app.source-map.json
build/app.target-report.json
build/app.security-report.json
build/app.build-manifest.json
```

Development generation:

```text
.build-dev/app.api-report.json
.build-dev/app.security-report.json
.build-dev/app.source-map.json
.build-dev/app.ai-context.json
.build-dev/docs/
```

---

## Compiler Report

Galerina should generate target and capability reports.

Example:

```json
{
  "target": "browser",
  "status": "planned",
  "output": "js",
  "capabilities": {
    "aLOwed": ["dom", "fetch", "storage"],
    "blocked": ["environment", "server_database", "secrets"]
  },
  "imports": {
    "aLOwed": ["browser.dom", "browser.http"],
    "blocked": [
      {
        "import": "server.database",
        "code": "galerina-ERR-TARGET-IMPORT-002",
        "reason": "Database access must run on a server target."
      }
    ]
  },
  "fallback": {
    "wasm": "js"
  },
  "sourceMaps": true
}
```

---

## v0.1 Compiler Milestone

Recommended tiny compiler milestone:

```text
parse boot.spore
parse target browser
parse simple imports
classify browser-safe and server-only imports
block server-only imports for browser target
generate target/capability compiler report
emit tiny JavaScript output for a simple browser-safe flow
```

This proves the Galerina target boundary before adding vector, offload nodes or real frontend compilation.

---

## Relationship to Other Galerina Documents

This model connects:

```text
docs/frontend-compilation-js-wasm.md
docs/vector-model.md
docs/primary-lane-and-offload-nodes.md
docs/logic-targets.md
docs/compiler-backends.md
docs/security-model.md
docs/warnings-and-diagnostics.md
```

---

## Final Rule

```text
Every Galerina target must declare or infer capabilities.
Every import must be checked against the selected target.
Every fallback must be reported.
Every generated output must be source-mapped where useful.
Security-sensitive behaviour must fail closed by default.
```
