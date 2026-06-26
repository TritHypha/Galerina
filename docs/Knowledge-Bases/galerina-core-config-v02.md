> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Config v0.2

## Formal Specification — Environment Config and Secret Reference Model

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-config`.

See also: `galerina-core-config-environment-secrets.md` (prior KB).

---

## EnvironmentMode Enum

```ts
enum EnvironmentMode {
    Development,
    Testing,
    Staging,
    Production,
    Sandbox
}
```

| Environment | Purpose                   |
| ----------- | ------------------------- |
| Development | Local developer execution |
| Testing     | Automated testing         |
| Staging     | Pre-production validation |
| Production  | Live runtime              |
| Sandbox     | Restricted execution      |

Note: Sandbox is new in v0.2. The prior KB did not include Sandbox mode.

---

## ConfigValue Discriminated Union

```ts
type ConfigValue =
    | {
        type: "string";

        value: string;
      }

    | {
        type: "number";

        value: number;
      }

    | {
        type: "boolean";

        value: boolean;
      }

    | {
        type: "secret";

        value: SecretEnvironmentReference;
      };
```

The `secret` kind wraps a `SecretEnvironmentReference` rather than a raw
value. This prevents secrets from appearing as plain strings in config.

Note: The prior KB had "url", "duration", and "bytes" kinds. The v0.2
formal spec uses "string", "number", "boolean", "secret".

---

### Example ConfigValues

```ts
const apiUrl: ConfigValue = {
    type: "string",
    value: "https://api.galerina.dev"
};

const dbPassword: ConfigValue = {
    type: "secret",
    value: {
        source: "env",
        key: "DATABASE_PASSWORD"
    }
};
```

---

## EnvironmentPolicy

```ts
interface EnvironmentPolicy {
    allowSecretValuesInReports: boolean;
}
```

---

### defaultEnvironmentPolicy()

```ts
function defaultEnvironmentPolicy():
    EnvironmentPolicy {

    return {
        allowSecretValuesInReports:
            false
    };
}
```

Secrets must never appear in runtime reports, audit streams, explain
traces, deployment logs, or diagnostics unless explicitly permitted.

---

## EnvironmentConfig (v0.2)

```ts
interface EnvironmentConfig {
    schemaVersion: string;

    mode: EnvironmentMode;

    values: Record<
        string,
        ConfigValue
    >;

    policy: EnvironmentPolicy;
}
```

Example:
```json
{
  "schemaVersion": "0.2",
  "mode": "Production",
  "values": {
    "API_URL": {
      "type": "string",
      "value": "https://api.galerina.dev"
    }
  },
  "policy": {
    "allowSecretValuesInReports": false
  }
}
```

---

## Secret Reference Model

### SecretEnvironmentReference (v0.2)

```ts
interface SecretEnvironmentReference {
    source: string;

    key: string;
}
```

Example:
```json
{
  "source": "env",
  "key": "DATABASE_PASSWORD"
}
```

---

### SecretConfigSource

```ts
type SecretConfigSource =
    | {
        type: "env";
      }

    | {
        type: "vault";
      }

    | {
        type: "kms";
      }

    | {
        type: "runtime";
      };
```

| Source  | Purpose                  |
| ------- | ------------------------ |
| env     | Environment variables    |
| vault   | Secret vault systems     |
| kms     | Key management systems   |
| runtime | Runtime-provided secrets |

Note: The prior KB used "file" and "secretStore". The v0.2 formal spec
uses "vault" and "kms" as explicit providers.

---

### ProtectedSecret (v0.2)

```ts
interface ProtectedSecret {
    reference:
        SecretEnvironmentReference;

    protected: true;
}
```

Note: ProtectedSecret in this package is a simple interface (not a class).
The class form with `reveal()` is in `galerina-core-security`.

---

## Environment Loading

### LoadEnvironmentConfigInput

```ts
interface LoadEnvironmentConfigInput {
    environmentPath: string;

    mode: EnvironmentMode;

    policy?: EnvironmentPolicy;
}
```

---

### loadEnvironmentConfig()

```ts
function loadEnvironmentConfig(
    input: LoadEnvironmentConfigInput
): EnvironmentConfig {

    const raw =
        loadJson(
            input.environmentPath
        );

    return {
        schemaVersion: "0.2",

        mode: input.mode,

        values: raw.values,

        policy:
            input.policy ??
            defaultEnvironmentPolicy()
    };
}
```

---

## Secret Sink Validation

### canSendSecretToSink()

```ts
function canSendSecretToSink(
    sink: string
): boolean {

    const allowedSinks = [
        "runtime-memory",
        "secure-vault",
        "kms"
    ];

    return allowedSinks.includes(
        sink
    );
}
```

Secrets may never flow into logs, reports, browser runtimes, distributed
traces, or analytics systems.

---

## EnvironmentConfigReport

```ts
interface EnvironmentConfigReport {
    mode: EnvironmentMode;

    values: Record<
        string,
        SecretReportValue
    >;
}
```

---

### SecretReportValue

```ts
type SecretReportValue =
    | {
        type: "visible";

        value: unknown;
      }

    | {
        type: "redacted";
      };
```

---

### sanitizeValue()

```ts
function sanitizeValue(
    value: ConfigValue,
    policy: EnvironmentPolicy
): SecretReportValue {

    if (
        value.type === "secret" &&
        !policy
            .allowSecretValuesInReports
    ) {
        return {
            type: "redacted"
        };
    }

    return {
        type: "visible",

        value
    };
}
```

---

## Sandbox Environment Rules

Sandbox mode enforces stricter restrictions than Production:

| Restriction                 | Purpose         |
| --------------------------- | --------------- |
| No runtime secrets          | Isolation       |
| No external vault access    | Security        |
| No unsafe sinks             | Leak prevention |
| No raw secret serialization | Audit safety    |

### validateSandboxConfig()

```ts
function validateSandboxConfig(
    config: EnvironmentConfig
): boolean {

    for (const value of Object.values(
        config.values
    )) {

        if (
            value.type === "secret"
        ) {
            return false;
        }
    }

    return true;
}
```

---

## Diagnostic Codes

### SPORE-CONFIG

| Code          | Meaning                   |
| ------------- | ------------------------- |
| SPORE-CONFIG-001 | Invalid config schema     |
| SPORE-CONFIG-002 | Missing environment value |
| SPORE-CONFIG-003 | Invalid environment mode  |

### SPORE-SECRET

| Code          | Meaning                         |
| ------------- | ------------------------------- |
| SPORE-SECRET-001 | Unsafe secret sink              |
| SPORE-SECRET-002 | Secret serialization prohibited |
| SPORE-SECRET-003 | Invalid secret reference        |
| SPORE-SECRET-004 | Secret exposure in report       |

---

## File Layout

```text
galerina-core-config/src/

  environment/
    EnvironmentMode.ts          (enum — 5 values including Sandbox)
    EnvironmentConfig.ts
    EnvironmentPolicy.ts
    defaultEnvironmentPolicy.ts

  secrets/
    SecretEnvironmentReference.ts
    SecretConfigSource.ts       (vault/kms/env/runtime)
    ProtectedSecret.ts          (interface not class)
    canSendSecretToSink.ts

  loaders/
    loadEnvironmentConfig.ts
    LoadEnvironmentConfigInput.ts

  reports/
    EnvironmentConfigReport.ts
    SecretReportValue.ts
    sanitizeValue.ts
    validateSandboxConfig.ts
```

---

## Planned v0.3 Features

| Feature                     | Purpose                     |
| --------------------------- | --------------------------- |
| Secret Rotation             | Runtime key rotation        |
| Distributed Config Sync     | Cluster consistency         |
| Encrypted Config Bundles    | Portable secure deployment  |
| Secret Capability Tokens    | Delegated secret access     |
| Policy DSL                  | Declarative secret policy   |
| Runtime Config Verification | Immutable config validation |
