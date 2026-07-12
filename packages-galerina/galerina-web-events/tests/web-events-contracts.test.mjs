import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_EVENT_PAYLOAD_FIELD_KINDS,
  KNOWN_EVENT_PROPAGATION_POLICIES,
  KNOWN_SENSITIVE_CAPABILITIES,
  KNOWN_WEB_EVENT_KINDS,
  WEB_EVENTS_CHECKS,
  createWebEventReport,
  deriveWebEventsReportStatus,
  validateEventPayloadField,
  validateEventRatePolicy,
  validateSensitiveCapabilityDeclaration,
  validateWebEventContract,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const goodEvent = {
  name: "add-to-basket",
  kind: "click",
  payload: [
    { name: "productId", kind: "string" },
    { name: "quantity", kind: "integer" },
  ],
  propagation: "stop",
  rate: { debounceMs: 250 },
};

const sensitiveEvent = {
  name: "copy-share-link",
  kind: "click",
  payload: [{ name: "url", kind: "string" }],
  propagation: "stop",
  sensitive: {
    capabilities: ["clipboard"],
    requiresUserGesture: true,
  },
};

describe("typed event contracts — kinds from the known set", () => {
  it("declares exactly click, input, submit and navigation", () => {
    assert.deepEqual(KNOWN_WEB_EVENT_KINDS, ["click", "input", "submit", "navigation"]);
  });

  it("accepts a typed event of every known kind", () => {
    for (const kind of KNOWN_WEB_EVENT_KINDS) {
      assert.deepEqual(codes(validateWebEventContract({ ...goodEvent, kind })), [], kind);
    }
  });

  it("REJECTS an unknown event kind instead of defaulting it", () => {
    for (const kind of ["hover", "scroll", "", undefined]) {
      const diags = validateWebEventContract({ ...goodEvent, kind });
      assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_EVENT_KIND_UNKNOWN"], String(kind));
      assert.equal(diags[0].severity, "error");
    }
  });

  it("requires an event name", () => {
    const diags = validateWebEventContract({ ...goodEvent, name: " " });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_EVENT_NAME_REQUIRED"]);
  });
});

describe("payload validation — fields declare kinds from the known set", () => {
  it("accepts every known payload field kind", () => {
    for (const kind of KNOWN_EVENT_PAYLOAD_FIELD_KINDS) {
      assert.deepEqual(codes(validateEventPayloadField({ name: "f", kind })), [], kind);
    }
  });

  it("rejects unknown payload kinds and unnamed fields", () => {
    const diags = validateWebEventContract({
      ...goodEvent,
      payload: [
        { name: "", kind: "string" },
        { name: "blob", kind: "object" },
      ],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_EVENTS_PAYLOAD_FIELD_KIND_UNKNOWN",
      "Galerina_WEB_EVENTS_PAYLOAD_FIELD_NAME_REQUIRED",
    ]);
  });
});

describe("debounce/throttle — bounded and non-contradictory", () => {
  it("accepts a debounce-only and a throttle-only policy", () => {
    assert.deepEqual(codes(validateEventRatePolicy({ debounceMs: 100 })), []);
    assert.deepEqual(codes(validateEventRatePolicy({ throttleMs: 100 })), []);
    assert.deepEqual(codes(validateEventRatePolicy({})), []);
  });

  it("requires positive integer bounds", () => {
    for (const value of [0, -1, 1.5, Number.NaN]) {
      assert.deepEqual(
        codes(validateEventRatePolicy({ debounceMs: value })),
        ["Galerina_WEB_EVENTS_DEBOUNCE_BOUND_INVALID"],
        `debounce ${value}`,
      );
      assert.deepEqual(
        codes(validateEventRatePolicy({ throttleMs: value })),
        ["Galerina_WEB_EVENTS_THROTTLE_BOUND_INVALID"],
        `throttle ${value}`,
      );
    }
  });

  it("ERRORS when debounce and throttle are declared on the same event", () => {
    const diags = validateEventRatePolicy({ debounceMs: 100, throttleMs: 100 });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_RATE_POLICY_CONTRADICTION"]);
    assert.equal(diags[0].severity, "error");
  });
});

describe("propagation policy — from the known set", () => {
  it("accepts every known propagation policy", () => {
    for (const propagation of KNOWN_EVENT_PROPAGATION_POLICIES) {
      const diags = validateWebEventContract({ ...goodEvent, propagation });
      assert.deepEqual(codes(diags), [], propagation);
    }
  });

  it("rejects an unknown propagation policy", () => {
    const diags = validateWebEventContract({ ...goodEvent, propagation: "bubble" });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_PROPAGATION_POLICY_UNKNOWN"]);
  });
});

describe("user-gesture requirement — literal true, re-checked at runtime", () => {
  it("accepts a gesture-gated sensitive capability declaration", () => {
    assert.deepEqual(codes(validateWebEventContract(sensitiveEvent)), []);
  });

  it("declares exactly the four sensitive capabilities", () => {
    assert.deepEqual(KNOWN_SENSITIVE_CAPABILITIES, [
      "clipboard",
      "fullscreen",
      "permission_request",
      "download",
    ]);
  });

  it("fails closed when an untyped caller sets requiresUserGesture false", () => {
    const diags = validateSensitiveCapabilityDeclaration({
      capabilities: ["download"],
      requiresUserGesture: false,
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects an unknown sensitive capability", () => {
    const diags = validateSensitiveCapabilityDeclaration({
      capabilities: ["geolocation"],
      requiresUserGesture: true,
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_CAPABILITY_UNKNOWN"]);
  });

  it("warns when the gesture gate protects an empty capability list", () => {
    const diags = validateSensitiveCapabilityDeclaration({
      capabilities: [],
      requiresUserGesture: true,
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_EVENTS_CAPABILITIES_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("createWebEventReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for clean events", () => {
    const report = createWebEventReport({ events: [goodEvent, sensitiveEvent] });
    assert.equal(report.eventCount, 2);
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_EVENTS_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("fails the userGesture check when a sensitive handler skips the gesture", () => {
    const report = createWebEventReport({
      events: [
        {
          ...sensitiveEvent,
          sensitive: { capabilities: ["clipboard"], requiresUserGesture: false },
        },
      ],
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED",
    ]);
    assert.equal(report.checks.userGesture, "fail");
    assert.equal(report.checks.events, "pass");
    assert.equal(report.checks.payload, "pass");
    assert.equal(report.checks.rate, "pass");
    assert.equal(report.checks.propagation, "pass");
  });

  it("fails events, rate and propagation checks from their own diagnostics", () => {
    const report = createWebEventReport({
      events: [
        {
          name: "",
          kind: "hover",
          payload: [],
          propagation: "bubble",
          rate: { debounceMs: 100, throttleMs: 50 },
        },
      ],
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_EVENTS_EVENT_KIND_UNKNOWN",
      "Galerina_WEB_EVENTS_EVENT_NAME_REQUIRED",
      "Galerina_WEB_EVENTS_PROPAGATION_POLICY_UNKNOWN",
      "Galerina_WEB_EVENTS_RATE_POLICY_CONTRADICTION",
    ]);
    assert.equal(report.checks.events, "fail");
    assert.equal(report.checks.rate, "fail");
    assert.equal(report.checks.propagation, "fail");
    assert.equal(report.checks.payload, "pass");
    assert.equal(report.checks.userGesture, "pass");
  });

  it("reports partial with warning messages for an empty capability list", () => {
    const report = createWebEventReport({
      events: [
        {
          ...sensitiveEvent,
          sensitive: { capabilities: [], requiresUserGesture: true },
        },
      ],
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), ["Galerina_WEB_EVENTS_CAPABILITIES_EMPTY"]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_EVENTS_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebEventsReportStatus([]), "success");
    assert.equal(
      deriveWebEventsReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebEventsReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});
