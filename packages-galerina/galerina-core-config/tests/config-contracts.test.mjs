import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defineEnvironmentVariableReference,
  loadConfigFromObjects,
  parseEnvironmentConfig,
  validateHostPackageManifestBoundary,
  GALERINA_ENVIRONMENT_MODES,
  isEnvironmentMode,
  defaultEnvironmentPolicy,
  getVaultEntry,
  SPORE_VAULT_001,
  SPORE_VAULT_002,
  SPORE_VAULT_003,
  SPORE_VAULT_004,
  SPORE_VAULT_005,
  vaultDiagnosticSecretInVault,
  vaultDiagnosticKeyInvalid,
  vaultDiagnosticTypeMismatch,
  vaultDiagnosticKeyMissing,
  vaultDiagnosticMutationDenied,
} from "../dist/index.js";

describe("galerina-core-config contracts", () => {
  it("loads a runtime handoff from project and environment objects", () => {
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
        variables: ["GALERINA_APP_ENV"],
        secrets: [{ name: "GALERINA_APP_SECRET", required: true }],
      },
      availableEnvironment: {
        GALERINA_APP_ENV: "production",
        GALERINA_APP_SECRET: "set",
      },
      generatedAt: "2026-05-08T00:00:00.000Z",
    });

    assert.equal(result.runtime?.canRun, true);
    assert.equal(result.runtime?.environment.mode, "production");
    assert.deepEqual(result.diagnostics, []);
  });

  it("reports missing production secrets without exposing values", () => {
    const result = loadConfigFromObjects({
      project: {
        name: "galerina-app",
        version: "0.1.0",
        root: ".",
        entryFiles: [],
        packages: [],
        strict: true,
        targets: [],
      },
      environment: {
        mode: "production",
        secrets: ["GALERINA_APP_SECRET"],
      },
      availableEnvironment: {},
    });

    assert.equal(result.runtime?.canRun, false);
    assert.equal(
      result.diagnostics[0]?.code,
      "SPORE-CONFIG-004",
    );
    assert.match(result.diagnostics[0]?.message ?? "", /GALERINA_APP_SECRET/);
    assert.doesNotMatch(result.diagnostics[0]?.message ?? "", /undefined|null|set/);
  });

  it("requires environment validation before production runtime handoff", () => {
    const result = loadConfigFromObjects({
      project: {
        name: "galerina-app",
        version: "0.1.0",
        root: ".",
        entryFiles: [],
        packages: [],
        strict: true,
        targets: [],
      },
      environment: {
        mode: "production",
      },
    });

    assert.equal(result.runtime?.canRun, false);
    assert.equal(
      result.diagnostics[0]?.code,
      "SPORE-CONFIG-005",
    );
  });

  it("disables benchmark packages by default in production", () => {
    const result = loadConfigFromObjects({
      project: {
        name: "galerina-app",
        version: "0.1.0",
        root: ".",
        entryFiles: [],
        packages: [
          "packages-galerina/galerina-core",
          "packages-galerina/galerina-tools-benchmark",
        ],
        strict: true,
        targets: [],
      },
      environment: {
        mode: "production",
      },
      availableEnvironment: {},
    });

    assert.equal(result.runtime?.canRun, false);
    assert.equal(
      result.diagnostics.at(-1)?.code,
      "SPORE-CONFIG-012",
    );
  });

  it("allows explicit reported production package overrides", () => {
    const result = loadConfigFromObjects({
      project: {
        name: "galerina-app",
        version: "0.1.0",
        root: ".",
        entryFiles: [],
        packages: [
          "packages-galerina/galerina-core",
          "packages-galerina/galerina-tools-benchmark",
        ],
        production: {
          packageOverrides: [
            {
              path: "packages-galerina/galerina-tools-benchmark",
              reason: "One-off production hardware validation before launch.",
              expires: "2026-06-01",
            },
          ],
        },
        strict: true,
        targets: [],
      },
      environment: {
        mode: "production",
      },
      availableEnvironment: {},
    });

    assert.equal(result.runtime?.canRun, true);
    assert.equal(
      result.runtime?.activeProductionPackageOverrides[0]?.path,
      "packages-galerina/galerina-tools-benchmark",
    );
    assert.deepEqual(result.diagnostics, []);
  });

  it("can forbid production package overrides by policy", () => {
    const result = loadConfigFromObjects({
      project: {
        name: "galerina-app",
        version: "0.1.0",
        root: ".",
        entryFiles: [],
        packages: ["packages-galerina/galerina-tools-benchmark"],
        production: {
          packageOverrides: [
            {
              path: "packages-galerina/galerina-tools-benchmark",
              reason: "Temporary validation.",
            },
          ],
        },
        strict: true,
        targets: [],
      },
      environment: {
        mode: "production",
      },
      availableEnvironment: {},
      productionPolicy: {
        allowProductionPackageOverrides: false,
      },
    });

    assert.equal(result.runtime?.canRun, false);
    assert.equal(
      result.diagnostics.at(-1)?.code,
      "SPORE-CONFIG-013",
    );
  });

  it("normalises safe environment variable references", () => {
    const reference = defineEnvironmentVariableReference("GALERINA_CACHE_TTL", {
      required: false,
      scope: "runtime",
      defaultValue: "60",
    });
    const result = parseEnvironmentConfig({
      mode: "development",
      variables: [reference],
    });

    assert.equal(result.environment?.variables[0]?.kind, "env");
    assert.equal(result.environment?.variables[0]?.secret, false);
    assert.equal(result.diagnostics.length, 0);
  });

  it("keeps Galerina package graph fields out of host package manifests", () => {
    const diagnostics = validateHostPackageManifestBoundary({
      name: "galerina-host-app",
      version: "0.1.0",
      loPackages: ["packages-galerina/galerina-core"],
      dependencies: {
        "galerina-package-graph": "1.0.0",
      },
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "SPORE-CONFIG-007",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "SPORE-CONFIG-009",
      ),
      true,
    );
  });

  it("allows package.json to remain a host tooling manifest", () => {
    const diagnostics = validateHostPackageManifestBoundary({
      name: "galerina-host-app",
      version: "0.1.0",
      scripts: {
        test: "node --test",
      },
      devDependencies: {
        typescript: "^5.5.0",
      },
    });

    assert.deepEqual(diagnostics, []);
  });

  it("GALERINA_ENVIRONMENT_MODES contains exactly four canonical modes", () => {
    assert.deepEqual([...GALERINA_ENVIRONMENT_MODES], ["development", "test", "staging", "production"]);
  });

  it("isEnvironmentMode validates membership correctly", () => {
    assert.equal(isEnvironmentMode("production"), true);
    assert.equal(isEnvironmentMode("development"), true);
    assert.equal(isEnvironmentMode("local"), false);
    assert.equal(isEnvironmentMode("prod"), false);
  });

  it("defaultEnvironmentPolicy is maximally strict in production and staging", () => {
    const prod = defaultEnvironmentPolicy("production");
    assert.equal(prod.allowDotEnvFiles, false);
    assert.equal(prod.allowUnsafeOverrides, false);
    assert.equal(prod.allowSecretValuesInReports, false);

    const staging = defaultEnvironmentPolicy("staging");
    assert.equal(staging.allowDotEnvFiles, false);
    assert.equal(staging.allowUnsafeOverrides, false);
  });

  it("defaultEnvironmentPolicy allows .env files in development only", () => {
    const dev = defaultEnvironmentPolicy("development");
    assert.equal(dev.allowDotEnvFiles, true);
    assert.equal(dev.allowUnsafeOverrides, true);

    const test = defaultEnvironmentPolicy("test");
    assert.equal(test.allowDotEnvFiles, true);
    assert.equal(test.allowUnsafeOverrides, false);
  });

  it("getVaultEntry retrieves typed values from a vault schema", () => {
    const vault = {
      "app.name":       { key: "app.name",       value: "Galerina Demo", type: "string"  },
      "limits.maxMb":   { key: "limits.maxMb",   value: 64,            type: "number"  },
      "flags.enabled":  { key: "flags.enabled",  value: true,          type: "boolean" },
    };

    assert.equal(getVaultEntry(vault, "app.name"), "Galerina Demo");
    assert.equal(getVaultEntry(vault, "limits.maxMb"), 64);
    assert.equal(getVaultEntry(vault, "flags.enabled"), true);
    assert.equal(getVaultEntry(vault, "missing.key"), undefined);
  });

  it("vault diagnostic codes are correctly formatted SPORE-VAULT codes", () => {
    assert.equal(SPORE_VAULT_001, "SPORE-VAULT-001");
    assert.equal(SPORE_VAULT_002, "SPORE-VAULT-002");
    assert.equal(SPORE_VAULT_003, "SPORE-VAULT-003");
    assert.equal(SPORE_VAULT_004, "SPORE-VAULT-004");
    assert.equal(SPORE_VAULT_005, "SPORE-VAULT-005");
  });

  it("vault diagnostic constructors produce correct codes and error severity", () => {
    assert.equal(vaultDiagnosticSecretInVault("auth.apiKey").code, SPORE_VAULT_001);
    assert.equal(vaultDiagnosticKeyInvalid("INVALID_KEY").code, SPORE_VAULT_002);
    assert.equal(vaultDiagnosticTypeMismatch("app.timeout", "number", "string").code, SPORE_VAULT_003);
    assert.equal(vaultDiagnosticKeyMissing("app.region").code, SPORE_VAULT_004);
    assert.equal(vaultDiagnosticMutationDenied("app.name").code, SPORE_VAULT_005);

    const allDiags = [
      vaultDiagnosticSecretInVault("k"),
      vaultDiagnosticKeyInvalid("k"),
      vaultDiagnosticTypeMismatch("k", "number", "string"),
      vaultDiagnosticKeyMissing("k"),
      vaultDiagnosticMutationDenied("k"),
    ];
    assert.ok(allDiags.every((d) => d.severity === "error"));
  });

  it("vaultDiagnosticSecretInVault includes the key in message and path", () => {
    const d = vaultDiagnosticSecretInVault("auth.apiKey");
    assert.match(d.message, /auth\.apiKey/);
    assert.equal(d.path, "auth.apiKey");
  });
});
