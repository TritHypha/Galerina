// rd0236-runtime-hardening.test.mjs — RED-bench regression tests for the RD-0236 runtime
// governance fail-opens fixed in tower-citizen: #1 forgeable capability mask, #2 null-policy ⇒
// unattested bridges trusted, #3 checkTransition unknown-requirement fall-through, #4 silent
// host-native fallback, #5 unlisted model admitted by absence of an allow-list, #10 tower-runtime.load
// unverified metadata. Each fails on the pre-fix code and passes after. #2/#4/#5 additionally assert
// the audited opt-in flag re-enables the permissive path (no over-blocking) — owner decision 2026-07-02.
// See ../ZTF-Knowledge-Bases/galerina-rd-0236-runtime-50yr-mistake-audit.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HybridInferenceEngine, TowerRuntime, GovernanceEnforcer, TPL_DEFAULT_POLICY, createHybridEngine,
  signCapabilityGrant, generateAttestationKeypair, attestBridge, StubTernaryBridge, AuditLogger,
} from "../dist/index.js";

// ── #1 — the capability mask is a real #private field; a runtime field-write cannot forge it ──
test("RD-0236 #1: forging grantedCapabilityMask via a field write does NOT grant authority", async () => {
  // Construct an engine that does NOT hold the ai.inference capability bit (mask = 0).
  const engine = new HybridInferenceEngine(
    { airGapped: true, governanceTier: 1 }, undefined, undefined, undefined, false, null, 0,
  );
  // The exact exploit RD-0236 reproduced: overwrite the "readonly" field at runtime.
  try { engine.grantedCapabilityMask = 0xffffffff; } catch { /* frozen ⇒ even stronger */ }
  const receipt = await engine.infer({ prompt: "x", correlationId: "RD0236-CAP", maxNewTokens: 10 });
  // Pre-fix (private readonly erased at runtime): the forge set the field ⇒ capability held ⇒ NOT denied.
  // Post-fix (#private): the gate reads the untamperable private mask (0) ⇒ still denied.
  assert.equal(receipt.trapFired, true, "capability gate must still deny — the forge is ineffective");
  assert.equal(receipt.trapCode, "ERR_CAPABILITY_DENIED", "the #private mask (0) is read, not the forged public field");
});

// ── #3 — an unknown requirement string is rejected (was silently satisfied) ──
test("RD-0236 #3: a transition policy naming an UNKNOWN requirement is rejected at load (fail-closed)", () => {
  assert.throws(
    () => new GovernanceEnforcer({
      version: "test",
      restrictedTransitions: [{ from: 0, to: 1, requires: ["totally_unknown_requirement"] }],
      defaultAction: -1,
    }),
    /FUNGI-GOV-TPL-001/,
    "a policy that names an unverifiable requirement must be refused at load",
  );
  // A policy with only KNOWN requirements constructs fine (no over-rejection).
  assert.doesNotThrow(() => new GovernanceEnforcer(TPL_DEFAULT_POLICY));
});

// ── #10 — load refuses metadata with an unverifiable artifact identity ──
test("RD-0236 #10: TowerRuntime.load refuses metadata with an unverifiable artifactHash", async () => {
  const rt = new TowerRuntime({ auditInMemory: true });
  const bad = { engineId: "e", artifactPath: "p", artifactHash: "not-a-hash", governanceTier: 1, license: "Apache-2.0", maxMemoryMB: 1, capabilityMask: 0 };
  await assert.rejects(() => rt.load(bad), /FUNGI-ASSIMILATE-003/, "unverifiable artifactHash must be refused (fail-closed)");
  // A well-formed sha256: identity loads normally (no over-rejection).
  const ok = await rt.load({ ...bad, artifactHash: "sha256:abc123" });
  assert.ok(ok.sandbox, "valid metadata loads");
});

// ── #2 — a null attestation policy no longer trusts unattested bridges (fail-secure INVERSION) ──
test("RD-0236 #2: with NO attestation policy, a registry carrying ≥1 bridge is DENIED by default", async () => {
  // Pre-fix: attestationPolicy === null short-circuited checkBridgeAttestation to "all attested", so
  // the default stub registry (2 cryptographically-unverifiable bridges) ran with zero proof.
  // Post-fix: a null policy + ≥1 bridge traps ERR_BRIDGE_UNATTESTED unless the deployment opts in.
  // (allowUnsignedCapabilityGrant opts past the #1 capability gate, which now fires FIRST, so this
  // isolates the #2 bridge-attestation gate under test.)
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnsignedCapabilityGrant: true } });
  const denied = await eng.infer({ prompt: "x", correlationId: "RD0236-2-deny", opClasses: ["feedforward"] });
  assert.equal(denied.trapFired, true, "an unverifiable bridge must not run without an attestation policy");
  assert.equal(denied.trapCode, "ERR_BRIDGE_UNATTESTED");

  // The audited opt-in (dev/simulator use) restores the permissive path — no over-blocking.
  const optedIn = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnattestedBridges: true, allowUnsignedCapabilityGrant: true } });
  const ok = await optedIn.infer({ prompt: "x", correlationId: "RD0236-2-optin", opClasses: ["feedforward"] });
  assert.equal(ok.trapFired, false, "the explicit allowUnattestedBridges opt-in re-admits the registry");
});

// ── #4 — a routed precision with no bridge is DENIED, not silently run host-native (fail-secure INVERSION) ──
test("RD-0236 #4: a routed precision with no bridge is DENIED by default (no silent host-native)", async () => {
  // The default transformer plan routes some ops to a precision with no registered bridge. Pre-fix
  // those silently ran host-native (an uncontrolled state change) unless denyHostNativeFallback was set;
  // post-fix the deny is the DEFAULT. (allowUnattestedBridges opts past the unrelated #2 gate to isolate #4.)
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnattestedBridges: true, allowUnsignedCapabilityGrant: true } });
  const denied = await eng.infer({ prompt: "x", correlationId: "RD0236-4-deny" });
  assert.equal(denied.trapFired, true, "a no-bridge precision must not silently run host-native");
  assert.equal(denied.trapCode, "ERR_HOST_NATIVE_DENIED");

  const optedIn = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnattestedBridges: true, allowHostNativeFallback: true, allowUnsignedCapabilityGrant: true } });
  const ok = await optedIn.infer({ prompt: "x", correlationId: "RD0236-4-optin" });
  assert.equal(ok.trapFired, false, "the explicit allowHostNativeFallback opt-in restores the fallback");
});

// ── #5 — a named model with NO ai{} allow-list is DENIED, not admitted by absence (fail-secure INVERSION) ──
test("RD-0236 #5: a request naming a model with NO ai{} allow-list is DENIED by default", async () => {
  // Pre-fix: absence of an approvedModels allow-list meant "no model gate", so a request could name ANY
  // model and run. Post-fix: naming a model with no allow-list traps ERR_AI_MODEL_NOT_APPROVED unless the
  // deployment opts in. The two engines below differ by EXACTLY allowUnlistedModels — the flag under test.
  // (Bridges + host-native are opted in on both so the model gate, which fires first, is the only variable.)
  const eng = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnattestedBridges: true, allowHostNativeFallback: true, allowUnsignedCapabilityGrant: true } });
  const denied = await eng.infer({ prompt: "x", correlationId: "RD0236-5-deny", model: "unlisted_model_x" });
  assert.equal(denied.trapFired, true, "an unlisted model must not be admitted by mere absence of an allow-list");
  assert.equal(denied.trapCode, "ERR_AI_MODEL_NOT_APPROVED");

  const optedIn = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { allowUnattestedBridges: true, allowHostNativeFallback: true, allowUnlistedModels: true, allowUnsignedCapabilityGrant: true } });
  const ok = await optedIn.infer({ prompt: "x", correlationId: "RD0236-5-optin", model: "unlisted_model_x" });
  assert.equal(ok.trapFired, false, "the explicit allowUnlistedModels opt-in admits the unlisted model");
});

// ── #1 follow-on — capability authority is bound to a SIGNED grant (fail-secure INVERSION) ──
test("RD-0236 #1 (follow-on): capability authority requires a SIGNED grant — deny-by-default", async () => {
  // Pre-follow-on: the #private field stopped a runtime FORGE, but the plain constructor mask was still
  // trusted — a caller could construct with any mask and self-grant authority. Post: authority is 0 unless
  // a `signedCapabilityGrant` cryptographically verifies against the attestation policy for THIS engine's id
  // (or the audited allowUnsignedCapabilityGrant opt-in trusts the plain mask). The capability gate runs
  // FIRST, so the deny cases below trap ERR_CAPABILITY_DENIED regardless of bridge/host-native state.
  const ENGINE_ID = "galerina-hybrid-uhie-v1"; // HYBRID_METADATA.engineId
  const AI_INFERENCE_CAP = 0b00100000;
  const { publicKeyPem, privateKeyPem } = generateAttestationKeypair();
  const policy = { requireSigned: true, publicKeyPem };
  const permissive = { allowUnattestedBridges: true, allowHostNativeFallback: true };

  // (a) DEFAULT: no signed grant, no opt-in ⇒ authority 0 ⇒ ERR_CAPABILITY_DENIED.
  const bare = createHybridEngine({ airGapped: true, governanceTier: 1, attestation: policy, governance: permissive });
  const d = await bare.infer({ prompt: "x", correlationId: "RD0236-1-deny", opClasses: ["feedforward"] });
  assert.equal(d.trapFired, true, "no signed grant + no opt-in ⇒ no authority");
  assert.equal(d.trapCode, "ERR_CAPABILITY_DENIED");

  // (b) a VALID signed grant for THIS engine ⇒ authority conferred ⇒ runs (bridges attested with the same key).
  const signedBridge = attestBridge(new StubTernaryBridge(new AuditLogger(null)), privateKeyPem);
  const attestedRegistry = new Map([[signedBridge.technique, signedBridge]]);
  const grant = signCapabilityGrant({ engineId: ENGINE_ID, capabilityMask: AI_INFERENCE_CAP }, privateKeyPem);
  const granted = createHybridEngine({
    airGapped: true, governanceTier: 1, attestation: policy, bridges: attestedRegistry,
    governance: { allowHostNativeFallback: true }, signedCapabilityGrant: grant,
  });
  const g = await granted.infer({ prompt: "x", correlationId: "RD0236-1-grant", opClasses: ["feedforward"] });
  assert.equal(g.trapFired, false, "a valid signed grant confers ai.inference authority");

  // (c) the audited opt-in restores the pre-#1 unsigned-mask behaviour.
  const optedIn = createHybridEngine({ airGapped: true, governanceTier: 1, governance: { ...permissive, allowUnsignedCapabilityGrant: true } });
  const o = await optedIn.infer({ prompt: "x", correlationId: "RD0236-1-optin", opClasses: ["feedforward"] });
  assert.equal(o.trapFired, false, "the explicit allowUnsignedCapabilityGrant opt-in trusts the plain mask");

  // (d) a FORGED grant (signed by the WRONG key) confers no authority ⇒ still denied.
  const other = generateAttestationKeypair();
  const forged = signCapabilityGrant({ engineId: ENGINE_ID, capabilityMask: AI_INFERENCE_CAP }, other.privateKeyPem);
  const forgedEng = createHybridEngine({ airGapped: true, governanceTier: 1, attestation: policy, governance: permissive, signedCapabilityGrant: forged });
  const f = await forgedEng.infer({ prompt: "x", correlationId: "RD0236-1-forged", opClasses: ["feedforward"] });
  assert.equal(f.trapCode, "ERR_CAPABILITY_DENIED", "a grant signed by the wrong key confers no authority");

  // (e) a grant minted for a DIFFERENT engineId is refused (no cross-engine replay).
  const wrongId = signCapabilityGrant({ engineId: "some-other-engine", capabilityMask: AI_INFERENCE_CAP }, privateKeyPem);
  const wrongIdEng = createHybridEngine({ airGapped: true, governanceTier: 1, attestation: policy, governance: permissive, signedCapabilityGrant: wrongId });
  const w = await wrongIdEng.infer({ prompt: "x", correlationId: "RD0236-1-wrongid", opClasses: ["feedforward"] });
  assert.equal(w.trapCode, "ERR_CAPABILITY_DENIED", "a grant minted for another engineId is refused");
});
