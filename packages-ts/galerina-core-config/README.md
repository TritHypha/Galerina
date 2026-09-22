# Galerina Config

`galerina-core-config` is the package for Galerina project configuration, environment mode and
policy loading contracts.

It belongs in:

```text
/packages-ts/galerina-core-config
```

Use this package for:

```text
project config shape
environment mode loading
development/test/staging/production policy
config validation diagnostics
runtime config handoff
safe environment variable references
host package manifest boundary checks
```

## Environment Mode

`EnvironmentMode` is a closed set:

```ts
export type EnvironmentMode = "development" | "test" | "staging" | "production"
```

Unknown modes emit `FUNGI-CONFIG-001`. An unset mode emits `FUNGI-CONFIG-002`
and falls back to `development` with a warning.

## Environment Config Types

`EnvironmentConfig` is the **unversioned runtime-handoff snapshot** used by
`RuntimeConfigHandoff`. The versioned schema is `EnvironmentConfigV2`.

```ts
export interface EnvironmentConfig {
  mode: EnvironmentMode
  variables: EnvironmentVariableReference[]
  secrets: EnvironmentVariableReference[]
}
```

`loadEnvironmentConfig()` returns `EnvironmentConfigV2` and emits
`FUNGI-CONFIG-028` for missing public variables and `FUNGI-CONFIG-029` for
missing secrets. It does not reuse 001/002.

## Safe Secret Resolution Flow

```text
config declares required secret name
    ↓
security creates protected SecretReference
    ↓
runtime validates capability
    ↓
secret provider resolves raw value inside protected boundary
    ↓
approved safe sink consumes value
    ↓
raw value is never logged or reported
```

## Diagnostic Codes

| Code | Meaning |
| --- | --- |
| `FUNGI-CONFIG-001` | invalid environment mode (`resolveEnvironmentMode`) |
| `FUNGI-CONFIG-002` | missing environment mode (`resolveEnvironmentMode`) |
| `FUNGI-CONFIG-003` | project config is not an object |
| `FUNGI-CONFIG-004` | required environment variable missing (runtime handoff) |
| `FUNGI-CONFIG-005` | production handoff requires environment validation |
| `FUNGI-CONFIG-028` | required public variable missing (`loadEnvironmentConfig`) |
| `FUNGI-CONFIG-029` | required secret missing (`loadEnvironmentConfig`) |
| `FUNGI-CONFIG-030` | legacy environment schema refused |

## Contracts

`galerina-core-config` exposes typed contracts for:

- `ProjectConfig` - project name, version, root, entry files, package
  references, targets and documentation/tool paths.
- `EnvironmentConfig` - the active mode plus public and secret environment
  variable references.
- `ProductionStrictnessPolicy` - production checks for strict project mode,
  missing required variables, unsafe secret defaults and production-disabled
  packages.
- `RuntimeConfigHandoff` - the safe object passed to runtime consumers after
  config validation.
- `ConfigDiagnostic` - structured warnings and errors with stable codes,
  paths and optional suggested fixes.
- `HostPackageManifestBoundaryPolicy` - validation that keeps Galerina package graph
  fields out of host ecosystem manifests such as `package.json`.

Environment variables are represented by name and metadata only. Secret values
must not be loaded into or printed by this package.

## Example

```ts
import { loadConfigFromObjects } from "@galerina/core-config";

const result = loadConfigFromObjects({
  project: {
    name: "galerina-app",
    version: "0.1.0",
    root: ".",
    entryFiles: ["packages-ts/galerina-framework-example-app/src/index.fungi"],
    packages: ["packages-ts/galerina-core", "packages-ts/galerina-core-config", "packages-ts/galerina-framework-example-app"],
    strict: true,
    targets: ["cpu", "wasm"],
  },
  environment: {
    mode: "production",
    variables: ["Galerina_APP_ENV"],
    secrets: ["Galerina_APP_SECRET"],
  },
  availableEnvironment: {
    Galerina_APP_ENV: "production",
    Galerina_APP_SECRET: "set",
  },
});
```

See `examples/project-config.json` for a fuller object-shaped example.

## Production Package Overrides

Production mode must be conservative about optional tooling packages. Packages
such as `galerina-tools-benchmark` and `galerina-devtools-*` are disabled by default in
production profiles.

Default production rule:

```text
production disables development-only and benchmark packages unless explicitly
overridden with a reason.
```

Example explicit override:

```json
{
  "production": {
    "packageOverrides": [
      {
        "path": "packages-ts/galerina-tools-benchmark",
        "reason": "One-off production hardware validation before launch.",
        "expires": "2026-06-01"
      }
    ]
  }
}
```

Overrides are included in the runtime config handoff as
`activeProductionPackageOverrides` so build, security and deployment reports can
show that production defaults were intentionally changed.

## Host Package Boundary

`package.json` is a host ecosystem manifest for NPM scripts, current
JavaScript/TypeScript prototype tooling and generated JS/TS interop packaging.
It must not define Galerina package graph keys, runtime profiles, compiler target
policy or production package overrides.

Galerina package selection belongs in future `package-galerina.json` and `galerina.lock.json`
schemas once those schemas are implemented.

## Architecture Depth: TypeScript Contracts (v0.2 Specification)

### ConfigValue (Discriminated Union)

```ts
export type ConfigValue =
    | { kind: "string";   value: string   }
    | { kind: "number";   value: number   }
    | { kind: "boolean";  value: boolean  }
    | { kind: "url";      value: string   }
    | { kind: "duration"; value: number; unit: "ms" | "s" | "m" | "h" }
    | { kind: "bytes";    value: number; unit: "b" | "kb" | "mb" | "gb" }
```

### EnvironmentPolicy

Live policy (not a second undocumented shape):

```ts
export interface EnvironmentPolicy {
    allowDotEnvFiles: boolean
    allowUnsafeOverrides: boolean
    secretReportMode: "redacted-only"   // invariant: no plaintext mode exists
}

export function defaultEnvironmentPolicy(mode: EnvironmentMode): EnvironmentPolicy
```

### EnvironmentConfigV2

```ts
export interface EnvironmentConfigV2 {
    schemaVersion: "galerina.config.environment.v2"
    mode: EnvironmentMode
    variables: string[]    // names only, not values
    secrets: SecretEnvironmentReference[]
    policy: EnvironmentPolicy
}
```

### SecretEnvironmentReference

Live source/category vocabulary (hyphenated categories; `env|vault|kms|runtime`):

```ts
export type SecretConfigSource =
    | { kind: "env";     variableName: string }
    | { kind: "vault";   storeId: string; keyPath: string }
    | { kind: "kms";     keyId: string; provider?: string }
    | { kind: "runtime" }

export interface SecretEnvironmentReference {
    id: string
    name: string
    present: boolean
    redacted: true
    fingerprint?: string
    source: SecretConfigSource
    category: SecretCategory
    requiredIn: EnvironmentMode[]
    allowedSinks: string[]
    deniedSinks: string[]
    redaction: "full" | "partial" | "fingerprint_only"
}
```

Underscore categories (`api_key`) and `file` / `secretStore` / `runtimeInjected`
source kinds are **not** admitted.

### Loading Contracts

```ts
export interface LoadEnvironmentConfigInput {
    mode: EnvironmentMode
    variableNames: string[]
    secretNames: string[]
    availableEnvironment: Record<string, string>
    policy?: Partial<EnvironmentPolicy>
    schemaVersion?: string
}

export async function loadEnvironmentConfig(
    input: LoadEnvironmentConfigInput
): Promise<{ config: EnvironmentConfigV2; diagnostics: ConfigDiagnostic[] }>
```

### Config Report Types

Live report shape (source-owned; not a second schema):

```ts
export interface SecretReportValue {
    name: string
    sourceKind: SecretConfigSourceKind
    redacted: true
    category?: SecretCategory
}

export interface EnvironmentConfigReport {
    schemaVersion: "galerina.config.environment.v2"
    mode: EnvironmentMode
    policy: EnvironmentPolicy
    variableCount: number
    secretCount: number
    secrets: SecretReportValue[]
    diagnostics: ConfigDiagnostic[]
}
```

Internal directory split (`environment/`, `secrets/`, `loaders/`) is **not**
part of this freeze. Symbols remain in `src/index.ts`.
```

## Boundary

`galerina-core-config` should load and validate configuration. It must not execute app
logic, run tasks, serve HTTP or reveal secrets.

Final rule:

```text
galerina-core-config describes configuration safely.
galerina-core-security protects sensitive values.
consuming packages enforce their own runtime behaviour.
```
