// =============================================================================
// inline-fixtures.ts — extract .fungi fixtures embedded in .mjs/.cjs harness
// files so the corpus scanner SEES them.
//
// Why this exists (the learned check — owner rule "encode learned checks into
// build tools"): the disk scan in scanner.ts only finds *.fungi / *.gate FILES.
// But much of the .fungi corpus lives as backtick-string FIXTURES inside test
// and proof files (foo.test.mjs, some-proof.mjs). That blind spot bit twice:
//   • W4 — two @version proofs wrote fixtures with no header, and the scan never
//     saw them (they are not *.fungi on disk).
//   • W5b — reserving `check`/`fault` as keywords broke six test fixtures that
//     used `flow check(...)`; the scan reported ZERO collisions because those
//     `check` tokens sat inside .mjs strings, invisible to the disk scan.
//
// This module closes that gap: it walks the .mjs/.cjs corpus, extracts every
// backtick template literal that LOOKS like .fungi source, unescapes it, and
// hands it to the SAME real-lexer analysis path (scanFungiSource). The result
// is always classified test-corpus (it lives in a harness file) so it can never
// gate --strict — but its planned-word usage now feeds the collision table,
// which is exactly what a keyword reservation / codemod (W6) must consult.
//
// Extraction posture:
//   • The template-literal EXTRACTION is a small stateful host-language scanner
//     (code / line-comment / block-comment / '…' / "…" / `…` with ${} interp) —
//     NOT a regex — so a backtick inside a comment or a quoted string does not
//     start a spurious fixture. (The .fungi TOKEN analysis downstream is the
//     real compiler lexer, per the owner "never regex for .fungi" rule.)
//   • Fail-safe: a host file that cannot be read or scanned is reported as a
//     finding entry (readError set), never silently skipped.
//   • Known limitation: a JS regex literal that contains `//`, `/*`, or a
//     backtick can confuse the naive comment scan; the failure mode is
//     UNDER-reporting one rare fixture (this tool measures, the compiler
//     enforces), never a crash or a false --strict gate.
// =============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { FileScan } from "./scanner.js";
import { scanFungiSource } from "./scanner.js";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".graph", "coverage", ".claude",
]);

/** Harness files that may carry inline .fungi fixtures (test + proof runners). */
const HOST_EXT = /\.(?:c|m)js$/;

/** Recursively find every .mjs/.cjs host under root (generated/dep dirs skipped). */
export function discoverInlineHosts(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — files inside are unreachable anyway
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name));
      } else if (HOST_EXT.test(e.name)) {
        out.push(join(dir, e.name));
      }
    }
  };
  walk(root);
  out.sort();
  return out;
}

export interface InlineFixture {
  /** 1-based line in the host file where the template literal opens. */
  readonly line: number;
  /** Unescaped fixture body (JS escapes resolved), ready for the .fungi lexer. */
  readonly content: string;
}

/** Does an unescaped template body look like real .fungi source? A single strong
 *  signal is enough — these feed a test-corpus report where a false positive is a
 *  harmless extra entry, while a miss is exactly the bug we are fixing. */
export function looksLikeFungi(body: string): boolean {
  if (/(?:^|\n)[ \t]*@version[ \t]+\S/.test(body)) return true;                        // .fungi header line
  if (/\b(?:pure|secure|unsecure|impure)?[ \t]*flow[ \t]+[A-Za-z_]\w*[ \t]*\(/.test(body)) return true; // flow decl
  if (/\bcontract[ \t]*\{/.test(body)) return true;                                     // contract block
  return false;
}

/** JS single-char escape resolutions used inside template literals. A trailing
 *  backslash-newline is a line continuation (resolves to nothing). Unknown
 *  escapes resolve to the literal char, matching JS semantics. */
const ESCAPES: Readonly<Record<string, string>> = {
  n: "\n", t: "\t", r: "\r", "0": "\0", b: "\b", f: "\f", v: "\v",
  "\\": "\\", "`": "`", "$": "$", "'": "'", '"': '"', "\n": "",
};

function unescape(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (c === "\\" && i + 1 < raw.length) {
      const nx = raw[i + 1]!;
      out += ESCAPES[nx] ?? nx;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

type Frame =
  | { kind: "code"; interp: boolean; depth: number }
  | { kind: "tpl"; buf: string[]; line: number };

/**
 * Extract every backtick template literal that looks like a .fungi fixture.
 * A stateful scanner (not regex): tracks code / line + block comments / quoted
 * strings / nested template literals with `${…}` interpolation, so a backtick in
 * a comment or string never starts a fixture, and an interpolation never ends
 * one early. Interpolations are replaced by a ` _INTERP_ ` identifier placeholder
 * so the surrounding .fungi still lexes cleanly.
 */
export function extractFungiFixtures(src: string): InlineFixture[] {
  const out: InlineFixture[] = [];
  const stack: Frame[] = [{ kind: "code", interp: false, depth: 0 }];
  const top = (): Frame => stack[stack.length - 1]!;
  const n = src.length;
  let i = 0;
  let line = 1;

  while (i < n) {
    const f = top();
    const c = src[i]!;
    const nx = src[i + 1];
    if (c === "\n") line++;

    if (f.kind === "code") {
      if (c === "/" && nx === "/") {                          // line comment
        i += 2;
        while (i < n && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && nx === "*") {                          // block comment
        i += 2;
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
          if (src[i] === "\n") line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (c === "'" || c === '"') {                           // quoted string
        i++;
        while (i < n && src[i] !== c) {
          if (src[i] === "\\") i++;                            // skip escaped char
          else if (src[i] === "\n") line++;
          i++;
        }
        i++;                                                   // closing quote
        continue;
      }
      if (c === "`") {                                        // template opens
        stack.push({ kind: "tpl", buf: [], line });
        i++;
        continue;
      }
      if (c === "{") { f.depth++; i++; continue; }
      if (c === "}") {
        if (f.interp && f.depth === 0) { stack.pop(); i++; continue; } // closes ${…}
        if (f.depth > 0) f.depth--;
        i++;
        continue;
      }
      i++;
      continue;
    }

    // f.kind === "tpl"
    if (c === "\\") {                                         // capture escape pair verbatim
      f.buf.push(c);
      if (i + 1 < n) {
        f.buf.push(src[i + 1]!);
        if (src[i + 1] === "\n") line++;
      }
      i += 2;
      continue;
    }
    if (c === "`") {                                          // template closes
      stack.pop();
      const body = unescape(f.buf.join(""));
      if (looksLikeFungi(body)) out.push({ line: f.line, content: body });
      i++;
      continue;
    }
    if (c === "$" && nx === "{") {                            // interpolation → placeholder
      f.buf.push(" _INTERP_ ");
      stack.push({ kind: "code", interp: true, depth: 0 });
      i += 2;
      continue;
    }
    f.buf.push(c);
    i++;
  }
  return out;
}

/** Minimal finding entry when a host file cannot be read or scanned at all. */
function hostFinding(file: string, readError: string): FileScan {
  return {
    file, kind: "fungi", source: "inline", corpus: "test",
    lexErrors: 0, readError,
    version: { present: false, valid: false, raw: null, value: null },
    legacyOps: { and2: 0, or2: 0 }, legacyIdents: {},
    matches: { total: 0, withoutWildcard: 0, linesWithoutWildcard: [] },
    usage: {}, secureFlow: 0,
  };
}

/**
 * Scan every .mjs/.cjs host under root and return a FileScan per extracted inline
 * .fungi fixture (always test-corpus, source="inline"). Fail-safe: a host that
 * cannot be read or extracted becomes a single finding entry, never a silent skip.
 */
export function scanInlineFixtures(root: string): FileScan[] {
  const out: FileScan[] = [];
  const rel = (abs: string): string => relative(root, abs).split(sep).join("/");
  for (const abs of discoverInlineHosts(root)) {
    const relPath = rel(abs);
    let source: string;
    try {
      source = readFileSync(abs, "utf8");
    } catch (err) {
      out.push(hostFinding(relPath, err instanceof Error ? err.message : String(err)));
      continue;
    }
    let fixtures: InlineFixture[];
    try {
      fixtures = extractFungiFixtures(source);
    } catch (err) {
      out.push(hostFinding(relPath, `inline-extract failed: ${err instanceof Error ? err.message : String(err)}`));
      continue;
    }
    for (const fx of fixtures) {
      const base = scanFungiSource(fx.content, `${relPath}#L${fx.line}`);
      out.push({ ...base, corpus: "test", source: "inline" });
    }
  }
  return out;
}
