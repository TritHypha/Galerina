import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_PROMOTE_001,
  FUNGI_PROMOTE_002,
  FUNGI_PROMOTE_003,
  FUNGI_PROMOTE_004,
  PROMOTE_ENVIRONMENTS,
  PROMOTE_REQUEST_FIELDS,
  PROMOTE_REQUEST_SCHEMA,
  PROMOTE_RESULT_FIELDS,
  PROMOTE_TARGETS,
  createPromotePlan,
  createPromoteResult,
  isPromoteEnvironment,
  isPromoteTarget,
  readPromoteRequest,
  readPromoteResult,
} from "../dist/index.js";

const HASH_A = "sha256:" + "a".repeat(64);
const HASH_M = "sha256:" + "c".repeat(64);

function req(over = {}) {
  return Object.freeze({
    schema: PROMOTE_REQUEST_SCHEMA,
    fromEnvironment: "staging",
    toEnvironment: "production",
    buildHash: HASH_A,
    target: "node",
    ...over,
  });
}

describe("promote contracts closed shapes", () => {
  it("exposes closed vocabularies and field lists", () => {
    assert.deepEqual([...PROMOTE_ENVIRONMENTS], [
      "development", "test", "staging", "production",
    ]);
    assert.deepEqual([...PROMOTE_TARGETS], [
      "node", "wasm", "native", "serverless", "edge", "gpu", "photonic",
    ]);
    assert.deepEqual([...PROMOTE_REQUEST_FIELDS], [
      "schema", "fromEnvironment", "toEnvironment", "buildHash", "target", "moduleHash",
    ]);
    assert.deepEqual([...PROMOTE_RESULT_FIELDS], [
      "success", "admitted", "diagnostics", "fromEnvironment", "toEnvironment",
      "buildHash", "target", "reportPath",
    ]);
    assert.equal(isPromoteEnvironment("staging"), true);
    assert.equal(isPromoteEnvironment("prod"), false);
    assert.equal(isPromoteTarget("node"), true);
    assert.equal(isPromoteTarget("jvm"), false);
  });

  it("readPromoteRequest accepts closed request and optional moduleHash", () => {
    const a = readPromoteRequest(req());
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.value.fromEnvironment, "staging");
    assert.equal(a.value.toEnvironment, "production");
    assert.equal(a.value.moduleHash, undefined);

    const b = readPromoteRequest(req({ moduleHash: HASH_M }));
    assert.equal(b.ok, true);
    if (!b.ok) return;
    assert.equal(b.value.moduleHash, HASH_M);
  });

  it("readPromoteRequest refuses getters, unknown keys, bad domains, same-env", () => {
    const getter = {
      schema: PROMOTE_REQUEST_SCHEMA,
      fromEnvironment: "staging",
      toEnvironment: "production",
      buildHash: HASH_A,
    };
    Object.defineProperty(getter, "target", { get: () => "node", enumerable: true });
    const g = readPromoteRequest(getter);
    assert.equal(g.ok, false);
    if (!g.ok) assert.equal(g.diagnostics[0]?.code, FUNGI_PROMOTE_001);

    const unk = readPromoteRequest(req({ extra: 1 }));
    assert.equal(unk.ok, false);

    const badHash = readPromoteRequest(req({ buildHash: "sha256:ZZ" }));
    assert.equal(badHash.ok, false);
    if (!badHash.ok) assert.equal(badHash.diagnostics[0]?.code, FUNGI_PROMOTE_002);

    const badEnv = readPromoteRequest(req({ fromEnvironment: "prod" }));
    assert.equal(badEnv.ok, false);

    const same = readPromoteRequest(req({ fromEnvironment: "staging", toEnvironment: "staging" }));
    assert.equal(same.ok, false);
    if (!same.ok) assert.equal(same.diagnostics[0]?.code, FUNGI_PROMOTE_003);
  });

  it("createPromotePlan admits distinct closed envs and refuses hostile input", () => {
    const ok = createPromotePlan(req());
    assert.equal(ok.success, true);
    assert.equal(ok.admitted, true);
    assert.equal(ok.fromEnvironment, "staging");
    assert.equal(ok.toEnvironment, "production");
    assert.equal(ok.diagnostics.length, 0);

    const a = createPromotePlan(null);
    assert.equal(a.success, false);
    assert.ok(a.diagnostics.some((d) => d.code === FUNGI_PROMOTE_001));

    const proxy = new Proxy({}, { get: () => { throw new Error("boom"); } });
    const b = createPromotePlan(proxy);
    assert.equal(b.success, false);
  });

  it("createPromoteResult / readPromoteResult recompute success and refuse inconsistency", () => {
    const ok = createPromoteResult({
      admitted: true,
      diagnostics: [],
      fromEnvironment: "staging",
      toEnvironment: "production",
      buildHash: HASH_A,
      target: "node",
    });
    assert.equal(ok.success, true);

    const readOk = readPromoteResult({
      success: true,
      admitted: true,
      diagnostics: [],
      fromEnvironment: "staging",
      toEnvironment: "production",
      buildHash: HASH_A,
      target: "node",
    });
    assert.equal(readOk.ok, true);

    const inconsistent = readPromoteResult({
      success: true,
      admitted: true,
      diagnostics: [
        {
          code: FUNGI_PROMOTE_003,
          severity: "error",
          message: "same env",
          field: "toEnvironment",
        },
      ],
      fromEnvironment: "staging",
      toEnvironment: "production",
      buildHash: HASH_A,
      target: "node",
    });
    assert.equal(inconsistent.ok, false);
    if (!inconsistent.ok) assert.equal(inconsistent.diagnostics[0]?.code, FUNGI_PROMOTE_004);

    const badPath = createPromoteResult({
      admitted: true,
      diagnostics: [],
      fromEnvironment: "staging",
      toEnvironment: "production",
      buildHash: HASH_A,
      target: "node",
      reportPath: "../escape",
    });
    assert.equal(badPath.success, false);
    assert.ok(badPath.diagnostics.some((d) => d.code === FUNGI_PROMOTE_002));
  });

  it("never echoes refused environment or hash tokens in diagnostics", () => {
    const secret = "sha256:" + "d".repeat(64);
    const r = readPromoteRequest(req({ buildHash: "not-a-hash", fromEnvironment: "evil-env" }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      const blob = JSON.stringify(r.diagnostics);
      assert.equal(blob.includes("not-a-hash"), false);
      assert.equal(blob.includes("evil-env"), false);
      assert.equal(blob.includes(secret), false);
    }
  });
});
