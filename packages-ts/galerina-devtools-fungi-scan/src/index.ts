// @galerina/devtools-fungi-scan — public API
export {
  discoverCorpus,
  findSignedPackageRoots,
  isCommittedCeremonyManifest,
  readVersionHeader,
  scanFungiSource,
  scanGateSource,
  scanCorpus,
  strictFindings,
  corpusSourceExceedsMaxBytes,
  MAX_CORPUS_FILE_BYTES,
  MAX_CORPUS_WALK_DEPTH,
  MAX_CORPUS_FILES,
  PLANNED_CONSTRUCT_WORDS,
  PLANNED_ALIAS_WORDS,
  LEGACY_VERDICT_IDENTS,
  type CorpusScan,
  type FileScan,
  type MatchStats,
  type VersionHeader,
  type StrictFinding,
} from "./scanner.js";
export {
  discoverInlineHosts,
  extractFungiFixtures,
  scanInlineFixtures,
  looksLikeFungi,
  type InlineFixture,
} from "./inline-fixtures.js";
export { buildRollup, renderMarkdown, renderConsole, type Rollup, type WordRollup } from "./report.js";
