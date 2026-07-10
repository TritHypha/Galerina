// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web-events (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: born fail-closed. web-events is the event boundary —
// raw browser Event objects never reach application logic; only typed, schema-validated payloads cross,
// and sensitive capabilities are gesture-gated (CWE-862). Each test exercises a governance/
// web-failclosed-contract.json invariant (E1..E4) with unknown -> DENY assertions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateEventPayloadField,
  validateSensitiveCapabilityDeclaration,
  validateWebEventContract,
  KNOWN_WEB_EVENT_KINDS,
  KNOWN_EVENT_PAYLOAD_FIELD_KINDS,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

const goodEvent = {
  name: "product-click",
  kind: "click",
  payload: [{ name: "productId", kind: "string" }],
  propagation: "allow",
};

describe("web-events fail-closed acceptance (FUNGI-WEB-030..031)", () => {
  it("E1 FUNGI-WEB-030 (CWE-862): only typed payload fields cross — a raw/untyped payload field is unrepresentable and DENIED", () => {
    // The payload field kinds are a closed scalar/enum set: there is no "raw"/"object"/"any" member,
    // so a raw browser Event cannot be smuggled across the boundary as a payload field.
    assert.deepEqual([...KNOWN_EVENT_PAYLOAD_FIELD_KINDS].sort(), ["boolean", "enum", "integer", "number", "string"]);
    const rawish = validateEventPayloadField({ name: "evt", kind: "object" });
    assert.deepEqual(errorCodes(rawish), ["Galerina_WEB_EVENTS_PAYLOAD_FIELD_KIND_UNKNOWN"]);
    // Clean: a declared scalar field is a first-class typed payload.
    assert.deepEqual(validateEventPayloadField({ name: "productId", kind: "string" }), []);
  });

  it("E2 FUNGI-WEB-031 (CWE-862/1173): a sensitive capability without literal-true requiresUserGesture is DENIED — the gate is re-checked at runtime", () => {
    // An untyped caller relaxing requiresUserGesture to false is rejected ((x as boolean) !== true).
    const gestureFree = validateSensitiveCapabilityDeclaration({ capabilities: ["clipboard"], requiresUserGesture: false });
    assert.deepEqual(errorCodes(gestureFree), ["Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED"]);
    // The denial composes through the whole event contract too — a gesture-free sensitive handler fails closed.
    const gestureFreeHandler = validateWebEventContract({
      ...goodEvent,
      sensitive: { capabilities: ["download"], requiresUserGesture: false },
    });
    assert.deepEqual(errorCodes(gestureFreeHandler), ["Galerina_WEB_EVENTS_USER_GESTURE_REQUIRED"]);
    // Clean: a gesture-gated sensitive handler passes.
    assert.deepEqual(validateSensitiveCapabilityDeclaration({ capabilities: ["clipboard"], requiresUserGesture: true }), []);
  });

  it("E3 (CWE-20): event payloads are schema-validated at the boundary — an untyped or nameless payload field denies the whole event", () => {
    const untypedPayload = validateWebEventContract({ ...goodEvent, payload: [{ name: "blob", kind: "any" }] });
    assert.deepEqual(errorCodes(untypedPayload), ["Galerina_WEB_EVENTS_PAYLOAD_FIELD_KIND_UNKNOWN"]);
    const namelessField = validateWebEventContract({ ...goodEvent, payload: [{ name: "  ", kind: "string" }] });
    assert.deepEqual(errorCodes(namelessField), ["Galerina_WEB_EVENTS_PAYLOAD_FIELD_NAME_REQUIRED"]);
    // Clean: a well-typed event contract passes the boundary.
    assert.deepEqual(validateWebEventContract(goodEvent), []);
  });

  it("E4 (unknown -> DENY): an unknown event kind produces no transition — it is rejected, never defaulted", () => {
    assert.deepEqual(KNOWN_WEB_EVENT_KINDS, ["click", "input", "submit", "navigation"]);
    for (const kind of ["wheel", "message", "keydown"]) {
      const unknownKind = validateWebEventContract({ ...goodEvent, kind });
      assert.deepEqual(errorCodes(unknownKind), ["Galerina_WEB_EVENTS_EVENT_KIND_UNKNOWN"], kind);
    }
  });
});
