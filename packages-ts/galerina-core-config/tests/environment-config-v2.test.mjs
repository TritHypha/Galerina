import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENVIRONMENT_CONFIG_SCHEMA,
  FUNGI_CONFIG_028,
  FUNGI_CONFIG_029,
  FUNGI_CONFIG_030,
  defaultEnvironmentPolicy,
  isSecretCategory,
  isSecretConfigSourceKind,
  loadEnvironmentConfig,
  resolveEnvironmentMode,
} from "../dist/index.js";

describe("EnvironmentConfigV2 — C15 freeze", () => {
  it("loads a v2 config with names only and redacted secrets", async () => {
    const { config, diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["GALERINA_APP_ENV"],
      secretNames: ["GALERINA_APP_SECRET"],
      availableEnvironment: {
        GALERINA_APP_ENV: "production",
        GALERINA_APP_SECRET: "super-secret-value",
      },
    });

    assert.deepEqual(diagnostics, []);
    assert.equal(config.schemaVersion, ENVIRONMENT_CONFIG_SCHEMA);
    assert.deepEqual(config.variables, ["GALERINA_APP_ENV"]);
    assert.equal(config.secrets.length, 1);
    assert.equal(config.secrets[0].name, "GALERINA_APP_SECRET");
    assert.equal(config.secrets[0].present, true);
    assert.equal(config.secrets[0].redacted, true);
    assert.equal(config.secrets[0].source.kind, "env");
    assert.equal(config.secrets[0].category, "generic");
    assert.equal(config.policy.secretReportMode, "redacted-only");
    assert.equal(JSON.stringify(config).includes("super-secret-value"), false);
  });

  it("uses FUNGI-CONFIG-028/029 for missing names, not mode-owned 001/002", async () => {
    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["GALERINA_APP_ENV"],
      secretNames: ["GALERINA_APP_SECRET"],
      availableEnvironment: { GALERINA_APP_SECRET: "super-secret-value" },
    });
    const codes = diagnostics.map((d) => d.code);
    assert.ok(codes.includes(FUNGI_CONFIG_028));
    assert.equal(codes.includes("FUNGI-CONFIG-001"), false);
    assert.equal(codes.includes("FUNGI-CONFIG-002"), false);
    assert.equal(
      diagnostics.some((d) => d.message.includes("super-secret-value")),
      false,
    );

    const missingSecret = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["GALERINA_APP_ENV"],
      secretNames: ["GALERINA_APP_SECRET"],
      availableEnvironment: { GALERINA_APP_ENV: "production" },
    });
    assert.ok(missingSecret.diagnostics.some((d) => d.code === FUNGI_CONFIG_029));
    assert.equal(
      missingSecret.diagnostics.some((d) => d.code === "FUNGI-CONFIG-002"),
      false,
    );
  });

  it("keeps resolveEnvironmentMode as the owner of FUNGI-CONFIG-001/002", () => {
    const invalid = resolveEnvironmentMode("preview");
    assert.equal(invalid.diagnostics[0]?.code, "FUNGI-CONFIG-001");
    const missing = resolveEnvironmentMode(undefined);
    assert.equal(missing.diagnostics[0]?.code, "FUNGI-CONFIG-002");
  });

  it("refuses a legacy schema version", async () => {
    const { diagnostics } = await loadEnvironmentConfig({
      schemaVersion: "galerina.config.environment.v1",
      mode: "test",
      variableNames: [],
      secretNames: [],
      availableEnvironment: {},
    });
    assert.ok(diagnostics.some((d) => d.code === FUNGI_CONFIG_030));
  });

  it("freezes hyphenated categories and env|vault|kms|runtime sources", () => {
    assert.equal(isSecretCategory("api-key"), true);
    assert.equal(isSecretCategory("api_key"), false);
    assert.equal(isSecretConfigSourceKind("env"), true);
    assert.equal(isSecretConfigSourceKind("file"), false);
    assert.equal(isSecretConfigSourceKind("secretStore"), false);
    assert.deepEqual(defaultEnvironmentPolicy("production").allowDotEnvFiles, false);
  });

  it("preserves missing diagnostic code and severity when a value overlaps messages", async () => {
    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["GALERINA_REQUIRED"],
      secretNames: ["GALERINA_SECRET"],
      availableEnvironment: { PUBLIC_HINT: "GALERINA" },
    });

    assert.deepEqual(
      diagnostics.map(({ code, severity }) => ({ code, severity })),
      [
        { code: FUNGI_CONFIG_028, severity: "error" },
        { code: FUNGI_CONFIG_029, severity: "error" },
      ],
    );
    assert.equal(diagnostics.every((diagnostic) => !diagnostic.message.includes("GALERINA")), true);
  });

  it("accepts only own data string values and does not invoke an accessor", async () => {
    const inherited = Object.create({ GALERINA_INHERITED: "from-prototype" });
    const inheritedResult = await loadEnvironmentConfig({
      mode: "production",
      variableNames: [],
      secretNames: ["GALERINA_INHERITED"],
      availableEnvironment: inherited,
    });

    let getterCalled = false;
    const accessor = {};
    Object.defineProperty(accessor, "GALERINA_GETTER", {
      enumerable: true,
      get() {
        getterCalled = true;
        return "from-getter";
      },
    });
    const accessorResult = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["GALERINA_GETTER"],
      secretNames: [],
      availableEnvironment: accessor,
    });

    assert.equal(inheritedResult.config.secrets[0]?.present, false);
    assert.equal(inheritedResult.diagnostics[0]?.code, FUNGI_CONFIG_029);
    assert.equal(inheritedResult.diagnostics[0]?.severity, "error");
    assert.equal(getterCalled, false);
    assert.equal(accessorResult.diagnostics[0]?.code, FUNGI_CONFIG_028);
    assert.equal(accessorResult.diagnostics[0]?.severity, "error");
  });

  it("refuses a proxy environment without invoking its get trap", async () => {
    let getTrapCalled = false;
    const proxied = new Proxy({}, {
      get() {
        getTrapCalled = true;
        throw new Error("environment get trap must not run");
      },
    });

    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: [],
      secretNames: ["GALERINA_PROXY_SECRET"],
      availableEnvironment: proxied,
    });

    assert.equal(getTrapCalled, false);
    assert.equal(diagnostics[0]?.code, FUNGI_CONFIG_029);
    assert.equal(diagnostics[0]?.severity, "error");
  });

  it("refuses proxy reflection traps before inspecting environment properties", async () => {
    let ownKeysTrapCalled = false;
    let descriptorTrapCalled = false;
    const proxied = new Proxy({ GALERINA_TRAPPED: "secret" }, {
      ownKeys() {
        ownKeysTrapCalled = true;
        throw new Error("ownKeys trap must not run");
      },
      getOwnPropertyDescriptor() {
        descriptorTrapCalled = true;
        throw new Error("descriptor trap must not run");
      },
    });

    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: [],
      secretNames: ["GALERINA_TRAPPED"],
      availableEnvironment: proxied,
    });

    assert.equal(ownKeysTrapCalled, false);
    assert.equal(descriptorTrapCalled, false);
    assert.equal(diagnostics[0]?.code, FUNGI_CONFIG_029);
    assert.equal(diagnostics[0]?.severity, "error");
  });

  it("refuses a revoked environment proxy as unavailable", async () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();

    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: [],
      secretNames: ["GALERINA_REVOKED"],
      availableEnvironment: revocable.proxy,
    });

    assert.equal(diagnostics[0]?.code, FUNGI_CONFIG_029);
    assert.equal(diagnostics[0]?.severity, "error");
  });

  it("redacts diagnostic message and path in one pass without rewriting the marker", async () => {
    const { diagnostics } = await loadEnvironmentConfig({
      mode: "production",
      variableNames: ["REDACTED"],
      secretNames: [],
      availableEnvironment: {
        PUBLIC_MARKER_TEXT: "REDACTED",
        PUBLIC_MARKER_PREFIX: "[",
      },
    });

    assert.equal(diagnostics[0]?.code, FUNGI_CONFIG_028);
    assert.equal(diagnostics[0]?.name, "REQUIRED_ENVIRONMENT_VARIABLE_MISSING");
    assert.equal(diagnostics[0]?.severity, "error");
    assert.equal(diagnostics[0]?.message, "Required environment variable \"[REDACTED]\" is missing.");
    assert.equal(diagnostics[0]?.path, "variables.[REDACTED]");
  });
});
