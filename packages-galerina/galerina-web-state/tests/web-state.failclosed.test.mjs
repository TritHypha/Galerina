// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web-state (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: born fail-closed. web-state is the trust-boundary
// lattice that feeds every other package (CWE-501); its job is that untrusted API/storage/URL/event
// data cannot become typed state except via an explicit validate->convert step. Each test exercises
// a governance/web-failclosed-contract.json invariant (S1..S4) with unknown -> DENY assertions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validatePageStateContract,
  validateApiToStateConversion,
  validateHydrationContract,
  KNOWN_PAGE_STATE_PHASES,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

describe("web-state fail-closed acceptance (FUNGI-WEB-010..011)", () => {
  it("S1 FUNGI-WEB-010 (CWE-501): API->state conversion without a data-response mapping ref is DENIED — raw model data cannot become typed state", () => {
    const laundered = validateApiToStateConversion({ stateContract: "ProductPageState", responseMappingRef: "" });
    assert.deepEqual(errorCodes(laundered), ["Galerina_WEB_STATE_RESPONSE_MAPPING_REF_REQUIRED"]);
    // A named data-response mapping is the only path across the boundary (validate->convert).
    assert.deepEqual(
      validateApiToStateConversion({ stateContract: "ProductPageState", responseMappingRef: "@galerina/data-response#ProductView" }),
      [],
    );
  });

  it("S2 (CWE-20): an unknown state phase is rejected, never defaulted (no attacker-chosen 'trusted' phase)", () => {
    const bad = validatePageStateContract({
      name: "ProductPageState",
      initialPhase: "trusted",
      fields: [{ name: "id", kind: "string" }],
    });
    assert.ok(errorCodes(bad).includes("Galerina_WEB_STATE_PHASE_UNKNOWN"));
    // loading / error / partial are first-class — validation failure has a real state to land in.
    assert.deepEqual([...KNOWN_PAGE_STATE_PHASES].sort(), ["error", "idle", "loaded", "loading", "partial"]);
  });

  it("S1/S3 (CWE-501): an untyped state field kind is DENIED — untyped fields cannot enter browser state", () => {
    const bad = validatePageStateContract({
      name: "ProductPageState",
      initialPhase: "idle",
      fields: [{ name: "blob", kind: "any" }],
    });
    assert.ok(errorCodes(bad).includes("Galerina_WEB_STATE_FIELD_KIND_UNKNOWN"));
  });

  it("S4 FUNGI-WEB-011 (CWE-501): hydration carrying secret/credential is DENIED, and an unknown classification -> DENY (never assumed public)", () => {
    const secret = validateHydrationContract({ name: "h", fields: [{ name: "apiKey", classification: "secret" }] });
    assert.deepEqual(errorCodes(secret), ["Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN"]);
    const credential = validateHydrationContract({ name: "h", fields: [{ name: "sessionToken", classification: "credential" }] });
    assert.deepEqual(errorCodes(credential), ["Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN"]);
    // Unknown classification is not assumed public — it fails closed.
    const unknown = validateHydrationContract({ name: "h", fields: [{ name: "x", classification: "maybe" }] });
    assert.deepEqual(errorCodes(unknown), ["Galerina_WEB_STATE_HYDRATION_CLASSIFICATION_UNKNOWN"]);
    // A public field hydrates cleanly.
    assert.deepEqual(validateHydrationContract({ name: "h", fields: [{ name: "title", classification: "public" }] }), []);
  });
});
