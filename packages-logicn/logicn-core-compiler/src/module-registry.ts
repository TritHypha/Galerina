// =============================================================================
// LogicN Module Registry — File-based import resolution (DAG merge)
//
// Resolves `import "./path.lln"` declarations by loading and parsing the
// referenced file, extracting its exported symbols (flows, types, records,
// guards, statics, bitfields), and making them available in the importing
// file's scope.
//
// This is the Stage-A implementation of multi-file compilation. It uses
// synchronous I/O so it fits cleanly into the existing synchronous compileFile()
// pipeline in cli.ts.
//
// DAG merge semantics:
//   - Imported files share the project's governance ceiling (boot.lln)
//   - Each file's flows carry their own contract {}
//   - Circular imports: detected via in-progress Set, produce LLN-IMPORT-003
//
// LLN diagnostic codes:
//   LLN-IMPORT-001  File not found at the resolved path
//   LLN-IMPORT-002  Imported file has parse errors (cannot merge)
//   LLN-IMPORT-003  Circular import detected
//   LLN-IMPORT-004  Symbol collision — imported name conflicts with local definition
//   LLN-IMPORT-005  Import path escapes the allowed project root (pre-governance path traversal)
//   LLN-IMPORT-006  Imported file exceeds the maximum size (compile-time DoS guard)
// =============================================================================

import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { parseProgram } from "./parser.js";
import type { AstNode } from "./parser.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FileImportedSymbol {
  /** The bare name that enters scope (e.g. "addTwo", "Order"). */
  readonly name: string;
  /** The kind of declaration. */
  readonly kind: "flow" | "type" | "record" | "guard" | "static" | "bitfield";
  /** Absolute path of the file this symbol was declared in. */
  readonly sourceFile: string;
  /** The AST node for the declaration. */
  readonly node: AstNode;
}

export interface FileModuleDiagnostic {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  /** The file that contains the import statement. */
  readonly file: string;
  /** The raw import path string as written in source. */
  readonly importedFrom: string;
}

export interface ResolvedFileModule {
  /** Absolute path to the imported file. */
  readonly filePath: string;
  /** All symbols exported by this file (transitively resolved). */
  readonly symbols: readonly FileImportedSymbol[];
  /** Any diagnostics generated while resolving this module. */
  readonly diagnostics: readonly FileModuleDiagnostic[];
}

// ---------------------------------------------------------------------------
// Path extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw file path from an importDecl.value.
 *
 * The parser stores the full import clause as a space-joined token string.
 * For `import "./path.lln"` the value is `"./path.lln"` (quotes included
 * because the lexer keeps the surrounding quote characters in string tokens).
 *
 * Returns null if the value does not look like a relative file path.
 */
function extractFilePath(importDeclValue: string): string | null {
  const trimmed = importDeclValue.trim();
  // Strip surrounding quote characters (single or double)
  const unquoted = trimmed.replace(/^["']|["']$/g, "");
  // Only handle explicit relative paths (./ or ../)
  if (!unquoted.startsWith("./") && !unquoted.startsWith("../")) return null;
  // Must end with .lln
  if (!unquoted.endsWith(".lln")) return null;
  return unquoted;
}

// ---------------------------------------------------------------------------
// Flow kind set
// ---------------------------------------------------------------------------

const FLOW_KINDS = new Set([
  "flowDecl",
  "pureFlowDecl",
  "secureFlowDecl",
  "guardedFlowDecl",
  "governedFlowDecl",
]);

// ---------------------------------------------------------------------------
// Symbol extraction
// ---------------------------------------------------------------------------

/**
 * Extract top-level exported symbols from a parsed AST.
 * Only program-level (top-level) declarations are exported.
 */
function extractSymbols(
  ast: AstNode,
  sourceFile: string,
): FileImportedSymbol[] {
  const symbols: FileImportedSymbol[] = [];

  for (const node of ast.children ?? []) {
    const kind = node.kind;

    if (FLOW_KINDS.has(kind)) {
      // For governed flows, node.value may be "governed:floor:name" — take last segment
      const rawName = node.value ?? "";
      const name = rawName.includes(":") ? (rawName.split(":").pop() ?? rawName) : rawName;
      if (name) {
        symbols.push({ name, kind: "flow", sourceFile, node });
      }
      continue;
    }

    if (kind === "typeDecl" || kind === "enumDecl") {
      const name = node.value ?? "";
      if (name) symbols.push({ name, kind: "type", sourceFile, node });
      continue;
    }

    if (kind === "recordDecl") {
      const name = node.value ?? "";
      if (name) symbols.push({ name, kind: "record", sourceFile, node });
      continue;
    }

    if (kind === "guardDecl") {
      const name = node.value ?? "";
      if (name) symbols.push({ name, kind: "guard", sourceFile, node });
      continue;
    }

    if (kind === "staticDecl") {
      const name = node.value ?? "";
      if (name) symbols.push({ name, kind: "static", sourceFile, node });
      continue;
    }

    if (kind === "bitfieldDecl") {
      const name = node.value ?? "";
      if (name) symbols.push({ name, kind: "bitfield", sourceFile, node });
      continue;
    }
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Pre-governance read safety (LLN-IMPORT-005 / -006)
//
// Import resolution reads files from disk DURING COMPILATION, before any governance
// applies. Two abuses are closed here:
//   • Path traversal — a malicious `import "../../../../etc/secret.lln"` would, with
//     no containment, read an arbitrary host file (its content is then parsed and can
//     surface via diagnostics / merged symbols). The resolved path MUST stay within the
//     allowed root (LOGICN_FS_ROOT, else cwd), checked segment-safe (path.relative) AND
//     after symlink canonicalization (realpathSync) — the same two-layer defence the
//     runtime fs sandbox uses (stdlib.ts), so an in-root symlink can't point outside.
//   • Oversize read — readFileSync slurps the whole file into memory; a multi-hundred-MB
//     import could OOM the compiler before the lexer's own 10 MB ceiling is reached. The
//     size is stat-checked BEFORE the read so an oversize import fails fast.
// ---------------------------------------------------------------------------

/** Max bytes for a single imported .lln — matches the lexer's 10 MB source ceiling (LLN-LEX-004). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** The compile-time filesystem root that imports may not escape (same convention as the runtime sandbox). */
function importContainmentRoot(): string {
  const env = (process as unknown as { env: Record<string, string | undefined> }).env;
  return resolve(env["LOGICN_FS_ROOT"] ?? process.cwd());
}

/**
 * True iff `target` is contained within `root`. Two layers, BOTH must agree (either alone is bypassable):
 *   1. segment-safe — relative(root, target) must not start with ".." or be absolute (blocks ../ traversal
 *      and sibling-prefix bypasses such as `/root-evil` vs `/root`).
 *   2. symlink-safe — the same check after realpathSync canonicalizes the nearest existing ancestor
 *      (blocks an in-root symlink that resolves outside the root). Canonicalizing both sides also avoids a
 *      false reject when the root itself sits behind a symlink (e.g. macOS /tmp → /private/tmp).
 * Fails closed: any realpath error (broken symlink / race) is treated as "not contained".
 */
export function isWithinRoot(target: string, root: string): boolean {
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) return false;
  try {
    const realRoot = realpathSync(root);
    const check = existsSync(target) ? target
      : existsSync(resolve(target, "..")) ? resolve(target, "..")
        : root;
    const realRel = relative(realRoot, realpathSync(check));
    if (realRel.startsWith("..") || isAbsolute(realRel)) return false;
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Core resolution logic (synchronous)
// ---------------------------------------------------------------------------

/**
 * Resolve all `import "./path.lln"` declarations in a source file.
 *
 * Uses synchronous I/O so it fits into the existing synchronous
 * compileFile() pipeline without requiring async/await restructuring.
 *
 * @param sourceFile   Absolute path to the file containing the import statements
 * @param importDecls  Array of importDecl AST nodes from the parser
 * @param inProgress   Set of absolute paths currently being resolved (cycle detection)
 * @returns            One ResolvedFileModule per import declaration attempted
 */
export function resolveFileImports(
  sourceFile: string,
  importDecls: readonly AstNode[],
  inProgress: Set<string> = new Set(),
): ResolvedFileModule[] {
  const results: ResolvedFileModule[] = [];
  const sourceDir = dirname(sourceFile);
  const containmentRoot = importContainmentRoot();

  for (const decl of importDecls) {
    if (decl.kind !== "importDecl") continue;

    const rawValue = (decl.value ?? "").trim();
    const relPath = extractFilePath(rawValue);
    if (relPath === null) continue; // not a file import — skip (package import handled elsewhere)

    const resolvedPath = resolve(sourceDir, relPath);

    // LLN-IMPORT-005: path-traversal guard. The resolved path is checked for containment BEFORE any fs
    // access — a pre-governance import must never read a file outside its allowed scope. Allowed scope =
    // the project root (LOGICN_FS_ROOT, else cwd) OR the importing file's OWN directory subtree. The
    // second clause lets a file import its neighbours (`./sibling.lln`) even when the file itself lives
    // outside cwd (e.g. compiling a one-off file, or a fixture under a temp dir) — importing a neighbour
    // is always legitimate. Escaping BOTH (a project file's `../../../etc/passwd`) still fails closed: a
    // `../` chain that climbs above the project AND above the source dir is denied.
    if (!isWithinRoot(resolvedPath, containmentRoot) && !isWithinRoot(resolvedPath, sourceDir)) {
      results.push({
        filePath: resolvedPath,
        symbols: [],
        diagnostics: [{
          code: "LLN-IMPORT-005",
          severity: "error",
          message:
            `Import path '${relPath}' escapes the allowed project root. Imports may only reference ` +
            `files within the project root '${containmentRoot}' (set LOGICN_FS_ROOT to widen it).`,
          file: sourceFile,
          importedFrom: relPath,
        }],
      });
      continue;
    }

    // LLN-IMPORT-001: File not found
    if (!existsSync(resolvedPath)) {
      results.push({
        filePath: resolvedPath,
        symbols: [],
        diagnostics: [{
          code: "LLN-IMPORT-001",
          severity: "error",
          message:
            `Cannot resolve import: file not found at '${resolvedPath}'. ` +
            `Check the path relative to '${relative(process.cwd(), sourceFile)}'.`,
          file: sourceFile,
          importedFrom: relPath,
        }],
      });
      continue;
    }

    // LLN-IMPORT-003: Circular import
    if (inProgress.has(resolvedPath)) {
      results.push({
        filePath: resolvedPath,
        symbols: [],
        diagnostics: [{
          code: "LLN-IMPORT-003",
          severity: "error",
          message:
            `Circular import detected: '${relative(process.cwd(), resolvedPath)}' ` +
            `is already being resolved in this chain. Circular imports are not permitted.`,
          file: sourceFile,
          importedFrom: relPath,
        }],
      });
      continue;
    }

    // LLN-IMPORT-006: size guard — stat BEFORE the read so an oversize import fails fast instead of
    // being slurped whole into memory (compile-time OOM/DoS). The lexer's own 10 MB ceiling runs only
    // AFTER the bytes are already resident, so this pre-read check is the one that prevents the spike.
    try {
      const bytes = statSync(resolvedPath).size;
      if (bytes > MAX_IMPORT_BYTES) {
        results.push({
          filePath: resolvedPath,
          symbols: [],
          diagnostics: [{
            code: "LLN-IMPORT-006",
            severity: "error",
            message:
              `Imported file '${relative(process.cwd(), resolvedPath)}' is ${bytes} bytes, exceeding ` +
              `the ${MAX_IMPORT_BYTES}-byte import limit.`,
            file: sourceFile,
            importedFrom: relPath,
          }],
        });
        continue;
      }
    } catch {
      // stat failed (vanished/permission) — fall through; the read below yields the canonical LLN-IMPORT-001.
    }

    // Read the imported file
    let importedSource: string;
    try {
      importedSource = readFileSync(resolvedPath, "utf8");
    } catch (e) {
      results.push({
        filePath: resolvedPath,
        symbols: [],
        diagnostics: [{
          code: "LLN-IMPORT-001",
          severity: "error",
          message: `Cannot read file '${resolvedPath}': ${String(e)}`,
          file: sourceFile,
          importedFrom: relPath,
        }],
      });
      continue;
    }

    // Parse the imported file (parseProgram lexes internally)
    const parseResult = parseProgram(importedSource, resolvedPath);

    // LLN-IMPORT-002: Parse errors
    if (parseResult.diagnostics.some(d => d.severity === "error")) {
      results.push({
        filePath: resolvedPath,
        symbols: [],
        diagnostics: [{
          code: "LLN-IMPORT-002",
          severity: "error",
          message:
            `Imported file '${relative(process.cwd(), resolvedPath)}' has parse errors ` +
            `and cannot be merged. Fix errors in the imported file first.`,
          file: sourceFile,
          importedFrom: relPath,
        }],
      });
      continue;
    }

    // Mark as in-progress for circular import detection
    inProgress.add(resolvedPath);

    // Extract top-level symbols from this file
    const symbols: FileImportedSymbol[] = extractSymbols(parseResult.ast, resolvedPath);

    // Recursively resolve nested imports in the imported file
    const nestedImportDecls = (parseResult.ast.children ?? []).filter(
      c => c.kind === "importDecl",
    );
    if (nestedImportDecls.length > 0) {
      const nestedResults = resolveFileImports(resolvedPath, nestedImportDecls, inProgress);
      for (const nestedMod of nestedResults) {
        // Propagate nested symbols into this module's symbol set
        symbols.push(...nestedMod.symbols);
        // Propagate nested diagnostics as separate result entries
        if (nestedMod.diagnostics.length > 0) {
          results.push(nestedMod);
        }
      }
    }

    inProgress.delete(resolvedPath);

    results.push({ filePath: resolvedPath, symbols, diagnostics: [] });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Symbol collision check
// ---------------------------------------------------------------------------

/**
 * Check for symbol name collisions between imported symbols and local definitions.
 *
 * Returns LLN-IMPORT-004 diagnostics (warnings) for any conflicts.
 * Local definitions always take precedence — the warning is informational.
 *
 * @param importedSymbols   Symbols gathered from all resolved imports
 * @param localSymbolNames  Set of names declared locally in the importing file
 * @param sourceFile        Path of the importing file (for diagnostic location)
 */
export function checkFileSymbolCollisions(
  importedSymbols: readonly FileImportedSymbol[],
  localSymbolNames: ReadonlySet<string>,
  sourceFile: string,
): FileModuleDiagnostic[] {
  const diagnostics: FileModuleDiagnostic[] = [];
  const seen = new Map<string, string>(); // name → sourceFile

  for (const sym of importedSymbols) {
    if (localSymbolNames.has(sym.name)) {
      diagnostics.push({
        code: "LLN-IMPORT-004",
        severity: "warning",
        message:
          `Imported symbol '${sym.name}' from '${relative(process.cwd(), sym.sourceFile)}' ` +
          `conflicts with a local definition. The local definition takes precedence.`,
        file: sourceFile,
        importedFrom: sym.sourceFile,
      });
    } else if (seen.has(sym.name)) {
      const prev = seen.get(sym.name)!;
      diagnostics.push({
        code: "LLN-IMPORT-004",
        severity: "warning",
        message:
          `Symbol '${sym.name}' imported from multiple files. ` +
          `'${relative(process.cwd(), sym.sourceFile)}' shadows ` +
          `'${relative(process.cwd(), prev)}'.`,
        file: sourceFile,
        importedFrom: sym.sourceFile,
      });
    } else {
      seen.set(sym.name, sym.sourceFile);
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Convenience: collect all file-import symbols for a compiled file
// ---------------------------------------------------------------------------

/**
 * High-level helper: given a parsed AST and the absolute path to its source
 * file, resolve all `import "./path.lln"` declarations and return a flat list
 * of all imported symbols plus any diagnostics.
 *
 * This is the primary entry point used by cli.ts.
 */
export function gatherFileImports(
  ast: AstNode,
  sourceFile: string,
): {
  readonly symbols: readonly FileImportedSymbol[];
  readonly diagnostics: readonly FileModuleDiagnostic[];
  readonly resolvedPaths: readonly string[];
} {
  const importDecls = (ast.children ?? []).filter(c => c.kind === "importDecl");
  if (importDecls.length === 0) {
    return { symbols: [], diagnostics: [], resolvedPaths: [] };
  }

  const inProgress = new Set<string>([sourceFile]);
  const resolvedModules = resolveFileImports(sourceFile, importDecls, inProgress);

  const allSymbols: FileImportedSymbol[] = [];
  const allDiagnostics: FileModuleDiagnostic[] = [];
  const resolvedPaths: string[] = [];

  for (const mod of resolvedModules) {
    allSymbols.push(...mod.symbols);
    allDiagnostics.push(...mod.diagnostics);
    if (mod.diagnostics.length === 0) {
      resolvedPaths.push(mod.filePath);
    }
  }

  return { symbols: allSymbols, diagnostics: allDiagnostics, resolvedPaths };
}
