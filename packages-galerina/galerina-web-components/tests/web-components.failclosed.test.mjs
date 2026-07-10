// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web-components (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: born fail-closed. web-components keeps component
// inputs, effects and HTML output safe (CWE-79): slot/child HTML goes through the same sanitiser gate
// as web-render, props are typed, effects are an allowlist. Each test exercises a governance/
// web-failclosed-contract.json invariant (C1..C4) with unknown -> DENY assertions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateComponentProps,
  validateComponentChildContent,
  validateComponentContract,
  KNOWN_COMPONENT_CHILD_KINDS,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

const goodComponent = {
  name: "ProductCard",
  props: [{ name: "title", kind: "string" }],
  slotAllowlist: ["body"],
  slotted: [{ slot: "body", content: { kind: "text", value: "in stock" } }],
  effects: ["render"],
};

describe("web-components fail-closed acceptance (FUNGI-WEB-040..042)", () => {
  it("C1 FUNGI-WEB-040 (CWE-79): child HTML must pass the sanitiser gate — a raw child kind is unrepresentable and unsanitised safe_html is DENIED", () => {
    // The child union is text|safe_html ONLY — the same discipline as web-render R2.
    assert.deepEqual([...KNOWN_COMPONENT_CHILD_KINDS], ["text", "safe_html"]);
    // A smuggled raw child kind fails closed (raw HTML children are unrepresentable).
    const raw = validateComponentChildContent({ kind: "raw_html", value: "<img src=x onerror=alert(1)>" });
    assert.deepEqual(errorCodes(raw), ["Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN"]);
    // safe_html without a named sanitize policy cannot pass the gate — the impl consumes the shipped
    // data-html sanitiser by reference (reuseMandate), it does not fork a sanitiser.
    const unsanitised = validateComponentChildContent({ kind: "safe_html", sanitizePolicyRef: "   " });
    assert.deepEqual(errorCodes(unsanitised), ["Galerina_WEB_COMPONENTS_SANITIZE_POLICY_REF_REQUIRED"]);
    // Clean: text is escaped-by-construction, and safe_html naming its policy passes.
    assert.deepEqual(validateComponentChildContent({ kind: "text", value: "<b>literal, not markup</b>" }), []);
    assert.deepEqual(
      validateComponentChildContent({ kind: "safe_html", sanitizePolicyRef: "@galerina/data-html#ArticlePolicy" }),
      [],
    );
  });

  it("C2 FUNGI-WEB-041 (CWE-20): an untyped/any prop is DENIED — untyped props may not cross the component boundary", () => {
    const untyped = validateComponentProps([{ name: "data", kind: "any" }]);
    assert.deepEqual(errorCodes(untyped), ["Galerina_WEB_COMPONENTS_PROP_KIND_UNKNOWN"]);
    // Clean: a declared typed prop passes.
    assert.deepEqual(validateComponentProps([{ name: "title", kind: "string" }]), []);
  });

  it("C3 FUNGI-WEB-042 (CWE-862): an undeclared component effect (network/storage/...) is DENIED — side effects live in governed flows, not components", () => {
    for (const effect of ["network", "storage", "fetch", "navigation"]) {
      const forbidden = validateComponentContract({ ...goodComponent, effects: ["render", effect] });
      assert.deepEqual(errorCodes(forbidden), ["Galerina_WEB_COMPONENTS_EFFECT_FORBIDDEN"], effect);
    }
    // Clean: the browser-safe effect vocabulary (render/state_read/state_write/event_emit) passes.
    assert.deepEqual(
      validateComponentContract({ ...goodComponent, effects: ["render", "state_read", "state_write"] }),
      [],
    );
  });

  it("C4 (unknown -> DENY): an unknown slot content kind and a slot outside the allowlist both fail closed", () => {
    // NOTE (C4): the contract phrases C4 as "unknown slot content -> escaped-text, never HTML"; the impl
    // enforces the STRONGER fail-closed form — an unknown child kind is DENIED (CHILD_KIND_UNKNOWN), so it
    // never reaches an HTML sink at all. The security property "never HTML" holds; we assert the real (stronger) behaviour.
    const unknownSlotContent = validateComponentChildContent({ kind: "iframe", src: "//evil.example" });
    assert.deepEqual(errorCodes(unknownSlotContent), ["Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN"]);
    // Slots are deny-by-default: content targeting a slot outside the allowlist is denied.
    const undeclaredSlot = validateComponentContract({
      ...goodComponent,
      slotted: [{ slot: "danger", content: { kind: "text", value: "x" } }],
    });
    assert.deepEqual(errorCodes(undeclaredSlot), ["Galerina_WEB_COMPONENTS_SLOT_UNKNOWN"]);
  });
});
