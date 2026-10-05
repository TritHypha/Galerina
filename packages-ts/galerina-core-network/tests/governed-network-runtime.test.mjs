import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_NETWORK_CODES,
  FUNGI_NETWORK_CODE_LIST,
  NETWORK_POLICY_REPORT_SCHEMA,
  NetworkAdmissionError,
  createNetworkPolicyReport,
  defineNetworkPolicy,
  productionNetworkPolicy,
  safeHttpRequest,
  validateAiPrompt,
  validateCapability,
  validateDestination,
  validateTlsRequirement,
  OPENAI_POLICY,
} from "../dist/index.js";

const C = FUNGI_NETWORK_CODES;
const codes = (ds) => [...new Set(ds.map((d) => d.code))].sort();
const policy = defineNetworkPolicy("api", {
  endpoints: [
    { direction: "outbound", protocol: "https", effect: "allow", hosts: ["api.example.com", "*"], ports: [443] },
    { direction: "outbound", protocol: "https", effect: "allow", hosts: ["blocked.example.com"] },
    { direction: "outbound", protocol: "https", effect: "deny", hosts: ["blocked.example.com"] },
    { direction: "outbound", protocol: "http", effect: "allow", hosts: ["plain.example.com"] },
    { direction: "outbound", protocol: "rawSocket", effect: "allow", hosts: ["raw.example.com"] },
  ],
});
const without = (o, k) => Object.fromEntries(Object.entries(o).filter(([key]) => key !== k));
const dest = (over = {}) => ({ name: "api", protocol: "https", host: "api.example.com", port: 443, tlsRequired: true, ...over });

describe("FUNGI-NETWORK diagnostic codes", () => {
  it("defines exactly 001..008", () => {
    assert.deepEqual([...FUNGI_NETWORK_CODE_LIST], ["001", "002", "003", "004", "005", "006", "007", "008"].map((n) => `FUNGI-NETWORK-${n}`));
    assert.ok(Object.isFrozen(FUNGI_NETWORK_CODES));
  });
});

describe("validateDestination (deny-by-default)", () => {
  it("admits only a declared outbound allow rule with matching protocol, host and port", () => {
    assert.deepEqual(validateDestination(dest(), policy), []);
    assert.deepEqual(validateDestination(dest({ host: "API.example.com." }), policy), []);
    assert.deepEqual(codes(validateDestination(dest({ host: "other.example.com" }), policy)), [C.UNDECLARED_DESTINATION]);
    assert.deepEqual(codes(validateDestination(dest({ port: 8443 }), policy)), [C.UNDECLARED_DESTINATION]);
    assert.deepEqual(codes(validateDestination(without(dest(), "port"), policy)), [C.UNDECLARED_DESTINATION]);
  });
  it("undeclared stays FUNGI-NETWORK-001 even under defaultEffect allow; '*' never matches", () => {
    const open = defineNetworkPolicy("open", { defaultEffect: "allow" });
    assert.deepEqual(codes(validateDestination(dest(), open)), [C.UNDECLARED_DESTINATION]);
    assert.deepEqual(codes(validateDestination(dest({ host: "anything.example.org" }), policy)), [C.UNDECLARED_DESTINATION]);
  });
  it("deny rules beat allow rules; SSRF targets and raw sockets refuse", () => {
    assert.deepEqual(codes(validateDestination(without(dest({ host: "blocked.example.com" }), "port"), policy)), [C.DESTINATION_NOT_ALLOWLISTED]);
    const ssrf = defineNetworkPolicy("ssrf", { endpoints: [{ direction: "outbound", protocol: "https", effect: "allow", hosts: ["169.254.169.254", "10.0.0.5"] }] });
    for (const host of ["169.254.169.254", "10.0.0.5"]) assert.deepEqual(codes(validateDestination(without(dest({ host }), "port"), ssrf)), [C.DESTINATION_NOT_ALLOWLISTED], host);
    assert.ok(codes(validateDestination(without(dest({ protocol: "rawSocket", host: "raw.example.com" }), "port"), policy)).includes(C.RAW_SOCKET_DENIED));
  });
  it("malformed destinations and policies refuse", () => {
    for (const bad of [{}, dest({ name: "" }), dest({ protocol: "quic" }), dest({ host: "a b" }), dest({ host: "user@api.example.com" }), dest({ port: 0 }), dest({ port: 1.5 }), dest({ tlsRequired: "yes" })]) {
      assert.deepEqual(codes(validateDestination(bad, policy)), [C.UNDECLARED_DESTINATION]);
    }
    assert.deepEqual(codes(validateDestination(dest(), {})), [C.RUNTIME_POLICY_UNAVAILABLE]);
  });
  it("production policy admits nothing undeclared", () => {
    assert.deepEqual(codes(validateDestination(dest(), productionNetworkPolicy)), [C.UNDECLARED_DESTINATION]);
  });
});

describe("validateTlsRequirement", () => {
  it("TLS policy admits only https/tls with tlsRequired", () => {
    assert.deepEqual(validateTlsRequirement(dest(), policy), []);
    assert.deepEqual(validateTlsRequirement(dest({ protocol: "tls" }), policy), []);
    for (const protocol of ["http", "tcp", "udp", "websocket", "rawSocket"]) assert.deepEqual(codes(validateTlsRequirement(dest({ protocol }), policy)), [C.INSECURE_TRANSPORT], protocol);
    assert.deepEqual(codes(validateTlsRequirement(dest({ tlsRequired: false }), policy)), [C.INSECURE_TRANSPORT]);
  });
  it("a TLS-requiring destination refuses plaintext even under a plaintext policy", () => {
    const lax = defineNetworkPolicy("lax", { tls: { ...policy.tls, requireTls: false } });
    assert.deepEqual(validateTlsRequirement(dest({ protocol: "http", tlsRequired: false }), lax), []);
    assert.deepEqual(codes(validateTlsRequirement(dest({ protocol: "http", tlsRequired: true }), lax)), [C.INSECURE_TRANSPORT]);
    assert.deepEqual(codes(validateTlsRequirement(dest(), {})), [C.RUNTIME_POLICY_UNAVAILABLE]);
  });
});

describe("validateCapability", () => {
  it("denies unless explicitly granted", () => {
    assert.deepEqual(codes(validateCapability("NetworkHttps", policy)), [C.CAPABILITY_MISSING]);
    assert.deepEqual(validateCapability("NetworkHttps", policy, ["NetworkHttps"]), []);
    for (const bad of ["", "1abc", "a b", 7]) assert.deepEqual(codes(validateCapability(bad, policy, [bad])), [C.CAPABILITY_MISSING]);
  });
});

const makeRuntime = (over = {}) => {
  const calls = [];
  const runtime = {
    policy,
    validate: () => [],
    validateDestination: (d) => validateDestination(d, policy),
    validateTlsRequirement: (d) => validateTlsRequirement(d, policy),
    validateCapability: (c) => validateCapability(c, policy, ["NetworkHttps"]),
    request: async (input) => { calls.push(input); return { status: 200, headers: { "content-type": "application/json" }, body: "{}", destination: input.destination, receivedAt: "2026-10-05T00:00:00.000Z", durationMs: 3 }; },
    ...over,
  };
  return { runtime, calls };
};
const req = (over = {}) => ({ destination: dest(), method: "GET", path: "/v1/items", timeoutMs: 5000, capability: "NetworkHttps", ...over });
const refusedWith = async (promise, expected) => {
  await assert.rejects(promise, (err) => { assert.ok(err instanceof NetworkAdmissionError); for (const c of expected) assert.ok(codes(err.diagnostics).includes(c), c); return true; });
};

describe("safeHttpRequest", () => {
  it("delegates an admitted request exactly once", async () => {
    const { runtime, calls } = makeRuntime();
    const res = await safeHttpRequest(req(), runtime);
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
  });
  it("refuses before any I/O on destination, TLS, capability, shape and secret-flow failures", async () => {
    const cases = [
      [req({ destination: dest({ host: "evil.example.net" }) }), [C.UNDECLARED_DESTINATION]],
      [req({ destination: dest({ tlsRequired: false }) }), [C.INSECURE_TRANSPORT]],
      [req({ capability: "Other" }), [C.CAPABILITY_MISSING]],
      [req({ method: "TRACE" }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ path: "//evil.example.net/x" }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ path: "/x\r\nHost: evil" }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ path: "/x?api_key=abc" }), [C.SECRET_FLOW]],
      [req({ timeoutMs: 0 }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ timeoutMs: 120001 }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ timeoutMs: Number.POSITIVE_INFINITY }), [C.RUNTIME_POLICY_UNAVAILABLE]],
      [req({ headers: { "x-ok": "a\r\nb" } }), [C.RUNTIME_POLICY_UNAVAILABLE]],
    ];
    for (const [input, expected] of cases) {
      const { runtime, calls } = makeRuntime();
      await refusedWith(safeHttpRequest(input, runtime), expected);
      assert.equal(calls.length, 0, JSON.stringify(input.path));
    }
  });
  it("a permissive runtime cannot override the package checks; a stricter one can refuse more", async () => {
    const lax = makeRuntime({ validateDestination: () => [], validateTlsRequirement: () => [], validate: () => [] });
    await refusedWith(safeHttpRequest(req({ destination: dest({ host: "evil.example.net" }) }), lax.runtime), [C.UNDECLARED_DESTINATION]);
    assert.equal(lax.calls.length, 0);
    const strict = makeRuntime({ validate: () => [{ code: C.DESTINATION_NOT_ALLOWLISTED, severity: "error", message: "no" }] });
    await refusedWith(safeHttpRequest(req(), strict.runtime), [C.DESTINATION_NOT_ALLOWLISTED]);
    const throwing = makeRuntime({ validateCapability: () => { throw new Error("boom"); } });
    await refusedWith(safeHttpRequest(req(), throwing.runtime), [C.RUNTIME_POLICY_UNAVAILABLE]);
  });
  it("refuses an unusable runtime and a malformed or redirected response", async () => {
    await refusedWith(safeHttpRequest(req(), {}), [C.RUNTIME_POLICY_UNAVAILABLE]);
    await refusedWith(safeHttpRequest(req(), makeRuntime({ request: "not-a-function" }).runtime), [C.RUNTIME_POLICY_UNAVAILABLE]);
    for (const response of [{ status: 99, headers: {} }, { status: 200.5 }, "ok"]) {
      const { runtime } = makeRuntime({ request: async (i) => (typeof response === "string" ? response : { ...response, destination: i.destination, receivedAt: "t", durationMs: 1, body: "" }) });
      await refusedWith(safeHttpRequest(req(), runtime), [C.RUNTIME_POLICY_UNAVAILABLE]);
    }
    const redirected = makeRuntime({ request: async () => ({ status: 200, headers: {}, body: "", destination: dest({ host: "other.example.com" }), receivedAt: "t", durationMs: 1 }) });
    await refusedWith(safeHttpRequest(req(), redirected.runtime), [C.RUNTIME_POLICY_UNAVAILABLE]);
  });
});

describe("validateAiPrompt", () => {
  it("passes plain text and refuses size, secret and PII breaches", () => {
    assert.deepEqual(validateAiPrompt("Summarise the release notes.", OPENAI_POLICY), []);
    assert.deepEqual(codes(validateAiPrompt("x".repeat(OPENAI_POLICY.maxPromptBytes + 1), OPENAI_POLICY)), [C.AI_PROVIDER_NOT_APPROVED]);
    for (const p of ["use key sk-abcdefghijklmnopqrstuv", "AKIAABCDEFGHIJKLMNOP", "-----BEGIN RSA PRIVATE KEY-----"]) assert.deepEqual(codes(validateAiPrompt(p, OPENAI_POLICY)), [C.SECRET_FLOW], p); // gitleaks:allow (fake secret-shaped fixtures)
    for (const p of ["mail alice@example.com", "call +44 20 7946 0958"]) assert.deepEqual(codes(validateAiPrompt(p, OPENAI_POLICY)), [C.SECRET_FLOW], p);
    assert.deepEqual(validateAiPrompt("mail alice@example.com", { ...OPENAI_POLICY, allowPii: true }), []);
    assert.deepEqual(codes(validateAiPrompt(42, OPENAI_POLICY)), [C.AI_PROVIDER_NOT_APPROVED]);
    assert.deepEqual(codes(validateAiPrompt("hi", {})), [C.AI_PROVIDER_NOT_APPROVED]);
    // Linear-time scans: worst-case near-cap inputs with no match finish quickly (ReDoS regression).
    for (const hostile of ["a".repeat(1024 * 1024 - 1) + "@", "a@".repeat(400000), "a@a.".repeat(250000), "1(".repeat(400000), "eyJ" + "a".repeat(900000)]) {
      const started = Date.now();
      validateAiPrompt(hostile, OPENAI_POLICY);
      assert.ok(Date.now() - started < 2000, `slow on ${hostile.slice(0, 6)}`);
    }
    const noCap = without(OPENAI_POLICY, "maxPromptBytes");
    assert.deepEqual(codes(validateAiPrompt("x".repeat(1024 * 1024 + 1), noCap)), [C.AI_PROVIDER_NOT_APPROVED]);
  });
});

describe("createNetworkPolicyReport", () => {
  it("splits validated and denied destinations and never carries webhook secrets", () => {
    const secret = "s".repeat(40);
    const report = createNetworkPolicyReport({
      policy,
      generatedAt: "2026-10-05T00:00:00.000Z",
      destinations: [dest(), dest({ name: "evil", host: "evil.example.net" })],
      webhookPolicies: [{ secret, algorithm: "sha256", headerName: "x-sig", maxAgeSeconds: 300 }],
    });
    assert.equal(report.schemaVersion, NETWORK_POLICY_REPORT_SCHEMA);
    assert.equal(report.schemaVersion, "galerina.network.report.v1");
    assert.deepEqual(report.validatedDestinations.map((d) => d.name), ["api"]);
    assert.deepEqual([...report.deniedDestinations], ["evil"]);
    assert.deepEqual(codes(report.diagnostics), [C.UNDECLARED_DESTINATION]);
    assert.ok(report.diagnostics.every((d) => d.path.startsWith("destinations.1")));
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.ok(Object.isFrozen(report));
  });
});
