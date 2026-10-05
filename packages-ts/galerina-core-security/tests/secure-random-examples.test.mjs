import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNGI_SEC_SRN_001,
  FUNGI_SEC_SRN_002,
  FUNGI_SEC_SRN_003,
  FUNGI_SEC_SRN_004,
  FUNGI_SEC_SRN_005,
  SECURE_RANDOM_EXAMPLES_SCHEMA,
  SECURE_RANDOM_PURPOSES,
  RANDOMNESS_SOURCES,
  SECURE_RANDOM_DIAGNOSTIC_EXAMPLES,
  readSecureRandomExamples,
  lookupSecureRandomExample,
} from "../dist/index.js";

const ex = (o = {}) => ({
  purpose: "token",
  source: "Random",
  verdict: "denied",
  severity: "error",
  code: "example.random.forbidden",
  safeMessage: "Random must not be used for secrets, keys, tokens, salts or nonces.",
  ...o,
});

const report = (examples, o = {}) => ({
  schema: SECURE_RANDOM_EXAMPLES_SCHEMA,
  examples,
  complete: false,
  diagnostics: [],
  ...o,
});

const codeOf = (r) => (r.ok ? "ok" : r.diagnostics[0]?.code);

test("baseline catalog covers every purpose x source with the deny-first matrix", () => {
  assert.equal(SECURE_RANDOM_DIAGNOSTIC_EXAMPLES.length, SECURE_RANDOM_PURPOSES.length * RANDOMNESS_SOURCES.length);
  assert.equal(Object.isFrozen(SECURE_RANDOM_DIAGNOSTIC_EXAMPLES), true);
  const keys = SECURE_RANDOM_DIAGNOSTIC_EXAMPLES.map((e) => `${e.purpose}\u0000${e.source}`);
  assert.deepEqual(keys, [...keys].sort());
  for (const purpose of SECURE_RANDOM_PURPOSES) {
    for (const source of RANDOMNESS_SOURCES) {
      const r = lookupSecureRandomExample(purpose, source);
      assert.equal(r.ok, true);
      if (!r.ok) continue;
      if (source === "Random") {
        assert.equal(r.value.verdict, "denied");
        assert.equal(r.value.severity, "error");
        assert.equal(r.value.code, "example.random.forbidden");
      } else {
        assert.equal(r.value.verdict, "allowed");
        assert.equal(r.value.severity, "info");
        assert.equal(r.value.code, "example.secure-random.required");
      }
    }
  }
  for (const bad of [["tokenXYZ", "Random"], ["token", "Math.random"], [null, "Random"], ["token", Number.NaN]]) {
    const m = lookupSecureRandomExample(bad[0], bad[1]);
    assert.equal(codeOf(m), FUNGI_SEC_SRN_005);
    assert.equal(JSON.stringify(m).includes("XYZ"), false);
    assert.equal(JSON.stringify(m).includes("Math"), false);
  }
});

test("complete baseline report round-trips frozen", () => {
  const r = readSecureRandomExamples(report([...SECURE_RANDOM_DIAGNOSTIC_EXAMPLES], { complete: true }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.examples.length, 10);
  assert.equal(r.value.complete, true);
  assert.equal(Object.isFrozen(r.value), true);
  assert.equal(Object.isFrozen(r.value.examples[0]), true);
});

test("incomplete subsets round-trip when ordered; complete requires exact baseline", () => {
  const subset = [
    ex({ purpose: "key", source: "Random" }),
    ex({
      purpose: "key",
      source: "SecureRandom",
      verdict: "allowed",
      severity: "info",
      code: "example.secure-random.required",
      safeMessage: "SecureRandom is required for security randomness.",
    }),
  ];
  assert.equal(codeOf(readSecureRandomExamples(report(subset))), "ok");
  assert.equal(codeOf(readSecureRandomExamples(report(subset, { complete: true }))), FUNGI_SEC_SRN_005);
  const swapped = [SECURE_RANDOM_DIAGNOSTIC_EXAMPLES[1], SECURE_RANDOM_DIAGNOSTIC_EXAMPLES[0]];
  assert.equal(codeOf(readSecureRandomExamples(report(swapped, { complete: true }))), FUNGI_SEC_SRN_003);
});

test("rule matrix refuses Random-as-allowed and SecureRandom-as-denied / wrong severity / code / message", () => {
  const cases = [
    [ex({ verdict: "allowed" }), FUNGI_SEC_SRN_003],
    [ex({ severity: "info" }), FUNGI_SEC_SRN_003],
    [ex({ code: "example.secure-random.required" }), FUNGI_SEC_SRN_003],
    [ex({ safeMessage: "ok actually" }), FUNGI_SEC_SRN_003],
    [ex({
      source: "SecureRandom",
      verdict: "denied",
      severity: "error",
      code: "example.random.forbidden",
      safeMessage: "Random must not be used for secrets, keys, tokens, salts or nonces.",
    }), FUNGI_SEC_SRN_003],
    [ex({ purpose: "password" }), FUNGI_SEC_SRN_002],
    [ex({ source: "CSPRNG" }), FUNGI_SEC_SRN_002],
    [ex({ verdict: "review" }), FUNGI_SEC_SRN_002],
    [ex({ severity: "warning" }), FUNGI_SEC_SRN_002],
    [ex({ code: "Galerina_SECURITY_INSECURE_RANDOM" }), FUNGI_SEC_SRN_002],
    [ex({ safeMessage: "" }), FUNGI_SEC_SRN_002],
  ];
  for (const [e, code] of cases) assert.equal(codeOf(readSecureRandomExamples(report([e]))), code);
  assert.equal(codeOf(readSecureRandomExamples(report([ex(), ex()]))), FUNGI_SEC_SRN_003);
});

test("closed shapes refuse unknown keys, missing fields, null, NaN, undefined and wrong schema without echo", () => {
  const extra = readSecureRandomExamples({ ...report([ex()]), secretTokenXYZ: "sk-live-XYZ" });
  assert.equal(codeOf(extra), FUNGI_SEC_SRN_001);
  assert.equal(JSON.stringify(extra).includes("XYZ"), false);
  const { complete: _c, ...missing } = report([ex()]);
  assert.equal(codeOf(readSecureRandomExamples(missing)), FUNGI_SEC_SRN_001);
  for (const bad of [null, undefined, Number.NaN, "x", [], 1]) {
    assert.equal(codeOf(readSecureRandomExamples(bad)), FUNGI_SEC_SRN_001);
  }
  assert.equal(codeOf(readSecureRandomExamples(report([ex()], { schema: "galerina.security.random" }))), FUNGI_SEC_SRN_002);
  assert.equal(codeOf(readSecureRandomExamples(report([ex({ keyXYZ: 1 })]))), FUNGI_SEC_SRN_001);
  assert.equal(codeOf(readSecureRandomExamples(report([null]))), FUNGI_SEC_SRN_004);
  assert.equal(codeOf(readSecureRandomExamples(report({ 0: ex(), length: 1 }))), FUNGI_SEC_SRN_004);
  assert.equal(codeOf(readSecureRandomExamples(report([ex()], { complete: undefined }))), FUNGI_SEC_SRN_002);
  const d = { code: "X", severity: "error", message: "m", field: "examples" };
  assert.equal(codeOf(readSecureRandomExamples(report([ex()], { diagnostics: [d] }))), FUNGI_SEC_SRN_005);
});

test("hostile getters, proxies and sparse arrays refuse without running getters or throwing", () => {
  let ran = false;
  const getterEx = ex();
  Object.defineProperty(getterEx, "source", { get() { ran = true; return "Random"; }, enumerable: true });
  assert.equal(codeOf(readSecureRandomExamples(report([getterEx]))), FUNGI_SEC_SRN_004);
  const proxy = new Proxy(report([ex()]), {
    ownKeys() { throw new Error("boom"); },
    getOwnPropertyDescriptor() { throw new Error("boom"); },
  });
  assert.doesNotThrow(() => readSecureRandomExamples(proxy));
  assert.equal(codeOf(readSecureRandomExamples(proxy)), FUNGI_SEC_SRN_001);
  const sparse = [ex()];
  sparse.length = 2;
  assert.equal(codeOf(readSecureRandomExamples(report(sparse))), FUNGI_SEC_SRN_004);
  const sym = report([ex()]);
  sym[Symbol("s")] = 1;
  assert.equal(codeOf(readSecureRandomExamples(sym)), FUNGI_SEC_SRN_001);
  class Box { constructor() { Object.assign(this, report([ex()])); } }
  assert.equal(codeOf(readSecureRandomExamples(new Box())), FUNGI_SEC_SRN_001);
  assert.equal(ran, false);
});
