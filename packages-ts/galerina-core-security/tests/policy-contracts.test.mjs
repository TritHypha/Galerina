import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_POL_001,
  FUNGI_SEC_POL_002,
  FUNGI_SEC_POL_003,
  POLICY_DEFINITION_SCHEMA,
  EFFECTIVE_POLICY_SCHEMA,
  POLICY_CONFLICT_SCHEMA,
  readPolicyDefinition,
  readEffectivePolicy,
  readPolicyConflict,
} from "../dist/index.js";

const goodDefinition = Object.freeze({
  schema: POLICY_DEFINITION_SCHEMA,
  policyId: "net.egress",
  kind: "network",
  defaultDecision: "deny",
  priority: 10,
  fieldNames: Object.freeze(["allowPlainHttp", "requireTimeouts"]),
  diagnostics: Object.freeze([]),
});

const goodEffective = Object.freeze({
  schema: EFFECTIVE_POLICY_SCHEMA,
  subjectId: "route.api",
  policyId: "net.egress",
  decision: "deny",
  appliedPolicyIds: Object.freeze(["net.egress"]),
  complete: true,
  diagnostics: Object.freeze([]),
});

const goodConflict = Object.freeze({
  schema: POLICY_CONFLICT_SCHEMA,
  conflictId: "c1",
  kind: "contradictory_decision",
  policyIds: Object.freeze(["net.a", "net.b"]),
  diagnosticCodes: Object.freeze(["FUNGI-SEC-POL-003"]),
  diagnostics: Object.freeze([]),
});

test("readPolicyDefinition admits a closed deny-default definition", () => {
  const result = readPolicyDefinition(goodDefinition);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.schema, POLICY_DEFINITION_SCHEMA);
  assert.equal(result.value.defaultDecision, "deny");
  assert.equal(result.value.kind, "network");
  assert.deepEqual(result.value.fieldNames, ["allowPlainHttp", "requireTimeouts"]);
  assert.equal(result.value.diagnostics.length, 0);
});

test("readEffectivePolicy and readPolicyConflict admit closed shapes", () => {
  const eff = readEffectivePolicy(goodEffective);
  assert.equal(eff.ok, true);
  if (!eff.ok) return;
  assert.equal(eff.value.decision, "deny");
  assert.equal(eff.value.complete, true);

  const conflict = readPolicyConflict(goodConflict);
  assert.equal(conflict.ok, true);
  if (!conflict.ok) return;
  assert.equal(conflict.value.kind, "contradictory_decision");
  assert.deepEqual(conflict.value.policyIds, ["net.a", "net.b"]);
});

test("hostile getter / prototype / unknown key refuse without echo", () => {
  const hostile = {
    schema: POLICY_DEFINITION_SCHEMA,
    policyId: "secret.leak",
    kind: "network",
    defaultDecision: "deny",
    priority: 1,
    fieldNames: [],
    diagnostics: [],
  };
  Object.defineProperty(hostile, "policyId", {
    get() {
      throw new Error("getter-ran");
    },
    enumerable: true,
  });
  const r1 = readPolicyDefinition(hostile);
  assert.equal(r1.ok, false);
  if (r1.ok) return;
  assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_POL_001);
  const joined = r1.diagnostics.map((d) => d.message).join(" ");
  assert.equal(joined.includes("secret.leak"), false);
  assert.equal(joined.includes("getter-ran"), false);

  const extra = { ...goodDefinition, evil: "TOKEN" };
  const r2 = readPolicyDefinition(extra);
  assert.equal(r2.ok, false);
  if (r2.ok) return;
  assert.equal(r2.diagnostics.some((d) => d.code === FUNGI_SEC_POL_001), true);
  assert.equal(r2.diagnostics.map((d) => d.message).join(" ").includes("TOKEN"), false);
});

test("NaN priority, allow default, and unknown kind refuse", () => {
  const nanPriority = { ...goodDefinition, priority: Number.NaN };
  const r1 = readPolicyDefinition(nanPriority);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics[0]?.code, FUNGI_SEC_POL_002);

  const allowDefault = { ...goodDefinition, defaultDecision: "allow" };
  const r2 = readPolicyDefinition(allowDefault);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.diagnostics[0]?.code, FUNGI_SEC_POL_002);

  const unknownKind = { ...goodDefinition, kind: "unknown" };
  const r3 = readPolicyDefinition(unknownKind);
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.equal(r3.diagnostics[0]?.code, FUNGI_SEC_POL_002);
});

test("effective policy requires primary policyId in appliedPolicyIds", () => {
  const bad = {
    ...goodEffective,
    policyId: "net.primary",
    appliedPolicyIds: Object.freeze(["net.other"]),
  };
  const r = readEffectivePolicy(bad);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.diagnostics.some((d) => d.code === FUNGI_SEC_POL_003), true);
});

test("conflict with one policyId refused except unknown_reference", () => {
  const one = {
    ...goodConflict,
    kind: "duplicate_id",
    policyIds: Object.freeze(["only.one"]),
  };
  const r1 = readPolicyConflict(one);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.diagnostics.some((d) => d.code === FUNGI_SEC_POL_003), true);

  const unknownRef = {
    ...goodConflict,
    kind: "unknown_reference",
    policyIds: Object.freeze(["missing.policy"]),
    diagnosticCodes: Object.freeze([]),
  };
  const r2 = readPolicyConflict(unknownRef);
  assert.equal(r2.ok, true);
});
