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
