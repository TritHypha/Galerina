# Galerina React Native Target Support

Status: Draft.

Galerina should support React Native in the same spirit as Dart/Flutter interop:

```text
Galerina is the language and compiler/toolchain.
React Native is an external mobile framework.
```

Galerina should generate safe JavaScript/TypeScript packages, schemas, bindings,
reports and native-boundary metadata that React Native apps can consume. It
should not become a React Native framework and should not make React Native
component syntax part of Galerina Core.

---

## Core Rule

```text
Galerina can target React Native through generated packages and explicit interop.
React Native keeps ownership of screens, navigation, components and app lifecycle.
```

Galerina should provide:

```text
TypeScript declarations
ESM-compatible JavaScript output
React Native adapter wrappers
typed API clients
JSON schemas
OpenAPI output
WASM bridge metadata where supported
native module boundary reports
JSI/TurboModule-style boundary metadata where used
device permission reports
source maps
security reports
AI-readable adapter guides
```

React Native should provide:

```text
components
JSX/TSX
screens
navigation
state management
Metro/Babel configuration
native module implementation
app lifecycle
platform project structure
```

---

## Recommended Target Layers

React Native support should be layered.

```text
Level 1: Generated TypeScript/JavaScript package output
Level 2: React Native-friendly API/client/hook adapters
Level 3: Device permission and platform capability reports
Level 4: Native module / JSI / TurboModule boundary reports
Level 5: Optional UI helper generation later
```

The first useful target is:

```text
Galerina logic/types/API contracts
-> ESM JavaScript
-> TypeScript declarations
-> JSON Schema/OpenAPI
-> React Native adapter manifest
```

---

## Target Names

Recommended target names:

```text
target react-native-adapter = generated React Native-friendly wrappers
target react-native-package = generated package for React Native apps
target mobile-native        = native package/binding output target
```

`react-native-adapter` is the normal first target. `mobile-native` is lower
level and should only be used when native bindings are required.

Example direction:

```Galerina
target react-native-adapter {
  module esm
  typescript_declarations true
  source_maps true
  adapter_manifest true
  permissions_report true
}
```

---

## Type Mapping

Portable Galerina code should use Galerina types.

| Galerina type        | React Native / TypeScript boundary |
| -------------- | ---------------------------------- |
| `String`       | `string`                           |
| `Bool`         | `boolean`                          |
| `Int`          | `number` with range validation     |
| `Decimal`      | `string` or typed decimal wrapper  |
| `Bytes`        | boundary-specific byte wrapper     |
| `Option<T>`    | generated optional wrapper or `T \| null` only at boundary |
| `Result<T, E>` | generated discriminated union      |
| `SecureString` | redacted/opaque token wrapper      |

Normal Galerina code should not use JavaScript `undefined`, loose nullability,
truthy/falsy logic or untyped objects.

Boundary conversions must be explicit, source-mapped and reported.

---

## Generated Adapter Output

React Native adapter output may include:

```text
TypeScript interfaces
API clients
React hook wrappers
form validation schemas
storage policy helpers
permission manifest
native boundary manifest
source maps
security report
AI adapter guide
```

Example generated hook shape:

```ts
export function useOrdersApi() {
  return {
    createOrder,
    getOrder
  };
}
```

This is generated adapter code. It is not Galerina syntax.

---

## Native Boundary Policy

React Native apps often cross into platform-specific native code. In Galerina, that
must be explicit.

Native boundary reports should include:

```text
native module name
platform support
permissions
effects
threading assumptions
memory ownership
byte/buffer conversions
secret handling
unsupported targets
source-map entries
```

Rules:

```text
Native modules are denied unless declared.
Native modules must not receive SecureString unless explicitly allowed and redacted.
Bytes crossing the native boundary must have ownership and copy/transfer policy.
Unsupported platforms must be reported, not silently generated.
Native errors must map back into Result<T, E>.
```

---

## Device Capability Policy

React Native device features remain package/platform capabilities, not Galerina Core
APIs.

Examples:

```text
camera
microphone
location
contacts
Bluetooth
photos
notifications
secure storage
biometrics
```

Galerina should provide:

```text
permission declarations
effect checks
platform support reports
privacy reports
safe buffer rules
source maps
```

---

## Storage Policy

React Native apps may use local storage packages, secure storage packages or
platform keychains.

Galerina rules:

```text
SecureString must not be stored in plain local storage.
Token storage must use an explicit secure-storage boundary.
Storage access must be permissioned and reported.
Cache size and TTL should be explicit.
```

---

## What Must Stay Out Of Core Galerina

```text
React Native components
JSX/TSX syntax
navigation libraries
screen routing
state management packages
Metro configuration
Babel plugins
native platform project files
Android/iOS lifecycle code
style systems
gesture libraries
animation libraries
```

These belong in React Native packages, generated adapters or the host app.

---

## Security Risk

React Native support is a high-risk boundary because it can involve JavaScript,
mobile permissions, storage, native modules and platform-specific behaviour.

Recommended rank:

```text
React Native adapter output: Risk 3
React Native native module boundary: Risk 4
React Native SecureString storage: Risk 4
React Native UI component syntax in Galerina Core: unsupported for early Galerina
```

Required reports:

```text
react-native-adapter-manifest.json
react-native-permissions-report.json
react-native-native-boundary-report.json
react-native-security-report.json
source maps
AI adapter guide
```

---

## Final Rule

```text
Support React Native at the boundary.
Do not make React Native a core Galerina framework.
```

Galerina should generate safe, typed, source-mapped and reportable code that React
Native apps can use.
