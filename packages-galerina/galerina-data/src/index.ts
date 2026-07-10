// Umbrella contracts for the Galerina data-processing family.
//
// This package owns the vocabulary the family shares — the coordinated
// package list, security boundary names, memory limit shape, archive
// integrity references and the family-wide report index — and enforces the
// umbrella-level invariants itself: every declared boundary fails closed,
// every report entry's status must agree with its error count, and the
// family report index makes coverage gaps (a package that reported nothing)
// visible instead of implying an all-green family. It implements no engine
// of any kind.

// The packages this umbrella coordinates, as named in its README.
export type DataFamilyPackage =
  | "@galerina/data-html"
  | "@galerina/data-search"
  | "@galerina/data-archive"
  | "@galerina/data-json"
  | "@galerina/data-database"
  | "@galerina/data-pipeline"
  | "@galerina/data-reports";

export const DATA_FAMILY_PACKAGES: readonly DataFamilyPackage[] = [
  "@galerina/data-html",
  "@galerina/data-search",
  "@galerina/data-archive",
  "@galerina/data-json",
  "@galerina/data-database",
  "@galerina/data-pipeline",
  "@galerina/data-reports",
];

// Shared memory-limit vocabulary. Bounded processing is a family-wide rule,
// so the shape (and its "must be positive" semantics) lives here once.
export interface DataMemoryLimits {
  readonly maxDocumentBytes: number;
  readonly maxBufferBytes: number;
  readonly maxConcurrentStreams: number;
}

export type DataSecurityBoundary =
  | "parse"
  | "sanitize"
  | "index"
  | "archive"
  | "database"
  | "pipeline";

// A declared security boundary. failClosed is the literal `true`: a
// fail-open boundary is not a boundary, so it cannot be expressed.
export interface DataBoundaryDeclaration {
  readonly boundary: DataSecurityBoundary;
  readonly ownerPackage: DataFamilyPackage;
  readonly failClosed: true;
}

export type DataChecksumAlgorithm = "sha256" | "sha384" | "sha512" | "blake3";

// Reference from the umbrella to an archive integrity artefact.
export interface ArchiveIntegrityRef {
  readonly archive: string;
  readonly checksumAlgorithm: DataChecksumAlgorithm;
  readonly reportKind: "app.archive-integrity-report.json";
}

export type DataReportStatus = "success" | "partial" | "failed";

export interface DataFamilyReportEntry {
  readonly kind: string;
  readonly producer: string;
  readonly status: DataReportStatus;
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface DataFamilyReportIndex {
  readonly generatedAt: string;
  readonly overallStatus: DataReportStatus;
  readonly entries: readonly DataFamilyReportEntry[];
  readonly missingProducers: readonly string[];
  readonly diagnostics: readonly DataDiagnostic[];
  readonly warnings: readonly string[];
}

export type DataDiagnosticSeverity = "warning" | "error";

export interface DataDiagnostic {
  readonly code: string;
  readonly severity: DataDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const FAMILY_PACKAGES: ReadonlySet<string> = new Set(DATA_FAMILY_PACKAGES);

const KNOWN_BOUNDARIES: ReadonlySet<string> = new Set([
  "parse",
  "sanitize",
  "index",
  "archive",
  "database",
  "pipeline",
]);

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["success", "partial", "failed"]);

const KNOWN_CHECKSUM_ALGORITHMS: ReadonlySet<string> = new Set([
  "sha256",
  "sha384",
  "sha512",
  "blake3",
]);

const REPORT_KIND_PATTERN = /^app\.[a-z0-9-]+\.json$/;

function dataDiagnostic(
  code: string,
  severity: DataDiagnosticSeverity,
  message: string,
  path?: string,
): DataDiagnostic {
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

export function validateDataMemoryLimits(
  limits: DataMemoryLimits,
  path = "limits",
): readonly DataDiagnostic[] {
  const diagnostics: DataDiagnostic[] = [];

  if (!isPositiveSafeInteger(limits.maxDocumentBytes)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_MEMORY_LIMIT_REQUIRED",
      "error",
      "Data memory limits require a positive integer maxDocumentBytes.",
      `${path}.maxDocumentBytes`,
    ));
  }

  if (!isPositiveSafeInteger(limits.maxBufferBytes)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_MEMORY_LIMIT_REQUIRED",
      "error",
      "Data memory limits require a positive integer maxBufferBytes.",
      `${path}.maxBufferBytes`,
    ));
  }

  if (!isPositiveSafeInteger(limits.maxConcurrentStreams)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_STREAM_LIMIT_REQUIRED",
      "error",
      "Data memory limits require a positive integer maxConcurrentStreams.",
      `${path}.maxConcurrentStreams`,
    ));
  }

  return diagnostics;
}

export function validateDataBoundaryDeclaration(
  declaration: DataBoundaryDeclaration,
  path = "boundary",
): readonly DataDiagnostic[] {
  const diagnostics: DataDiagnostic[] = [];

  if (!KNOWN_BOUNDARIES.has(declaration.boundary)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_BOUNDARY_UNKNOWN",
      "error",
      `Security boundary "${String(declaration.boundary)}" is not a known family boundary.`,
      `${path}.boundary`,
    ));
  }

  // A boundary owned outside the family is not coordinated by this umbrella
  // and cannot be vouched for here.
  if (!FAMILY_PACKAGES.has(declaration.ownerPackage)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_OWNER_UNKNOWN",
      "error",
      `Boundary owner "${String(declaration.ownerPackage)}" is not a coordinated family package.`,
      `${path}.ownerPackage`,
    ));
  }

  if ((declaration.failClosed as boolean) !== true) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_FAIL_CLOSED_REQUIRED",
      "error",
      "Family security boundaries must fail closed; this is not configurable.",
      `${path}.failClosed`,
    ));
  }

  return diagnostics;
}

export function validateArchiveIntegrityRef(
  ref: ArchiveIntegrityRef,
  path = "archiveRef",
): readonly DataDiagnostic[] {
  const diagnostics: DataDiagnostic[] = [];

  if (ref.archive.trim().length === 0) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_ARCHIVE_NAME_REQUIRED",
      "error",
      "Archive integrity reference requires an archive name.",
      `${path}.archive`,
    ));
  }

  if (!KNOWN_CHECKSUM_ALGORITHMS.has(ref.checksumAlgorithm)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_CHECKSUM_ALGORITHM_UNKNOWN",
      "error",
      `Checksum algorithm "${String(ref.checksumAlgorithm)}" is not in the known set.`,
      `${path}.checksumAlgorithm`,
    ));
  }

  if (ref.reportKind !== "app.archive-integrity-report.json") {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_ARCHIVE_REPORT_KIND_INVALID",
      "error",
      "Archive integrity references must point at app.archive-integrity-report.json.",
      `${path}.reportKind`,
    ));
  }

  return diagnostics;
}

export function validateDataFamilyReportEntry(
  entry: DataFamilyReportEntry,
  path = "entry",
): readonly DataDiagnostic[] {
  const diagnostics: DataDiagnostic[] = [];

  if (!REPORT_KIND_PATTERN.test(entry.kind)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_REPORT_KIND_INVALID",
      "error",
      `Report kind "${entry.kind}" must match app.<name>.json.`,
      `${path}.kind`,
    ));
  }

  if (entry.producer.trim().length === 0) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_PRODUCER_REQUIRED",
      "error",
      "Report entry requires a producer package name.",
      `${path}.producer`,
    ));
  } else if (!FAMILY_PACKAGES.has(entry.producer)) {
    // A report from outside the coordinated family is not fatal, but the
    // index must not silently launder it into the family picture.
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_PRODUCER_UNKNOWN",
      "warning",
      `Report producer "${entry.producer}" is not a coordinated family package.`,
      `${path}.producer`,
    ));
  }

  if (!KNOWN_STATUSES.has(entry.status)) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_REPORT_STATUS_UNKNOWN",
      "error",
      `Report status "${String(entry.status)}" is not in the shared vocabulary.`,
      `${path}.status`,
    ));
  }

  for (const [name, value] of [
    ["errorCount", entry.errorCount],
    ["warningCount", entry.warningCount],
  ] as const) {
    if (!isNonNegativeSafeInteger(value)) {
      diagnostics.push(dataDiagnostic(
        "Galerina_DATA_REPORT_COUNT_INVALID",
        "error",
        `Report entry ${name} must be a non-negative integer.`,
        `${path}.${name}`,
      ));
    }
  }

  // The family invariant, enforced at the umbrella too: success may not
  // coexist with errors.
  if (entry.status === "success" && isNonNegativeSafeInteger(entry.errorCount) && entry.errorCount > 0) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_STATUS_CONTRADICTION",
      "error",
      `Report entry from "${entry.producer}" claims success while carrying ${entry.errorCount} errors.`,
      `${path}.status`,
    ));
  }

  if (entry.status === "failed" && entry.errorCount === 0) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_FAILURE_UNEXPLAINED",
      "warning",
      `Report entry from "${entry.producer}" claims failure but carries no errors.`,
      `${path}.status`,
    ));
  }

  return diagnostics;
}

// Family-wide report aggregator. Overall status is derived: any invalid or
// failed entry fails the family; partial entries or coverage gaps cap the
// family at "partial"; only a full, clean sweep is "success".
export function createDataFamilyReportIndex(input: {
  readonly entries: readonly DataFamilyReportEntry[];
  readonly generatedAt?: string;
}): DataFamilyReportIndex {
  const diagnostics: DataDiagnostic[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(generatedAt))) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_TIMESTAMP_INVALID",
      "error",
      "Family report index generatedAt must be a parseable timestamp.",
      "generatedAt",
    ));
  }

  const seen = new Set<string>();
  input.entries.forEach((entry, index) => {
    diagnostics.push(...validateDataFamilyReportEntry(entry, `entries.${index}`));

    const key = `${entry.producer}::${entry.kind}`;
    if (seen.has(key)) {
      diagnostics.push(dataDiagnostic(
        "Galerina_DATA_REPORT_DUPLICATE",
        "error",
        `Duplicate report entry for ${entry.kind} from ${entry.producer}.`,
        `entries.${index}`,
      ));
    }
    seen.add(key);
  });

  // Coverage: a family package that reported nothing is a gap the index
  // must show, or "everything green" quietly means "everything we heard
  // from was green".
  const producers = new Set(input.entries.map((entry) => entry.producer));
  const missingProducers = DATA_FAMILY_PACKAGES.filter(
    (name) => !producers.has(name),
  );
  for (const missing of missingProducers) {
    diagnostics.push(dataDiagnostic(
      "Galerina_DATA_REPORT_COVERAGE_GAP",
      "warning",
      `Family package "${missing}" produced no report entry.`,
      "entries",
    ));
  }

  const hasErrorDiagnostics = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
  const anyFailed = input.entries.some((entry) => entry.status === "failed");
  const anyPartial = input.entries.some((entry) => entry.status === "partial");

  let overallStatus: DataReportStatus;
  if (hasErrorDiagnostics || anyFailed) {
    overallStatus = "failed";
  } else if (anyPartial || missingProducers.length > 0) {
    overallStatus = "partial";
  } else {
    overallStatus = "success";
  }

  return {
    generatedAt,
    overallStatus,
    entries: input.entries,
    missingProducers,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
