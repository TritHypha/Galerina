#!/usr/bin/env node
// code-index.mjs — index EVERY diagnostic/error code in Galerina: its definition, its name/severity,
// and every place it is emitted / tested / documented. A re-runnable dev tool that SAVES TOKENS —
// query build/code-index/CODE_INDEX.md instead of re-grepping the tree. (Owner request, 2026-06-22.)
//
// Namespaces indexed: numeric FUNGI-<FAMILY>-NNN, syntax-admitted descriptive
// FUNGI identities such as FUNGI-FUSE-HASH-MISMATCH, GATE-* diagnostics, and
// ERR_<...> runtime errors. Descriptive prose cannot mint catalog authority.
// Output: build/code-index/code-index.json (machine) + CODE_INDEX.md (human/AI-browsable) + a stdout summary.
// Roles per occurrence: def (exported const / make*Diag definition / object literal with name+severity),
//   emit (push/throw/code: site), test, doc (.md), fungi (.fungi), ref (any other mention).
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { extractCodes, CODE_TEST, familyOf, nsOf } from "./lib/codes.mjs";
import { classifyDescriptiveDiagnosticIdentities } from "./lib/descriptive-diagnostic-identities.mjs";
import { parseRustRuntimeErrorDefinitions, rustLexicalMasks } from "./lib/rust-runtime-error-codes.mjs";
import {
  generatedOutputMatches,
  provenance,
} from "./lib/provenance.mjs"; // BLD-003 / #216 provenance sidecar

const ROOT = process.cwd();
// Argument contract (zero-trust default, owner may revisit): `--help`/`-h` prints usage and exits 0
// WITHOUT writing; any unknown or repeated argument refuses (exit 2) before any read or write. A
// generator owner must never treat an unrecognised flag as a request to regenerate tracked output.
const CODE_INDEX_USAGE = [
  "usage: node scripts/code-index.mjs [--check]",
  "  (no arguments)  regenerate build/code-index/CODE_INDEX.md, code-index.json and provenance.json",
  "  --check         compare the generated output without writing; exit 1 on drift",
  "  --help, -h      print this usage and exit 0 without writing",
].join("\n");
{
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(CODE_INDEX_USAGE);
    process.exit(0);
  }
  const seen = new Set();
  for (const arg of args) {
    if (arg !== "--check" || seen.has(arg)) {
      console.error(`code-index: REFUSED unknown or repeated argument ${JSON.stringify(arg)}; nothing was written.\n${CODE_INDEX_USAGE}`);
      process.exit(2);
    }
    seen.add(arg);
  }
}
const CHECK = process.argv.includes("--check");
const SCAN = ["packages-ts", "docs", "scripts", "governance"].map((d) => join(ROOT, d));
const ROOT_SOURCES = [join(ROOT, "galerina.mjs")];
const OUT = join(ROOT, "build", "code-index");
const EXT = /\.(ts|mjs|cjs|fungi|md|rs)$/;
const SKIP = new Set(["node_modules", "dist", ".git"]);
// Numeric CODE_RE / CODE_TEST / familyOf / nsOf come from the shared codes
// module. Descriptive identities use the bounded lexical classifier rather
// than broadening that regex into family-prefix and example false positives.

function walk(dir) {
  const out = [];
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of ents) {
    if (SKIP.has(d.name)) continue;
    const p = join(dir, d.name);
    if (d.isDirectory()) out.push(...walk(p));
    else if (EXT.test(d.name) && !d.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/**
 * Write generated content, or compare it without writing in `--check` mode.
 * Missing or byte-drifted output leaves the process non-zero.
 */
function emitOutput(path, content) {
  if (!CHECK) {
    writeFileSync(path, content);
    return;
  }
  let actual;
  try {
    actual = readFileSync(path, "utf8");
  } catch {
    console.error(`code-index: missing generated output ${relative(ROOT, path).replace(/\\/g, "/")}`);
    process.exitCode = 1;
    return;
  }
  if (!generatedOutputMatches(path, actual, content)) {
    console.error(`code-index: generated output drift ${relative(ROOT, path).replace(/\\/g, "/")}`);
    process.exitCode = 1;
  }
}

const idx = new Map(); // code -> { occ:[{file,line,role}], names:Set, sevs:Set }
const get = (c) => { if (!idx.has(c)) idx.set(c, { occ: [], names: new Set(), sevs: new Set() }); return idx.get(c); };

/**
 * Capture metadata from one diagnostic object without crossing into the next
 * exported definition or object field. One-line definitions close on the
 * starting line and must never absorb metadata from following declarations.
 */
function captureObjectMetadata(lines, start, entry, limit = 10) {
  for (let j = start; j < Math.min(start + limit, lines.length); j++) {
    const current = lines[j];
    if (j > start && (
      /\bexport const\s+\w+\s*=/.test(current)
      || /^\s*\}/.test(current)
      || /\b(?:code|errorCode):/.test(current)
    )) break;
    const name = current.match(/name:\s*"([^"]+)"/);
    if (name) entry.names.add(name[1]);
    const severity = current.match(/severity:\s*"([^"]+)"/);
    if (severity) entry.sevs.add(severity[1]);
    if (/}\s*(?:as const)?\s*;?\s*$/.test(current)) break;
  }
}

function rustBlockRange(lines, startPattern) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return null;
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
      }
    }
    if (opened && depth === 0) return [start + 1, index + 1];
  }
  return [start + 1, lines.length];
}

const FILES = [
  ...SCAN.flatMap(walk),
  ...ROOT_SOURCES.filter((path) => existsSync(path)),
];

// PASS 1 — constId -> code: `export const <ID> = { … code:"CODE" … }` or `export const <ID> = "CODE"`.
// Lets PASS 2 resolve emits/uses that reference a code by its CONSTANT IDENTIFIER (e.g.
// `code: FUNGI_BOOL_BOUNDARY_001_FAILED_CLOSED`), which the hyphenated code regex cannot see (id ≠ string).
const constToCode = new Map();
for (const file of FILES) {
  let txt; try { txt = readFileSync(file, "utf8"); } catch { continue; }
  const ls = txt.split(/\r?\n/);
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(/export const\s+([A-Za-z_]\w*)\s*=\s*[{"]/);
    if (!m) continue;
    const inWin = extractCodes(ls.slice(i, Math.min(i + 8, ls.length)).join(" "));
    if (inWin.length) constToCode.set(m[1], inWin[0]);
  }
}

for (const file of FILES) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const isTest = /\/tests?\//.test(rel) || /\.test\./.test(rel);
  const isDoc = rel.endsWith(".md");
  const isFungi = rel.endsWith(".fungi");
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);
    if (rel.endsWith(".rs")) {
      const rustLines = rustLexicalMasks(source).code.split(/\r?\n/);
      const definitions = parseRustRuntimeErrorDefinitions(source);
      const byConstant = new Map();
      for (const definition of definitions) {
        if (!definition.code || !/^ERR_[A-Z0-9_]+$/.test(definition.code)) continue;
        const entry = get(definition.code);
        entry.occ.push({ file: rel, line: definition.line, role: "def" });
        if (definition.name) entry.names.add(definition.name);
        if (definition.severity) entry.sevs.add(definition.severity);
        byConstant.set(definition.constant, definition.code);
      }
      const definitionLines = new Set();
      for (const definition of definitions) {
        for (let line = definition.line; line <= definition.endLine; line += 1) {
          definitionLines.add(line);
        }
      }
      const isRustTest = /(?:\/tests\/|\/tests\.rs$|\.test\.rs$)/.test(rel);
      const runtimeEmitRanges = [
        rustBlockRange(rustLines, /\bfn\s+runtime_code\s*\(/),
        rustBlockRange(rustLines, /\bimpl\s+fmt::Display\s+for\s+/),
      ].filter(Boolean);
      for (let index = 0; index < lines.length; index += 1) {
        const lineNumber = index + 1;
        if (definitionLines.has(lineNumber)) continue;
        for (const [constant, code] of byConstant) {
          if (new RegExp(`\\b${constant}\\b`).test(rustLines[index])) {
            const role = isRustTest ? "test"
              : runtimeEmitRanges.some(([start, end]) => lineNumber >= start && lineNumber <= end)
                ? "emit" : "ref";
            get(code).occ.push({ file: rel, line: lineNumber, role });
          }
        }
        for (const literal of rustLines[index].matchAll(/\bERR_[A-Z0-9_]+\b/g)) {
          if ([...byConstant.values()].includes(literal[0])) continue;
          get(literal[0]).occ.push({ file: rel, line: lineNumber, role: isRustTest ? "test" : "ref" });
        }
      }
      continue;
    }
    const descriptive = isDoc || isFungi
      ? { identities: [] }
      : classifyDescriptiveDiagnosticIdentities(source, { testOnly: isTest });
    for (const identity of descriptive.identities) {
      get(identity.code).occ.push({
        file: rel,
        line: identity.line,
        role: "emit",
        catalogIdentity: true,
      });
    }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    // exclude COMMENT lines and TS TYPE positions from emit/def — they mention a code but produce none.
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    // type position (not a runtime emit): `readonly code: "FUNGI-X"`, a "X" | "Y" union, or a `type` alias.
    const isTypeDecl = /\breadonly\b/.test(line) || /"\s*\|\s*"/.test(line) || /^(?:export\s+)?type\s+\w+/.test(trimmed);
    // The compiler parser owns a private diagnostic sink: `this.emit(code, name, message, ...)`.
    // `emit` is otherwise too generic to classify globally (event buses use the same method name),
    // so recognize it only in a source file named parser.ts and inspect a bounded argument window.
    if (!isComment && /(?:^|\/)parser\.ts$/.test(rel) && /\bthis\.emit\s*\(/.test(line)) {
      const start = line.search(/\bthis\.emit\s*\(/);
      const callLines = [line.slice(start)];
      for (let j = i + 1; !/\)\s*;/.test(callLines.at(-1)) && j < Math.min(i + 6, lines.length); j++) {
        callLines.push(lines[j]);
      }
      const win = callLines.join(" ");
      const args = [...win.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      const literalCodeIndex = args.findIndex((arg) => CODE_TEST.test(arg));
      let code = literalCodeIndex >= 0 ? args[literalCodeIndex] : undefined;
      if (!code) {
        for (const match of win.matchAll(/\b([A-Za-z_]\w*)(?:\.(?:code|name))?\b/g)) {
          code = constToCode.get(match[1]);
          if (code) break;
        }
      }
      if (code) {
        const entry = get(code);
        entry.occ.push({ file: rel, line: i + 1, role: isTest ? "test" : "emit" });
        const name = literalCodeIndex >= 0 ? args[literalCodeIndex + 1] : undefined;
        if (!isTest && name && /^[A-Za-z][A-Za-z0-9_]*$/.test(name)) entry.names.add(name);
      }
    }
    // multi-line make*Diag(code, name, ...): attribute the windowed (code, name) as an emit at the
    // make-line, even when the code/name args sit on the following lines (common in governance-verifier.ts).
    if (!isComment && /make\w*Diag\(/.test(line)) {
      const win = line.slice(line.search(/make\w*Diag\(/)) + " " + lines.slice(i + 1, Math.min(i + 5, lines.length)).join(" ");
      const margs = [...win.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const ci = margs.findIndex((a) => CODE_TEST.test(a));
      if (ci >= 0) {
        const e = get(margs[ci]);
        e.occ.push({ file: rel, line: i + 1, role: isDoc ? "doc" : isTest ? "test" : "emit" });
        const nm = margs[ci + 1];
        if (nm && /^[A-Za-z][A-Za-z0-9_]*$/.test(nm) && !isDoc && !isTest) e.names.add(nm);
        // makeTCDiag / makeVSDiag hardcode `severity:"error"` INTERNALLY (no severity arg at the call
        // site), so the field-window scan below never sees it and the code registers severity-blank
        // (the FUNGI-PRIVACY-002 gap). Attribute "error" here. Factories that TAKE a severity arg
        // (governance-verifier's makeGovDiag) are captured at their call site — only the two
        // error-hardcoding factories are inferred.
        if (/make(?:TC|VS)Diag\s*\(/.test(line) && !isDoc && !isTest) e.sevs.add("error");
      }
    }
    // multi-line Error/Exception construction: `throw new SomeError(<newline> ERR_x, msg)` — the code
    // constant sits on a CONTINUATION line, so the same-line throw/emit check below misses it. Window the
    // constructor call and attribute its code token(s) as emits (analogous to the make*Diag windowing above).
    if (!isComment && /\bnew\s+\w*(?:Error|Exception)\s*\(/.test(line)) {
      const win = line.slice(line.search(/\bnew\s+\w*(?:Error|Exception)/))
        + " " + lines.slice(i + 1, Math.min(i + 5, lines.length)).join(" ");
      for (const code of extractCodes(win)) {
        get(code).occ.push({ file: rel, line: i + 1, role: isDoc ? "doc" : isTest ? "test" : "emit" });
      }
    }
    // Diagnostic-construction call with a CONST first arg: `createCompilerDiagnostic(FUNGI_X.code, …)`,
    // `create*Diagnostic(FUNGI_X, …)`, or `make*Diag(FUNGI_X, …)`. The code is named by its constant
    // IDENTIFIER (positional), which neither extractCodes (no literal string) nor the `code: IDENT`
    // field check below sees — so these emit sites were INVISIBLE and the code showed "inline" only via
    // its mis-counted const-def line. Window the call and resolve the FIRST constToCode identifier as an
    // EMIT. (#65/0123 — the false-NEGATIVE half; pairs with the const-def→def fix below. `this.code`/
    // `d.code`/`diagnostic.code` are NOT constToCode keys, so reads of a diagnostic are excluded.)
    if (!isComment && /(?:create\w*Diagnostic|make\w*Diag)\s*\(/.test(line)) {
      const cs = line.search(/(?:create\w*Diagnostic|make\w*Diag)\s*\(/);
      const win = line.slice(cs) + " " + lines.slice(i + 1, Math.min(i + 5, lines.length)).join(" ");
      for (const mm of win.matchAll(/\b([A-Za-z_]\w*)(?:\.(?:code|name|severity))?\b/g)) {
        const cc = constToCode.get(mm[1]);
        if (cc) {
          const e = get(cc);
          e.occ.push({ file: rel, line: i + 1, role: isDoc ? "doc" : isTest ? "test" : "emit" });
          // #125: a `create*Diagnostic(CONST, "NAME", "severity", …)` POSITIONAL call names its code by a
          // const (resolved here) and its severity by a bare string literal — capture the FIRST severity
          // token from the call window (a closed vocabulary error|warning|info, so unambiguous, and it
          // precedes the message) so a positional-const emit like the VAULT/PRIVACY diagnostics is not
          // recorded live-but-blank-severity.
          if (!isDoc && !isTest) { const sv = win.match(/"(error|warning|info)"/); if (sv) e.sevs.add(sv[1]); }
          break;
        }
      }
    }
    // const-identifier emit/use: `code: FUNGI_FOO_001_BAR` / `errorCode: ERR_X` — id ≠ hyphenated code string,
    // so extractCodes misses it; resolve via the PASS-1 map. Runs BEFORE the !codes short-circuit (the line
    // has no literal code token). This is what makes 28 const-emitted diagnostics show as live, not dead.
    if (!isComment && !isTypeDecl) {
      for (const m of line.matchAll(/\b(?:code|errorCode):\s*([A-Za-z_]\w*)/g)) {
        const cc = constToCode.get(m[1]);
        if (!cc) continue;
        const e = get(cc);
        e.occ.push({ file: rel, line: i + 1, role: isDoc ? "doc" : isTest ? "test" : "emit" });
        // #125 severity-capture: the code on THIS line is a CONST identifier, so extractCodes(line) is
        // empty and the name/severity window below (gated on a hyphenated literal) never runs for it. A
        // multi-line `{ code: FUNGI_X_CONST, name: "…", severity: "…" }` diagnostic would then register
        // LIVE but with a BLANK severity (the registry severity-capture gap: 27 FUNGI-* codes). Capture
        // name/severity here from the SAME object, bounded at the object close (`}`) or the next `code:`
        // field so it can never bleed into the following diagnostic object.
        if (!isDoc && !isTest) {
          captureObjectMetadata(lines, i, e);
        }
      }
    }
    const codes = extractCodes(line);
    if (!codes.length) continue;
    const hasNameSev = /name:\s*"[^"]+"/.test(line) && /severity:\s*"[^"]+"/.test(line);
    // A field line (code:/name:/severity:/message:) inside an `export const X = { … }` diagnostic-OBJECT
    // DEFINITION is a DEF, not an emit — the `export const` opener sits a few lines up (a push/return/
    // create*Diagnostic object has a call/return opener instead). Without this, a RESERVED const's
    // `code: "FUNGI-X"` line is mis-read as an emit (role precedence is def>emit), so the const def is
    // never recorded (defs=0) and the code shows "inline" — making a never-emitted reserved code (e.g.
    // FUNGI-MEMORY-001..007) indistinguishable from a live one. Require `export const` so local emit objects
    // (`const d = {…}; push(d)`) are NOT mistaken for defs. (#65/0123 — the false-POSITIVE half.)
    let inConstObjDef = false;
    if (!isComment && !isTypeDecl && /^\s*(?:code|name|severity|message)\s*:/.test(line)) {
      for (let b = i - 1; b >= Math.max(0, i - 8); b--) {
        if (/export const\s+\w+\s*=\s*\{\s*$/.test(lines[b])) { inConstObjDef = true; break; }
        if (/(?:\.push\(|return\b|^\s*\}|;\s*$|create\w*Diagnostic\s*\(|make\w*Diag\s*\()/.test(lines[b])) break;
      }
    }
    const isDef = !isComment && !isTypeDecl && (/export const\s+\w+/.test(line) || hasNameSev || inConstObjDef);
    const isMake = !isComment && /make\w*Diag\(/.test(line);
    // emit = make*Diag, a `code:`/`errorCode:` field set to a code (STRING literal OR an exported
    // constant identifier — e.g. `code: ERR_xxx` in a `{ ok:false, code, reason }` result object;
    // unquoted ERR_ consts were previously mis-classified `ref` → false "dead"), a throw, or a .push.
    const isEmit = !isComment && !isTypeDecl && (isMake
      || /code:\s*"/.test(line)
      || /\b(?:code|errorCode):\s*(?:"?ERR_[A-Z0-9_]+|"FUNGI-)/.test(line)
      || /\bthrow\b/.test(line)
      || /\.push\(/.test(line));
    for (const code of codes) {
      const e = get(code);
      let role = isDoc ? "doc" : isTest ? "test" : isFungi ? "fungi" : (isDef ? "def" : isEmit ? "emit" : "ref");
      e.occ.push({ file: rel, line: i + 1, role });
      // capture name/severity only at code-bearing src lines (def/emit), within a tight window
      if (!isDoc && !isTest && (isDef || isEmit)) {
        captureObjectMetadata(lines, i, e, 6);
        if (isMake) {
          const win = line.slice(line.search(/make\w*Diag\(/)) + " " + lines.slice(i + 1, Math.min(i + 4, lines.length)).join(" ");
          const args = [...win.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
          if (args[0] === code && args[1] && /^[A-Za-z][A-Za-z0-9_]*$/.test(args[1])) e.names.add(args[1]);
        }
      }
    }
  }
}

// ── assemble ──
// A diagnostic code is DEFINED + EMITTED by compiler source (packages-ts/*/src), never by a dev-tool
// SCRIPT — scripts only reference or self-test codes. So a def/emit the heuristic scored inside scripts/ is
// really a REF: e.g. audit-twin-emit-parity.mjs's self-test fixture `makeTCDiag("FUNGI-TYPE-002", …)`, or the
// negative case `// dead: no FUNGI-TYPE-019 emit here — this comment must NOT count`. Downgrading them keeps a
// RESERVED code (defined in src, only fixture-"emitted" in a script — FUNGI-MEMORY-001/COND-001/TYPE-019/
// VAL-001) from being mis-promoted to "live" (RD-0451 surface — the same class as the FUNGI-X fixture, but
// hitting REAL reserved codes). Applied before the dedup so collapsed refs don't double-count.
const isScriptFile = (f) => f.startsWith("scripts/");
// Reserved placeholder families: FUNGI-X-* / FUNGI-Y-* are pure SELF-TEST FIXTURE codes (names "Foo"/"Bar")
// in audit-production-blockers.mjs / audit-artifact-drift.mjs. "X"/"Y" are never real diagnostic families
// (real families are semantic: TYPE/NAME/GOV/EFFECT/MEMORY/…), so drop them entirely; the shared extractCodes
// stays intact (those self-tests still need to see them). The scripts-emit downgrade above handles the
// fixtures that reuse a REAL family (TYPE-099, etc.) — they survive as refs, correctly non-live.
const RESERVED_PLACEHOLDER_FAMILIES = new Set(["X", "Y"]);
const codes = [...idx.entries()]
  .filter(([code]) => !(nsOf(code) === "FUNGI" && RESERVED_PLACEHOLDER_FAMILIES.has(familyOf(code))))
  .map(([code, e]) => {
  const seen = new Set();
  const occ = e.occ
    .map((o) => (isScriptFile(o.file) && !o.catalogIdentity && (o.role === "def" || o.role === "emit")) ? { ...o, role: "ref" } : o)
    .filter((o) => { const k = `${o.file}:${o.line}:${o.role}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return {
    code, namespace: nsOf(code), family: familyOf(code),
    occurrences: occ.length,
    docOnly: occ.every((o) => o.role === "doc"),
    defs: occ.filter((o) => o.role === "def").map((o) => `${o.file}:${o.line}`),
    emits: occ.filter((o) => o.role === "emit").map((o) => `${o.file}:${o.line}`),
    tests: occ.filter((o) => o.role === "test").length,
    refs: occ.filter((o) => o.role === "ref").length,
    docs: occ.filter((o) => o.role === "doc").length,
    names: [...e.names], severities: [...e.sevs],
    allSites: occ.map((o) => `${o.role} ${o.file}:${o.line}`),
  };
}).sort((a, b) => a.code.localeCompare(b.code));

if (!CHECK) mkdirSync(OUT, { recursive: true });
emitOutput(join(OUT, "code-index.json"), JSON.stringify(codes, null, 2));

// markdown (browsable map): grouped by family
const byFam = new Map();
for (const c of codes) { if (!byFam.has(c.family)) byFam.set(c.family, []); byFam.get(c.family).push(c); }
const md = ["# Galerina — Code Index (generated by scripts/code-index.mjs)", "",
  `${codes.length} codes (${codes.filter((c) => !c.docOnly).length} non-doc-only + ${codes.filter((c) => c.docOnly).length} doc-only) · ${codes.reduce((s, c) => s + c.occurrences, 0)} occurrences · ${[...byFam.keys()].length} families.`,
  "Non-doc-only includes fixtures, imports and references; it does not establish production registration. Test-site counts are lexical mentions, not executed or passing tests. Definition and emission sites require source verification.",
  "Query this instead of grepping. Regenerate: `node scripts/code-index.mjs`.", ""];
for (const fam of [...byFam.keys()].sort()) {
  md.push(`## ${fam} (${byFam.get(fam).length})`, "", "| code | name(s) | severity | def | emit sites | test sites | doc sites |", "|---|---|---|---|---|---|---|");
  for (const c of byFam.get(fam)) {
    md.push(`| ${c.code} | ${c.names.join(" / ") || "—"} | ${c.severities.join("/") || "—"} | ${c.defs[0] ?? "—"} | ${c.emits.length} | ${c.tests} | ${c.docs} |`);
  }
  md.push("");
}
emitOutput(join(OUT, "CODE_INDEX.md"), md.join("\n"));
emitOutput(
  join(OUT, "provenance.json"),
  JSON.stringify(provenance("code-index", ROOT), null, 2) + "\n",
);

// stdout summary (concise — don't pull the whole index into context)
const nNoDef = codes.filter((c) => c.defs.length === 0 && c.emits.length > 0).length;
const nDeadDef = codes.filter((c) => c.defs.length > 0 && c.emits.length === 0 && c.tests === 0).length;
const srcCodes = codes.filter((c) => !c.docOnly);
const docOnly = codes.filter((c) => c.docOnly);
console.log(`code-index: ${codes.length} total = ${srcCodes.length} non-doc-only + ${docOnly.length} doc-only · ${srcCodes.filter((c) => c.namespace === "FUNGI").length} FUNGI non-doc-only, ${srcCodes.filter((c) => c.namespace === "ERR").length} ERR non-doc-only · ${[...byFam.keys()].length} families`);
console.log(`  emission sites without indexed definitions: ${nNoDef}   definitions without indexed emission/test sites: ${nDeadDef}   doc-only codes: ${docOnly.length}; lexical sites are not execution evidence`);
console.log(`  -> ${CHECK ? "checked" : "wrote"} build/code-index/CODE_INDEX.md + code-index.json + provenance.json`);
