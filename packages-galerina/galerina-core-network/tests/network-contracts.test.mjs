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
