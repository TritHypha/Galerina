#!/usr/bin/env node
// project-graph-generator.mjs — deterministic, fail-closed publication wrapper
// for the core CLI project graph. The child writes only to a temporary
// directory; this wrapper validates the complete set before touching build/.
// Version: 1.0.0 · Task 7 generator governance.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  generatedOutputMatches,
  provenanceForCheck,
} from "./lib/provenance.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/project-graph-generator.mjs [--root <dir>] [--check]\n  --help, -h  print this usage and exit 0 without reading or writing");

const FILES = Object.freeze([
  "Galerina_GRAPH_REPORT.md",
  "galerina-ai-map.md",
  "galerina-devtools-project-graph.html",
  "galerina-devtools-project-graph.json",
]);

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
        throw new Error("project-graph: --root requires exactly one path");
      }
      root = resolve(argv[++i]);
      rootSeen = true;
      continue;
    }
    if (arg === "--check" && !check) {
      check = true;
      continue;
    }
    throw new Error(`project-graph: unknown or duplicate argument ${arg}`);
  }
  return { root, check };
}

/**
 * Resolve a deterministic epoch for the child graph's generatedAt field.
 */
function sourceDateEpoch(builtAt) {
  const supplied = process.env.SOURCE_DATE_EPOCH;
  if (supplied !== undefined && supplied !== "") {
    if (!/^\d+$/.test(supplied)) {
      throw new Error("project-graph: SOURCE_DATE_EPOCH must be integer seconds");
    }
    return supplied;
  }
  return String(Math.floor(Date.parse(builtAt) / 1000));
}

/**
 * Generate and validate the complete graph output set in a temporary
 * directory. No repository output is touched here.
 */
function derive(root, builtAt) {
  const cli = join(
    root,
    "packages-ts",
    "galerina-core-cli",
    "dist",
    "index.js",
  );
  if (!existsSync(cli)) {
    throw new Error("project-graph: core CLI build is missing");
  }
  const temporary = mkdtempSync(join(tmpdir(), "galerina-project-graph-"));
  try {
    const result = spawnSync(
      process.execPath,
      [cli, "graph", "--out", temporary],
      {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        env: {
          ...process.env,
          SOURCE_DATE_EPOCH: sourceDateEpoch(builtAt),
        },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `project-graph: child refused with exit ${result.status}: ${(result.stderr || result.stdout).trim()}`,
      );
    }
    const actual = readdirSync(temporary, { withFileTypes: true })
      .map((entry) => entry.isFile() ? entry.name : `${entry.name}/`)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify([...FILES].sort())) {
      throw new Error(
        `project-graph: child output set mismatch: ${actual.join(", ") || "(empty)"}`,
      );
    }
    const outputs = new Map(
      FILES.map((name) => [name, readFileSync(join(temporary, name), "utf8")]),
    );
    let graph;
    try {
      graph = JSON.parse(outputs.get("galerina-devtools-project-graph.json"));
    } catch {
      throw new Error("project-graph: child JSON is malformed");
    }
    if (
      !Array.isArray(graph?.nodes)
      || graph.nodes.length === 0
      || !Array.isArray(graph?.edges)
      || graph.edges.length === 0
    ) {
      throw new Error("project-graph: child graph is empty or structurally incomplete");
    }
    return outputs;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const OPTIONS = parseArgs(process.argv.slice(2));
const outputDirectory = join(OPTIONS.root, "build", "graph");
const provenancePath = join(outputDirectory, "provenance.json");
const stamp = provenanceForCheck(
  "project-graph-generator",
  OPTIONS.root,
  provenancePath,
  OPTIONS.check,
);
let generated;
try {
  generated = derive(OPTIONS.root, stamp.builtAt);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const expected = new Map(
  [...generated].map(([name, bytes]) => [join(outputDirectory, name), bytes]),
);
expected.set(
  provenancePath,
  JSON.stringify(stamp, null, 2) + "\n",
);

if (OPTIONS.check) {
  const stale = [...expected.entries()]
    .filter(([path, bytes]) =>
      !existsSync(path)
      || !generatedOutputMatches(path, readFileSync(path, "utf8"), bytes))
    .map(([path]) => relative(OPTIONS.root, path).replace(/\\/g, "/"));
  if (stale.length > 0) {
    console.error(`project-graph: missing or stale output(s): ${stale.join(", ")}; no files written`);
    process.exit(1);
  }
  console.log(`project-graph: ${expected.size}/${expected.size} outputs current`);
  process.exit(0);
}

mkdirSync(outputDirectory, { recursive: true });
for (const [path, bytes] of expected) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
console.log(`project-graph: published ${expected.size} validated outputs`);
