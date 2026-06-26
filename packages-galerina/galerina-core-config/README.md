# Galerina Config

`galerina-core-config` is the package for Galerina project configuration, environment mode and
policy loading contracts.

It belongs in:

```text
/packages-galerina/galerina-core-config
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

Unknown modes emit `SPORE-CONFIG-003` rather than silently falling back.

## Environment Config Types

```ts
export interface EnvironmentConfig {
  mode: EnvironmentMode
  variables: string[]   // names only, not values
  secrets: string[]     // names only, not values
}

export interface SecretEnvironmentReference {
  name: string
  present: boolean
  redacted: true        // never the raw value
  fingerprint?: string
}
```

`loadEnvironmentConfig()` validates required variables and secrets, emits
`SPORE-CONFIG-001` for missing public variables and `SPORE-CONFIG-002` for missing
secrets.

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
| `SPORE-CONFIG-001` | required public environment variable missing |
| `SPORE-CONFIG-002` | required secret missing |
| `SPORE-CONFIG-003` | unknown environment mode |
| `SPORE-CONFIG-004` | production strict mode disabled |
| `SPORE-CONFIG-005` | unsafe secret default detected |
| `SPORE-CONFIG-006` | development package enabled in production |
| `SPORE-CONFIG-010` | host package manifest boundary violation |

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
    entryFiles: ["packages-galerina/galerina-framework-example-app/src/index.spore"],
    packages: ["packages-galerina/galerina-core", "packages-galerina/galerina-core-config", "packages-galerina/galerina-framework-example-app"],
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
        "path": "packages-galerina/galerina-tools-benchmark",
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

```ts
export interface EnvironmentPolicy {
    mode: EnvironmentMode
    requireHttps: boolean
    requireSecrets: boolean
    allowLocalhost: boolean
    allowDevTools: boolean
    allowDebugLogging: boolean
    allowSecretValuesInReports: false   // always false — never expose secret values
    strictMode: boolean
}

// Returns the default policy for the given mode
export function defaultEnvironmentPolicy(mode: EnvironmentMode): EnvironmentPolicy
// development: loose, test: moderate, staging: strict-ish, production: full strict
```

### EnvironmentConfig (v0.2)

```ts
export interface EnvironmentConfig {
    schemaVersion: "galerina.config.environment.v1"
    mode: EnvironmentMode
    variables: string[]    // names only, not values
    secrets: SecretEnvironmentReference[]
    policy: EnvironmentPolicy
}
```

### SecretEnvironmentReference (Extended)

```ts
export type SecretConfigSource =
    | { kind: "env";             variableName: string }
    | { kind: "file";            path: string         }
    | { kind: "secretStore";     provider: string; secretId: string }
    | { kind: "runtimeInjected"; label: string        }

export interface SecretEnvironmentReference {
    id: string
    name: string
    present: boolean
    redacted: true           // never the raw value
    fingerprint?: string
    source: SecretConfigSource
    category: "api_key" | "password" | "token" | "certificate" | "signing_key" | "generic"
    provider?: string
    requiredIn: EnvironmentMode[]     // modes where this secret is required
    allowedSinks: string[]
    deniedSinks: string[]
    redaction: "full" | "partial" | "fingerprint_only"
}
```

### Loading Contracts

```ts
export interface LoadEnvironmentConfigInput {
    mode: EnvironmentMode
    variableNames: string[]
    secretNames: string[]
    availableEnvironment: Record<string, string>
    policy?: Partial<EnvironmentPolicy>
}

export async function loadEnvironmentConfig(
    input: LoadEnvironmentConfigInput
): Promise<{ config: EnvironmentConfig; diagnostics: ConfigDiagnostic[] }>
```

### Config Report Types

```ts
export interface EnvironmentConfigReport {
    schemaVersion: "galerina.config.report.v1"
    mode: EnvironmentMode
    policy: EnvironmentPolicy
    variables: string[]
    secrets: SecretReportValue[]
    diagnostics: ConfigDiagnostic[]
}

export interface SecretReportValue {
    name: string
    present: boolean
    redaction: string
    source: string     // kind only, not raw path/value
}
```

### Internal File Layout

```text
packages-galerina/galerina-core-config/src/
  environment/
    environment-config.ts     ← EnvironmentConfig, EnvironmentMode, EnvironmentPolicy
    environment-policy.ts     ← defaultEnvironmentPolicy()
    environment-report.ts     ← EnvironmentConfigReport, SecretReportValue
  secrets/
    secret-reference.ts       ← SecretEnvironmentReference, SecretConfigSource
    secret-categories.ts
  loaders/
    load-environment.ts       ← loadEnvironmentConfig()
    load-project.ts
    load-config-objects.ts    ← loadConfigFromObjects()
  types/
    config-value.ts           ← ConfigValue discriminated union
    config-diagnostic.ts      ← ConfigDiagnostic
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
