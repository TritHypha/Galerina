import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_NETWORK_CODES,
  NetworkAdmissionError,
  createNetworkReport,
  defineNetworkPolicy,
  safeHttpRequest,
  validateDestination,
  validateNetworkPolicy,
  validateTlsRequirement,
} from "../dist/index.js";

const C = FUNGI_NETWORK_CODES;
const codes = (ds) => [...new Set(ds.map((d) => d.code))].sort();
const quicAllow = { direction: "outbound", protocol: "quic", effect: "allow", hosts: ["h3.example.com"], ports: [443] };
const policy = defineNetworkPolicy("quic", { endpoints: [quicAllow] });
const lax = defineNetworkPolicy("lax", { endpoints: [quicAllow], tls: { ...policy.tls, requireTls: false } });
const dest = (over = {}) => ({ name: "h3", protocol: "quic", host: "h3.example.com", port: 443, tlsRequired: true, ...over });

describe("quic: declared but not admitted (zero-trust default, owner may revisit)", () => {
  it("is a known protocol: a declared QUIC destination is not 'malformed'", () => {
    assert.deepEqual(validateDestination(dest(), policy), []);
    assert.deepEqual(codes(validateDestination(dest({ host: "other.example.com" }), policy)), [C.UNDECLARED_DESTINATION]);
  });

  it("an https allow rule does not admit quic to the same host (exact protocol match)", () => {
    const https = defineNetworkPolicy("https", { endpoints: [{ ...quicAllow, protocol: "https" }] });
    assert.deepEqual(codes(validateDestination(dest(), https)), [C.UNDECLARED_DESTINATION]);
  });

  it("validateNetworkPolicy refuses a QUIC allow rule; a QUIC deny rule is fine", () => {
    const allowCodes = validateNetworkPolicy(policy).filter((d) => d.severity === "error").map((d) => d.code);
    assert.ok(allowCodes.includes("Galerina_NETWORK_QUIC_NOT_ADMITTED"));
    const deny = defineNetworkPolicy("deny", { endpoints: [{ ...quicAllow, effect: "deny" }] });
    assert.ok(!validateNetworkPolicy(deny).some((d) => d.code === "Galerina_NETWORK_QUIC_NOT_ADMITTED"));
    const diag = validateNetworkPolicy(policy).find((d) => d.code === "Galerina_NETWORK_QUIC_NOT_ADMITTED");
    assert.equal(diag.path, "endpoints.0.protocol");
    assert.ok(!diag.message.includes("h3.example.com"));
  });

  it("validateTlsRequirement refuses QUIC under a TLS policy and under a plaintext-tolerant policy", () => {
    for (const p of [policy, lax]) {
      for (const tlsRequired of [true, false]) {
        assert.deepEqual(codes(validateTlsRequirement(dest({ tlsRequired }), p)), [C.INSECURE_TRANSPORT]);
      }
    }
  });

  it("safeHttpRequest refuses QUIC before any I/O", async () => {
    let called = false;
    const runtime = {
      policy: lax,
      validate: () => [], validateDestination: () => [], validateTlsRequirement: () => [], validateCapability: () => [],
      request: async () => { called = true; return {}; },
    };
    const input = { destination: dest({ tlsRequired: false }), method: "GET", path: "/", timeoutMs: 1000, capability: "net.h3" };
    await assert.rejects(safeHttpRequest(input, runtime, ["net.h3"]), (err) => {
      assert.ok(err instanceof NetworkAdmissionError);
      assert.ok(err.diagnostics.some((d) => d.code === C.INSECURE_TRANSPORT && d.path === "destination.protocol"));
      return true;
    });
    assert.equal(called, false);
  });

  it("the network report surfaces the refusal as an error diagnostic", () => {
    const report = createNetworkReport({ policy });
    assert.ok(report.diagnostics.some((d) => d.code === "Galerina_NETWORK_QUIC_NOT_ADMITTED" && d.severity === "error"));
    assert.equal(report.plaintextAllowed, false);
  });
});
