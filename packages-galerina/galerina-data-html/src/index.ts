// HTML parse, sanitize, render, extraction and search-document contracts.
//
// This package defines typed boundaries, not a browser or layout engine.
// Sanitization is deny-by-default: only what an allowlist names may survive,
// executable content may never be allowlisted, and every unsafe finding must
// record what was done about it (removed or escaped — "kept" is not an
// outcome a sanitizer can report).

export type HtmlParseMode = "document" | "fragment";

// Parsing untrusted HTML must be bounded, exactly like JSON decoding:
// attacker-sized markup without byte/node limits is unbounded work.
export interface HtmlParsePlan {
  readonly name: string;
  readonly mode: HtmlParseMode;
  readonly maxInputBytes: number;
  readonly maxNodeCount?: number;
}

// Deny-by-default sanitize policy: tags and attributes not listed here are
// dropped. An empty allowlist is valid (it renders nothing) but is warned
// about so nobody ships it by accident.
export interface HtmlSanitizePolicy {
  readonly name: string;
  readonly allowedTags: readonly string[];
  readonly allowedAttributes: readonly string[];
}

// Safe rendering is sanitize-then-render; a render plan therefore carries its
// sanitize policy rather than referencing one that may not exist.
export interface HtmlRenderPlan {
  readonly name: string;
  readonly sanitize: HtmlSanitizePolicy;
}

export type HtmlExtractionTarget = "links" | "text" | "metadata" | "title";

export interface HtmlExtractionPlan {
  readonly source: string;
  readonly targets: readonly HtmlExtractionTarget[];
}

export interface HtmlSearchField {
  readonly name: string;
  readonly from: HtmlExtractionTarget;
}

// Creating a search document from HTML: the document must be addressable
// (id) and must actually index something (at least one field).
export interface HtmlSearchDocumentPlan {
  readonly documentId: string;
  readonly source: string;
  readonly fields: readonly HtmlSearchField[];
}

export type HtmlUnsafeFindingKind = "element" | "attribute" | "url";

// What the sanitizer did about unsafe content. There is deliberately no
// "kept" member: unsafe content that survives is a policy violation, not a
// reportable disposition.
export type HtmlUnsafeAction = "removed" | "escaped";

export interface HtmlUnsafeFinding {
  readonly kind: HtmlUnsafeFindingKind;
  readonly name: string;
  readonly action: HtmlUnsafeAction;
  readonly count: number;
}

export interface HtmlProcessingReport {
  readonly source: string;
  readonly policy: string;
  readonly unsafeFindings: readonly HtmlUnsafeFinding[];
  readonly unsafeTotal: number;
  readonly diagnostics: readonly HtmlDiagnostic[];
  readonly warnings: readonly string[];
}

export type HtmlDiagnosticSeverity = "warning" | "error";

export interface HtmlDiagnostic {
  readonly code: string;
  readonly severity: HtmlDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_PARSE_MODES: ReadonlySet<string> = new Set(["document", "fragment"]);

const KNOWN_EXTRACTION_TARGETS: ReadonlySet<string> = new Set([
  "links",
  "text",
  "metadata",
  "title",
]);

const KNOWN_UNSAFE_KINDS: ReadonlySet<string> = new Set([
  "element",
  "attribute",
  "url",
]);

const KNOWN_UNSAFE_ACTIONS: ReadonlySet<string> = new Set(["removed", "escaped"]);

// Executable or navigation-hijacking elements that no sanitize allowlist may
// contain: allowlisting any of these turns "sanitized" HTML into an XSS
// vector, so their presence is an error rather than a warning.
const FORBIDDEN_TAGS: ReadonlySet<string> = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
]);

function htmlDiagnostic(
  code: string,
  severity: HtmlDiagnosticSeverity,
  message: string,
  path?: string,
): HtmlDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateHtmlParsePlan(
  plan: HtmlParsePlan,
): readonly HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_PLAN_NAME_REQUIRED",
      "error",
      "HTML parse plan requires a name.",
      "name",
    ));
  }

  if (!KNOWN_PARSE_MODES.has(plan.mode)) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_PARSE_MODE_UNKNOWN",
      "error",
      `HTML parse mode "${String(plan.mode)}" is not a known mode.`,
      "mode",
    ));
  }

  if (!isPositiveSafeInteger(plan.maxInputBytes)) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_INPUT_LIMIT_REQUIRED",
      "error",
      "HTML parse plan requires a positive integer maxInputBytes; unbounded parse is unsafe.",
      "maxInputBytes",
    ));
  }

  if (plan.maxNodeCount !== undefined && !isPositiveSafeInteger(plan.maxNodeCount)) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_NODE_LIMIT_INVALID",
      "error",
      "HTML parse plan maxNodeCount, when set, must be a positive integer.",
      "maxNodeCount",
    ));
  }

  return diagnostics;
}

// Deny-by-default sanitization. An empty allowlist is safe (nothing renders)
// but almost never intended, so it warns. Executable tags and event-handler
// attributes inside the allowlist are errors: an allowlist that names them
// is not a sanitize policy.
export function validateHtmlSanitizePolicy(
  policy: HtmlSanitizePolicy,
  path = "sanitize",
): readonly HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];

  if (policy.name.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_POLICY_NAME_REQUIRED",
      "error",
      "HTML sanitize policy requires a name.",
      `${path}.name`,
    ));
  }

  if (policy.allowedTags.length === 0 && policy.allowedAttributes.length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_ALLOWLIST_EMPTY",
      "warning",
      "HTML sanitize allowlist is empty; the policy is valid but renders nothing.",
      `${path}.allowedTags`,
    ));
  }

  policy.allowedTags.forEach((tag, index) => {
    const normalised = tag.trim().toLowerCase();
    if (normalised.length === 0) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_TAG_NAME_REQUIRED",
        "error",
        "HTML allowlisted tag names must be non-empty.",
        `${path}.allowedTags.${index}`,
      ));
      return;
    }
    if (FORBIDDEN_TAGS.has(normalised)) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_UNSAFE_TAG_FORBIDDEN",
        "error",
        `Tag "${normalised}" is executable content and may never be allowlisted.`,
        `${path}.allowedTags.${index}`,
      ));
    }
  });

  policy.allowedAttributes.forEach((attribute, index) => {
    const normalised = attribute.trim().toLowerCase();
    if (normalised.length === 0) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_ATTRIBUTE_NAME_REQUIRED",
        "error",
        "HTML allowlisted attribute names must be non-empty.",
        `${path}.allowedAttributes.${index}`,
      ));
      return;
    }
    // Every on* attribute is an inline event handler — script by another
    // name — so the whole namespace is forbidden, not an enumerated list.
    if (normalised.startsWith("on")) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_EVENT_HANDLER_FORBIDDEN",
        "error",
        `Attribute "${normalised}" is an event handler and may never be allowlisted.`,
        `${path}.allowedAttributes.${index}`,
      ));
    }
  });

  return diagnostics;
}

export function validateHtmlRenderPlan(
  plan: HtmlRenderPlan,
): readonly HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_PLAN_NAME_REQUIRED",
      "error",
      "HTML render plan requires a name.",
      "name",
    ));
  }

  diagnostics.push(...validateHtmlSanitizePolicy(plan.sanitize));

  return diagnostics;
}

export function validateHtmlExtractionPlan(
  plan: HtmlExtractionPlan,
): readonly HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];

  if (plan.source.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_EXTRACTION_SOURCE_REQUIRED",
      "error",
      "HTML extraction plan requires a source.",
      "source",
    ));
  }

  if (plan.targets.length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_EXTRACTION_TARGETS_REQUIRED",
      "error",
      "HTML extraction plan requires at least one target.",
      "targets",
    ));
  }

  plan.targets.forEach((target, index) => {
    if (!KNOWN_EXTRACTION_TARGETS.has(target)) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_EXTRACTION_TARGET_UNKNOWN",
        "error",
        `HTML extraction target "${String(target)}" is not a known target.`,
        `targets.${index}`,
      ));
    }
  });

  return diagnostics;
}

export function validateHtmlSearchDocumentPlan(
  plan: HtmlSearchDocumentPlan,
): readonly HtmlDiagnostic[] {
  const diagnostics: HtmlDiagnostic[] = [];

  if (plan.documentId.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_SEARCH_DOCUMENT_ID_REQUIRED",
      "error",
      "HTML search document requires a document id.",
      "documentId",
    ));
  }

  if (plan.fields.length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_SEARCH_FIELDS_REQUIRED",
      "error",
      "HTML search document requires at least one field.",
      "fields",
    ));
  }

  plan.fields.forEach((field, index) => {
    if (field.name.trim().length === 0) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_SEARCH_FIELD_NAME_REQUIRED",
        "error",
        "HTML search document field requires a name.",
        `fields.${index}.name`,
      ));
    }
    if (!KNOWN_EXTRACTION_TARGETS.has(field.from)) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_SEARCH_FIELD_SOURCE_UNKNOWN",
        "error",
        `HTML search document field source "${String(field.from)}" is not a known extraction target.`,
        `fields.${index}.from`,
      ));
    }
  });

  return diagnostics;
}

// Unsafe element/attribute report. Fail-closed: a finding whose action is
// not a known safe disposition (removed/escaped) is an error — it means
// unsafe content survived sanitization.
export function createHtmlProcessingReport(input: {
  readonly source: string;
  readonly policy: HtmlSanitizePolicy;
  readonly unsafeFindings?: readonly HtmlUnsafeFinding[];
}): HtmlProcessingReport {
  const diagnostics: HtmlDiagnostic[] = [];
  const unsafeFindings = input.unsafeFindings ?? [];

  if (input.source.trim().length === 0) {
    diagnostics.push(htmlDiagnostic(
      "Galerina_DATA_HTML_SOURCE_REQUIRED",
      "error",
      "HTML processing report requires a source.",
      "source",
    ));
  }

  diagnostics.push(...validateHtmlSanitizePolicy(input.policy, "policy"));

  let unsafeTotal = 0;
  unsafeFindings.forEach((finding, index) => {
    if (!KNOWN_UNSAFE_KINDS.has(finding.kind)) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_UNSAFE_KIND_UNKNOWN",
        "error",
        `Unsafe finding kind "${String(finding.kind)}" is not a known kind.`,
        `unsafeFindings.${index}.kind`,
      ));
    }
    if (!KNOWN_UNSAFE_ACTIONS.has(finding.action)) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_UNSAFE_ACTION_INVALID",
        "error",
        `Unsafe finding action "${String(finding.action)}" is not a safe disposition; unsafe content must be removed or escaped.`,
        `unsafeFindings.${index}.action`,
      ));
    }
    if (!Number.isSafeInteger(finding.count) || finding.count < 0) {
      diagnostics.push(htmlDiagnostic(
        "Galerina_DATA_HTML_COUNT_INVALID",
        "error",
        "Unsafe finding count must be a non-negative integer.",
        `unsafeFindings.${index}.count`,
      ));
    } else {
      unsafeTotal += finding.count;
    }
  });

  return {
    source: input.source,
    policy: input.policy.name,
    unsafeFindings,
    unsafeTotal,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
