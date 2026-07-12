// Browser component boundary contracts.
//
// This package keeps component inputs, effects and HTML output safe — it is
// not a design system, component library or page builder. Props are typed
// (kinds from a known set, duplicates rejected). Child content follows the
// same renderable-content discipline as galerina-web-render, re-declared
// here by name because sibling packages are never imported: text (always
// escaped) or safe_html naming its sanitize policy — a raw member does not
// exist. Slots are deny-by-default: only allowlisted named slots accept
// content. Effects come from a browser-safe known set (render, state_read,
// state_write, event_emit); anything else — network, storage — is an error,
// because components are pure surface and side effects live in governed
// flows. Interactive components (those that emit events) must name an
// accessibility contract: a11y is not optional.

export type WebComponentsDiagnosticSeverity = "warning" | "error";

export interface WebComponentsDiagnostic {
  readonly code: string;
  readonly severity: WebComponentsDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export type ComponentPropKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "enum"
  | "list"
  | "record";

export const KNOWN_COMPONENT_PROP_KINDS: readonly ComponentPropKind[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "enum",
  "list",
  "record",
];

export interface ComponentProp {
  readonly name: string;
  readonly kind: ComponentPropKind;
}

// Child content mirrors the galerina-web-render renderable union by name:
// there is no raw member, so unescaped markup cannot be expressed as a
// component child.
export interface ComponentTextChild {
  readonly kind: "text";
  readonly value: string;
}

export interface ComponentSafeHtmlChild {
  readonly kind: "safe_html";
  /** Sanitize policy reference, e.g. "@galerina/data-html#ArticlePolicy". */
  readonly sanitizePolicyRef: string;
}

export type ComponentChildContent = ComponentTextChild | ComponentSafeHtmlChild;

export const KNOWN_COMPONENT_CHILD_KINDS: readonly ComponentChildContent["kind"][] = [
  "text",
  "safe_html",
];

// Slotted content targets a named slot; only slots in the component's
// allowlist accept content.
export interface ComponentSlotContent {
  readonly slot: string;
  readonly content: ComponentChildContent;
}

// The browser-safe effect vocabulary. Network, storage and anything else
// not listed here is not a component effect — it is a governed flow.
export type ComponentEffect = "render" | "state_read" | "state_write" | "event_emit";

export const KNOWN_COMPONENT_EFFECTS: readonly ComponentEffect[] = [
  "render",
  "state_read",
  "state_write",
  "event_emit",
];

export interface ComponentContract {
  readonly name: string;
  readonly props: readonly ComponentProp[];
  /** Named slots that accept content; deny-by-default for anything else. */
  readonly slotAllowlist: readonly string[];
  readonly slotted: readonly ComponentSlotContent[];
  readonly effects: readonly ComponentEffect[];
  /** Required when the component emits events (interactive components). */
  readonly accessibilityRef?: string;
}

export type WebComponentsCheck =
  | "component"
  | "props"
  | "childSafety"
  | "slots"
  | "effects"
  | "accessibility";

export type WebComponentsCheckOutcome = "pass" | "fail";

export type WebComponentsReportStatus = "success" | "partial" | "failed";

export interface ComponentReport {
  readonly component: string;
  readonly status: WebComponentsReportStatus;
  readonly checks: Readonly<Record<WebComponentsCheck, WebComponentsCheckOutcome>>;
  readonly diagnostics: readonly WebComponentsDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_COMPONENTS_CHECKS: readonly WebComponentsCheck[] = [
  "component",
  "props",
  "childSafety",
  "slots",
  "effects",
  "accessibility",
];

const KNOWN_PROP_KINDS: ReadonlySet<string> = new Set(KNOWN_COMPONENT_PROP_KINDS);

const KNOWN_CHILD_KINDS: ReadonlySet<string> = new Set(KNOWN_COMPONENT_CHILD_KINDS);

const KNOWN_EFFECTS: ReadonlySet<string> = new Set(KNOWN_COMPONENT_EFFECTS);

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebComponentsCheck, readonly string[]>> = {
  component: ["Galerina_WEB_COMPONENTS_COMPONENT_NAME_REQUIRED"],
  props: [
    "Galerina_WEB_COMPONENTS_PROP_NAME_REQUIRED",
    "Galerina_WEB_COMPONENTS_PROP_KIND_UNKNOWN",
    "Galerina_WEB_COMPONENTS_PROP_DUPLICATE",
  ],
  childSafety: [
    "Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN",
    "Galerina_WEB_COMPONENTS_SANITIZE_POLICY_REF_REQUIRED",
  ],
  slots: [
    "Galerina_WEB_COMPONENTS_SLOT_NAME_REQUIRED",
    "Galerina_WEB_COMPONENTS_SLOT_UNKNOWN",
  ],
  effects: ["Galerina_WEB_COMPONENTS_EFFECT_FORBIDDEN"],
  accessibility: ["Galerina_WEB_COMPONENTS_ACCESSIBILITY_REF_REQUIRED"],
};

function componentsDiagnostic(
  code: string,
  severity: WebComponentsDiagnosticSeverity,
  message: string,
  path?: string,
): WebComponentsDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

export function validateComponentProps(
  props: readonly ComponentProp[],
  path = "props",
): readonly WebComponentsDiagnostic[] {
  const diagnostics: WebComponentsDiagnostic[] = [];

  const seen = new Set<string>();
  props.forEach((prop, index) => {
    const name = prop.name.trim();
    if (name.length === 0) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_PROP_NAME_REQUIRED",
        "error",
        "Component prop requires a name.",
        `${path}.${index}.name`,
      ));
    } else if (seen.has(name)) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_PROP_DUPLICATE",
        "error",
        `Component prop "${name}" is declared more than once.`,
        `${path}.${index}.name`,
      ));
    } else {
      seen.add(name);
    }

    if (!KNOWN_PROP_KINDS.has(prop.kind)) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_PROP_KIND_UNKNOWN",
        "error",
        `Component prop kind "${String(prop.kind)}" is not in the known set; untyped props may not cross the component boundary.`,
        `${path}.${index}.kind`,
      ));
    }
  });

  return diagnostics;
}

// The safe-child gate: same union discipline as the web-render content
// gate. Fail-closed — a child whose kind is not in the known set (including
// a smuggled raw member) is rejected.
export function validateComponentChildContent(
  content: ComponentChildContent,
  path = "content",
): readonly WebComponentsDiagnostic[] {
  const diagnostics: WebComponentsDiagnostic[] = [];
  const kind = (content as { readonly kind: string }).kind;

  if (!KNOWN_CHILD_KINDS.has(kind)) {
    diagnostics.push(componentsDiagnostic(
      "Galerina_WEB_COMPONENTS_CHILD_KIND_UNKNOWN",
      "error",
      `Component child kind "${String(kind)}" is not renderable; only "text" (always escaped) and "safe_html" exist — raw HTML children are unrepresentable and denied.`,
      `${path}.kind`,
    ));
    return diagnostics;
  }

  if (content.kind === "safe_html" && content.sanitizePolicyRef.trim().length === 0) {
    diagnostics.push(componentsDiagnostic(
      "Galerina_WEB_COMPONENTS_SANITIZE_POLICY_REF_REQUIRED",
      "error",
      "SafeHtml component children must name the sanitize policy that produced them.",
      `${path}.sanitizePolicyRef`,
    ));
  }

  return diagnostics;
}

export function validateComponentContract(
  contract: ComponentContract,
  path = "component",
): readonly WebComponentsDiagnostic[] {
  const diagnostics: WebComponentsDiagnostic[] = [];

  if (contract.name.trim().length === 0) {
    diagnostics.push(componentsDiagnostic(
      "Galerina_WEB_COMPONENTS_COMPONENT_NAME_REQUIRED",
      "error",
      "Component contract requires a name.",
      `${path}.name`,
    ));
  }

  diagnostics.push(...validateComponentProps(contract.props, `${path}.props`));

  // Slot policy, deny-by-default. An empty allowlist is valid — the
  // component simply renders no slotted content — but it is warned so
  // nobody ships it by accident.
  const allowedSlots = new Set<string>();
  if (contract.slotAllowlist.length === 0) {
    diagnostics.push(componentsDiagnostic(
      "Galerina_WEB_COMPONENTS_SLOT_ALLOWLIST_EMPTY",
      "warning",
      "Component slot allowlist is empty; the contract is valid but renders no slotted content.",
      `${path}.slotAllowlist`,
    ));
  }
  contract.slotAllowlist.forEach((slot, index) => {
    const name = slot.trim();
    if (name.length === 0) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_SLOT_NAME_REQUIRED",
        "error",
        "Slot allowlist entries must be non-empty slot names.",
        `${path}.slotAllowlist.${index}`,
      ));
      return;
    }
    allowedSlots.add(name);
  });

  contract.slotted.forEach((slotContent, index) => {
    if (!allowedSlots.has(slotContent.slot.trim())) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_SLOT_UNKNOWN",
        "error",
        `Slot "${String(slotContent.slot)}" is not in the component's slot allowlist; only named allowlisted slots accept content.`,
        `${path}.slotted.${index}.slot`,
      ));
    }
    diagnostics.push(
      ...validateComponentChildContent(slotContent.content, `${path}.slotted.${index}.content`),
    );
  });

  contract.effects.forEach((effect, index) => {
    if (!KNOWN_EFFECTS.has(effect)) {
      diagnostics.push(componentsDiagnostic(
        "Galerina_WEB_COMPONENTS_EFFECT_FORBIDDEN",
        "error",
        `Component effect "${String(effect)}" is not browser-safe surface work (render/state_read/state_write/event_emit); network, storage and other side effects live in governed flows, not components.`,
        `${path}.effects.${index}`,
      ));
    }
  });

  // Interactive components must name their accessibility contract.
  const interactive = contract.effects.includes("event_emit");
  const accessibilityRef = contract.accessibilityRef ?? "";
  if (interactive && accessibilityRef.trim().length === 0) {
    diagnostics.push(componentsDiagnostic(
      "Galerina_WEB_COMPONENTS_ACCESSIBILITY_REF_REQUIRED",
      "error",
      "Interactive components (declaring event_emit) must name an accessibility contract; a11y is not optional.",
      `${path}.accessibilityRef`,
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebComponentsReportStatus(
  diagnostics: readonly WebComponentsDiagnostic[],
): WebComponentsReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createComponentReport(input: {
  readonly component: ComponentContract;
}): ComponentReport {
  const diagnostics = [...validateComponentContract(input.component)];

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebComponentsCheck, WebComponentsCheckOutcome>;
  for (const check of WEB_COMPONENTS_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    component: input.component.name,
    status: deriveWebComponentsReportStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
