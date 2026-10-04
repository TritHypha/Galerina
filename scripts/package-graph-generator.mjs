#!/usr/bin/env node
// package-graph-generator.mjs — derive and enforce every registered package
// boundary before publishing any generated package graph.
// Version: 1.0.0 · Task 7 generator governance.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  generatedOutputMatches,
  provenance,
} from "./lib/provenance.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/package-graph-generator.mjs [--root <dir>] [--check]\n  --help, -h  print this usage and exit 0 without reading or writing");

/**
 * Parse one selected root and an optional non-mutating check mode.
 */
function parseArgs(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let rootSeen = false;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      if (rootSeen || i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("package-graph: --root requires exactly one path");
      }
      root = resolve(argv[++i]);
      rootSeen = true;
      continue;
    }
    if (arg === "--check" && !check) {
      check = true;
      continue;
    }
    throw new Error(`package-graph: unknown or duplicate argument ${arg}`);
  }
  return { root, check };
}

/**
 * Read the exact registered package set and refuse malformed or duplicate
 * workspace entries.
 */
function registeredPackages(root) {
  let workspace;
  try {
    workspace = JSON.parse(readFileSync(join(root, "galerina.workspace.json"), "utf8"));
  } catch {
    throw new Error("package-graph: galerina.workspace.json is missing or malformed");
  }
  if (
    !Array.isArray(workspace?.packages)
    || workspace.packages.length === 0
    || !workspace.packages.every((entry) =>
      typeof entry === "string" && /^packages-ts\/[^/]+$/.test(entry))
  ) {
    throw new Error("package-graph: workspace package list is empty or malformed");
  }
  const packages = workspace.packages.map((entry) => entry.slice("packages-ts/".length));
  if (new Set(packages).size !== packages.length) {
    throw new Error("package-graph: workspace package list contains duplicates");
  }
  return packages.sort();
}

/**
 * Compare the workspace list with every package directory carrying
 * package.json so neither side can silently omit a boundary.
 */
function verifyPackageSet(root, registered) {
  const packageRoot = join(root, "packages-ts");
  const actual = readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) =>
      entry.isDirectory() && existsSync(join(packageRoot, entry.name, "package.json")))
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(registered)) {
    throw new Error(
      `package-graph: workspace/directory package-set mismatch (${registered.length} registered, ${actual.length} present)`,
    );
  }
}

/**
 * Derive every package report and enforce every existing boundary policy
 * before returning any output bytes.
 */
async function derive(root) {
  const dist = join(
    root,
    "packages-ts",
    "galerina-devtools-package-graph",
    "dist",
  );
  const required = ["scanner.js", "graph.js", "reporter.js"];
  for (const file of required) {
    if (!existsSync(join(dist, file))) {
      throw new Error(`package-graph: built module missing: ${file}`);
    }
  }
  const [{ scanPackage }, { buildGraph }, reporter] = await Promise.all([
    import(pathToFileURL(join(dist, "scanner.js")).href),
    import(pathToFileURL(join(dist, "graph.js")).href),
    import(pathToFileURL(join(dist, "reporter.js")).href),
  ]);
  if (
    typeof scanPackage !== "function"
    || typeof buildGraph !== "function"
    || typeof reporter.runBoundaryGate !== "function"
    || typeof reporter.renderJson !== "function"
    || typeof reporter.renderBoundaryMarkdown !== "function"
  ) {
    throw new Error("package-graph: built module interface is incomplete");
  }

  const packages = registeredPackages(root);
  verifyPackageSet(root, packages);
  const outputs = new Map();
  const refusals = [];
  for (const name of packages) {
    const scope = join(root, "packages-ts", name);
    const policy = join(scope, ".graph", "boundary-policy.json");
    if (!existsSync(policy)) {
      refusals.push(`${name}: boundary-policy.json missing`);
      continue;
    }
    let graph;
    try {
      graph = buildGraph(scanPackage(scope));
    } catch (error) {
      refusals.push(`${name}: scan refused (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    const gate = reporter.runBoundaryGate(scope, graph, true);
    if (gate?.status !== "PASS") {
      refusals.push(
        `${name}: boundary gate ${gate?.status ?? "UNKNOWN"} (${(gate?.violations ?? []).join(", ") || "no reason"})`,
      );
      continue;
    }
    outputs.set(
      join(scope, ".graph", "package-graph.json"),
      reporter.renderJson(graph),
    );
    outputs.set(
      join(scope, ".graph", "BOUNDARY.md"),
      reporter.renderBoundaryMarkdown(graph, gate),
    );
  }
  if (refusals.length > 0) {
    throw new Error(`package-graph: ${refusals.length} package refusal(s):\n${refusals.join("\n")}`);
  }
  if (outputs.size !== packages.length * 2) {
    throw new Error("package-graph: output conservation failed");
  }
  return { packages, outputs };
}

const OPTIONS = parseArgs(process.argv.slice(2));
let derived;
try {
  derived = await derive(OPTIONS.root);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const expected = new Map(derived.outputs);
expected.set(
  join(OPTIONS.root, "build", "package-graphs", "provenance.json"),
  JSON.stringify(provenance("package-graph-generator", OPTIONS.root), null, 2) + "\n",
);

if (OPTIONS.check) {
  const stale = [...expected.entries()]
    .filter(([path, bytes]) =>
      !existsSync(path)
      || !generatedOutputMatches(path, readFileSync(path, "utf8"), bytes))
    .map(([path]) => relative(OPTIONS.root, path).replace(/\\/g, "/"));
  if (stale.length > 0) {
    console.error(`package-graph: ${stale.length} missing or stale output(s); no files written`);
    process.exit(1);
  }
  console.log(`package-graph: ${derived.packages.length} packages / ${expected.size} outputs current`);
  process.exit(0);
}

for (const [path, bytes] of expected) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
console.log(`package-graph: published ${expected.size} outputs for ${derived.packages.length} packages`);
