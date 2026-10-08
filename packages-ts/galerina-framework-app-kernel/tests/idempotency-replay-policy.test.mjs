import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_IDR_001,
  FUNGI_APPK_IDR_002,
  FUNGI_APPK_IDR_003,
  FUNGI_APPK_IDR_004,
  FUNGI_APPK_IDR_005,
  IDEMPOTENCY_MAX_KEY_BYTES_MAX,
  IDEMPOTENCY_REPLAY_POLICY_FIELDS,
  IDEMPOTENCY_REPLAY_POLICY_SCHEMA,
  IDEMPOTENCY_TTL_SECONDS_MAX,
  createIdempotencyReplayPolicy,
  readIdempotencyReplayPolicy,
  resolveEffectiveRoutePolicy,
} from "../dist/index.js";

function basePolicy(overrides = {}) {
  return {
    schema: IDEMPOTENCY_REPLAY_POLICY_SCHEMA,
    name: "DefaultIdempotency",
    mutatingMethods: "required",
    header: "Idempotency-Key",
    ttlSeconds: 86_400,
    maxKeyBytes: 256,
    missingKey: "reject",
    onDuplicate: "reject",
    storeFailure: "reject",
    claim: "atomic",
    claimAfterGates: "required",
    scope: "route",
    echoKey: "deny",
    ...overrides,
  };
}

const refusal = (input) => {
  const r = readIdempotencyReplayPolicy(input);
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics.length, 1);
  return r.diagnostics[0];
};

describe("idempotency replay policy", () => {
  it("admits the fail-closed baseline and returns a frozen detached copy", () => {
    const input = basePolicy({ diagnostics: [] });
    const r = readIdempotencyReplayPolicy(input);
    assert.equal(r.ok, true);
    assert.ok(Object.isFrozen(r.value) && Object.isFrozen(r.value.diagnostics));
    assert.deepEqual({ ...r.value, diagnostics: [] }, { ...basePolicy(), diagnostics: [] });
    input.header = "X-Other";
    assert.equal(r.value.header, "Idempotency-Key");
  });

  it("matches the shipped route-defaults for a mutating route", () => {
    const p = resolveEffectiveRoutePolicy({ method: "POST", path: "/orders", handler: "createOrder" });
    assert.equal(p.idempotency.enabled, true);
    const r = readIdempotencyReplayPolicy(basePolicy({ header: p.idempotency.header, ttlSeconds: p.idempotency.ttlSeconds, onDuplicate: p.idempotency.onDuplicate }));
    assert.equal(r.ok, true);
  });

  it("refuses non-plain inputs", () => {
    class P { constructor() { Object.assign(this, basePolicy()); } }
    for (const bad of [null, undefined, "x", 1, [basePolicy()], new P()]) {
      const d = refusal(bad);
      assert.equal(d.code, FUNGI_APPK_IDR_001);
      assert.equal(d.field, "record");
    }
    assert.equal(readIdempotencyReplayPolicy(Object.assign(Object.create(null), basePolicy())).ok, true);
  });

  it("refuses unknown and symbol keys without echoing them", () => {
    const d = refusal({ ...basePolicy(), sk_live_leakyKeyName: 1 });
    assert.equal(d.code, FUNGI_APPK_IDR_001);
    assert.ok(!JSON.stringify(d).includes("sk_live_leakyKeyName"));
    assert.equal(refusal({ ...basePolicy(), [Symbol("x")]: 1 }).code, FUNGI_APPK_IDR_001);
  });

  it("refuses each missing required field by name", () => {
    for (const field of IDEMPOTENCY_REPLAY_POLICY_FIELDS.filter((f) => f !== "diagnostics")) {
      const input = basePolicy();
      delete input[field];
      const d = refusal(input);
      assert.equal(d.code, FUNGI_APPK_IDR_001);
      assert.equal(d.field, field);
    }
  });

  it("refuses accessors without running them", () => {
    let ran = false;
    const input = basePolicy();
    Object.defineProperty(input, "ttlSeconds", { enumerable: true, get() { ran = true; return 60; } });
    assert.equal(refusal(input).code, FUNGI_APPK_IDR_001);
    assert.equal(ran, false);
  });

  it("refuses wrong schema and bad names", () => {
    assert.equal(refusal(basePolicy({ schema: "galerina.app-kernel.idempotency-replay-policy/v2" })).field, "schema");
    for (const name of ["", "lower", "Has Space", "A".repeat(65), 1]) {
      const d = refusal(basePolicy({ name }));
      assert.equal(d.code, FUNGI_APPK_IDR_002);
      assert.equal(d.field, "name");
    }
  });

  it("header must be a bounded HTTP token", () => {
    assert.equal(readIdempotencyReplayPolicy(basePolicy({ header: "X-Request-Id" })).ok, true);
    for (const header of ["", "Bad Header", "Idem:Key", "x".repeat(65), "Key\r\nSet-Cookie", "Kl\u00fcssel", 7, null]) {
      const d = refusal(basePolicy({ header }));
      assert.equal(d.code, FUNGI_APPK_IDR_003);
      assert.equal(d.field, "header");
      if (typeof header === "string" && header.length > 0) assert.ok(!d.message.includes(header));
    }
  });

  it("ttlSeconds and maxKeyBytes are bounded positive safe integers", () => {
    assert.equal(readIdempotencyReplayPolicy(basePolicy({ ttlSeconds: IDEMPOTENCY_TTL_SECONDS_MAX, maxKeyBytes: IDEMPOTENCY_MAX_KEY_BYTES_MAX })).ok, true);
    assert.equal(readIdempotencyReplayPolicy(basePolicy({ ttlSeconds: 1, maxKeyBytes: 1 })).ok, true);
    for (const v of [0, -1, 1.5, NaN, Infinity, "60", null]) {
      assert.equal(refusal(basePolicy({ ttlSeconds: v })).field, "ttlSeconds");
      assert.equal(refusal(basePolicy({ maxKeyBytes: v })).field, "maxKeyBytes");
    }
    assert.equal(refusal(basePolicy({ ttlSeconds: IDEMPOTENCY_TTL_SECONDS_MAX + 1 })).code, FUNGI_APPK_IDR_002);
    assert.equal(refusal(basePolicy({ maxKeyBytes: IDEMPOTENCY_MAX_KEY_BYTES_MAX + 1 })).code, FUNGI_APPK_IDR_002);
  });

  it("every behaviour field admits only its fail-closed value", () => {
    const relaxations = {
      mutatingMethods: ["optional", "disabled"],
      missingKey: ["allow", "generate"],
      onDuplicate: ["allow", "Reject"],
      storeFailure: ["allow", "bypass"],
      claim: ["read-then-write", "observe"],
      claimAfterGates: ["optional"],
      scope: ["global", "principal"],
      echoKey: ["allow"],
    };
    for (const [field, values] of Object.entries(relaxations)) {
      for (const value of [...values, undefined, null, true]) {
        const d = refusal(basePolicy({ [field]: value }));
        assert.equal(d.code, FUNGI_APPK_IDR_002, `${field}=${String(value)}`);
        assert.equal(d.field, field);
        if (typeof value === "string") assert.ok(!d.message.includes(value));
      }
    }
  });

  it("onDuplicate replay is reserved, as route admission refuses it", () => {
    const d = refusal(basePolicy({ onDuplicate: "replay" }));
    assert.equal(d.code, FUNGI_APPK_IDR_002);
    assert.match(d.message, /reserved/);
  });

  it("input diagnostics must be a closed empty list", () => {
    assert.equal(refusal(basePolicy({ diagnostics: "none" })).code, FUNGI_APPK_IDR_004);
    assert.equal(refusal(basePolicy({ diagnostics: [{ code: "X" }] })).code, FUNGI_APPK_IDR_004);
    const sparse = [];
    sparse.length = 2;
    assert.equal(refusal(basePolicy({ diagnostics: sparse })).code, FUNGI_APPK_IDR_004);
    const d = refusal(basePolicy({ diagnostics: [{ code: "C", severity: "error", message: "m", field: "record" }] }));
    assert.equal(d.code, FUNGI_APPK_IDR_005);
  });

  it("create never throws and returns a refused fail-closed shape", () => {
    const hostile = new Proxy({}, { ownKeys() { throw new Error("boom"); } });
    const created = createIdempotencyReplayPolicy(hostile);
    assert.equal(created.name, "Refused");
    assert.equal(created.diagnostics[0].code, FUNGI_APPK_IDR_001);
    assert.equal(created.onDuplicate, "reject");
    assert.equal(created.claim, "atomic");
    assert.equal(created.echoKey, "deny");
    assert.ok(Object.isFrozen(created));
  });
});