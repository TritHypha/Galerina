// Browser client state, typed state transition and render-diff contracts.
//
// This package defines the typed-state boundary for the Galerina web family
// — not a state framework and not a store. Data from APIs, storage, URL
// parameters, events and workers is untrusted until validated and converted
// into typed state: every state field declares a kind from a known set,
// loading/error/partial are first-class phases (unknown phases are rejected,
// never defaulted), API-to-state conversion must name its
// galerina-data-response mapping (raw model data never enters browser
// state), and hydration payloads are public text — a field declared secret
// or credential is an error, mirroring galerina-target-js's browser-secret
// denial. Sibling contracts are referenced by name strings, never imports.

export type WebStateDiagnosticSeverity = "warning" | "error";

export interface WebStateDiagnostic {
  readonly code: string;
  readonly severity: WebStateDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// Loading, error and partial data are first-class states, not exceptional
// afterthoughts. Unknown phases are rejected, never coerced to "idle".
export type PageStatePhase = "idle" | "loading" | "loaded" | "error" | "partial";

export const KNOWN_PAGE_STATE_PHASES: readonly PageStatePhase[] = [
  "idle",
  "loading",
  "loaded",
  "error",
  "partial",
];

export type PageStateFieldKind =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "enum"
  | "list"
  | "record";

export const KNOWN_PAGE_STATE_FIELD_KINDS: readonly PageStateFieldKind[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "enum",
  "list",
  "record",
];

export interface PageStateField {
  readonly name: string;
  readonly kind: PageStateFieldKind;
}

export interface PageStateContract {
  readonly name: string;
  readonly initialPhase: PageStatePhase;
  readonly fields: readonly PageStateField[];
}

// API data becomes state only through a named galerina-data-response
// mapping; the reference is a string into the sibling package, never an
// import.
export interface ApiToStateConversion {
  readonly stateContract: string;
  /** e.g. "@galerina/data-response#ProductListResponse" */
  readonly responseMappingRef: string;
}

// Hydration payloads are serialised into the page and are public text.
// The classification vocabulary exists so a declaration can be checked:
// "secret" and "credential" are expressible only so they can be rejected.
export type HydrationFieldClassification = "public" | "secret" | "credential";

export const KNOWN_HYDRATION_CLASSIFICATIONS: readonly HydrationFieldClassification[] = [
  "public",
  "secret",
  "credential",
];

export interface HydrationPayloadField {
  readonly name: string;
  readonly classification: HydrationFieldClassification;
}

export interface HydrationContract {
  readonly name: string;
  readonly fields: readonly HydrationPayloadField[];
}

// State diffs are bounded work, exactly like render patches.
export interface StateDiffPlan {
  readonly name: string;
  readonly maxDiffOps: number;
}

export type WebStateCheck = "contract" | "conversion" | "hydration" | "diffBounds";

export type WebStateCheckOutcome = "pass" | "fail";

export type WebStateReportStatus = "success" | "partial" | "failed";

export interface ClientStateReport {
  readonly contract: string;
  readonly status: WebStateReportStatus;
  readonly checks: Readonly<Record<WebStateCheck, WebStateCheckOutcome>>;
  readonly diagnostics: readonly WebStateDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_STATE_CHECKS: readonly WebStateCheck[] = [
  "contract",
  "conversion",
  "hydration",
  "diffBounds",
];

const KNOWN_PHASES: ReadonlySet<string> = new Set(KNOWN_PAGE_STATE_PHASES);

const KNOWN_FIELD_KINDS: ReadonlySet<string> = new Set(KNOWN_PAGE_STATE_FIELD_KINDS);

const KNOWN_CLASSIFICATIONS: ReadonlySet<string> = new Set(
  KNOWN_HYDRATION_CLASSIFICATIONS,
);

// Classifications that may never ride a hydration payload: the browser is
// the public side of the wire.
const FORBIDDEN_HYDRATION_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  "secret",
  "credential",
]);

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebStateCheck, readonly string[]>> = {
  contract: [
    "Galerina_WEB_STATE_CONTRACT_NAME_REQUIRED",
    "Galerina_WEB_STATE_PHASE_UNKNOWN",
    "Galerina_WEB_STATE_FIELD_NAME_REQUIRED",
    "Galerina_WEB_STATE_FIELD_KIND_UNKNOWN",
    "Galerina_WEB_STATE_FIELD_DUPLICATE",
  ],
  conversion: [
    "Galerina_WEB_STATE_CONVERSION_TARGET_REQUIRED",
    "Galerina_WEB_STATE_RESPONSE_MAPPING_REF_REQUIRED",
  ],
  hydration: [
    "Galerina_WEB_STATE_HYDRATION_NAME_REQUIRED",
    "Galerina_WEB_STATE_HYDRATION_FIELD_NAME_REQUIRED",
    "Galerina_WEB_STATE_HYDRATION_CLASSIFICATION_UNKNOWN",
    "Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN",
  ],
  diffBounds: [
    "Galerina_WEB_STATE_DIFF_PLAN_NAME_REQUIRED",
    "Galerina_WEB_STATE_DIFF_OPS_BOUND_REQUIRED",
  ],
};

function stateDiagnostic(
  code: string,
  severity: WebStateDiagnosticSeverity,
  message: string,
  path?: string,
): WebStateDiagnostic {
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

export function validatePageStateContract(
  contract: PageStateContract,
  path = "contract",
): readonly WebStateDiagnostic[] {
  const diagnostics: WebStateDiagnostic[] = [];

  if (contract.name.trim().length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_CONTRACT_NAME_REQUIRED",
      "error",
      "Page state contract requires a name.",
      `${path}.name`,
    ));
  }

  if (!KNOWN_PHASES.has(contract.initialPhase)) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_PHASE_UNKNOWN",
      "error",
      `Page state phase "${String(contract.initialPhase)}" is not in the known set (idle/loading/loaded/error/partial); unknown phases are rejected, never defaulted.`,
      `${path}.initialPhase`,
    ));
  }

  if (contract.fields.length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_FIELDS_EMPTY",
      "warning",
      "Page state contract declares no fields; the contract is valid but carries nothing.",
      `${path}.fields`,
    ));
  }

  const seen = new Set<string>();
  contract.fields.forEach((field, index) => {
    const name = field.name.trim();
    if (name.length === 0) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_FIELD_NAME_REQUIRED",
        "error",
        "Page state field requires a name.",
        `${path}.fields.${index}.name`,
      ));
    } else if (seen.has(name)) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_FIELD_DUPLICATE",
        "error",
        `Page state field "${name}" is declared more than once.`,
        `${path}.fields.${index}.name`,
      ));
    } else {
      seen.add(name);
    }

    if (!KNOWN_FIELD_KINDS.has(field.kind)) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_FIELD_KIND_UNKNOWN",
        "error",
        `Page state field kind "${String(field.kind)}" is not in the known set; untyped fields cannot enter browser state.`,
        `${path}.fields.${index}.kind`,
      ));
    }
  });

  return diagnostics;
}

// "Raw model data never enters browser state" made checkable: a conversion
// that names no response mapping is bypassing the typed data family.
export function validateApiToStateConversion(
  conversion: ApiToStateConversion,
  path = "conversion",
): readonly WebStateDiagnostic[] {
  const diagnostics: WebStateDiagnostic[] = [];

  if (conversion.stateContract.trim().length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_CONVERSION_TARGET_REQUIRED",
      "error",
      "API-to-state conversion must name its target page state contract.",
      `${path}.stateContract`,
    ));
  }

  if (conversion.responseMappingRef.trim().length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_RESPONSE_MAPPING_REF_REQUIRED",
      "error",
      "API-to-state conversion must name its galerina-data-response mapping; raw model data never enters browser state.",
      `${path}.responseMappingRef`,
    ));
  }

  return diagnostics;
}

// Hydration payloads are public text. A field carrying a secret or
// credential classification is an error (mirroring the browser secret
// denial in galerina-target-js), and an unknown classification is rejected
// rather than assumed public.
export function validateHydrationContract(
  contract: HydrationContract,
  path = "hydration",
): readonly WebStateDiagnostic[] {
  const diagnostics: WebStateDiagnostic[] = [];

  if (contract.name.trim().length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_HYDRATION_NAME_REQUIRED",
      "error",
      "Hydration contract requires a name.",
      `${path}.name`,
    ));
  }

  contract.fields.forEach((field, index) => {
    if (field.name.trim().length === 0) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_HYDRATION_FIELD_NAME_REQUIRED",
        "error",
        "Hydration payload field requires a name.",
        `${path}.fields.${index}.name`,
      ));
    }

    if (!KNOWN_CLASSIFICATIONS.has(field.classification)) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_HYDRATION_CLASSIFICATION_UNKNOWN",
        "error",
        `Hydration field classification "${String(field.classification)}" is not in the known set; an unclassified field cannot be assumed public.`,
        `${path}.fields.${index}.classification`,
      ));
    } else if (FORBIDDEN_HYDRATION_CLASSIFICATIONS.has(field.classification)) {
      diagnostics.push(stateDiagnostic(
        "Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN",
        "error",
        `Hydration field "${field.name}" is classified "${field.classification}"; browser hydration is public text and may never carry secret material.`,
        `${path}.fields.${index}.classification`,
      ));
    }
  });

  return diagnostics;
}

export function validateStateDiffPlan(
  plan: StateDiffPlan,
  path = "diffPlan",
): readonly WebStateDiagnostic[] {
  const diagnostics: WebStateDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_DIFF_PLAN_NAME_REQUIRED",
      "error",
      "State diff plan requires a name.",
      `${path}.name`,
    ));
  }

  if (!isPositiveSafeInteger(plan.maxDiffOps)) {
    diagnostics.push(stateDiagnostic(
      "Galerina_WEB_STATE_DIFF_OPS_BOUND_REQUIRED",
      "error",
      "State diff plan requires a positive integer maxDiffOps; an unbounded diff pass is unbounded work.",
      `${path}.maxDiffOps`,
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebStateReportStatus(
  diagnostics: readonly WebStateDiagnostic[],
): WebStateReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createClientStateReport(input: {
  readonly contract: PageStateContract;
  readonly conversion: ApiToStateConversion;
  readonly hydration?: HydrationContract;
  readonly diffPlan?: StateDiffPlan;
}): ClientStateReport {
  const diagnostics: WebStateDiagnostic[] = [
    ...validatePageStateContract(input.contract),
    ...validateApiToStateConversion(input.conversion),
  ];

  if (input.hydration !== undefined) {
    diagnostics.push(...validateHydrationContract(input.hydration));
  }

  if (input.diffPlan !== undefined) {
    diagnostics.push(...validateStateDiffPlan(input.diffPlan));
  }

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebStateCheck, WebStateCheckOutcome>;
  for (const check of WEB_STATE_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    contract: input.contract.name,
    status: deriveWebStateReportStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
