// =============================================================================
// report.ts — rollups + markdown/console rendering for a CorpusScan.
// =============================================================================

import type { CorpusScan, FileScan } from "./scanner.js";
import { PLANNED_ALIAS_WORDS, PLANNED_CONSTRUCT_WORDS, strictFindings } from "./scanner.js";

export interface WordRollup {
  readonly word: string;
  readonly files: number;
  readonly occurrences: number;
}

export interface Rollup {
  readonly totalFiles: number;
  readonly fungiFiles: number;
  readonly gateFiles: number;
  readonly runtimeFiles: number;
  readonly testFiles: number;
  /** Byte-frozen inside REAL-SIGNED packages (CG-7) — strict-exempt, ceremony-owed. */
  readonly signedFrozenFiles: number;
  readonly readErrors: number;
  readonly lexErrorFiles: number;
  readonly versionPresent: number;
  readonly versionValid: number;
  readonly filesWithLegacyOps: number;
  readonly legacyOpOccurrences: number;
  readonly filesWithLegacyIdents: number;
  readonly matchTotal: number;
  readonly matchWithoutWildcard: number;
  readonly filesWithMatchGap: number;
  readonly secureFlowCount: number;
  /** Planned-word usage, descending by file count — the keyword-collision table. */
  readonly constructUsage: readonly WordRollup[];
  readonly aliasUsage: readonly WordRollup[];
  readonly strict: readonly { file: string; why: string }[];
}

function rollupWords(files: readonly FileScan[], words: readonly string[]): WordRollup[] {
  return words
    .map((word) => {
      let fileCount = 0;
      let occ = 0;
      for (const f of files) {
        const n = f.usage[word] ?? 0;
        if (n > 0) {
          fileCount++;
          occ += n;
        }
      }
      return { word, files: fileCount, occurrences: occ };
    })
    .filter((w) => w.occurrences > 0)
    .sort((a, b) => b.files - a.files || b.occurrences - a.occurrences);
}

export function buildRollup(scan: CorpusScan): Rollup {
  const fs = scan.files;
  const fungi = fs.filter((f) => f.kind === "fungi");
  return {
    totalFiles: fs.length,
    fungiFiles: fungi.length,
    gateFiles: fs.length - fungi.length,
    runtimeFiles: fs.filter((f) => f.corpus === "runtime").length,
    testFiles: fs.filter((f) => f.corpus === "test").length,
    signedFrozenFiles: fs.filter((f) => f.corpus === "signed-frozen").length,
    readErrors: fs.filter((f) => f.readError !== null).length,
    lexErrorFiles: fs.filter((f) => f.lexErrors > 0).length,
    versionPresent: fs.filter((f) => f.version.present).length,
    versionValid: fs.filter((f) => f.version.valid).length,
    filesWithLegacyOps: fs.filter((f) => f.legacyOps.and2 + f.legacyOps.or2 > 0).length,
    legacyOpOccurrences: fs.reduce((s, f) => s + f.legacyOps.and2 + f.legacyOps.or2, 0),
    filesWithLegacyIdents: fs.filter((f) => Object.keys(f.legacyIdents).length > 0).length,
    matchTotal: fs.reduce((s, f) => s + f.matches.total, 0),
    matchWithoutWildcard: fs.reduce((s, f) => s + f.matches.withoutWildcard, 0),
    filesWithMatchGap: fs.filter((f) => f.matches.withoutWildcard > 0).length,
    secureFlowCount: fs.reduce((s, f) => s + f.secureFlow, 0),
    constructUsage: rollupWords(fungi, PLANNED_CONSTRUCT_WORDS),
    aliasUsage: rollupWords(fungi, PLANNED_ALIAS_WORDS),
    strict: strictFindings(scan),
  };
}

const wordTable = (rows: readonly WordRollup[]): string =>
  rows.length === 0
    ? "_none in corpus_\n"
    : "| word | files | occurrences |\n|---|---:|---:|\n" +
      rows.map((r) => `| \`${r.word}\` | ${r.files} | ${r.occurrences} |`).join("\n") + "\n";

export function renderMarkdown(scan: CorpusScan, r: Rollup): string {
  const gapFiles = scan.files
    .filter((f) => f.matches.withoutWildcard > 0)
    .sort((a, b) => b.matches.withoutWildcard - a.matches.withoutWildcard)
    .slice(0, 25);
  const legacyFiles = scan.files
    .filter((f) => f.legacyOps.and2 + f.legacyOps.or2 > 0)
    .sort((a, b) => (b.legacyOps.and2 + b.legacyOps.or2) - (a.legacyOps.and2 + a.legacyOps.or2));

  let md = `# FUNGI-SCAN — syntax-migration corpus report

Scanned **${r.totalFiles}** files (${r.fungiFiles} \`.fungi\` · ${r.gateFiles} \`.gate\`) — ${r.runtimeFiles} runtime-corpus, ${r.testFiles} test-corpus.
Detection = REAL compiler lexer token stream (see package note; regex misses \`@\`-headers and no-space operator forms).

## Migration gap summary

| Check | Status |
|---|---|
| \`@version\` header present | ${r.versionPresent}/${r.totalFiles} (valid: ${r.versionValid}) |
| files with legacy \`&&\`/\`\\|\\|\` | ${r.filesWithLegacyOps} (${r.legacyOpOccurrences} occurrences) |
| files with legacy \`vAnd\`/\`vOr\`/\`vNot\` | ${r.filesWithLegacyIdents} |
| \`match\` blocks total / without \`_\` arm | ${r.matchTotal} / **${r.matchWithoutWildcard}** (in ${r.filesWithMatchGap} files) |
| \`secure flow\` adoption | ${r.secureFlowCount} |
| unreadable files | ${r.readErrors} |
| files with lexer errors | ${r.lexErrorFiles} |

## Planned-keyword usage — constructs
Pre-reservation this is the **collision-risk** table (identifiers that would break when the word becomes a keyword); post-reservation it is the adoption metric.

${wordTable(r.constructUsage)}
## Planned-keyword usage — rename aliases

${wordTable(r.aliasUsage)}
## match blocks without a \`_\` arm (top ${gapFiles.length})

${gapFiles.length === 0 ? "_none_\n" : gapFiles.map((f) => `- \`${f.file}\` — ${f.matches.withoutWildcard} (lines ${f.matches.linesWithoutWildcard.join(", ")})${f.corpus === "test" ? " _[test-corpus]_" : ""}`).join("\n") + "\n"}
## files with legacy \`&&\`/\`||\`

${legacyFiles.length === 0 ? "_none_\n" : legacyFiles.map((f) => `- \`${f.file}\` — ${f.legacyOps.and2} \`&&\`, ${f.legacyOps.or2} \`||\`${f.corpus === "test" ? " _[test-corpus]_" : ""}`).join("\n") + "\n"}
## Strict-mode findings (runtime corpus only): ${r.strict.length}

${r.strict.length === 0 ? "_clean — corpus fully migrated_\n" : r.strict.slice(0, 60).map((s) => `- \`${s.file}\` — ${s.why}`).join("\n") + (r.strict.length > 60 ? `\n- …and ${r.strict.length - 60} more (see JSON)` : "") + "\n"}
Full per-file detail: \`fungi-scan.json\` next to this report.
`;
  return md;
}

export function renderConsole(r: Rollup): string {
  const lines = [
    `fungi-scan: ${r.totalFiles} files (${r.fungiFiles} .fungi · ${r.gateFiles} .gate) — ${r.runtimeFiles} runtime / ${r.testFiles} test` +
    (r.signedFrozenFiles > 0 ? ` / ${r.signedFrozenFiles} SIGNED-FROZEN (CG-7, re-sign ceremony owed)` : ""),
    `  @version: ${r.versionPresent}/${r.totalFiles} present (${r.versionValid} valid) · legacy &&/||: ${r.filesWithLegacyOps} files (${r.legacyOpOccurrences}x) · vAnd/vOr/vNot: ${r.filesWithLegacyIdents} files`,
    `  match without _: ${r.matchWithoutWildcard}/${r.matchTotal} (in ${r.filesWithMatchGap} files) · secure flow: ${r.secureFlowCount} · unreadable: ${r.readErrors} · lex-error files: ${r.lexErrorFiles}`,
  ];
  const topCollisions = [...r.constructUsage, ...r.aliasUsage].sort((a, b) => b.files - a.files).slice(0, 8);
  if (topCollisions.length > 0) {
    lines.push(`  keyword-collision top: ${topCollisions.map((w) => `${w.word}(${w.files}f/${w.occurrences}x)`).join(" · ")}`);
  }
  lines.push(`  strict findings (runtime corpus): ${r.strict.length}`);
  return lines.join("\n");
}
