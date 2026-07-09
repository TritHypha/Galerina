// =============================================================================
// scanner.ts — token-level syntax-migration scanner for the .fungi/.gate corpus.
// =============================================================================
// 2026-07-08 syntax update (docs/SYNTAX_UPDATE_PLAN.md, W2). Measures every file
// against the migration: @version headers, legacy forms (&&/||, vAnd/vOr/vNot),
// match-without-wildcard, and usage of every PLANNED keyword (which is a
// collision risk BEFORE the word is reserved, and an adoption metric AFTER).
//
// All detection runs on the REAL compiler lexer's token stream — never regex —
// because regex misses `@version` headers, no-space operator forms (`x&&y`),
// and dotted/slashed names (`net.fetch`, `a/b`). Enforcement lives in the
// compiler; this tool only measures, so the parser/verifier stay the authority.
//
// Fail-closed reporting posture: a file that cannot be read or lexed is a
// FINDING (counted, listed), never silently skipped.
// =============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { lex, type Token } from "@galerina/core-compiler";
import { scanInlineFixtures } from "./inline-fixtures.js";

// ── planned-word tables (docs/SYNTAX_UPDATE_PLAN.md §2 W5) ──────────────────

/** New governance/logic constructs planned for reservation (PROMPT §2.1–2.5). */
export const PLANNED_CONSTRUCT_WORDS: readonly string[] = [
  "check", "fault", "flip", "all", "any",
  "sealed", "auto", "schema", "prefilter",
  "unsecure", "purify", "through", "destination", "breach", "authorize",
];

/** Ergonomic rename aliases planned as pure lexer sugar (PROMPT §2.6). */
export const PLANNED_ALIAS_WORDS: readonly string[] = [
  "modulate", "stream", "each", "prism", "fuse", "refract", "crystallize",
  "project", "release", "deflect", "graft", "purge", "vacuum", "tether",
  "illuminate", "drop", "cast",
];

/** Legacy K3 combinator names being retired from the language surface. */
export const LEGACY_VERDICT_IDENTS: readonly string[] = ["vAnd", "vOr", "vNot"];

// ── result shapes ────────────────────────────────────────────────────────────

export interface VersionHeader {
  /** `@version …` is literally the first line of the file. */
  readonly present: boolean;
  /** Present AND matches the grammar for this file kind (int for .fungi, semver for .gate). */
  readonly valid: boolean;
  /** The raw first line when present (trimmed). */
  readonly raw: string | null;
  /** The parsed version value when valid. */
  readonly value: string | null;
}

export interface MatchStats {
  readonly total: number;
  /** match blocks with neither a `_` arm nor a `when` guard arm (RD-0240 exposure). */
  readonly withoutWildcard: number;
  readonly linesWithoutWildcard: readonly number[];
}

export interface FileScan {
  /** Repo-relative path with forward slashes. Inline fixtures append `#L<line>`
   *  to name the host file + the line the fixture opens on. */
  readonly file: string;
  readonly kind: "fungi" | "gate";
  /** "disk" = a real .fungi/.gate file. "inline" = a backtick `.fungi` fixture
   *  extracted from a .mjs/.cjs harness file (test/proof). Absent ⇒ "disk".
   *  Inline fixtures are always test-corpus (strict-exempt) but their planned-word
   *  usage feeds the collision table — the blind spot this closes (see
   *  inline-fixtures.ts; it bit W4 @version proofs and the W5b keyword reserve). */
  readonly source?: "disk" | "inline";
  /** "test" = under a tests/ or fixtures/ path segment (negative fixtures allowed
   *  to hold old syntax). "signed-frozen" = inside a REAL-SIGNED fusable package
   *  (CG-7: the .lmanifest binds the source hash, so the file is byte-frozen until
   *  the offline re-sign ceremony — it must NOT be migrated in place and is exempt
   *  from --strict, but the debt is REPORTED, never silent). Everything else is
   *  "runtime" corpus and must migrate. */
  readonly corpus: "runtime" | "test" | "signed-frozen";
  /** Lexer error-severity diagnostics (a file that cannot lex is a finding). */
  readonly lexErrors: number;
  /** File could not even be read — always a finding, never skipped. */
  readonly readError: string | null;
  readonly version: VersionHeader;
  /** Legacy two-char boolean operators (to migrate to `and`/`or`). */
  readonly legacyOps: { readonly and2: number; readonly or2: number };
  /** Legacy verdict-combinator identifiers (vAnd/vOr/vNot). */
  readonly legacyIdents: Readonly<Record<string, number>>;
  readonly matches: MatchStats;
  /** Occurrences of each planned word (identifier OR keyword token).
   *  Pre-reservation: collision risk. Post-reservation: adoption. */
  readonly usage: Readonly<Record<string, number>>;
  /** `secure flow` adjacent-token pairs (taint surface adoption). */
  readonly secureFlow: number;
}

export interface CorpusScan {
  readonly root: string;
  readonly files: readonly FileScan[];
}

// ── corpus discovery ─────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".graph", "coverage", ".claude",
]);

const TEST_SEGMENT = /^(tests?|fixtures?|__tests__)$/i;

/** Recursively find every .fungi and .gate under root (generated/dep dirs skipped). */
export function discoverCorpus(root: string): { fungi: string[]; gate: string[] } {
  const fungi: string[] = [];
  const gate: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir (junction stub etc.) — files inside are unreachable anyway
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
      } else if (e.name.endsWith(".fungi")) {
        fungi.push(join(dir, e.name));
      } else if (e.name.endsWith(".gate")) {
        gate.push(join(dir, e.name));
      }
    }
  };
  walk(root);
  fungi.sort();
  gate.sort();
  return { fungi, gate };
}

function classifyCorpus(relPath: string): "runtime" | "test" {
  return relPath.split(/[\\/]/).some((seg) => TEST_SEGMENT.test(seg)) ? "test" : "runtime";
}

/**
 * Find package roots whose dist/<name>.lmanifest.json carries a REAL signature.
 * Mirrors scripts/lib/signed-lmanifest.mjs `isRealSignedManifest` (keyId +
 * non-placeholder signature) — kept in sync by the shared test expectation;
 * the lib is plain-scripts side and this package must stay self-contained.
 * Learned 2026-07-08: the version-stamp codemod dirtied 2 signed packages and
 * audit-signed-fixture-drift went red — this class is now machine-checked here.
 */
export function findSignedPackageRoots(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile() && e.name === "package.fungi.json") {
        try {
          const name = (JSON.parse(readFileSync(join(dir, e.name), "utf8")) as { name?: string }).name;
          if (typeof name === "string") {
            const manifest = JSON.parse(readFileSync(join(dir, "dist", `${name}.lmanifest.json`), "utf8")) as {
              governanceSignature?: { keyId?: unknown; signature?: unknown };
            };
            const sig = manifest.governanceSignature;
            if (
              sig !== null && typeof sig === "object" &&
              typeof sig.keyId === "string" && typeof sig.signature === "string" &&
              sig.signature.length > 0 && !sig.signature.startsWith("placeholder")
            ) {
              out.push(dir);
            }
          }
        } catch {
          /* absent/unreadable manifest → not signed; the drift auditor owns deeper checks */
        }
      } else if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
        walk(join(dir, e.name), depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

// ── version header ───────────────────────────────────────────────────────────

const FUNGI_VERSION_RE = /^@version[ \t]+([1-9][0-9]*)[ \t]*(?:\/\/.*)?$/;
const GATE_VERSION_RE = /^@version[ \t]+([0-9]+\.[0-9]+\.[0-9]+)[ \t]*(?:\/\/.*|#.*)?$/;

/** The header must be LITERALLY the first line on disk (W4 sequencing depends on this).
 *  A leading UTF-8 BOM is tolerated — much of the corpus carries one. */
export function readVersionHeader(source: string, kind: "fungi" | "gate"): VersionHeader {
  const noBom = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const firstLine = (noBom.split(/\r?\n/, 1)[0] ?? "").trim();
  if (!firstLine.startsWith("@version")) {
    return { present: false, valid: false, raw: null, value: null };
  }
  const m = kind === "fungi" ? FUNGI_VERSION_RE.exec(firstLine) : GATE_VERSION_RE.exec(firstLine);
  if (m === null) {
    return { present: true, valid: false, raw: firstLine, value: null };
  }
  return { present: true, valid: true, raw: firstLine, value: m[1] ?? null };
}

// ── token-stream analysis (.fungi) ───────────────────────────────────────────

const WILDCARDISH = new Set(["_", "else", "default", "None"]);

interface TokenAnalysis {
  readonly and2: number;
  readonly or2: number;
  readonly legacyIdents: Record<string, number>;
  readonly matches: MatchStats;
  readonly usage: Record<string, number>;
  readonly secureFlow: number;
}

function analyzeTokens(tokens: readonly Token[]): TokenAnalysis {
  // The lexer does not emit comment/whitespace tokens, but filter defensively so
  // adjacency checks (`secure flow`) stay correct if that ever changes.
  const ts = tokens.filter((t) => (t.kind as string) !== "comment");

  let and2 = 0;
  let or2 = 0;
  let secureFlow = 0;
  const legacyIdents: Record<string, number> = {};
  const usage: Record<string, number> = {};
  const plannedWords = new Set<string>([...PLANNED_CONSTRUCT_WORDS, ...PLANNED_ALIAS_WORDS]);
  const legacySet = new Set<string>(LEGACY_VERDICT_IDENTS);

  let matchTotal = 0;
  let matchWithout = 0;
  const linesWithout: number[] = [];

  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    if (t.value === "&&") and2++;
    else if (t.value === "||") or2++;

    if ((t.kind === "identifier" || t.kind === "keyword") && plannedWords.has(t.value)) {
      usage[t.value] = (usage[t.value] ?? 0) + 1;
    }
    if (t.kind === "identifier" && legacySet.has(t.value)) {
      legacyIdents[t.value] = (legacyIdents[t.value] ?? 0) + 1;
    }
    if (t.value === "secure" && ts[i + 1]?.value === "flow") secureFlow++;

    // ── match exhaustiveness (report-level; the verifier is the enforcer) ──
    if (t.kind === "keyword" && t.value === "match") {
      matchTotal++;
      // find the arm-block "{" at paren-depth 0 after the subject
      let j = i + 1;
      let parenDepth = 0;
      while (j < ts.length) {
        const v = ts[j]!.value;
        if (v === "(") parenDepth++;
        else if (v === ")") parenDepth--;
        else if (v === "{" && parenDepth === 0) break;
        j++;
      }
      if (j >= ts.length) {
        // malformed match (no arm block) — count as without-wildcard, fail-closed
        matchWithout++;
        linesWithout.push(t.line);
        continue;
      }
      // walk the balanced arm block; look for a wildcard-ish arm or a `when` guard at depth 1
      let depth = 0;
      let covered = false;
      for (let k = j; k < ts.length; k++) {
        const v = ts[k]!.value;
        if (v === "{") depth++;
        else if (v === "}") {
          depth--;
          if (depth === 0) break;
        } else if (depth === 1) {
          const next = ts[k + 1]?.value;
          if (WILDCARDISH.has(v) && (next === ":" || next === "=>")) covered = true;
          if (ts[k]!.kind === "keyword" && v === "when") covered = true; // guard match — boolean, not enum-exhaustive
        }
      }
      if (!covered) {
        matchWithout++;
        linesWithout.push(t.line);
      }
    }
  }

  return {
    and2,
    or2,
    legacyIdents,
    matches: { total: matchTotal, withoutWildcard: matchWithout, linesWithoutWildcard: linesWithout },
    usage,
    secureFlow,
  };
}

const EMPTY_MATCHES: MatchStats = { total: 0, withoutWildcard: 0, linesWithoutWildcard: [] };

// ── per-file scan ────────────────────────────────────────────────────────────

export function scanFungiSource(source: string, relPath: string): Omit<FileScan, "corpus"> {
  const version = readVersionHeader(source, "fungi");
  // Lex WITHOUT the header line so a future header never distorts token analysis
  // (today the lexer has no @version rule; post-W4 the parser owns it).
  const body = version.present ? source.slice(source.indexOf("\n") + 1) : source;
  const result = lex(body, relPath);
  const lexErrors = result.diagnostics.filter((d) => d.severity === "error").length;
  const a = analyzeTokens(result.tokens);
  return {
    file: relPath,
    kind: "fungi",
    lexErrors,
    readError: null,
    version,
    legacyOps: { and2: a.and2, or2: a.or2 },
    legacyIdents: a.legacyIdents,
    matches: a.matches,
    usage: a.usage,
    secureFlow: a.secureFlow,
  };
}

/** .gate is NOT .fungi grammar — header check only; gate-parser stays its authority.
 *  (.gate is never a runtime code file — owner rule 2026-07-08.) */
export function scanGateSource(source: string, relPath: string): Omit<FileScan, "corpus"> {
  return {
    file: relPath,
    kind: "gate",
    lexErrors: 0,
    readError: null,
    version: readVersionHeader(source, "gate"),
    legacyOps: { and2: 0, or2: 0 },
    legacyIdents: {},
    matches: EMPTY_MATCHES,
    usage: {},
    secureFlow: 0,
  };
}

export function scanCorpus(root: string): CorpusScan {
  const { fungi, gate } = discoverCorpus(root);
  const files: FileScan[] = [];
  const rel = (abs: string): string => relative(root, abs).split(sep).join("/");
  const signedRoots = findSignedPackageRoots(root).map((d) => d + sep);

  for (const [list, kind] of [[fungi, "fungi"], [gate, "gate"]] as const) {
    for (const abs of list) {
      const relPath = rel(abs);
      const corpus: FileScan["corpus"] = signedRoots.some((d) => abs.startsWith(d))
        ? "signed-frozen"
        : classifyCorpus(relPath);
      let source: string;
      try {
        source = readFileSync(abs, "utf8");
      } catch (err) {
        // fail-closed: unreadable file is a FINDING, not a skip
        files.push({
          file: relPath, kind, corpus, lexErrors: 0,
          readError: err instanceof Error ? err.message : String(err),
          version: { present: false, valid: false, raw: null, value: null },
          legacyOps: { and2: 0, or2: 0 }, legacyIdents: {},
          matches: EMPTY_MATCHES, usage: {}, secureFlow: 0,
        });
        continue;
      }
      const base = kind === "fungi" ? scanFungiSource(source, relPath) : scanGateSource(source, relPath);
      files.push({ ...base, corpus, source: "disk" });
    }
  }
  // Close the disk-only blind spot: also scan .fungi fixtures embedded as backtick
  // strings inside .mjs/.cjs harness files. Always test-corpus, so strict-exempt —
  // but their planned-word usage now feeds the collision table (W6 must see it).
  files.push(...scanInlineFixtures(root));
  return { root, files };
}

// ── strict gate (post-migration): runtime corpus must be fully migrated ──────

export interface StrictFinding {
  readonly file: string;
  readonly why: string;
}

/** Findings that block in --strict mode. Test-corpus files are exempt (negative
 *  fixtures legitimately hold old/bad syntax to prove detectors fire); signed-frozen
 *  files are exempt (byte-frozen by CG-7 until the re-sign ceremony) but their count
 *  is surfaced by the report so the ceremony debt never goes invisible. */
export function strictFindings(scan: CorpusScan): StrictFinding[] {
  const out: StrictFinding[] = [];
  for (const f of scan.files) {
    if (f.corpus !== "runtime") continue;
    if (f.readError !== null) out.push({ file: f.file, why: `unreadable: ${f.readError}` });
    if (f.lexErrors > 0) out.push({ file: f.file, why: `${f.lexErrors} lexer error(s)` });
    if (!f.version.present) out.push({ file: f.file, why: "missing @version header (BK-4/A4)" });
    else if (!f.version.valid) out.push({ file: f.file, why: `malformed @version header: ${f.version.raw}` });
    if (f.legacyOps.and2 > 0 || f.legacyOps.or2 > 0) {
      out.push({ file: f.file, why: `legacy &&/|| (${f.legacyOps.and2 + f.legacyOps.or2}) — migrate to and/or` });
    }
    const legacyCount = Object.values(f.legacyIdents).reduce((s, n) => s + n, 0);
    if (legacyCount > 0) out.push({ file: f.file, why: `legacy vAnd/vOr/vNot identifiers (${legacyCount})` });
    if (f.matches.withoutWildcard > 0) {
      out.push({
        file: f.file,
        why: `${f.matches.withoutWildcard} match block(s) without _ arm (RD-0240) at line(s) ${f.matches.linesWithoutWildcard.join(", ")}`,
      });
    }
  }
  return out;
}
