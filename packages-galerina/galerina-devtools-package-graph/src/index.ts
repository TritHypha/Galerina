export { scanPackage } from "./scanner.js";
export type { ScanResult, ScannedFile, FileImport, EdgeKind } from "./scanner.js";
export { buildGraph } from "./graph.js";
export type { PackageGraph, InternalEdge, ExternalDep } from "./graph.js";
export { writeJson, writeBoundaryMarkdown, runBoundaryGate } from "./reporter.js";
export type { BoundaryPolicy, CheckResult } from "./reporter.js";
