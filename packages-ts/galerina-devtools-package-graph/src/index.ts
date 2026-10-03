export { scanPackage, scanOmitsCoveredDefaultRoots, DEFAULT_ROOTS, MAX_SCAN_FILES, MAX_SCAN_DIRS, MAX_SCAN_DEPTH, MAX_SCAN_FILE_BYTES, MAX_SCAN_TOTAL_BYTES } from "./scanner.js";
export type {
  ScanResult,
  ScannedFile,
  FileImport,
  EdgeKind,
  AllowedOrphan,
  ProductAsset,
  PackageGraphConfig,
} from "./scanner.js";
export { buildGraph } from "./graph.js";
export type { PackageGraph, InternalEdge, ExternalDep } from "./graph.js";
export { writeJson, writeBoundaryMarkdown, runBoundaryGate } from "./reporter.js";
export type { BoundaryPolicy, CheckResult } from "./reporter.js";
export {
  FUNGI_PKGSTD_001, FUNGI_PKGSTD_002, FUNGI_PKGSTD_003, FUNGI_PKGSTD_004, FUNGI_PKGSTD_005,
  FUNGI_PKGSTD_006, FUNGI_PKGSTD_007, FUNGI_PKGSTD_008, FUNGI_PKGSTD_009, FUNGI_PKGSTD_010,
  FUNGI_PKGSTD_011, FUNGI_PKGSTD_012, FUNGI_PKGSTD_013, FUNGI_PKGSTD_014, FUNGI_PKGSTD_015, FUNGI_PKGSTD_016,
  PACKAGE_BUILD_MANIFEST_SCHEMA, PACKAGE_MANIFEST_SCHEMA, PACKAGE_STANDARD_CODES, PACKAGE_STANDARD_FILES,
  PACKAGE_STANDARD_GENERATOR, auditGeneratedDrift, auditPackage, auditPackageSet, sortDiagnostics,
} from "./package-standard.js";
export type {
  DocumentText, ObservedSourceFile, PackageStandardCode, PackageStandardDiagnostic, PackageStandardInput,
  PackageStandardProfile,
} from "./package-standard.js";
