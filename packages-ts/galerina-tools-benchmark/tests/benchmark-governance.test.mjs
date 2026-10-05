import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BENCHMARK_STATE_PATH,
  BENCHMARK_SUBMIT_CONFIRMATION,
  DEFAULT_BENCHMARK_CONFIG,
  createShareableBenchmarkReport,
  decideBenchmarkAutoRun,
  isBenchmarkReportShareable,
  parseBenchmarkState,
  prepareBenchmarkSubmission,
  serializeBenchmarkState,
  validateBenchmarkReport,
} from "../dist/index.js";

const example = JSON.parse(readFileSync(new URL("../examples/benchmark-report.example.json", import.meta.url), "utf8"));
const optIn = { ...DEFAULT_BENCHMARK_CONFIG, privacy: { ...DEFAULT_BENCHMARK_CONFIG.privacy, allowSubmit: true } };
const leaky = () => ({
  ...structuredClone(example),
  hostname: "alice-desktop",
  username: "alice",
  projectPath: "C:\\Users\\alice\\secret-project", // path-leak-audit:allow (deliberate leak fixture)
  env: { HOME: "/home/alice", API_TOKEN: "x" }, // path-leak-audit:allow (deliberate leak fixture)
  system: { ...structuredClone(example.system), hostname: "alice-desktop", cwd: "/home/alice/p" }, // path-leak-audit:allow (deliberate leak fixture)
  tests: example.tests.map((t, i) => (i === 0 ? { ...t, reason: "failed at /home/alice/p/x.lo", user: "alice" } : t)), // path-leak-audit:allow (deliberate leak fixture)
  privacy: { ...example.privacy, hostname: "alice-desktop" },
});

describe("createShareableBenchmarkReport", () => {
  it("drops hostname, username, project path and env fields by rebuilding from allowlists", () => {
    const r = createShareableBenchmarkReport(leaky(), optIn);
    assert.equal(r.status, "SHAREABLE");
    for (const f of ["report.hostname", "report.username", "report.projectPath", "report.env", "report.system.hostname", "report.system.cwd", "report.tests.0.user"]) assert.ok(r.removedFields.includes(f), f);
    const text = JSON.stringify(r.report);
    for (const leak of ["alice", "secret-project", "API_TOKEN", "/home"]) assert.ok(!text.includes(leak), leak);
    assert.equal(r.redactedReasons, 1);
    assert.equal(r.report.tests[0].reason, "redacted");
    assert.deepEqual(validateBenchmarkReport(r.report), []);
    assert.equal(isBenchmarkReportShareable(r.report, optIn), true);
    assert.ok(Object.isFrozen(r.report));
  });
  it("still sanitises without opt-in but marks the report not shareable", () => {
    const r = createShareableBenchmarkReport(leaky(), DEFAULT_BENCHMARK_CONFIG);
    assert.equal(r.status, "SHAREABLE");
    assert.equal(r.report.privacy.shareable, false);
    assert.ok(!JSON.stringify(r.report).includes("alice"));
  });
  it("refuses non-records and structurally invalid reports", () => {
    assert.equal(createShareableBenchmarkReport("x", optIn).status, "REFUSED");
    assert.equal(createShareableBenchmarkReport({ ...structuredClone(example), mode: "turbo" }, optIn).status, "REFUSED");
  });
});

describe("benchmark state and major-version auto-run", () => {
  const base = { currentVersion: "2.0.0", environment: "development", config: DEFAULT_BENCHMARK_CONFIG };
  it("pins the state path and round-trips state strictly", () => {
    assert.equal(BENCHMARK_STATE_PATH, ".fungi/benchmark-state.json");
    const text = serializeBenchmarkState("1.4.2");
    assert.deepEqual(parseBenchmarkState(text).state, { schema: "Galerina.benchmark.state.v1", lastGalerinaVersion: "1.4.2" });
    assert.equal(parseBenchmarkState('{"schema":"Galerina.benchmark.state.v1","lastGalerinaVersion":"1.0.0","x":1}').ok, false);
    assert.equal(parseBenchmarkState("not json").ok, false);
    assert.throws(() => serializeBenchmarkState("v1"));
  });
  it("runs only on a major increase in development", () => {
    const d = decideBenchmarkAutoRun({ ...base, stateText: serializeBenchmarkState("1.9.9") });
    assert.deepEqual([d.run, d.reason], [true, "MAJOR_VERSION_CHANGED"]);
    assert.equal(parseBenchmarkState(d.nextStateText).state.lastGalerinaVersion, "2.0.0");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: serializeBenchmarkState("2.0.0-beta.1") }).reason, "NO_MAJOR_CHANGE");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: serializeBenchmarkState("3.0.0") }).run, false);
  });
  it("never runs in production, outside development, when disabled, on first run or bad state", () => {
    const st = serializeBenchmarkState("1.0.0");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: st, environment: "production" }).reason, "NEVER_IN_PRODUCTION");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: st, environment: "staging" }).reason, "NOT_DEVELOPMENT");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: st, config: { ...DEFAULT_BENCHMARK_CONFIG, runOnMajorUpdate: false } }).reason, "DISABLED_BY_CONFIG");
    const first = decideBenchmarkAutoRun({ ...base, stateText: "" });
    assert.deepEqual([first.run, first.reason], [false, "FIRST_RUN_RECORDED"]);
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: "{}" }).reason, "STATE_INVALID");
    assert.equal(decideBenchmarkAutoRun({ ...base, stateText: st, currentVersion: "latest" }).reason, "VERSION_INVALID");
  });
});

describe("prepareBenchmarkSubmission placeholder", () => {
  it("needs the exact confirmation and opt-in, and never uses the network", () => {
    assert.equal(prepareBenchmarkSubmission(example, optIn, "yes").status, "REFUSED");
    const noOpt = prepareBenchmarkSubmission(example, DEFAULT_BENCHMARK_CONFIG, BENCHMARK_SUBMIT_CONFIRMATION);
    assert.deepEqual([noOpt.status, noOpt.diagnostics[0].code], ["REFUSED", "Galerina_BENCHMARK_SUBMIT_NOT_OPTED_IN"]);
    const ok = prepareBenchmarkSubmission(leaky(), optIn, BENCHMARK_SUBMIT_CONFIRMATION);
    assert.equal(ok.status, "NOT_SUBMITTED_PLACEHOLDER");
    assert.equal(ok.networkUsed, false);
    assert.equal(ok.payload.anonymous, true);
    assert.equal(ok.payload.schema, "Galerina.benchmark.submit.v1");
    assert.ok(!JSON.stringify(ok.payload).includes("alice"));
  });
});
