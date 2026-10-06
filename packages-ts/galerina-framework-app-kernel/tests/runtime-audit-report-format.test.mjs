import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_RAR_001,
  FUNGI_APPK_RAR_002,
  FUNGI_APPK_RAR_003,
  FUNGI_APPK_RAR_004,
  FUNGI_APPK_RAR_005,
  RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
  createRuntimeAuditReportFormat,
  readRuntimeAuditReportFormat,
} from "../dist/runtime-audit-report-format.js";

function baseFormat(overrides = {}) {
  return {
    schema: RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA,
    name: "DefaultKernelReports",
    defaultDecision: "deny",
    admittedReports: ["api-manifest", "auth", "security"],
    redaction: "required",
    includeSecrets: "deny",
    maxEventsPerReport: 1000,
    ...overrides,
  };
}

function hasNoHoles(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasNoHoles);
  if (typeof value === "object") return Object.values(value).every(hasNoHoles);
  return true;
}

describe("app-kernel runtime audit report format", () => {
  it("admits a closed runtime audit report format", () => {
    const result = readRuntimeAuditReportFormat(baseFormat({ diagnostics: [] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, RUNTIME_AUDIT_REPORT_FORMAT_SCHEMA);
    assert.equal(result.value.name, "DefaultKernelReports");
    assert.equal(result.value.defaultDecision, "deny");
    assert.deepEqual([...result.value.admittedReports], ["api-manifest", "auth", "security"]);
    assert.equal(result.value.redaction, "required");
    assert.equal(result.value.includeSecrets, "deny");
    assert.equal(result.value.maxEventsPerReport, 1000);
    assert.equal(result.value.diagnostics.length, 0);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.admittedReports), true);
    assert.equal(hasNoHoles(result.value), true);
  });

  it("refuses getters, symbols, custom prototypes and unknown keys without echo", () => {
    const hostile = baseFormat();
    let ran = false;
    Object.defineProperty(hostile, "secret", {
      get() {
        ran = true;
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createRuntimeAuditReportFormat(hostile);
    assert.equal(ran, false);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_RAR_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...baseFormat(), [Symbol("x")]: 1 };
    assert.equal(createRuntimeAuditReportFormat(withSymbol).diagnostics[0]?.code, FUNGI_APPK_RAR_001);

    const proto = Object.assign(Object.create({ inherited: true }), baseFormat());
    assert.equal(createRuntimeAuditReportFormat(proto).diagnostics[0]?.code, FUNGI_APPK_RAR_001);

    const unknown = { ...baseFormat(), extra: true };
    const unknownResult = createRuntimeAuditReportFormat(unknown);
    assert.equal(unknownResult.diagnostics[0]?.code, FUNGI_APPK_RAR_001);
    assert.equal(unknownResult.diagnostics.some((d) => /extra/i.test(d.message)), false);
  });

  it("refuses allow default, optional redaction, secret inclusion and unbound limits", () => {
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ defaultDecision: "allow" })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_002,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ redaction: "optional" })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_002,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ includeSecrets: "allow" })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_002,
    );
    for (const bad of [0, -1, NaN, Infinity, 100_001, 1.5]) {
      assert.equal(
        createRuntimeAuditReportFormat(baseFormat({ maxEventsPerReport: bad })).diagnostics[0]?.code,
        FUNGI_APPK_RAR_002,
      );
    }
  });

  it("refuses reserved idempotency report kind, unknown kinds, duplicates and unsorted lists", () => {
    const reserved = createRuntimeAuditReportFormat(
      baseFormat({ admittedReports: ["api-manifest", "idempotency"] }),
    );
    assert.equal(reserved.diagnostics[0]?.code, FUNGI_APPK_RAR_002);
    assert.equal(reserved.diagnostics[0]?.field, "idempotency");
    assert.equal(reserved.diagnostics.some((d) => /idempotency/i.test(d.message) && /sk_|token|path/i.test(d.message)), false);

    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ admittedReports: ["api-manifest", "not-a-kind"] })).diagnostics[0]
        ?.code,
      FUNGI_APPK_RAR_002,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ admittedReports: ["auth", "auth"] })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_003,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ admittedReports: ["security", "api-manifest"] })).diagnostics[0]
        ?.code,
      FUNGI_APPK_RAR_002,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ admittedReports: [] })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_003,
    );
    assert.equal(
      createRuntimeAuditReportFormat(baseFormat({ admittedReports: { 0: "auth", length: 1 } })).diagnostics[0]?.code,
      FUNGI_APPK_RAR_004,
    );
  });

  it("refuses non-empty input diagnostics and keeps refused placeholder distinguishable", () => {
    const nested = createRuntimeAuditReportFormat(
      baseFormat({
        diagnostics: [{ code: "X", severity: "error", message: "nope", field: "name" }],
      }),
    );
    assert.equal(nested.diagnostics[0]?.code, FUNGI_APPK_RAR_005);
    assert.equal(nested.name, "Refused");
    assert.equal(nested.admittedReports.length, 0);
    assert.equal(nested.maxEventsPerReport, 1);
    assert.ok(nested.diagnostics.length > 0);
  });

  it("create and read agree; never throws on hostile proxy", () => {
    const ok = createRuntimeAuditReportFormat(baseFormat({ diagnostics: [] }));
    assert.equal(ok.diagnostics.length, 0);
    const again = readRuntimeAuditReportFormat(ok);
    assert.equal(again.ok, true);

    const proxy = new Proxy(
      {},
      {
        get() {
          throw new Error("proxy-get");
        },
        ownKeys() {
          throw new Error("proxy-keys");
        },
        getOwnPropertyDescriptor() {
          throw new Error("proxy-desc");
        },
      },
    );
    const fromProxy = createRuntimeAuditReportFormat(proxy);
    assert.equal(fromProxy.diagnostics[0]?.code, FUNGI_APPK_RAR_001);
    assert.equal(fromProxy.name, "Refused");
  });
});
