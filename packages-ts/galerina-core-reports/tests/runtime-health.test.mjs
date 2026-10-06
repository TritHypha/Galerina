import assert from "node:assert/strict";
import test from "node:test";
import {
  RUNTIME_HEALTH_FIELDS,
  RUNTIME_HEALTH_REPORT_FILE,
  serializeRuntimeHealth,
  validateRuntimeHealth,
} from "../dist/index.js";

// Exact example from docs/runtime-audit-log-schema-and-execution-proof.md section 30.
const docExample = () => ({
  timestamp: "2026-01-01T12:00:00Z",
  runtime: "galerina-runtime",
  cpuLoad: 0.52,
  memoryUsageMb: 512,
  schedulerQueueDepth: 4,
  activeExecutions: 12,
  fallbackCount: 1,
  denialCount: 0,
});
const codes = (r) => (r.ok ? [] : r.diagnostics.map((d) => `${d.code}:${d.field}`));

test("documented fields, order and file name", () => {
  assert.deepEqual([...RUNTIME_HEALTH_FIELDS], ["timestamp", "runtime", "cpuLoad", "memoryUsageMb", "schedulerQueueDepth", "activeExecutions", "fallbackCount", "denialCount"]);
  assert.equal(RUNTIME_HEALTH_REPORT_FILE, "runtime-health.json");
  assert.equal(Object.isFrozen(RUNTIME_HEALTH_FIELDS), true);
});

test("the docs section 30 example validates to a detached frozen copy", () => {
  const input = docExample();
  const r = validateRuntimeHealth(input);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, docExample());
  assert.equal(Object.isFrozen(r.value), true);
  input.cpuLoad = 99;
  assert.equal(r.value.cpuLoad, 0.52);
  assert.equal(validateRuntimeHealth({ ...docExample(), cpuLoad: 3.5 }).ok, true, "load average above 1 is admitted (no upper bound picked)");
});

test("missing fields and unknown/symbol keys refuse without echoing the key", () => {
  const missing = docExample(); delete missing.denialCount;
  assert.deepEqual(codes(validateRuntimeHealth(missing)), ["FUNGI-REPORT-002:denialCount"]);
  for (const extra of [{ ...docExample(), sk_live_XYZsecretKEY: 1 }, { ...docExample(), [Symbol("symSecretXYZ")]: 1 }]) {
    const r = validateRuntimeHealth(extra);
    assert.deepEqual(codes(r), ["FUNGI-REPORT-002:record"]);
    assert.equal(JSON.stringify(r).includes("XYZ"), false);
  }
});

test("non-finite, negative, fractional and wrong-typed values refuse (no NaN/null collapse)", () => {
  for (const [field, bad] of [["cpuLoad", Number.NaN], ["cpuLoad", -0.1], ["cpuLoad", Infinity], ["cpuLoad", "0.5"], ["cpuLoad", null],
    ["memoryUsageMb", 1.5], ["memoryUsageMb", -1], ["schedulerQueueDepth", Number.MAX_SAFE_INTEGER + 1], ["activeExecutions", null], ["fallbackCount", undefined], ["denialCount", "0"]]) {
    assert.deepEqual(codes(validateRuntimeHealth({ ...docExample(), [field]: bad })), [`FUNGI-REPORT-002:${field}`], `${field}=${String(bad)}`);
  }
  for (const ts of ["2026-01-01 12:00:00", "2026-01-01T12:00:00+01:00", "2026-13-01T12:00:00Z", 0, null]) {
    assert.deepEqual(codes(validateRuntimeHealth({ ...docExample(), timestamp: ts })), ["FUNGI-REPORT-003:timestamp"]);
  }
  for (const rt of ["", "has space", 7, null, "x".repeat(200)]) {
    assert.deepEqual(codes(validateRuntimeHealth({ ...docExample(), runtime: rt })), ["FUNGI-REPORT-002:runtime"]);
  }
  assert.equal(validateRuntimeHealth({ ...docExample(), cpuLoad: -0 }).value.cpuLoad, 0);
  assert.equal(Object.is(validateRuntimeHealth({ ...docExample(), cpuLoad: -0 }).value.cpuLoad, -0), false);
});

// Built at runtime so the source holds no key-shaped literal (fake fixture, not a key).
const FAKE_SECRET_RUNTIME = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");

test("secret material in runtime refuses as FUNGI-REPORT-004 and is never echoed", () => {
  const r = validateRuntimeHealth({ ...docExample(), runtime: FAKE_SECRET_RUNTIME });
  assert.deepEqual(codes(r), ["FUNGI-REPORT-004:runtime"]);
  assert.equal(JSON.stringify(r).includes("abcdefghij"), false);
});

test("hostile getters, proxies, class instances and non-records refuse without throwing", () => {
  let ran = false;
  const getter = docExample();
  Object.defineProperty(getter, "cpuLoad", { get() { ran = true; return 0.5; }, enumerable: true });
  assert.deepEqual(codes(validateRuntimeHealth(getter)), ["FUNGI-REPORT-002:record"]);
  assert.equal(ran, false);
  const proxy = new Proxy(docExample(), { ownKeys() { throw new Error("boom"); } });
  assert.doesNotThrow(() => validateRuntimeHealth(proxy));
  assert.deepEqual(codes(validateRuntimeHealth(proxy)), ["FUNGI-REPORT-002:record"]);
  class Health { constructor() { Object.assign(this, docExample()); } }
  assert.deepEqual(codes(validateRuntimeHealth(new Health())), ["FUNGI-REPORT-002:record"]);
  for (const bad of [null, undefined, 1, "x", [], [docExample()]]) assert.deepEqual(codes(validateRuntimeHealth(bad)), ["FUNGI-REPORT-002:record"]);
});

test("serializeRuntimeHealth writes documented order and refuses invalid input", () => {
  const shuffled = { denialCount: 0, runtime: "galerina-runtime", fallbackCount: 1, timestamp: "2026-01-01T12:00:00Z", activeExecutions: 12, cpuLoad: 0.52, schedulerQueueDepth: 4, memoryUsageMb: 512 };
  const s = serializeRuntimeHealth(shuffled);
  assert.equal(typeof s, "string");
  assert.deepEqual(Object.keys(JSON.parse(s)), [...RUNTIME_HEALTH_FIELDS]);
  assert.deepEqual(JSON.parse(s), docExample());
  assert.equal(s.endsWith("\n"), true);
  assert.equal(serializeRuntimeHealth({ ...docExample(), cpuLoad: Number.NaN }), undefined);
  assert.equal(serializeRuntimeHealth(new Proxy({}, { getPrototypeOf() { throw new Error("x"); } })), undefined);
});
