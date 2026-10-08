// 2026-10-05 dir split (HOLD unlocked, owner may revisit): webhook/ and policy/ hold the moved code.
// Public exports and the old deep-import path must be unchanged, and the moved policy module must
// not take a runtime dependency on index.ts (type-only imports keep the graph acyclic).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const index = await import(new URL("dist/index.js", root));
const shim = await import(new URL("dist/webhook.js", root));
const webhook = await import(new URL("dist/webhook/webhook-verification.js", root));
const values = await import(new URL("dist/policy/network-policy-values.js", root));

test("index re-exports the moved webhook functions by identity", () => {
  for (const name of ["sha256Bytes", "hmacSha256", "validateWebhookConfig", "verifyWebhookHmac"]) {
    assert.equal(typeof webhook[name], "function", name);
    assert.equal(index[name], webhook[name], `index.${name}`);
    assert.equal(shim[name], webhook[name], `webhook.js shim ${name}`);
  }
});

test("old dist/webhook.js deep path exposes the same export names", () => {
  assert.deepEqual(Object.keys(shim).sort(), Object.keys(webhook).sort());
});

test("index re-exports the moved policy values by identity", () => {
  for (const name of ["DEFAULT_TLS_POLICY", "DEFAULT_NETWORK_PRIVACY_POLICY", "productionNetworkPolicy", "OPENAI_POLICY"]) {
    assert.ok(values[name], name);
    assert.equal(index[name], values[name], name);
  }
});

test("moved policy values keep the zero-trust posture and freeze", () => {
  const p = values.productionNetworkPolicy;
  assert.ok(Object.isFrozen(p));
  assert.equal(p.defaultEffect, "deny");
  assert.equal(p.tls.requireTls, true);
  assert.equal(p.tls.minVersion, "TLS1.3");
  assert.equal(p.tls.allowPlaintextFallback, false);
  assert.deepEqual([...p.egress.allowedSchemes], ["https"]);
  assert.ok(p.endpoints[0].hosts.includes("169.254.169.254"));
  assert.ok(Object.isFrozen(values.OPENAI_POLICY));
  assert.equal(values.OPENAI_POLICY.allowSecretsInPrompt, false);
  // defineNetworkPolicy still defaults to the moved values.
  const d = index.defineNetworkPolicy("t");
  assert.equal(d.tls, values.DEFAULT_TLS_POLICY);
  assert.equal(d.privacy, values.DEFAULT_NETWORK_PRIVACY_POLICY);
});

test("moved modules import index.ts for types only (no runtime cycle)", () => {
  for (const rel of ["src/policy/network-policy-values.ts", "src/webhook/webhook-verification.ts"]) {
    const src = readFileSync(new URL(rel, root), "utf8");
    const runtimeIndexImports = src.split(/\r?\n/).filter((l) => /^import\s+(?!type\b)/.test(l) && /index\.js/.test(l));
    assert.deepEqual(runtimeIndexImports, [], rel);
  }
  const emitted = readFileSync(new URL("dist/policy/network-policy-values.js", root), "utf8");
  assert.doesNotMatch(emitted, /index\.js/);
});
