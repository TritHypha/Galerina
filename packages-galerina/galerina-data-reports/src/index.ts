// Shared data-processing report shape and status vocabulary.
//
// Owning data packages produce the facts; this package defines the envelope
// they travel in. The core invariant: STATUS IS ARITHMETIC, NOT ASSERTION.
// A report claiming "success" while carrying error diagnostics is rejected,
// and the builder derives status from the diagnostics instead of accepting a
// caller's claim in the first place.

export type DataReportKind =
  | "app.data-processing-report.json"
  | "app.html-processing-report.json"
  | "app.search-index-report.json"
  | "app.archive-report.json"
  | "app.archive-integrity-report.json"
  | "app.json-archive-report.json"
  | "app.database-archive-report.json"
  | "app.pipeline-report.json";

export type DataReportStatus = "success" | "partial" | "failed";

export type DataReportDiagnosticSeverity = "warning" | "error";

// One diagnostic shape for the whole family: both the diagnostics carried
// inside a report and the diagnostics this package's validators return.
export interface DataReportDiagnostic {
  readonly code: string;
  readonly severity: DataReportDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface DataReportEnvelope {
  readonly kind: DataReportKind;
  readonly producer: string;
  readonly generatedAt: string;
  readonly status: DataReportStatus;
  readonly diagnostics: readonly DataReportDiagnostic[];
  readonly counts: Readonly<Record<string, number>>;
}

export const KNOWN_DATA_REPORT_KINDS: readonly DataReportKind[] = [
  "app.data-processing-report.json",
  "app.html-processing-report.json",
  "app.search-index-report.json",
  "app.archive-report.json",
  "app.archive-integrity-report.json",
  "app.json-archive-report.json",
  "app.database-archive-report.json",
  "app.pipeline-report.json",
];

const KNOWN_KINDS: ReadonlySet<string> = new Set(KNOWN_DATA_REPORT_KINDS);

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["success", "partial", "failed"]);

const KNOWN_SEVERITIES: ReadonlySet<string> = new Set(["warning", "error"]);

function reportDiagnostic(
  code: string,
  severity: DataReportDiagnosticSeverity,
  message: string,
  path?: string,
): DataReportDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// Status derivation shared by the whole family: any error means "failed",
// warnings alone mean "partial", a clean run is "success". Using this helper
// makes a dishonest status impossible to construct.
export function deriveDataReportStatus(
  diagnostics: readonly DataReportDiagnostic[],
): DataReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function validateDataReportEnvelope(
  envelope: DataReportEnvelope,
): readonly DataReportDiagnostic[] {
  const diagnostics: DataReportDiagnostic[] = [];

  if (!KNOWN_KINDS.has(envelope.kind)) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_KIND_UNKNOWN",
      "error",
      `Report kind "${String(envelope.kind)}" is not a known data report kind.`,
      "kind",
    ));
  }

  if (envelope.producer.trim().length === 0) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_PRODUCER_REQUIRED",
      "error",
      "Report envelope requires a producer package name.",
      "producer",
    ));
  }

  if (Number.isNaN(Date.parse(envelope.generatedAt))) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_TIMESTAMP_INVALID",
      "error",
      "Report envelope generatedAt must be a parseable timestamp.",
      "generatedAt",
    ));
  }

  if (!KNOWN_STATUSES.has(envelope.status)) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_STATUS_UNKNOWN",
      "error",
      `Report status "${String(envelope.status)}" is not in the shared vocabulary.`,
      "status",
    ));
  }

  let carriesError = false;
  envelope.diagnostics.forEach((carried, index) => {
    if (carried.code.trim().length === 0) {
      diagnostics.push(reportDiagnostic(
        "Galerina_DATA_REPORTS_DIAGNOSTIC_CODE_REQUIRED",
        "error",
        "Carried diagnostics require a non-empty code.",
        `diagnostics.${index}.code`,
      ));
    }
    if (!KNOWN_SEVERITIES.has(carried.severity)) {
      diagnostics.push(reportDiagnostic(
        "Galerina_DATA_REPORTS_SEVERITY_UNKNOWN",
        "error",
        `Carried diagnostic severity "${String(carried.severity)}" is not warning or error.`,
        `diagnostics.${index}.severity`,
      ));
    }
    if (carried.severity === "error") {
      carriesError = true;
    }
  });

  // The family invariant: a report may not claim success past its own
  // evidence. Error diagnostics + "success" is a contradiction, an error.
  if (envelope.status === "success" && carriesError) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_STATUS_CONTRADICTION",
      "error",
      "Report claims success while carrying error diagnostics.",
      "status",
    ));
  }

  // The inverse gap is surfaced too: a "failed" report that explains nothing
  // is unauditable, though not itself dishonest — warning, not error.
  if (envelope.status === "failed" && !carriesError) {
    diagnostics.push(reportDiagnostic(
      "Galerina_DATA_REPORTS_FAILURE_UNEXPLAINED",
      "warning",
      "Report claims failure but carries no error diagnostics explaining it.",
      "status",
    ));
  }

  for (const [name, value] of Object.entries(envelope.counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      diagnostics.push(reportDiagnostic(
        "Galerina_DATA_REPORTS_COUNT_INVALID",
        "error",
        `Report count "${name}" must be a non-negative integer.`,
        `counts.${name}`,
      ));
    }
  }

  return diagnostics;
}

// Envelope builder: status is derived from the carried diagnostics, never
// accepted from the caller. generatedAt defaults to now.
export function createDataReportEnvelope(input: {
  readonly kind: DataReportKind;
  readonly producer: string;
  readonly diagnostics?: readonly DataReportDiagnostic[];
  readonly counts?: Readonly<Record<string, number>>;
  readonly generatedAt?: string;
}): DataReportEnvelope {
  const diagnostics = input.diagnostics ?? [];
  return {
    kind: input.kind,
    producer: input.producer,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: deriveDataReportStatus(diagnostics),
    diagnostics,
    counts: input.counts ?? {},
  };
}
