import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OPENAI_POLICY, defineNetworkPolicy, productionNetworkPolicy, validateNetworkPolicy } from "../dist/index.js";

const errors = (p) => validateNetworkPolicy(p).filter((d) => d.severity === "error").map((d) => d.code);
const warnings = (p) => validateNetworkPolicy(p).filter((d) => d.severity === "warning").map((d) => d.code);
const openaiAllow = { direction: "outbound", protocol: "https", effect: "allow", hosts: ["api.openai.com"], ports: [443] };

describe("NetworkPolicy upgrade fields (optional; zero-trust defaults, owner may revisit)", () => {
  it("the frozen production policy is unchanged and still validates cleanly", () => {
    assert.ok(Object.isFrozen(productionNetworkPolicy));
    for (const key of ["default", "allowPlainHttp", "aiProviders", "requireRateLimits"]) assert.equal(key in productionNetworkPolicy, false, key);
    assert.deepEqual(errors(productionNetworkPolicy), []);
  });

  it("default is an alias that must be deny and match defaultEffect", () => {
    assert.deepEqual(errors(defineNetworkPolicy("a", { default: "deny" })), []);
    assert.ok(errors(defineNetworkPolicy("b", { default: "allow" })).includes("Galerina_NETWORK_DEFAULT_ALLOW"));
    assert.ok(errors(defineNetworkPolicy("c", { default: "allow", defaultEffect: "allow" })).includes("Galerina_NETWORK_DEFAULT_ALLOW"));
  });

  it("allowPlainHttp: true is refused; false or absent is fine", () => {
    assert.ok(errors(defineNetworkPolicy("p", { allowPlainHttp: true })).includes("Galerina_NETWORK_PLAINTEXT_HTTP_ALLOWED"));
    assert.deepEqual(errors(defineNetworkPolicy("p", { allowPlainHttp: false })), []);
  });

  it("aiProviders need audit, a capability, no secrets and declared https endpoints", () => {
    assert.deepEqual(errors(defineNetworkPolicy("ai", { endpoints: [openaiAllow], aiProviders: [OPENAI_POLICY] })), []);
    assert.deepEqual(errors(defineNetworkPolicy("ai", { aiProviders: [OPENAI_POLICY] })), ["Galerina_NETWORK_AI_PROVIDER_ENDPOINT_UNDECLARED"]);
    const wildcard = defineNetworkPolicy("ai", { endpoints: [{ ...openaiAllow, hosts: ["*"] }], aiProviders: [OPENAI_POLICY] });
    assert.deepEqual(errors(wildcard), ["Galerina_NETWORK_AI_PROVIDER_ENDPOINT_UNDECLARED"]);
    for (const bad of [{ auditRequired: false }, { allowSecretsInPrompt: true }, { requireApiKeyCapability: "" }, { allowedEndpoints: [] }, { allowedEndpoints: ["https://api.openai.com/v1"] }]) {
      assert.deepEqual(errors(defineNetworkPolicy("ai", { endpoints: [openaiAllow], aiProviders: [{ ...OPENAI_POLICY, ...bad }] })), ["Galerina_NETWORK_AI_PROVIDER_INVALID"], JSON.stringify(bad));
    }
    assert.deepEqual(errors(defineNetworkPolicy("ai", { endpoints: [openaiAllow], aiProviders: [OPENAI_POLICY, OPENAI_POLICY] })), ["Galerina_NETWORK_AI_PROVIDER_INVALID"]);
    assert.deepEqual(errors(defineNetworkPolicy("ai", { aiProviders: "openai" })), ["Galerina_NETWORK_AI_PROVIDER_INVALID"]);
  });

  it("requireRateLimits: absent means inbound allow rules want a rate limit; false warns", () => {
    const inbound = { direction: "inbound", protocol: "https", effect: "allow", ports: [443] };
    assert.ok(warnings(defineNetworkPolicy("in", { endpoints: [inbound] })).includes("Galerina_NETWORK_RATE_LIMIT_REQUIRED"));
    assert.ok(!warnings(defineNetworkPolicy("in", { endpoints: [inbound], rateLimits: [{ name: "per-ip", limit: "100/minute", scope: "ip" }] })).includes("Galerina_NETWORK_RATE_LIMIT_REQUIRED"));
    assert.ok(warnings(defineNetworkPolicy("off", { requireRateLimits: false })).includes("Galerina_NETWORK_RATE_LIMIT_REQUIRED"));
    assert.ok(!warnings(defineNetworkPolicy("none", {})).includes("Galerina_NETWORK_RATE_LIMIT_REQUIRED"));
  });
});
