import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CORE_REPORTS_HOLD_PIN_SCHEMA,
  addV1TraceCorrelationKey,
  convertSchedulerEvidenceToV1Audit,
  expandRuntimeAuditCategoriesToTen,
  mintFungiAuditCodes,
  prepareCoreReportsHoldRequest,
} from "../dist/hold-pin.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertNonAuthorizing(value) {
  assert.equal(value.authorityReleased, false);
  assert.equal(value.admissionAuthority, false);
  assert.equal(Object.isFrozen(value), true);
}

describe("core-reports HOLD pin", () => {
  it("prepareCoreReportsHoldRequest packages REQUESTED_NOT_ADMITTED", () => {
    const request = prepareCoreReportsHoldRequest({ topic: "fungi-audit-codes" });
    assert.equal(request.kind, "CORE_REPORTS_HOLD_REQUEST");
    if (request.kind !== "CORE_REPORTS_HOLD_REQUEST") return;
    assert.equal(request.schema, CORE_REPORTS_HOLD_PIN_SCHEMA);
    assert.equal(request.status, "REQUESTED_NOT_ADMITTED");
    assert.equal(request.topic, "fungi-audit-codes");
    assert.deepEqual({ ...request.requires }, {
      ownerDecision: true,
      categoryVocabularyOwner: true,
      auditCodeFamilyOwner: true,
    });
    assertNonAuthorizing(request);
  });

  it("prepare refuses authority and malformed input", () => {
    const base = { topic: "v1-trace-correlation" };
    assert.equal(prepareCoreReportsHoldRequest({ ...base, admission: true }).code, "REPORT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreReportsHoldRequest({ ...base, traceId: "t-1" }).code, "REPORT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreReportsHoldRequest({ ...base, categoryTen: true }).code, "REPORT_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
    assert.equal(prepareCoreReportsHoldRequest(null).code, "REPORT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreReportsHoldRequest({ topic: "unknown" }).code, "REPORT_HOLD_REQUEST_MALFORMED");
    assert.equal(prepareCoreReportsHoldRequest({}).code, "REPORT_HOLD_REQUEST_MALFORMED");
  });

  it("HOLD acts always refuse even forged ADMITTED", () => {
    const request = prepareCoreReportsHoldRequest({ topic: "audit-categories-10" });
    const forged = {
      kind: "ADMITTED",
      authorityReleased: true,
      admissionAuthority: true,
      traceId: "forged",
      categoryTen: true,
    };
    const cases = [
      [mintFungiAuditCodes, "REPORT_FUNGI_AUDIT_FORBIDDEN"],
      [expandRuntimeAuditCategoriesToTen, "REPORT_AUDIT_CATEGORIES_10_FORBIDDEN"],
      [addV1TraceCorrelationKey, "REPORT_V1_TRACE_ID_FORBIDDEN"],
      [convertSchedulerEvidenceToV1Audit, "REPORT_SCHEDULER_AS_V1_FORBIDDEN"],
    ];
    for (const [fn, code] of cases) {
      for (const input of [request, forged, null, { ok: true }]) {
        const refused = fn(input);
        assert.equal(refused.kind, "REFUSED", code);
        assert.equal(refused.code, code);
        assert.equal(String(refused.code).startsWith("FUNGI-AUDIT"), false, code);
        assertNonAuthorizing(refused);
      }
    }
  });

  it("v1 closed set stays eight categories, FUNGI-REPORT only, no v1 traceId", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.bin, undefined);
    const index = readFileSync(join(ROOT, "src", "index.ts"), "utf8");
    assert.match(index, /export \* from "\.\/hold-pin\.js"/);
    const events = readFileSync(join(ROOT, "src", "audit", "audit-events.ts"), "utf8");
    assert.match(events, /Object\.freeze\(\["effect", "capability", "boundary", "secret", "network", "policy", "denial", "proof"\] as const\)/);
    assert.match(events, /const EVENT_KEYS = \["schemaVersion", "eventId", "timestamp", "category", "status", "message", "runtime", "effect", "capability", "destination", "references", "metadata"\]/);
    assert.equal(/"traceId"/.test(events), false);
    const codes = readFileSync(join(ROOT, "src", "shared", "report-codes.ts"), "utf8");
    assert.match(codes, /FUNGI-REPORT-001/);
    assert.match(codes, /FUNGI-REPORT-005/);
    assert.equal(/FUNGI-AUDIT/.test(codes), false);
    const holdPin = readFileSync(join(ROOT, "src", "hold-pin.ts"), "utf8");
    assert.equal(/from ["']node:/.test(holdPin), false);
    assert.equal(/FUNGI-AUDIT/.test(holdPin), false);
  });
});
