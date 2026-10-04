// rd-0363-plan-admission.test.mjs — RD-0363 passive plan replay admission gates.
//
// Tests the three invariants:
//   PV1 tampered plan → hash mismatch → REJECT (-1)
//   PV2 stale plan    → freshness fail → INDETERMINATE (0) → caller denies
//   PV3 cross-target  → targetBinding mismatch → REJECT (-1)
//   Happy path (fresh, matching target) → INDETERMINATE (0) because no signature (unsigned plans
//   never become ALLOW; they are always at best 0 until the key-verifier folds in +1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

let L;
test.before(async () => { L = await import(pathToFileURL(COMPILER).href); });

const SRC = `@version 1
pure flow addTwo(a: Int, b: Int) -> Int contract { effects {} } { return a + b }`;

function buildPlan() {
  const prog = L.parseProgram(SRC, "plan-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  // Build the execution plan via the exported helper (girFlow.executionPlan is only set
  // when explicitly requested; buildExecutionPlan is the intended API).
  const meta = prog.flows.find(f => f.name === "addTwo");
  if (meta === undefined) return undefined;
  return L.buildExecutionPlan(prog.ast, meta);
}

test("RD-0363: fresh unsigned plan → INDETERMINATE (0) — never ALLOW without a key", () => {
  const plan = buildPlan();
  assert.ok(plan !== undefined, "GIR must produce an executionPlan");
  const { verifyPlanAdmission } = L;
  if (typeof verifyPlanAdmission !== "function") {
    // Exported from the runtime/executionPlan module; check it's on the L export
    return; // skip if not re-exported at top level — the source-level test suffices
  }
  const result = verifyPlanAdmission(plan, { nowMs: Date.now() });
  assert.equal(result.verdict, 0, "unsigned plan must be INDETERMINATE — not ALLOW");
  assert.ok(!result.admitted, "unsigned plan must not be admitted");
});

test("RD-0363: tampered planHash → REJECT (-1)", () => {
  const plan = buildPlan();
  if (plan === undefined) return;
  const { verifyPlanAdmission } = L;
  if (typeof verifyPlanAdmission !== "function") return;
  const tampered = { ...plan, planHash: "0".repeat(64) };
  const result = verifyPlanAdmission(tampered, { nowMs: Date.now() });
  assert.equal(result.verdict, -1, "tampered plan must be REJECT (-1)");
  assert.ok(!result.admitted);
});

test("RD-0363: stale plan → INDETERMINATE (0) from freshness", () => {
  const plan = buildPlan();
  if (plan === undefined) return;
  const { verifyPlanFreshness } = L;
  if (typeof verifyPlanFreshness !== "function") return;
  // Simulate a plan generated 48 hours ago (past the 24 h default)
  const stale = { ...plan, generatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() };
  const result = verifyPlanFreshness(stale, Date.now());
  assert.equal(result.verdict, 0, "stale plan must return INDETERMINATE (0)");
  assert.ok(!result.admitted);
  assert.ok(result.reason?.includes("STALE"), "reason must mention STALE");
});

test("RD-0363: cross-target replay → REJECT (-1)", () => {
  const plan = buildPlan();
  if (plan === undefined) return;
  const { verifyPlanAdmission } = L;
  if (typeof verifyPlanAdmission !== "function") return;
  // Plan has no targetBinding; require "wasm" → reject
  const result = verifyPlanAdmission(plan, { requiredTarget: "wasm", nowMs: Date.now() });
  assert.equal(result.verdict, -1, "missing targetBinding with required target must REJECT");
  assert.ok(!result.admitted);
});

test("RD-0363: target-bound plan matches required target → INDETERMINATE (unsigned)", () => {
  const plan = buildPlan();
  if (plan === undefined) return;
  const { verifyPlanAdmission } = L;
  if (typeof verifyPlanAdmission !== "function") return;
  const retargeted = { ...plan, targetBinding: "wasm" };
  // The target is an admission-bound field: re-bind it as an issuer would.
  const withTarget = { ...retargeted, admissionHash: L.computePlanAdmissionHash(retargeted) };
  const result = verifyPlanAdmission(withTarget, { requiredTarget: "wasm", nowMs: Date.now() });
  // No signature → INDETERMINATE (0) even with matching target
  assert.equal(result.verdict, 0, "unsigned plan with matching target = INDETERMINATE");
});

test("RD-0363: a present but unverified signature never authorizes a plan", () => {
  const plan = buildPlan();
  assert.ok(plan !== undefined, "GIR must produce an executionPlan");
  const { verifyPlanAdmission } = L;
  assert.equal(typeof verifyPlanAdmission, "function", "verifyPlanAdmission must be exported");
  const signed = { ...plan, planSignature: "placeholder" };
  // The signature is an admission-bound field: re-bind it so the test reaches the signature gate.
  const signedButUnverified = { ...signed, admissionHash: L.computePlanAdmissionHash(signed) };
  const result = verifyPlanAdmission(signedButUnverified, { nowMs: Date.now() });
  assert.equal(result.verdict, 0, "presence alone must remain INDETERMINATE");
  assert.equal(result.admitted, false, "unverified signature must not authorize");
  assert.match(result.reason, /cryptographically verified/);
});

test("RD-0363: PLAN_DEFAULT_MAX_AGE_MS is exported and equals 86400000 ms (24 h)", () => {
  const { PLAN_DEFAULT_MAX_AGE_MS } = L;
  if (PLAN_DEFAULT_MAX_AGE_MS === undefined) return; // may not be re-exported at top level
  assert.equal(PLAN_DEFAULT_MAX_AGE_MS, 86_400_000, "default max age must be 24 h in ms");
});

// ---------------------------------------------------------------------------
// RD-0363 P5 adversarial controls (2026-10-04): admission-bound fields, closed
// step schema, numeric freshness, capability-entry coherence, and the
// interpreter execution-plan fast path. Every refusal asserts its REASON so a
// test cannot pass merely because the unsigned-plan gate always yields 0.
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-10-04T00:00:00.000Z");

/** The legacy four-field content hash, recomputed exactly as the builder does. */
function legacyPlanHash(plan) {
  const canonical = {
    flow: plan.flow,
    qualifier: plan.qualifier,
    steps: plan.steps,
    approvedCapabilities: Object.fromEntries(plan.approvedCapabilities),
  };
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

function stubHost(declared) {
  const enforcer = L.createContractEnforcer(undefined, "f", {});
  return L.createCapabilityHost({ declaredEffects: new Set(declared), enforcer });
}

const CTX = { flowName: "f", startedAt: NOW };

/** A built plan re-stamped at a fixed issue time, with its admission hash re-bound. */
function boundPlan(overrides = {}) {
  const plan = buildPlan();
  assert.ok(plan !== undefined, "buildExecutionPlan must produce a plan");
  const restamped = { ...plan, generatedAt: new Date(NOW - 1000).toISOString(), ...overrides };
  return { ...restamped, admissionHash: L.computePlanAdmissionHash(restamped) };
}

test("RD-0363 P5: buildExecutionPlan binds an admissionHash that admission recomputes", () => {
  const plan = buildPlan();
  assert.equal(typeof L.computePlanAdmissionHash, "function", "computePlanAdmissionHash must be exported");
  assert.match(plan.admissionHash, /^[0-9a-f]{64}$/);
  assert.equal(plan.admissionHash, L.computePlanAdmissionHash(plan));
  const result = L.verifyPlanAdmission(plan, { nowMs: Date.parse(plan.generatedAt) + 1 });
  assert.equal(result.verdict, 0);
  assert.match(result.reason, /no planSignature/, "an intact unsigned plan stops at the signature gate, not earlier");
});

test("RD-0363 P5: the legacy four-field planHash is unchanged by admission fields (determinism kept)", () => {
  const a = boundPlan();
  const b = boundPlan({ maxAgeMs: 5000, targetBinding: "wasm", generatedAt: new Date(NOW - 10).toISOString() });
  assert.equal(a.planHash, b.planHash, "planHash stays the content hash");
  assert.notEqual(a.admissionHash, b.admissionHash, "admissionHash covers the admission fields");
});

for (const [field, value] of [
  ["generatedAt", new Date(NOW - 500).toISOString()],
  ["maxAgeMs", 5000],
  ["targetBinding", "wasm"],
  ["planSignature", "deadbeef"],
]) {
  test(`RD-0363 P5 tampered: changing only ${field} without re-binding → REJECT (-1)`, () => {
    const plan = boundPlan();
    const tampered = { ...plan, [field]: value };
    const options = field === "targetBinding" ? { requiredTarget: "wasm", nowMs: NOW } : { nowMs: NOW };
    const result = L.verifyPlanAdmission(tampered, options);
    assert.equal(result.verdict, -1);
    assert.equal(result.admitted, false);
    assert.match(result.reason, /admissionHash mismatch/);
  });
}

test("RD-0363 P5 tampered: a missing admissionHash → REJECT (-1)", () => {
  const { admissionHash: _dropped, ...unbound } = boundPlan();
  const result = L.verifyPlanAdmission(unbound, { nowMs: NOW });
  assert.equal(result.verdict, -1);
  assert.match(result.reason, /admissionHash mismatch/);
});

test("RD-0363 P5 forged: tampered steps with a stale planHash → REJECT (-1) before the admission binding", () => {
  const plan = boundPlan();
  const forged = { ...plan, steps: [{ kind: "return", value: "FORGED" }] };
  const result = L.verifyPlanAdmission({ ...forged, admissionHash: L.computePlanAdmissionHash(forged) }, { nowMs: NOW });
  assert.equal(result.verdict, -1);
  assert.match(result.reason, /planHash mismatch/);
});

test("RD-0363 P5 retargeted: a bound cpu plan replayed on a wasm lane → REJECT (-1)", () => {
  const plan = boundPlan({ targetBinding: "cpu" });
  const result = L.verifyPlanAdmission(plan, { requiredTarget: "wasm", nowMs: NOW });
  assert.equal(result.verdict, -1);
  assert.match(result.reason, /targetBinding "cpu" !== required "wasm"/);
  const control = L.verifyPlanAdmission(plan, { requiredTarget: "cpu", nowMs: NOW });
  assert.equal(control.verdict, 0, "matching target reaches the signature gate");
  assert.match(control.reason, /no planSignature/);
});

test("RD-0363 P5 stale: a properly bound plan past maxAgeMs → INDETERMINATE (0) STALE", () => {
  const plan = boundPlan({ maxAgeMs: 500 });
  const result = L.verifyPlanAdmission(plan, { nowMs: NOW });
  assert.equal(result.verdict, 0);
  assert.match(result.reason, /STALE/);
});

test("RD-0363 P5 stale: age equal to maxAgeMs is already expired (issuedAt <= now < expiry)", () => {
  const plan = boundPlan({ maxAgeMs: 1000 });
  const result = L.verifyPlanFreshness(plan, NOW);
  assert.equal(result.verdict, 0);
  assert.match(result.reason, /STALE/);
  const inWindow = L.verifyPlanFreshness(plan, NOW - 1);
  assert.equal(inWindow.verdict, 1, "a valid in-window timestamp remains fresh");
});

test("RD-0363 P5 stale: a future generatedAt is not admissible (zero skew)", () => {
  const plan = boundPlan({ generatedAt: new Date(NOW + 200).toISOString() });
  const result = L.verifyPlanFreshness(plan, NOW);
  assert.equal(result.verdict, 0);
  assert.match(result.reason, /FUTURE/);
});

for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 86_400_001]) {
  test(`RD-0363 P5 stale: maxAgeMs=${String(bad)} is refused at the freshness helper (-1)`, () => {
    const plan = boundPlan({ maxAgeMs: bad });
    const result = L.verifyPlanFreshness(plan, NOW);
    assert.equal(result.verdict, -1);
    assert.match(result.reason, /maxAgeMs/);
  });
}

for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`RD-0363 P5 stale: nowMs=${String(bad)} is refused at the freshness helper (-1)`, () => {
    const plan = boundPlan();
    const result = L.verifyPlanFreshness(plan, bad);
    assert.equal(result.verdict, -1);
    assert.match(result.reason, /nowMs/);
  });
}

test("RD-0363 P5 unknown step: admission refuses an unknown kind even with correctly recomputed hashes (-1)", () => {
  const plan = boundPlan();
  const steps = [{ kind: "smuggle", value: "X" }, ...plan.steps];
  const legacy = legacyPlanHash({ ...plan, steps });
  const smuggled = { ...plan, steps, planHash: legacy };
  const result = L.verifyPlanAdmission({ ...smuggled, admissionHash: L.computePlanAdmissionHash(smuggled) }, { nowMs: NOW });
  assert.equal(result.verdict, -1);
  assert.match(result.reason, /unknown step kind 'smuggle'/);
});

test("RD-0363 P5 malformed: a JSON-decoded capability map is a controlled refusal, not a TypeError", () => {
  const plan = boundPlan();
  const decoded = JSON.parse(JSON.stringify(plan));
  const result = L.verifyPlanAdmission(decoded, { nowMs: NOW });
  assert.equal(result.verdict, -1);
  assert.match(result.reason, /approvedCapabilities/);
});

test("RD-0363 P5 unknown step: executePlan hard-refuses instead of skipping to a later return", async () => {
  const plan = buildPlan();
  const host = stubHost([]);
  const smuggled = { ...plan, steps: [{ kind: "smuggle" }, { kind: "return", value: "AFTER_UNKNOWN" }] };
  await assert.rejects(
    () => L.executePlan(smuggled, host, CTX),
    /unknown step kind 'smuggle'/,
  );
});

test("RD-0363 P5 coherence: executePlan refuses a capability step whose approved entry does not match", async () => {
  const host = stubHost(["database.read"]);
  const ctx = CTX;
  const entry = { declared: true, allowed: true, effect: "database.read", capability: "host.database.read" };
  const step = { kind: "capability_call", capability: "host.database.read", effect: "database.read", operation: "read" };
  const base = { flow: "f", qualifier: "pure", planHash: "", generatedAt: new Date(NOW).toISOString(), admissionHash: "" };
  const ok = await L.executePlan({ ...base, steps: [step, { kind: "return", value: "OK" }], approvedCapabilities: new Map([["database.read", entry]]) }, host, ctx);
  assert.equal(ok.value, "OK", "the matching approved entry is the positive control");
  assert.ok(ok.auditTrail.includes("capability_call: host.database.read (read) [allowed]"));
  for (const [label, hostileStep, hostileEntry] of [
    ["step capability", { ...step, capability: "host.not-approved" }, entry],
    ["entry declared", step, { ...entry, declared: false }],
    ["entry effect", step, { ...entry, effect: "database.write" }],
    ["entry capability", step, { ...entry, capability: "host.not-approved" }],
  ]) {
    await assert.rejects(
      () => L.executePlan({ ...base, steps: [hostileStep, { kind: "return", value: "OK" }], approvedCapabilities: new Map([["database.read", hostileEntry]]) }, host, ctx),
      /does not match its approved entry/,
      `${label} mismatch must refuse before any [allowed] audit entry`,
    );
  }
});

function runtimeFixture() {
  const prog = L.parseProgram(`@version 1\npure flow f() -> Int contract { effects {} } { return 1 }`, "rd0363-forged.fungi");
  const enforcer = L.createContractEnforcer(undefined, "f", {});
  const host = L.createCapabilityHost({ declaredEffects: new Set(), enforcer });
  return { prog, enforcer, host };
}

test("RD-0363 P5 forged: executeFlow with useExecutionPlan refuses a caller-supplied hash-invalid plan", async () => {
  const { prog, enforcer, host } = runtimeFixture();
  const forged = {
    flow: "f", qualifier: "pure", steps: [{ kind: "return", value: "FORGED" }], approvedCapabilities: new Map(),
    planHash: "0".repeat(64), generatedAt: new Date(0).toISOString(), admissionHash: "0".repeat(64),
  };
  const refused = await L.executeFlow("f", new Map(), prog.ast, prog.flows, enforcer, host, { useExecutionPlan: true }, new Map([["f", forged]]));
  assert.notDeepEqual(refused.value, { __tag: "string", value: "FORGED" }, "a forged plan must never execute");
  assert.equal(refused.value.__tag, "runtimeError");
  const diag = refused.diagnostics.find((d) => d.code === "FUNGI-RUNTIME-003");
  assert.ok(diag !== undefined, "refusal is reported as FUNGI-RUNTIME-003");
  assert.match(diag.message, /refused by admission \(verdict -1\): planAdmission: planHash mismatch/);

  const control = await L.executeFlow("f", new Map(), prog.ast, prog.flows, enforcer, host, { useExecutionPlan: false }, new Map([["f", forged]]));
  assert.deepEqual(control.value, { __tag: "int", value: 1 }, "without the plan path the AST result stands");
});

test("RD-0363 P5: executeFlow with useExecutionPlan refuses even an intact compiler-built plan until a verifier exists", async () => {
  const { prog, enforcer, host } = runtimeFixture();
  const meta = prog.flows.find((flow) => flow.name === "f");
  const plan = L.buildExecutionPlan(prog.ast, meta);
  const result = await L.executeFlow("f", new Map(), prog.ast, prog.flows, enforcer, host, { useExecutionPlan: true }, new Map([["f", plan]]));
  assert.equal(result.value.__tag, "runtimeError");
  const diag = result.diagnostics.find((d) => d.code === "FUNGI-RUNTIME-003");
  assert.ok(diag !== undefined);
  assert.match(diag.message, /refused by admission \(verdict 0\): planAdmission: no planSignature/);
});

test("RD-0363 P5: hashPassivePlan stays deterministic across builds despite the admission binding", () => {
  const a = boundPlan();
  const b = boundPlan({ generatedAt: new Date(NOW - 2000).toISOString() });
  assert.notEqual(a.admissionHash, b.admissionHash);
  assert.equal(L.hashPassivePlan(a), L.hashPassivePlan(b), "the outer content hash ignores generatedAt and its binding");
});
