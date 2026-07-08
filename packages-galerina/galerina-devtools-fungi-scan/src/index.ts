// @galerina/devtools-fungi-scan — public API
export {
  discoverCorpus,
  findSignedPackageRoots,
  readVersionHeader,
  scanFungiSource,
  scanGateSource,
  scanCorpus,
  strictFindings,
  PLANNED_CONSTRUCT_WORDS,
  PLANNED_ALIAS_WORDS,
  LEGACY_VERDICT_IDENTS,
  type CorpusScan,
  type FileScan,
  type MatchStats,
  type VersionHeader,
  type StrictFinding,
} from "./scanner.js";
export { buildRollup, renderMarkdown, renderConsole, type Rollup, type WordRollup } from "./report.js";
