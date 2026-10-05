// W01 G5: startup validation, build flags, test report and AI suggestion schemas.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateStartup,
  resolveBuildFlags,
  validateAppTestReport,
  evaluateBuildGate,
  validateAppAiSuggestions,
  renderAppAiSuggestionsMarkdown,
  createRuntimeConfigHandoff,
  STARTUP_REPORT_SCHEMA,
  APP_TEST_REPORT_SCHEMA,
  APP_AI_SUGGESTIONS_SCHEMA,
} from "../dist/index.js";

const manifest = (o = {}) => ({
  environment: {
    mode: "production",
    variables: [{ name: "APP_URL", required: true }],
    secrets: [{ name: "STRIPE_KEY", required: true }],
  },
  apiMethods: ["GET", "POST"],
  routes: [
    { method: "GET", path: "/health", handler: "health" },
    { method: "POST", path: "/hooks/pay", handler: "payHook" },
  ],
  listenPorts: [8443],
  inboundPorts: [8443],
  webhooks: [{ route: "/hooks/pay", hmac: true, replayWindowSeconds: 300, idempotencyKey: "event.id" }],
  packages: [{ name: "@galerina/web", version: "1.2.3" }],
  registry: [{ name: "@galerina/web", versions: ["1.2.3", "1.2.4"] }],
  ...o,
});
const fakeSecret = "sk-example-not-real"; // gitleaks:allow
const env = { APP_URL: "https://app.example", STRIPE_KEY: fakeSecret };
const failed = (r) => r.checks.filter((c) => !c.passed).map((c) => c.id);

describe("validateStartup report (L949)", () => {
  it("passes a complete manifest with ordered checks", () => {
    const r = validateStartup(manifest(), env);
    assert.equal(r.schema, STARTUP_REPORT_SCHEMA);
    assert.equal(r.pass, true);
    assert.deepEqual(r.checks.map((c) => c.id), [
      "required-env", "required-secrets", "api-methods", "inbound-ports",
      "route-handlers", "webhook-guards", "package-registry",
    ]);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.checks));
  });

  it("refuses malformed manifests (missing or surplus sections, accessors, proxies)", () => {
    const { webhooks, ...missing } = manifest();
    for (const bad of [missing, { ...manifest(), extra: 1 }, "x", [], new Proxy(manifest(), {})]) {
      const r = validateStartup(bad, env);
      assert.equal(r.pass, false);
      assert.equal(r.diagnostics[0].code, "FUNGI-CONFIG-031");
    }
    const getter = manifest();
    Object.defineProperty(getter, "routes", { get: () => [], enumerable: true });
    assert.equal(validateStartup(getter, env).pass, false);
  });
});

describe("env and secrets (L950, L951)", () => {
  it("missing or empty values fail; values are never echoed", () => {
    const r = validateStartup(manifest(), { APP_URL: "", STRIPE_KEY: undefined });
    assert.deepEqual(failed(r), ["required-env", "required-secrets"]);
    assert.ok(r.diagnostics.every((d) => d.code === "FUNGI-CONFIG-004"));
    const r2 = validateStartup(manifest(), { APP_URL: "https://app.example", STRIPE_KEY: "" });
    assert.deepEqual(failed(r2), ["required-secrets"]);
    assert.equal(JSON.stringify(validateStartup(manifest(), env)).includes(fakeSecret), false);
    assert.equal(JSON.stringify(r2).includes("app.example"), false);
  });

  it("non-production missing env still fails the check (warning severity)", () => {
    const m = manifest({ environment: { ...manifest().environment, mode: "development" } });
    const r = validateStartup(m, { STRIPE_KEY: fakeSecret });
    assert.deepEqual(failed(r), ["required-env"]);
    assert.equal(r.diagnostics[0].severity, "warning");
  });

  it("inherited environment keys are ignored", () => {
    const inherited = Object.create({ APP_URL: "x", STRIPE_KEY: "y" });
    assert.deepEqual(failed(validateStartup(manifest(), inherited)), ["required-env", "required-secrets"]);
  });
});

describe("api methods, ports, handlers (L952-L954)", () => {
  it("route method outside api_methods fails; unused method warns", () => {
    const r = validateStartup(manifest({ apiMethods: ["GET", "DELETE"] }), env);
    assert.ok(failed(r).includes("api-methods"));
    assert.ok(r.diagnostics.some((d) => d.code === "FUNGI-CONFIG-032"));
    assert.ok(r.diagnostics.some((d) => d.code === "FUNGI-CONFIG-033" && d.severity === "warning"));
    const unused = validateStartup(manifest({ apiMethods: ["GET", "POST", "PUT"] }), env);
    assert.equal(unused.pass, true);
    assert.equal(unused.diagnostics[0].code, "FUNGI-CONFIG-033");
    assert.equal(validateStartup(manifest({ apiMethods: ["GET", "POST", "TRACE"] }), env).pass, false);
  });

  it("undeclared listen ports fail; invalid ports are malformed", () => {
    assert.deepEqual(failed(validateStartup(manifest({ listenPorts: [8443, 9000] }), env)), ["inbound-ports"]);
    assert.equal(validateStartup(manifest({ listenPorts: [70000] }), env).diagnostics[0].code, "FUNGI-CONFIG-031");
  });

  it("blank handlers and duplicate routes fail", () => {
    const routes = [...manifest().routes, { method: "GET", path: "/health", handler: " " }];
    const r = validateStartup(manifest({ routes }), env);
    assert.deepEqual(failed(r), ["route-handlers"]);
    assert.equal(r.diagnostics.filter((d) => d.code === "FUNGI-CONFIG-035").length, 2);
  });
});

describe("webhooks and packages (L955, L956)", () => {
  it("webhooks need HMAC, replay window, idempotency and a POST route", () => {
    const hook = { route: "/hooks/other", hmac: false, replayWindowSeconds: 0, idempotencyKey: "" };
    const r = validateStartup(manifest({ webhooks: [hook] }), env);
    assert.deepEqual(failed(r), ["webhook-guards"]);
    assert.equal(r.diagnostics.filter((d) => d.code === "FUNGI-CONFIG-036").length, 4);
    const big = { route: "/hooks/pay", hmac: true, replayWindowSeconds: 86401, idempotencyKey: "id" };
    assert.equal(validateStartup(manifest({ webhooks: [big] }), env).pass, false);
  });

  it("packages must be pinned and present in the registry", () => {
    for (const version of ["^1.2.3", "~1.2.3", "latest", "1.x", ">=1.0.0", "*"]) {
      const r = validateStartup(manifest({ packages: [{ name: "@galerina/web", version }] }), env);
      assert.equal(r.diagnostics[0].code, "FUNGI-CONFIG-037", version);
    }
    const missing = validateStartup(manifest({ packages: [{ name: "@galerina/web", version: "9.9.9" }] }), env);
    assert.equal(missing.diagnostics[0].code, "FUNGI-CONFIG-038");
    const unknown = validateStartup(manifest({ packages: [{ name: "left-pad", version: "1.0.0" }] }), env);
    assert.equal(unknown.diagnostics[0].code, "FUNGI-CONFIG-038");
  });
});

describe("RuntimeConfigHandoff integration", () => {
  const project = { name: "demo", version: "1.0.0", root: ".", entryFiles: ["main.fungi"], packages: [], strict: true, governance: "full", targets: [], productionPackageOverrides: [] };
  const environment = { mode: "production", variables: [], secrets: [] };

  it("a failing startup manifest blocks canRun with FUNGI-CONFIG-039", () => {
    const h = createRuntimeConfigHandoff(project, environment, {
      availableEnvironment: {}, startupManifest: manifest(), generatedAt: "2026-10-05T00:00:00Z",
    });
    assert.equal(h.canRun, false);
    assert.equal(h.startup.pass, false);
    assert.ok(h.diagnostics.some((d) => d.code === "FUNGI-CONFIG-039"));
  });

  it("a passing manifest is attached and allows running", () => {
    const h = createRuntimeConfigHandoff(project, environment, {
      availableEnvironment: env, startupManifest: manifest(), generatedAt: "2026-10-05T00:00:00Z",
    });
    assert.equal(h.startup.pass, true);
    assert.equal(h.canRun, true);
  });

  it("requireStartupValidation refuses production without a manifest; default unchanged", () => {
    const strict = createRuntimeConfigHandoff(project, environment, {
      availableEnvironment: {}, productionPolicy: { requireStartupValidation: true }, generatedAt: "2026-10-05T00:00:00Z",
    });
    assert.ok(strict.diagnostics.some((d) => d.code === "FUNGI-CONFIG-043"));
    assert.equal(strict.canRun, false);
    const legacy = createRuntimeConfigHandoff(project, environment, { availableEnvironment: {}, generatedAt: "2026-10-05T00:00:00Z" });
    assert.equal(legacy.canRun, true);
    assert.equal("startup" in legacy, false);
  });
});

describe("resolveBuildFlags (L958-L960, L962, L963)", () => {
  it("defaults: nothing on except fail_on_test_failure", () => {
    const r = resolveBuildFlags([]);
    assert.equal(r.ok, true);
    assert.deepEqual({ ...r.flags }, { withTests: false, security: false, strict: false, failOnWarning: false, failOnTestFailure: true });
  });

  it("--with-tests and --security are independent", () => {
    assert.equal(resolveBuildFlags(["--with-tests"]).flags.withTests, true);
    assert.equal(resolveBuildFlags(["--with-tests"]).flags.security, false);
    assert.equal(resolveBuildFlags(["--security"]).flags.security, true);
  });

  it("--strict implies tests, security and fail_on_warning", () => {
    assert.deepEqual({ ...resolveBuildFlags(["--strict"]).flags }, { withTests: true, security: true, strict: true, failOnWarning: true, failOnTestFailure: true });
  });

  it("unknown, =value and positional flags are refused and resolve to strict", () => {
    for (const argv of [["--fast"], ["--strict=false"], ["app"], [1], "--strict"]) {
      const r = resolveBuildFlags(argv);
      assert.equal(r.ok, false);
      assert.equal(r.diagnostics[0].code, "FUNGI-CONFIG-040");
      assert.equal(r.flags.strict, true);
    }
  });
});

describe("C2 review hardening (NB-1..NB-3)", () => {
  it("env/secret records with surplus keys are malformed", () => {
    const m = manifest({ environment: { ...manifest().environment, secrets: [{ name: "STRIPE_KEY", required: true, value: fakeSecret }] } });
    const r = validateStartup(m, env);
    assert.equal(r.pass, false);
    assert.equal(r.diagnostics[0].code, "FUNGI-CONFIG-031");
    assert.equal(JSON.stringify(r).includes(fakeSecret), false);
  });

  it("arrays with extra non-index own keys are malformed", () => {
    const ports = [8443];
    ports.extra = 1;
    assert.equal(validateStartup(manifest({ listenPorts: ports }), env).diagnostics[0].code, "FUNGI-CONFIG-031");
    const argv = ["--strict"];
    argv[Symbol("x")] = 1;
    assert.equal(resolveBuildFlags(argv).ok, false);
  });

  it("FUNGI-CONFIG-040 never echoes positional arguments or flag values", () => {
    const r = resolveBuildFlags(["private-app/main.fungi", "--out=private-out/x", "--fast"]);
    const text = JSON.stringify(r.diagnostics);
    assert.equal(text.includes("private-app"), false);
    assert.equal(text.includes("private-out"), false);
    assert.ok(text.includes("--out=(value withheld)"));
    assert.ok(text.includes("--fast"));
    assert.equal(r.flags.strict, true);
  });
});

describe("app.test-report.json and build gate (L962-L964)", () => {
  const report = (o = {}) => ({
    schema: APP_TEST_REPORT_SCHEMA, passed: 3, failed: 0, skipped: 1, durationMs: 120,
    suites: [{ name: "a", passed: 2, failed: 0, skipped: 1 }, { name: "b", passed: 1, failed: 0, skipped: 0 }],
    ...o,
  });

  it("validates totals and shape", () => {
    assert.equal(validateAppTestReport(report()).ok, true);
    assert.equal(validateAppTestReport(report({ passed: 4 })).ok, false);
    assert.equal(validateAppTestReport(report({ failed: -1 })).ok, false);
    assert.equal(validateAppTestReport({ ...report(), extra: true }).ok, false);
    assert.equal(validateAppTestReport(report({ schema: "v0" })).diagnostics[0].code, "FUNGI-CONFIG-041");
  });

  it("fail_on_test_failure fails on any failed test in every mode", () => {
    const failing = report({ passed: 2, failed: 1, suites: [{ name: "a", passed: 2, failed: 1, skipped: 1 }] });
    const flags = resolveBuildFlags(["--with-tests"]).flags;
    const g = evaluateBuildGate({ flags, warningCount: 0, testReport: failing });
    assert.equal(g.pass, false);
    assert.match(g.reasons[0], /fail_on_test_failure/);
  });

  it("tests requested but no report fails closed", () => {
    assert.equal(evaluateBuildGate({ flags: resolveBuildFlags(["--with-tests"]).flags, warningCount: 0 }).pass, false);
  });

  it("fail_on_warning only under --strict or --fail-on-warning", () => {
    assert.equal(evaluateBuildGate({ flags: resolveBuildFlags([]).flags, warningCount: 2 }).pass, true);
    assert.equal(evaluateBuildGate({ flags: resolveBuildFlags(["--fail-on-warning"]).flags, warningCount: 2 }).pass, false);
    const strict = evaluateBuildGate({ flags: resolveBuildFlags(["--strict"]).flags, warningCount: 1, testReport: report() });
    assert.equal(strict.pass, false);
    assert.equal(evaluateBuildGate({ flags: resolveBuildFlags([]).flags, warningCount: -1 }).pass, false);
  });
});

describe("app.ai-suggestions.json / .md (L965, L966)", () => {
  const doc = (o = {}) => ({
    schema: APP_AI_SUGGESTIONS_SCHEMA,
    suggestions: [{ id: "add-timeout", severity: "warning", title: "Add a timeout <now>", detail: "Line one\nUse `timeout`.", path: "src/main.fungi" }],
    ...o,
  });

  it("admits valid suggestions", () => {
    assert.equal(validateAppAiSuggestions(doc()).ok, true);
    assert.equal(validateAppAiSuggestions(doc({ suggestions: [] })).ok, true);
  });

  it("refuses absolute paths, duplicates, bad severity, secrets and oversize lists", () => {
    const one = doc().suggestions[0];
    const cases = [
      [{ ...one, path: "/etc/passwd" }], // path-leak-audit:allow
      [{ ...one, path: "../x.fungi" }],
      [one, one],
      [{ ...one, severity: "critical" }],
      [{ ...one, detail: "password = hunter22secret" }], // gitleaks:allow
      [{ ...one, extra: 1 }],
      Array.from({ length: 201 }, (_, i) => ({ ...one, id: `s-${i}` })),
    ];
    for (const suggestions of cases) {
      const r = validateAppAiSuggestions(doc({ suggestions }));
      assert.equal(r.ok, false);
      assert.equal(r.diagnostics[0].code, "FUNGI-CONFIG-042");
    }
  });

  it("markdown is rendered from validated JSON only and escaped", () => {
    const r = renderAppAiSuggestionsMarkdown(doc());
    assert.equal(r.ok, true);
    assert.match(r.markdown, /## Add a timeout &lt;now&gt;/);
    assert.match(r.markdown, /> Use \\`timeout\\`\./);
    assert.deepEqual(renderAppAiSuggestionsMarkdown({ schema: "x" }), { ok: false, markdown: "" });
  });
});
