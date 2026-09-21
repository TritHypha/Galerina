import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createNetworkReport,
  defineNetworkPolicy,
  selectNetworkBackend,
  validateNetworkPolicy,
  DEFAULT_TLS_POLICY,
  DEFAULT_NETWORK_PRIVACY_POLICY,
  OPENAI_POLICY,
  productionNetworkPolicy,
  guardOutboundUrl,
} from "../dist/index.js";

describe("galerina-core-network contracts", () => {
  it("defines deny-by-default TLS-first policy", () => {
    const policy = defineNetworkPolicy("default");

    assert.equal(policy.defaultEffect, "deny");
    assert.equal(policy.tls.requireTls, true);
    assert.equal(validateNetworkPolicy(policy).length, 0);
  });

  it("rejects plaintext HTTP, raw sockets and invalid ports", () => {
    const diagnostics = validateNetworkPolicy(
      defineNetworkPolicy("bad-network", {
        endpoints: [
          {
            direction: "outbound",
            protocol: "http",
            effect: "allow",
            hosts: ["api.example.com"],
          },
          {
            direction: "inbound",
            protocol: "rawSocket",
            effect: "allow",
            ports: [0],
          },
        ],
      }),
    );

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_NETWORK_PLAINTEXT_HTTP_ALLOWED",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "Galerina_NETWORK_RAW_SOCKET_DENIED",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "Galerina_NETWORK_PORT_INVALID",
      ),
      true,
    );
  });

  it("selects a safe network backend and reports fallback", () => {
    const selection = selectNetworkBackend(
      {
        prefer: ["dpdk", "ioUring", "buffered"],
        fallback: "buffered",
        requireSafeFallback: true,
      },
      [
        {
          backend: "dpdk",
          available: true,
          zeroCopy: true,
          requiresDedicatedCores: true,
          requiresElevatedPrivileges: true,
        },
        { backend: "ioUring", available: true, zeroCopy: false },
        { backend: "buffered", available: true, zeroCopy: false },
      ],
    );

    assert.equal(selection.selected, "ioUring");
    assert.equal(selection.fallback, true);
    assert.equal(selection.satisfied, true);
  });

  it("creates network reports with ports and hosts", () => {
    const report = createNetworkReport({
      policy: defineNetworkPolicy("api", {
        endpoints: [
          {
            direction: "inbound",
            protocol: "https",
            effect: "allow",
            ports: [443, 443],
          },
          {
            direction: "outbound",
            protocol: "https",
            effect: "allow",
            hosts: ["api.example.com"],
          },
        ],
      }),
    });

    assert.deepEqual(report.inboundPorts, [443]);
    assert.deepEqual(report.outboundHosts, ["api.example.com"]);
    assert.equal(report.plaintextAllowed, false);
    assert.equal(report.rawSocketsAllowed, false);
  });

  it("loads the secure API example as a valid network policy", async () => {
    const example = JSON.parse(
      await readFile(
        new URL("../examples/secure-api-network-policy.json", import.meta.url),
        "utf8",
      ),
    );
    const report = createNetworkReport({ policy: example, production: true });

    assert.equal(report.diagnostics.length, 0);
    assert.deepEqual(report.inboundPorts, [443]);
    assert.deepEqual(report.outboundHosts, ["payments.internal.example"]);
  });

  it("DEFAULT_TLS_POLICY requires TLS 1.3, cert and hostname verification", () => {
    assert.equal(DEFAULT_TLS_POLICY.requireTls, true);
    assert.equal(DEFAULT_TLS_POLICY.minVersion, "TLS1.3");
    assert.equal(DEFAULT_TLS_POLICY.verifyCertificates, true);
    assert.equal(DEFAULT_TLS_POLICY.verifyHostnames, true);
    assert.equal(DEFAULT_TLS_POLICY.allowPlaintextFallback, false);
    assert.equal(DEFAULT_TLS_POLICY.allowDowngrade, false);
  });

  it("DEFAULT_NETWORK_PRIVACY_POLICY redacts sensitive headers and blocks secrets in URLs", () => {
    assert.equal(DEFAULT_NETWORK_PRIVACY_POLICY.denyQueryStringSecrets, true);
    assert.equal(DEFAULT_NETWORK_PRIVACY_POLICY.redactSensitiveHeaders, true);
    assert.equal(DEFAULT_NETWORK_PRIVACY_POLICY.denySensitiveDataInUrls, true);
    assert.equal(DEFAULT_NETWORK_PRIVACY_POLICY.minimiseMetadata, true);
  });

  it("defines the documented fail-closed OpenAI provider policy", () => {
    assert.deepEqual(OPENAI_POLICY, {
      provider: "openai",
      allowedEndpoints: ["api.openai.com"],
      requireApiKeyCapability: "OpenAiApiKey",
      dataCategories: [],
      auditRequired: true,
      allowSecretsInPrompt: false,
      allowPii: false,
      allowedRegions: ["eu-west"],
      maxPromptBytes: 1024 * 1024,
      requireRedaction: true,
    });
  });

  it("defines a frozen production policy with runtime SSRF and port guards", () => {
    assert.equal(productionNetworkPolicy.name, "production");
    assert.equal(productionNetworkPolicy.defaultEffect, "deny");
    assert.deepEqual(
      productionNetworkPolicy.endpoints.find(
        (endpoint) => endpoint.direction === "outbound" && endpoint.effect === "deny",
      )?.hosts,
      [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.azure.internal",
      ],
    );
    assert.equal(validateNetworkPolicy(productionNetworkPolicy, { production: true }).length, 0);
    assert.equal(Object.isFrozen(productionNetworkPolicy), true);
    assert.equal(Object.isFrozen(productionNetworkPolicy.egress), true);

    assert.equal(guardOutboundUrl("https://api.example.com/", productionNetworkPolicy.egress).allowed, true);
    assert.equal(guardOutboundUrl("https://api.example.com:8443/", productionNetworkPolicy.egress).allowed, false);
    assert.equal(guardOutboundUrl("http://api.example.com/", productionNetworkPolicy.egress).allowed, false);
    assert.equal(guardOutboundUrl("https://127.0.0.1/", productionNetworkPolicy.egress).allowed, false);
    assert.equal(guardOutboundUrl("https://metadata.google.internal/", productionNetworkPolicy.egress).allowed, false);
  });

  it("publishes the canonical replay and idempotency contracts", async () => {
    const declarations = await readFile(
      new URL("../dist/index.d.ts", import.meta.url),
      "utf8",
    );

    assert.match(declarations, /export interface ReplayStore\s*\{/);
    assert.match(declarations, /has\(key: string\): Promise<boolean> \| boolean/);
    assert.match(declarations, /put\(key: string, ttlSeconds: number\): Promise<void> \| void/);
    assert.match(declarations, /export interface IdempotencyRecord\s*\{/);
    assert.match(declarations, /export type AtomicClaimResult = "claimed" \| "duplicate"/);
    assert.match(declarations, /export interface AtomicAdmissionStore\s*\{/);
    assert.match(declarations, /claim\(\s*scope: string,\s*key: string,\s*ttlSeconds: number/);
    assert.match(declarations, /export interface IdempotencyStore\s*\{/);
    assert.match(declarations, /get\(key: string\): Promise<IdempotencyRecord \| undefined>/);
    assert.match(declarations, /put\(record: IdempotencyRecord, ttlSeconds\?: number\)/);
  });

  it("rejects a policy with default-allow effect", () => {
    const policy = defineNetworkPolicy("bad-default", {
      defaultEffect: "allow",
    });
    const diagnostics = validateNetworkPolicy(policy);

    assert.ok(
      diagnostics.some((d) => d.code === "Galerina_NETWORK_DEFAULT_ALLOW"),
      "Expected Galerina_NETWORK_DEFAULT_ALLOW",
    );
    assert.ok(diagnostics.some((d) => d.severity === "error"));
  });

  it("rejects a policy with an empty name", () => {
    const policy = defineNetworkPolicy("  ");
    const diagnostics = validateNetworkPolicy(policy);

    assert.ok(
      diagnostics.some((d) => d.code === "Galerina_NETWORK_POLICY_NAME_REQUIRED"),
    );
  });

  it("warns when timeouts and backpressure are not required", () => {
    const policy = defineNetworkPolicy("relaxed", {
      requireTimeouts: false,
      requireBackpressure: false,
    });
    const diagnostics = validateNetworkPolicy(policy);

    assert.ok(diagnostics.some((d) => d.code === "Galerina_NETWORK_TIMEOUT_REQUIRED" && d.severity === "warning"));
    assert.ok(diagnostics.some((d) => d.code === "Galerina_NETWORK_BACKPRESSURE_REQUIRED" && d.severity === "warning"));
  });

  it("selectNetworkBackend returns unsatisfied when no backend is available and fallback is unsafe", () => {
    const selection = selectNetworkBackend(
      { prefer: ["dpdk"], fallback: "buffered", requireSafeFallback: true },
      [
        { backend: "dpdk", available: false, zeroCopy: true },
        { backend: "buffered", available: false, zeroCopy: false },
      ],
    );

    assert.equal(selection.fallback, true);
    assert.equal(selection.satisfied, false);
    assert.equal(selection.selected, "buffered");
  });

  it("createNetworkReport with backend selection includes it in the report", () => {
    const policy = defineNetworkPolicy("api");
    const backendSelection = selectNetworkBackend(
      { prefer: ["ioUring", "buffered"], fallback: "buffered", requireSafeFallback: true },
      [
        { backend: "ioUring", available: true, zeroCopy: false },
        { backend: "buffered", available: true, zeroCopy: false },
      ],
    );
    const report = createNetworkReport({ policy, backendSelection });

    assert.equal(report.backendSelection?.selected, "ioUring");
    assert.equal(report.backendSelection?.fallback, false);
  });
});
