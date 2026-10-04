#!/usr/bin/env node
// kb-graph-generator.mjs — normalize and bind one explicit external KB corpus
// before publishing or checking the repository-local KB graph artifacts.
// Version: 1.0.0 · Task 7 external generator governance.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  generatedOutputMatches,
  provenanceForCheck,
} from "./lib/provenance.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/kb-graph-generator.mjs [--root <dir>] [--kb-dir <dir>] [--check]\n  --help, -h  print this usage and exit 0 without reading or writing");

function parseArgs(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let kbDir = null;
  let check = false;
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root" || arg === "--kb-dir") {
      if (seen.has(arg) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error(`kb-graph: ${arg} requires exactly one path`);
      }
      seen.add(arg);
      const value = resolve(argv[++i]);
      if (arg === "--root") root = value;
      if (arg === "--kb-dir") kbDir = value;
      continue;
    }
    if (arg === "--check" && !check) {
      check = true;
      continue;
    }
    throw new Error(`kb-graph: unknown or duplicate argument ${arg}`);
  }
  return {
    root,
    kbDir: kbDir
      || (process.env.GALERINA_KB_DIR ? resolve(process.env.GALERINA_KB_DIR) : null)
      || resolve(root, "..", "ZTF-Knowledge-Bases"),
    check,
  };
}

const SKIP_DIRS = new Set([".git", "build", "node_modules"]);

function markdownFiles(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) markdownFiles(path, result);
    if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
  }
  return result;
}

function externalDigest(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const path = relative(root, file).replace(/\\/g, "/");
    const bytes = readFileSync(file);
    hash.update(String(Buffer.byteLength(path)));
    hash.update(":");
    hash.update(path);
    hash.update(":");
    hash.update(String(bytes.length));
    hash.update(":");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function finalNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function derive(options) {
  if (!existsSync(options.kbDir)) throw new Error("kb-graph: selected KB directory does not exist");
  const files = markdownFiles(options.kbDir).sort();
  if (files.length === 0) throw new Error("kb-graph: selected KB corpus contains no Markdown documents");

  const dist = join(
    options.root,
    "packages-ts",
    "galerina-devtools-kb-graph",
    "dist",
  );
  const required = ["scanner.js", "graph.js", "reporter.js"];
  for (const file of required) {
    if (!existsSync(join(dist, file))) throw new Error(`kb-graph: built module missing: ${file}`);
  }
  const [{ scanKBDirectory }, { buildKBGraph }, reporter] = await Promise.all([
    import(pathToFileURL(join(dist, "scanner.js")).href),
    import(pathToFileURL(join(dist, "graph.js")).href),
    import(pathToFileURL(join(dist, "reporter.js")).href),
  ]);
  if (
    typeof scanKBDirectory !== "function"
    || typeof buildKBGraph !== "function"
    || typeof reporter.generateJSON !== "function"
    || typeof reporter.generateDOT !== "function"
    || typeof reporter.generateMarkdownReport !== "function"
  ) {
    throw new Error("kb-graph: built module interface is incomplete");
  }

  const scanned = scanKBDirectory(options.kbDir);
  const built = buildKBGraph(scanned);
  if (!Array.isArray(built?.nodes) || built.nodes.length !== files.length) {
    throw new Error(`kb-graph: document conservation failed (${built?.nodes?.length ?? "unknown"}/${files.length})`);
  }
  const graph = {
    ...built,
    nodes: built.nodes.map((node) => ({
      ...node,
      path: `kb/${relative(options.kbDir, node.path).replace(/\\/g, "/")}`,
      lastModified: new Date(0),
    })),
  };
  const out = join(options.root, "build", "kb-graph");
  const stamp = {
    ...provenanceForCheck(
      "kb-graph-generator",
      options.root,
      join(out, "provenance.json"),
      options.check,
    ),
    externalInputDigest: externalDigest(options.kbDir, files),
    externalDocumentCount: files.length,
  };
  return new Map([
    [join(out, "kb-graph.json"), finalNewline(reporter.generateJSON(graph))],
    [join(out, "kb-graph.dot"), finalNewline(reporter.generateDOT(graph))],
    [join(out, "kb-report.md"), finalNewline(
      reporter.generateMarkdownReport(graph, stamp.builtAt.slice(0, 10)),
    )],
    [join(out, "provenance.json"), `${JSON.stringify(stamp, null, 2)}\n`],
  ]);
}

let options;
let expected;
try {
  options = parseArgs(process.argv.slice(2));
  expected = await derive(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (options.check) {
  const stale = [...expected.entries()]
    .filter(([path, bytes]) =>
      !existsSync(path)
      || !generatedOutputMatches(path, readFileSync(path, "utf8"), bytes))
    .map(([path]) => relative(options.root, path).replace(/\\/g, "/"));
  if (stale.length > 0) {
    console.error(`kb-graph: ${stale.length} missing or stale output(s); no files written`);
    process.exit(1);
  }
  console.log("kb-graph: all four outputs current");
  process.exit(0);
}

for (const [path, bytes] of expected) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
console.log("kb-graph: published four normalized, source-bound outputs");
