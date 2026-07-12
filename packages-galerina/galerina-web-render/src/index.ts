// Typed browser rendering pipeline contracts.
//
// This package defines the render gate for the Galerina web family — not a
// browser engine, layout engine, CSS framework or app framework. The core
// rule is the renderable-content union itself: text (always escaped) and
// SafeHtml that names its sanitize policy are the only members. A raw-HTML
// member does not exist, so unescaped markup is unrepresentable in the type
// and rejected at runtime when smuggled in by an untyped caller. Render work
// is bounded (patch ops, batch items, batch delay) and the DOM update report
// derives its status and checks from validation — never from caller
// assertion. Sibling contracts (web-state, data-html) are referenced by
// name strings, never imports.

export type WebRenderDiagnosticSeverity = "warning" | "error";

export interface WebRenderDiagnostic {
  readonly code: string;
  readonly severity: WebRenderDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The renderable-content union IS the RawHtml denial policy. Text is always
// escaped; safe_html must name the sanitize policy (a galerina-data-html
// contract, by reference string) that produced it. There is deliberately no
// raw_html member: unescaped markup cannot be expressed in this vocabulary.
export interface TextRenderContent {
  readonly kind: "text";
  readonly value: string;
}

export interface SafeHtmlRenderContent {
  readonly kind: "safe_html";
  /** Sanitize policy reference, e.g. "@galerina/data-html#ArticlePolicy". */
  readonly sanitizePolicyRef: string;
}

export type RenderableContent = TextRenderContent | SafeHtmlRenderContent;

export const KNOWN_RENDERABLE_CONTENT_KINDS: readonly RenderableContent["kind"][] = [
  "text",
  "safe_html",
];

// State-diff rendering is the default pipeline: compare typed state with the
// current UI and patch only what changed, under an explicit op budget. The
// state contract is named by reference into galerina-web-state, never
// imported.
export interface StateDiffRenderPlan {
  readonly name: string;
  /** e.g. "@galerina/web-state#ProductPageState" */
  readonly stateContractRef: string;
  readonly maxPatchOps: number;
}

// Streaming render: large data arrives in validated batches, each bounded in
// item count and flush delay.
export interface StreamingBatchRenderPlan {
  readonly name: string;
  readonly maxBatchItems: number;
  readonly maxBatchDelayMs: number;
}

export interface DomUpdateCounts {
  readonly nodesCreated: number;
  readonly nodesUpdated: number;
  readonly nodesRemoved: number;
}

export type WebRenderCheck =
  | "target"
  | "contentGate"
  | "plan"
  | "bounds"
  | "counts";

export type WebRenderCheckOutcome = "pass" | "fail";

export type WebRenderReportStatus = "success" | "partial" | "failed";

export interface DomUpdateReport {
  readonly target: string;
  readonly status: WebRenderReportStatus;
  readonly counts: DomUpdateCounts;
  readonly checks: Readonly<Record<WebRenderCheck, WebRenderCheckOutcome>>;
  readonly diagnostics: readonly WebRenderDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_RENDER_CHECKS: readonly WebRenderCheck[] = [
  "target",
  "contentGate",
  "plan",
  "bounds",
  "counts",
];

const KNOWN_CONTENT_KINDS: ReadonlySet<string> = new Set(
  KNOWN_RENDERABLE_CONTENT_KINDS,
);

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebRenderCheck, readonly string[]>> = {
  target: ["Galerina_WEB_RENDER_TARGET_REQUIRED"],
  contentGate: [
    "Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN",
    "Galerina_WEB_RENDER_SANITIZE_POLICY_REF_REQUIRED",
  ],
  plan: [
    "Galerina_WEB_RENDER_PLAN_NAME_REQUIRED",
    "Galerina_WEB_RENDER_STATE_CONTRACT_REF_REQUIRED",
  ],
  bounds: [
    "Galerina_WEB_RENDER_PATCH_OPS_BOUND_REQUIRED",
    "Galerina_WEB_RENDER_BATCH_ITEMS_BOUND_REQUIRED",
    "Galerina_WEB_RENDER_BATCH_DELAY_BOUND_REQUIRED",
  ],
  counts: ["Galerina_WEB_RENDER_UPDATE_COUNT_INVALID"],
};

function renderDiagnostic(
  code: string,
  severity: WebRenderDiagnosticSeverity,
  message: string,
  path?: string,
): WebRenderDiagnostic {
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

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

// The SafeHtml render gate. Fail-closed: any content whose kind is not in
// the known set — including a smuggled { kind: "raw_html" } — is rejected;
// nothing renders unescaped by default.
export function validateRenderableContent(
  content: RenderableContent,
  path = "content",
): readonly WebRenderDiagnostic[] {
  const diagnostics: WebRenderDiagnostic[] = [];
  const kind = (content as { readonly kind: string }).kind;

  if (!KNOWN_CONTENT_KINDS.has(kind)) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN",
      "error",
      `Renderable content kind "${String(kind)}" is not renderable; only "text" (always escaped) and "safe_html" exist — raw HTML is unrepresentable and denied.`,
      `${path}.kind`,
    ));
    return diagnostics;
  }

  if (content.kind === "safe_html" && content.sanitizePolicyRef.trim().length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_SANITIZE_POLICY_REF_REQUIRED",
      "error",
      "SafeHtml content must name the sanitize policy that produced it; unsanitised HTML may not pass the render gate.",
      `${path}.sanitizePolicyRef`,
    ));
  }

  return diagnostics;
}

// A content list that renders nothing is valid but almost never intended, so
// it warns — mirroring the empty-allowlist discipline in galerina-data-html.
export function validateRenderableContentList(
  content: readonly RenderableContent[],
  path = "content",
): readonly WebRenderDiagnostic[] {
  const diagnostics: WebRenderDiagnostic[] = [];

  if (content.length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_CONTENT_EMPTY",
      "warning",
      "Render content list is empty; the plan is valid but renders nothing.",
      path,
    ));
  }

  content.forEach((item, index) => {
    diagnostics.push(...validateRenderableContent(item, `${path}.${index}`));
  });

  return diagnostics;
}

export function validateStateDiffRenderPlan(
  plan: StateDiffRenderPlan,
  path = "plan",
): readonly WebRenderDiagnostic[] {
  const diagnostics: WebRenderDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_PLAN_NAME_REQUIRED",
      "error",
      "State-diff render plan requires a name.",
      `${path}.name`,
    ));
  }

  if (plan.stateContractRef.trim().length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_STATE_CONTRACT_REF_REQUIRED",
      "error",
      "State-diff render plan must name its galerina-web-state contract; state controls rendering.",
      `${path}.stateContractRef`,
    ));
  }

  if (!isPositiveSafeInteger(plan.maxPatchOps)) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_PATCH_OPS_BOUND_REQUIRED",
      "error",
      "State-diff render plan requires a positive integer maxPatchOps; an unbounded patch pass is unbounded work.",
      `${path}.maxPatchOps`,
    ));
  }

  return diagnostics;
}

export function validateStreamingBatchRenderPlan(
  plan: StreamingBatchRenderPlan,
  path = "streaming",
): readonly WebRenderDiagnostic[] {
  const diagnostics: WebRenderDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_PLAN_NAME_REQUIRED",
      "error",
      "Streaming batch render plan requires a name.",
      `${path}.name`,
    ));
  }

  if (!isPositiveSafeInteger(plan.maxBatchItems)) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_BATCH_ITEMS_BOUND_REQUIRED",
      "error",
      "Streaming batch render plan requires a positive integer maxBatchItems.",
      `${path}.maxBatchItems`,
    ));
  }

  if (!isPositiveSafeInteger(plan.maxBatchDelayMs)) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_BATCH_DELAY_BOUND_REQUIRED",
      "error",
      "Streaming batch render plan requires a positive integer maxBatchDelayMs.",
      `${path}.maxBatchDelayMs`,
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebRenderReportStatus(
  diagnostics: readonly WebRenderDiagnostic[],
): WebRenderReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createDomUpdateReport(input: {
  readonly target: string;
  readonly plan: StateDiffRenderPlan;
  readonly content: readonly RenderableContent[];
  readonly streaming?: StreamingBatchRenderPlan;
  readonly counts: DomUpdateCounts;
}): DomUpdateReport {
  const diagnostics: WebRenderDiagnostic[] = [];

  if (input.target.trim().length === 0) {
    diagnostics.push(renderDiagnostic(
      "Galerina_WEB_RENDER_TARGET_REQUIRED",
      "error",
      "DOM update report requires a render target.",
      "target",
    ));
  }

  diagnostics.push(...validateStateDiffRenderPlan(input.plan));
  diagnostics.push(...validateRenderableContentList(input.content));

  if (input.streaming !== undefined) {
    diagnostics.push(...validateStreamingBatchRenderPlan(input.streaming));
  }

  for (const [name, value] of [
    ["nodesCreated", input.counts.nodesCreated],
    ["nodesUpdated", input.counts.nodesUpdated],
    ["nodesRemoved", input.counts.nodesRemoved],
  ] as const) {
    if (!isNonNegativeSafeInteger(value)) {
      diagnostics.push(renderDiagnostic(
        "Galerina_WEB_RENDER_UPDATE_COUNT_INVALID",
        "error",
        `DOM update count ${name} must be a non-negative integer.`,
        `counts.${name}`,
      ));
    }
  }

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebRenderCheck, WebRenderCheckOutcome>;
  for (const check of WEB_RENDER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    target: input.target,
    status: deriveWebRenderReportStatus(diagnostics),
    counts: input.counts,
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
