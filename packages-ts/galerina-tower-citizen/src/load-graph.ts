/**
 * Fail-closed ESM load-graph walker for RD-1295 cli-check isolation.
 *
 * The previous regex walker missed side-effect imports, package specifiers,
 * and treated missing files as skippable. This walker records every static
 * import, re-export and string-literal dynamic import, resolves destinations,
 * and refuses edges it cannot establish.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type * as Ts from "typescript";

const ts = createRequire(import.meta.url)("typescript") as typeof Ts;
import {
  CLI_CHECK_ALLOWED_STEMS,
  CLI_CHECK_PERMITTED_EXTERNALS,
  GOVERNANCE_FORBIDDEN_MODULES,
  KERNEL_ALLOWED_STEMS,
  KERNEL_FORBIDDEN_MODULES,
  KERNEL_PERMITTED_EXTERNALS,
  GOVERNANCE_ALLOWED_STEMS,
  PRODUCT_STEMS,
  PRODUCT_EXTERNALS,
  compositionClusters,
  type TowerProductEntry,
} from "./product-profiles.js";

export type ImportKind = "static" | "export" | "dynamic" | "side-effect";

export interface ImportEdge {
  readonly from: string;
  readonly specifier: string;
  readonly kind: ImportKind;
  readonly line: number;
}

export type ResolvedDestination =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "external"; readonly id: string };

export type LoadGraphResult =
  | {
      readonly ok: true;
      readonly files: readonly string[];
      readonly externals: readonly string[];
      readonly edges: readonly ImportEdge[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly edge?: ImportEdge;
    };

const TOWER_BARREL = "@galerina/tower-citizen";
const TOWER_SUBPATHS = new Set([
  ...Object.keys(PRODUCT_STEMS).map((name) => `${TOWER_BARREL}/${name}`),
  `${TOWER_BARREL}/governance-v1`,
]);

export function isTowerRootBarrel(specifier: string): boolean {
  return specifier === TOWER_BARREL || specifier === `${TOWER_BARREL}/index`;
}

function lineOf(sf: Ts.SourceFile, node: Ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function isImportCall(node: Ts.Node): node is Ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function isRequireCall(node: Ts.Node): node is Ts.CallExpression {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "require";
}

export function extractImportEdges(source: string, fromFile: string): ImportEdge[] | { readonly ok: false; readonly reason: string; readonly line: number } {
  const sf = ts.createSourceFile(fromFile, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parseDiags = (sf as Ts.SourceFile & { parseDiagnostics?: readonly Ts.Diagnostic[] }).parseDiagnostics ?? [];
  const firstErr = parseDiags.find((d) => d.category === ts.DiagnosticCategory.Error);
  if (firstErr !== undefined) {
    const pos = typeof firstErr.start === "number" ? firstErr.start : 0;
    return {
      ok: false,
      reason: "unsound-parse",
      line: sf.getLineAndCharacterOfPosition(pos).line + 1,
    };
  }
  const edges: ImportEdge[] = [];
  let refuse: { readonly ok: false; readonly reason: string; readonly line: number } | undefined;
  const visit = (node: Ts.Node): void => {
    if (refuse !== undefined) return;
    if (isRequireCall(node)) {
      refuse = { ok: false, reason: "unsupported-cjs-require", line: lineOf(sf, node) };
      return;
    }
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) {
        ts.forEachChild(node, visit);
        return;
      }
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        refuse = { ok: false, reason: "unsupported-non-literal-specifier", line: lineOf(sf, node) };
        return;
      }
      const kind: ImportKind = node.importClause === undefined ? "side-effect" : "static";
      edges.push({ from: fromFile, specifier: node.moduleSpecifier.text, kind, line: lineOf(sf, node.moduleSpecifier) });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
      if (node.isTypeOnly) {
        ts.forEachChild(node, visit);
        return;
      }
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        refuse = { ok: false, reason: "unsupported-non-literal-specifier", line: lineOf(sf, node) };
        return;
      }
      edges.push({ from: fromFile, specifier: node.moduleSpecifier.text, kind: "export", line: lineOf(sf, node.moduleSpecifier) });
    } else if (isImportCall(node)) {
      const arg = node.arguments[0];
      if (arg === undefined || !ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) {
        refuse = { ok: false, reason: "unsupported-dynamic-import", line: lineOf(sf, node) };
        return;
      }
      edges.push({ from: fromFile, specifier: arg.text, kind: "dynamic", line: lineOf(sf, arg) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (refuse !== undefined) return refuse;
  return edges;
}

function tryRealFile(candidate: string): string | undefined {
  if (!existsSync(candidate)) return undefined;
  const st = statSync(candidate);
  if (!st.isFile()) return undefined;
  return realpathSync.native(candidate);
}

/**
 * Node ESM import conditions. Matching walks the exports object's own keys in
 * insertion order and takes the first key that is in this set (Node's rule).
 * Do not iterate this set: `{ node, import }` and `{ import, node }` must differ.
 */
const ESM_EXPORT_CONDITIONS = new Set(["node-addons", "node", "import", "default"]);

function splitBareSpecifier(specifier: string): { readonly name: string; readonly subpath: string } | undefined {
  if (specifier.startsWith("#")) return undefined;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length < 2 || parts[0] === undefined || parts[1] === undefined) return undefined;
    const name = `${parts[0]}/${parts[1]}`;
    const rest = parts.slice(2).join("/");
    return { name, subpath: rest === "" ? "." : `./${rest}` };
  }
  const slash = specifier.indexOf("/");
  if (slash === -1) return { name: specifier, subpath: "." };
  return { name: specifier.slice(0, slash), subpath: `./${specifier.slice(slash + 1)}` };
}

function pickEsmExport(target: unknown): string | undefined {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const item of target) {
      const picked = pickEsmExport(item);
      if (picked !== undefined) return picked;
    }
    return undefined;
  }
  if (target !== null && typeof target === "object") {
    const rec = target as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      if (!ESM_EXPORT_CONDITIONS.has(key)) continue;
      const picked = pickEsmExport(rec[key]);
      if (picked !== undefined) return picked;
    }
  }
  return undefined;
}

function containingPackageDir(fromFile: string): string | undefined {
  let dir = dirname(resolve(fromFile));
  for (;;) {
    const pkgJson = join(dir, "package.json");
    if (existsSync(pkgJson)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Node PACKAGE_SELF first: if the importer's containing package is `packageName`,
 * that directory wins over a nested `node_modules` copy of the same name.
 */
export function findInstalledPackage(fromFile: string, packageName: string): string | undefined {
  const scope = containingPackageDir(fromFile);
  if (scope !== undefined) {
    try {
      const name = (JSON.parse(readFileSync(join(scope, "package.json"), "utf8")) as { name?: unknown }).name;
      if (name === packageName) return scope;
    } catch {
      /* malformed package.json is not a self-reference */
    }
  }
  let dir = dirname(resolve(fromFile));
  for (;;) {
    const nested = join(dir, "node_modules", packageName, "package.json");
    if (existsSync(nested)) return dirname(nested);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function resolveEsmPackageFromImporter(
  fromFile: string,
  specifier: string,
): ResolvedDestination | { readonly ok: false; readonly reason: string } {
  const split = splitBareSpecifier(specifier);
  if (split === undefined) {
    return { ok: false, reason: `unsupported-package-specifier:${specifier}` };
  }
  const root = findInstalledPackage(fromFile, split.name);
  if (root === undefined) {
    return { ok: false, reason: `unresolved-package:${specifier}` };
  }
  let pkg: { exports?: unknown; main?: unknown; module?: unknown };
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as typeof pkg;
  } catch {
    return { ok: false, reason: `unresolved-package:${specifier}` };
  }
  let rel: string | undefined;
  if (pkg.exports !== undefined) {
    if (typeof pkg.exports === "string" || Array.isArray(pkg.exports)) {
      if (split.subpath !== ".") return { ok: false, reason: `unresolved-package:${specifier}` };
      rel = pickEsmExport(pkg.exports);
    } else if (pkg.exports !== null && typeof pkg.exports === "object") {
      const table = pkg.exports as Record<string, unknown>;
      const keys = Object.keys(table);
      const hasSubpath = keys.some((k) => k.startsWith("."));
      const hasCondition = keys.some((k) => !k.startsWith("."));
      if (hasSubpath && hasCondition) {
        return { ok: false, reason: `unsupported-mixed-exports:${specifier}` };
      }
      if (hasSubpath) {
        const key = split.subpath === "." ? "." : split.subpath;
        if (key.includes("*")) return { ok: false, reason: `unsupported-export-pattern:${specifier}` };
        if (!Object.hasOwn(table, key)) return { ok: false, reason: `unresolved-package:${specifier}` };
        rel = pickEsmExport(table[key]);
      } else {
        if (split.subpath !== ".") return { ok: false, reason: `unresolved-package:${specifier}` };
        rel = pickEsmExport(table);
      }
    }
    if (rel === undefined) return { ok: false, reason: `unsupported-esm-export:${specifier}` };
  } else {
    if (split.subpath !== ".") return { ok: false, reason: `unresolved-package:${specifier}` };
    rel = typeof pkg.module === "string" ? pkg.module : typeof pkg.main === "string" ? pkg.main : "index.js";
  }
  const real = tryRealFile(resolve(root, rel));
  if (real === undefined) return { ok: false, reason: `unresolved-package:${specifier}` };
  return { kind: "file", path: real };
}

export async function resolveSpecifier(
  fromFile: string,
  specifier: string,
): Promise<ResolvedDestination | { readonly ok: false; readonly reason: string }> {
  if (specifier.startsWith("node:") || specifier === "crypto") {
    const id = specifier === "crypto" ? "node:crypto" : specifier;
    return { kind: "external", id };
  }
  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    const base = resolve(dirname(fromFile), specifier);
    const candidates = specifier.endsWith(".js") || specifier.endsWith(".mjs") || specifier.endsWith(".cjs")
      ? [base]
      : [base, `${base}.js`, join(base, "index.js")];
    for (const c of candidates) {
      const real = tryRealFile(c);
      if (real !== undefined) return { kind: "file", path: real };
    }
    return { ok: false, reason: `unresolved-relative:${specifier}` };
  }
  return resolveEsmPackageFromImporter(fromFile, specifier);
}

export async function walkLoadGraph(entry: string): Promise<LoadGraphResult> {
  const absEntry = resolve(entry);
  const realEntry = tryRealFile(absEntry);
  if (realEntry === undefined) {
    return { ok: false, reason: `unresolved-entry:${entry}` };
  }
  const files = new Set<string>();
  const externals = new Set<string>();
  const edges: ImportEdge[] = [];
  const queue = [realEntry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      return { ok: false, reason: `unreadable:${file}` };
    }
    const extracted = extractImportEdges(source, file);
    if (!Array.isArray(extracted)) {
      return { ok: false, reason: extracted.reason, edge: { from: file, specifier: "", kind: "static", line: extracted.line } };
    }
    for (const edge of extracted) {
      edges.push(edge);
      if (isTowerRootBarrel(edge.specifier)) {
        return {
          ok: false,
          reason: `forbidden-tower-barrel:${edge.specifier}`,
          edge,
        };
      }
      if (
        edge.specifier.startsWith(`${TOWER_BARREL}/`) &&
        !TOWER_SUBPATHS.has(edge.specifier)
      ) {
        return {
          ok: false,
          reason: `forbidden-tower-subpath:${edge.specifier}`,
          edge,
        };
      }
      const dest = await resolveSpecifier(file, edge.specifier);
      if ("ok" in dest) {
        return { ok: false, reason: dest.reason, edge };
      }
      if (dest.kind === "external") {
        externals.add(dest.id);
        continue;
      }
      queue.push(dest.path);
    }
  }
  return {
    ok: true,
    files: [...files].sort(),
    externals: [...externals].sort(),
    edges,
  };
}

function allowedDistFiles(packageRoot: string, stems: readonly string[], label: string): readonly string[] {
  const dist = realpathSync.native(join(packageRoot, "dist"));
  const out: string[] = [];
  for (const stem of stems) {
    const file = join(dist, `${stem}.js`);
    const real = tryRealFile(file);
    if (real === undefined) {
      throw new Error(`${label} allowed module missing: ${file}`);
    }
    out.push(real);
  }
  return out;
}

export function cliCheckAllowedFiles(packageRoot: string): readonly string[] {
  return allowedDistFiles(packageRoot, CLI_CHECK_ALLOWED_STEMS, "cli-check");
}

export function kernelAllowedFiles(packageRoot: string): readonly string[] {
  return allowedDistFiles(packageRoot, KERNEL_ALLOWED_STEMS, "kernel");
}

/** Dependency files are pinned explicitly, never learned from the graph under test. */
function dependencyFiles(packageRoot: string, bridge: boolean, pq: boolean, substrate: boolean): readonly string[] {
  const importer = join(packageRoot, "dist", "kernel.js");
  const files: string[] = [];
  const add = (from: string, name: string, paths: readonly string[]): string => {
    const root = findInstalledPackage(from, name);
    if (root === undefined) throw new Error(`profile dependency missing: ${name}`);
    for (const path of paths) {
      const file = tryRealFile(join(root, path));
      if (file === undefined) throw new Error(`profile dependency file missing: ${name}/${path}`);
      files.push(file);
    }
    return root;
  };
  if (bridge) add(importer, "@galerina/inference-bridge-contract", [
    "dist/index.js", "dist/bridge.js", "dist/manifest.js", "dist/oracle.js",
  ]);
  if (substrate) add(importer, "@galerina/substrate-math", ["dist/index.js"]);
  if (pq) {
    const root = add(importer, "@noble/post-quantum", ["ml-dsa.js", "_crystals.js", "utils.js"]);
    add(join(root, "ml-dsa.js"), "@noble/hashes", ["_u64.js", "sha3.js", "utils.js"]);
    add(join(root, "ml-dsa.js"), "@noble/curves", ["abstract/fft.js", "utils.js"]);
  }
  return files;
}

/** Complete file-identity set, including explicitly admitted third-party dependencies. */
export function productAllowedFiles(packageRoot: string, entry: TowerProductEntry): readonly string[] {
  if (!Object.hasOwn(PRODUCT_STEMS, entry)) throw new Error(`unknown Tower product entry: ${entry}`);
  const crypto = entry === "kernel" || entry === "inference" || entry === "custody";
  return [
    ...allowedDistFiles(packageRoot, PRODUCT_STEMS[entry], entry),
    ...dependencyFiles(packageRoot, crypto, crypto, entry === "photonic"),
  ];
}

/** Declared §6.10 composition file set. Unknown names throw ERR_TOWER_COMPOSITION_UNKNOWN. */
export function compositionAllowedFiles(packageRoot: string, id: string): readonly string[] {
  const files = new Set<string>();
  for (const cluster of compositionClusters(id)) {
    for (const file of productAllowedFiles(packageRoot, cluster)) files.add(file);
  }
  return [...files].sort();
}

export function compositionExternals(id: string): readonly string[] {
  const externals = new Set<string>();
  for (const cluster of compositionClusters(id)) {
    for (const ext of PRODUCT_EXTERNALS[cluster]) externals.add(ext);
  }
  return [...externals].sort();
}

/** tower.governance.v1 = kernel + cli-check, distinct from the governance subpath. */
export function governanceAllowedFiles(packageRoot: string): readonly string[] {
  return [
    ...allowedDistFiles(packageRoot, GOVERNANCE_ALLOWED_STEMS, "tower.governance.v1"),
    ...dependencyFiles(packageRoot, true, true, false),
  ];
}

export { KERNEL_FORBIDDEN_MODULES, KERNEL_PERMITTED_EXTERNALS };

export function posixUnder(root: string, file: string): string {
  return relative(root, file).replace(/\\/g, "/");
}

export interface ClosedSetReport {
  readonly ok: boolean;
  readonly extras: readonly string[];
  readonly forbidden: readonly string[];
  readonly unpermittedExternals: readonly string[];
}

export function enforceClosedSet(
  graph: Extract<LoadGraphResult, { ok: true }>,
  allowedFiles: readonly string[],
  permittedExternals: readonly string[] = CLI_CHECK_PERMITTED_EXTERNALS,
  forbiddenStems: readonly string[] = GOVERNANCE_FORBIDDEN_MODULES,
): ClosedSetReport {
  const allowed = new Set(allowedFiles.map((f) => realpathSync.native(f)));
  const extras: string[] = [];
  const forbidden = new Set<string>();
  for (const file of graph.files) {
    const real = realpathSync.native(file);
    if (!allowed.has(real)) extras.push(real);
    const base = real.replace(/\\/g, "/").split("/").pop() ?? "";
    const stem = base.replace(/\.(js|mjs|cjs|ts)$/, "");
    if (forbiddenStems.includes(stem)) forbidden.add(stem);
  }
  const unpermittedExternals = graph.externals.filter((id) => !permittedExternals.includes(id));
  return {
    ok: extras.length === 0 && forbidden.size === 0 && unpermittedExternals.length === 0,
    extras: extras.sort(),
    forbidden: [...forbidden].sort(),
    unpermittedExternals,
  };
}
