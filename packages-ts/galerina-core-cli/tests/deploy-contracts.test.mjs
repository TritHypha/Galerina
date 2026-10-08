import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEPLOYMENT_TARGETS,
  FUNGI_DEPLOY_001,
  FUNGI_DEPLOY_002,
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_004,
  FUNGI_DEPLOY_005,
  createDeploymentResult,
  isDeploymentTarget,
  readDeploymentResult,
  validateEffects,
} from "../dist/index.js";

const HASH = `sha256:${"a".repeat(64)}`;
const codes = (xs) => xs.map((d) => d.code);

const policy = (over = {}) => ({
  allowedEffects: ["fs.read", "net.fetch"],
  allowedTargets: ["edge", "node", "wasm"],
  requireVerified: true,
  ...over,
});

const manifest = (over = {}) => ({
  allowedEffects: ["fs.read"],
  verified: true,
  ...over,
});

const input = (over = {}) => ({
  manifest: manifest(),
  policy: policy(),
  target: "node",
  ...over,
});

test("isDeploymentTarget admits only the closed vocabulary", () => {
  for (const t of DEPLOYMENT_TARGETS) assert.equal(isDeploymentTarget(t), true);
  for (const bad of ["", "cuda", "server", "NODE", null, 1, {}, undefined]) {
    assert.equal(isDeploymentTarget(bad), false, String(bad));
  }
});

test("validateEffects accepts a closed verified slice under policy", () => {
  assert.deepEqual(validateEffects(input()), []);
});

test("validateEffects refuses non-plain input, accessors, unknown keys and missing fields", () => {
  assert.deepEqual(codes(validateEffects(null)), [FUNGI_DEPLOY_001]);
  assert.deepEqual(codes(validateEffects([])), [FUNGI_DEPLOY_001]);
  const proto = Object.create({ x: 1 });
  Object.assign(proto, input());
  assert.deepEqual(codes(validateEffects(proto)), [FUNGI_DEPLOY_001]);
  const accessor = {};
  Object.defineProperty(accessor, "target", { get: () => "node", enumerable: true });
  Object.assign(accessor, { manifest: manifest(), policy: policy() });
  assert.deepEqual(codes(validateEffects(accessor)), [FUNGI_DEPLOY_001]);
  assert.deepEqual(codes(validateEffects({ ...input(), extra: true })), [FUNGI_DEPLOY_001]);
  const missing = { manifest: manifest(), policy: policy() };
  assert.deepEqual(codes(validateEffects(missing)), [FUNGI_DEPLOY_001]);
});

test("validateEffects never throws on hostile proxies and never echoes keys/values", () => {
  const hostile = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error("ownKeys");
      },
      get: () => {
        throw new Error("get");
      },
      getOwnPropertyDescriptor: () => {
        throw new Error("desc");
      },
    },
  );
  assert.doesNotThrow(() => validateEffects(hostile));
  const diags = validateEffects({ ...input(), policy: { ...policy(), allowedEffects: ["Net.Fetch"] } });
  const blob = JSON.stringify(diags);
  assert.equal(blob.includes("Net.Fetch"), false);
  assert.equal(blob.includes("fs.read"), false);
  assert.deepEqual(codes(diags), [FUNGI_DEPLOY_002]);
});

test("validateEffects emits 003/004/005 for policy denial, target mismatch and verified gate", () => {
  assert.deepEqual(
    codes(validateEffects(input({ manifest: manifest({ allowedEffects: ["fs.write"] }) }))),
    [FUNGI_DEPLOY_003],
  );
  assert.deepEqual(codes(validateEffects(input({ target: "gpu" }))), [FUNGI_DEPLOY_004]);
  assert.deepEqual(
    codes(validateEffects(input({ manifest: manifest({ verified: false }) }))),
    [FUNGI_DEPLOY_005],
  );
  assert.deepEqual(
    codes(
      validateEffects(
        input({
          target: "gpu",
          manifest: manifest({ allowedEffects: ["fs.write"], verified: false }),
        }),
      ),
    ),
    [FUNGI_DEPLOY_004, FUNGI_DEPLOY_005, FUNGI_DEPLOY_003],
  );
});

test("validateEffects refuses unsorted effects and unknown targets in policy", () => {
  assert.deepEqual(
    codes(validateEffects(input({ policy: policy({ allowedEffects: ["net.fetch", "fs.read"] }) }))),
    [FUNGI_DEPLOY_002],
  );
  assert.deepEqual(
    codes(validateEffects(input({ policy: policy({ allowedTargets: ["node", "cuda"] }) }))),
    [FUNGI_DEPLOY_002],
  );
  assert.deepEqual(codes(validateEffects(input({ target: "cuda" }))), [FUNGI_DEPLOY_002]);
});

test("createDeploymentResult recomputes success and freezes the result", () => {
  const ok = createDeploymentResult("wasm", HASH, [], "reports/deployment-report.json");
  assert.equal(ok.success, true);
  assert.equal(ok.target, "wasm");
  assert.equal(ok.manifestHash, HASH);
  assert.equal(ok.reportPath, "reports/deployment-report.json");
  assert.ok(Object.isFrozen(ok));
  const bad = createDeploymentResult("wasm", HASH, [
    { code: FUNGI_DEPLOY_003, severity: "error", message: "denied", field: "allowedEffects" },
  ]);
  assert.equal(bad.success, false);
  assert.equal(bad.diagnostics.length, 1);
  assert.equal("reportPath" in bad, false);
  assert.equal(createDeploymentResult("cuda", HASH, []).success, false);
  assert.deepEqual(codes(createDeploymentResult("cuda", HASH, []).diagnostics), [FUNGI_DEPLOY_002]);
  assert.deepEqual(codes(createDeploymentResult("node", "sha256:ZZ", []).diagnostics), [FUNGI_DEPLOY_002]);
  assert.deepEqual(codes(createDeploymentResult("node", HASH, [], "../x").diagnostics), [FUNGI_DEPLOY_002]);
});

test("readDeploymentResult accepts closed success/failure shapes and refuses contradictions", () => {
  const ok = readDeploymentResult({
    success: true,
    target: "edge",
    manifestHash: HASH,
    diagnostics: [],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.success, true);
    assert.ok(Object.isFrozen(ok.value));
  }
  const fail = readDeploymentResult({
    success: false,
    target: "edge",
    manifestHash: HASH,
    diagnostics: [{ code: FUNGI_DEPLOY_004, severity: "error", message: "target refused", field: "target" }],
    reportPath: "out/deployment-report.json",
  });
  assert.equal(fail.ok, true);
  const contradict = readDeploymentResult({
    success: true,
    target: "edge",
    manifestHash: HASH,
    diagnostics: [{ code: FUNGI_DEPLOY_004, severity: "error", message: "x", field: "target" }],
  });
  assert.equal(contradict.ok, false);
  if (!contradict.ok) assert.deepEqual(codes(contradict.diagnostics), [FUNGI_DEPLOY_002]);
  assert.equal(readDeploymentResult(null).ok, false);
  assert.equal(readDeploymentResult({ success: true, target: "edge", manifestHash: HASH, diagnostics: [], extra: 1 }).ok, false);
  const accessor = {
    success: true,
    target: "edge",
    manifestHash: HASH,
    diagnostics: [],
  };
  Object.defineProperty(accessor, "reportPath", { get: () => "x", enumerable: true });
  assert.equal(readDeploymentResult(accessor).ok, false);
});

test("createDeploymentResult snapshots diagnostic entries (C21 NB-2; no getters later)", () => {
  let gets = 0;
  const hostile = {
    get code() { gets += 1; return "FUNGI-DEPLOY-003"; },
    get severity() { gets += 1; return "error"; },
    get message() { gets += 1; return "A declared effect is denied by the deployment policy."; },
    get field() { gets += 1; return "allowedEffects"; },
  };
  // Accessors refuse at snapshot time -> shape refuse diagnostic, never store hostile object.
  const refused = createDeploymentResult("wasm", "sha256:" + "ab".repeat(32), [hostile]);
  assert.equal(refused.success, false);
  assert.equal(refused.diagnostics.length, 1);
  assert.equal(refused.diagnostics[0].code, "FUNGI-DEPLOY-001");
  assert.equal(gets, 0);
  const plain = Object.freeze({
    code: "FUNGI-DEPLOY-003",
    severity: "error",
    message: "A declared effect is denied by the deployment policy.",
    field: "allowedEffects",
  });
  const ok = createDeploymentResult("wasm", "sha256:" + "ab".repeat(32), [plain]);
  assert.equal(ok.success, false);
  assert.equal(ok.diagnostics.length, 1);
  assert.equal(ok.diagnostics[0].code, "FUNGI-DEPLOY-003");
  assert.notEqual(ok.diagnostics[0], plain);
  assert.ok(Object.isFrozen(ok.diagnostics[0]));
});
