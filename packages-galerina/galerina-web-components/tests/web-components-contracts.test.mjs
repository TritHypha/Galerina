import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_COMPONENT_CHILD_KINDS,
  KNOWN_COMPONENT_EFFECTS,
  KNOWN_COMPONENT_PROP_KINDS,
  WEB_COMPONENTS_CHECKS,
  createComponentReport,
  deriveWebComponentsReportStatus,
  validateComponentChildContent,
  validateComponentContract,
  validateComponentProps,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const goodComponent = {
  name: "ProductCard",
  props: [
    { name: "title", kind: "string" },
    { name: "price", kind: "number" },
    { name: "inStock", kind: "boolean" },
  ],
  slotAllowlist: ["header", "body"],
  slotted: [
    { slot: "header", content: { kind: "text", value: "Product <b>name</b>" } },
    {
      slot: "body",
      content: {
        kind: "safe_html",
        sanitizePolicyRef: "@galerina/data-html#ProductDescriptionPolicy",
      },
    },
  ],
  effects: ["render", "state_read", "event_emit"],
  accessibilityRef: "@galerina/web-components#ProductCardA11y",
};

describe("typed props — kinds from the known set, duplicates rejected", () => {
  it("accepts a fully typed prop list", () => {
    assert.deepEqual(codes(validateComponentProps(goodComponent.props)), []);
  });

  it("accepts every known prop kind", () => {
    for (const kind of KNOWN_COMPONENT_PROP_KINDS) {
      assert.deepEqual(codes(validateComponentProps([{ name: "p", kind }])), [], kind);
    }
  });

  it("REJECTS unknown prop kinds instead of defaulting them", () => {
    const diags = validateComponentProps([{ name: "handler", kind: "function" }]);
    assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_PROP_KIND_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects duplicate and unnamed props", () => {
    const diags = validateComponentProps([
      { name: "title", kind: "string" },
      { name: "title", kind: "string" },
      { name: " ", kind: "string" },
    ]);
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_COMPONENTS_PROP_DUPLICATE",
      "Galerina_WEB_COMPONENTS_PROP_NAME_REQUIRED",
    ]);
  });
});

describe("safe child rendering — same union discipline as web-render", () => {
  it("declares exactly text and safe_html child kinds (no raw member)", () => {
    assert.deepEqual(KNOWN_COMPONENT_CHILD_KINDS, ["text", "safe_html"]);
    assert.ok(!KNOWN_COMPONENT_CHILD_KINDS.includes("raw_html"));
  });

  it("accepts text and policy-named safe_html children", () => {
    assert.deepEqual(
      codes(validateComponentChildContent({ kind: "text", value: "<script>" })),
      [],
    );
    assert.deepEqual(
      codes(validateComponentChildContent({
        kind: "safe_html",
        sanitizePolicyRef: "@galerina/data-html#Policy",
      })),
      [],
    );
  });

  it("REJECTS raw children smuggled in by an untyped caller", () => {
    for (const kind of ["raw_html", "html", "jsx", undefined]) {
      const diags = validateComponentChildContent({ kind, value: "<b>x</b>" });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN"],
        String(kind),
      );
      assert.equal(diags[0].severity, "error");
    }
  });

  it("requires a sanitize policy ref on safe_html children", () => {
    const diags = validateComponentChildContent({ kind: "safe_html", sanitizePolicyRef: " " });
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_COMPONENTS_SANITIZE_POLICY_REF_REQUIRED",
    ]);
  });
});

describe("slot policy — deny-by-default named slots", () => {
  it("ERRORS on content targeting a slot outside the allowlist", () => {
    const diags = validateComponentContract({
      ...goodComponent,
      slotted: [
        { slot: "footer", content: { kind: "text", value: "x" } },
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_SLOT_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("treats an empty allowlist as valid but warns (renders no slotted content)", () => {
    const diags = validateComponentContract({
      ...goodComponent,
      slotAllowlist: [],
      slotted: [],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_SLOT_ALLOWLIST_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects empty slot names in the allowlist", () => {
    const diags = validateComponentContract({
      ...goodComponent,
      slotAllowlist: ["header", " ", "body"],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_SLOT_NAME_REQUIRED"]);
  });

  it("validates slotted child content through the safe-child gate", () => {
    const diags = validateComponentContract({
      ...goodComponent,
      slotted: [
        { slot: "body", content: { kind: "raw_html", value: "<script>x</script>" } },
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN"]);
  });
});

describe("component effects — browser-safe set only", () => {
  it("declares exactly the four browser-safe effects", () => {
    assert.deepEqual(KNOWN_COMPONENT_EFFECTS, [
      "render",
      "state_read",
      "state_write",
      "event_emit",
    ]);
  });

  it("ERRORS on network, storage and any other non-surface effect", () => {
    for (const effect of ["network", "storage", "fetch", "timer"]) {
      const diags = validateComponentContract({
        ...goodComponent,
        effects: ["render", effect],
      });
      assert.deepEqual(codes(diags), ["Galerina_WEB_COMPONENTS_EFFECT_FORBIDDEN"], effect);
      assert.equal(diags[0].severity, "error");
    }
  });
});

describe("accessibility hooks — a11y is not optional for interactive components", () => {
  it("ERRORS when an event-emitting component has no accessibility ref", () => {
    const { accessibilityRef, ...withoutA11y } = goodComponent;
    const diags = validateComponentContract(withoutA11y);
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_COMPONENTS_ACCESSIBILITY_REF_REQUIRED",
    ]);
    assert.equal(diags[0].severity, "error");
  });

  it("ERRORS when the accessibility ref is blank", () => {
    const diags = validateComponentContract({ ...goodComponent, accessibilityRef: "  " });
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_COMPONENTS_ACCESSIBILITY_REF_REQUIRED",
    ]);
  });

  it("does not require an accessibility ref for non-interactive components", () => {
    const { accessibilityRef, ...rest } = goodComponent;
    const diags = validateComponentContract({
      ...rest,
      effects: ["render", "state_read"],
    });
    assert.deepEqual(codes(diags), []);
  });
});

describe("createComponentReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean component", () => {
    const report = createComponentReport({ component: goodComponent });
    assert.equal(report.component, "ProductCard");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_COMPONENTS_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("fails effects and accessibility checks from their own diagnostics", () => {
    const { accessibilityRef, ...withoutA11y } = goodComponent;
    const report = createComponentReport({
      component: { ...withoutA11y, effects: ["event_emit", "network"] },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_COMPONENTS_ACCESSIBILITY_REF_REQUIRED",
      "Galerina_WEB_COMPONENTS_EFFECT_FORBIDDEN",
    ]);
    assert.equal(report.checks.effects, "fail");
    assert.equal(report.checks.accessibility, "fail");
    assert.equal(report.checks.props, "pass");
    assert.equal(report.checks.childSafety, "pass");
    assert.equal(report.checks.slots, "pass");
    assert.equal(report.checks.component, "pass");
  });

  it("fails component, props, childSafety and slots checks from their own diagnostics", () => {
    const report = createComponentReport({
      component: {
        name: " ",
        props: [
          { name: "a", kind: "string" },
          { name: "a", kind: "string" },
        ],
        slotAllowlist: ["body"],
        slotted: [
          { slot: "footer", content: { kind: "safe_html", sanitizePolicyRef: "" } },
        ],
        effects: ["render"],
      },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_COMPONENTS_COMPONENT_NAME_REQUIRED",
      "Galerina_WEB_COMPONENTS_PROP_DUPLICATE",
      "Galerina_WEB_COMPONENTS_SANITIZE_POLICY_REF_REQUIRED",
      "Galerina_WEB_COMPONENTS_SLOT_UNKNOWN",
    ]);
    assert.equal(report.checks.component, "fail");
    assert.equal(report.checks.props, "fail");
    assert.equal(report.checks.childSafety, "fail");
    assert.equal(report.checks.slots, "fail");
    assert.equal(report.checks.effects, "pass");
    assert.equal(report.checks.accessibility, "pass");
  });

  it("reports partial with warning messages for an empty slot allowlist", () => {
    const report = createComponentReport({
      component: { ...goodComponent, slotAllowlist: [], slotted: [] },
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_COMPONENTS_SLOT_ALLOWLIST_EMPTY",
    ]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_COMPONENTS_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebComponentsReportStatus([]), "success");
    assert.equal(
      deriveWebComponentsReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebComponentsReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});
