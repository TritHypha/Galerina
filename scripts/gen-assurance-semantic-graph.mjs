#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveSemanticCoverage } from "./lib/assurance-fabric/semantic-coverage.mjs";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/gen-assurance-semantic-graph.mjs [--root <dir>] [--check]\n  --check  compare the generated output without writing\n  --help, -h  print this usage and exit 0 without reading or writing");

const TOOL = "semantic-assurance-graph";
const GIT_IDENTITY = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const MAX_GIT_BUFFER = 64 * 1024 * 1024;
const MAX_GIT_COMMITS = 100_000;
const SEMANTIC_TOOL_PATHS = Object.freeze([
  "scripts/gen-assurance-semantic-graph.mjs",
  "scripts/lib/assurance-fabric/semantic-coverage.mjs",
  "scripts/lib/assurance-fabric/semantic-graph.mjs",
  "scripts/lib/assurance-fabric/strict-json.mjs",
]);
const OUTPUTS = Object.freeze([
  "SEMANTIC-GRAPH.md",
  "provenance.json",
  "semantic-graph.json",
]);

function parseArgs(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let rootSeen = false;
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      const selected = argv[index + 1];
      if (rootSeen || selected === undefined || selected.startsWith("--")) {
        throw new Error("semantic-assurance-graph: --root requires exactly one path");
      }
      root = resolve(selected);
      rootSeen = true;
      index += 1;
      continue;
    }
    if (value === "--check" && !check) {
      check = true;
      continue;
    }
    throw new Error(`semantic-assurance-graph: unknown or duplicate argument ${value}`);
  }
  return Object.freeze({ root, check });
}

function renderMarkdown(report) {
  const state = report.verdictTrit === 1 ? "ALLOW" : report.verdictTrit === 0 ? "UNKNOWN" : "DENY";
  return [
    "# VOK Semantic Assurance Graph",
    "",
    `Conserved authoritative-input digest: \`${report.authoritativeInputsDigest}\``,
    "",
    `K3 evidence state: **${state} (${report.verdictTrit})**`,
    "",
    "This generated graph is an index of conserved evidence identities. It is non-authorizing and does not grant release, conversion, signing, retirement, or production authority.",
    "",
    "## Conserved totals",
    "",
    `- Release/system requirements: ${report.totals.requirements}`,
    `- System contracts: ${report.totals.systemContracts}`,
    `- Canonical parser-proven routes: ${report.totals.routes}`,
    `- Registered packages: ${report.totals.packages}`,
    `- Test evidence nodes: ${report.totals.tests}`,
    `- Live detector mappings: ${report.totals.detectors}`,
    `- Complete executable-family paths: ${report.totals.executableFamily}`,
    `- Legacy unmapped tests: ${report.totals.legacyUnmapped}`,
    "",
    "## Zero-trust boundaries",
    "",
    "- Route identities come only from canonical `.fungi` AST nodes conserved against the route registry.",
    "- Package edges and fan counts conserve all registered package graphs against the project graph.",
    "- Every tracked test file maps to release evidence or an explicit package/repository system contract.",
    "- Every detector names a planted refusal or mutation test.",
    "- `.ts`, `.d.ts`, `.mts`, `.cts`, `.mjs`, `.js`, and `.cjs` are independently counted; zero is explicit.",
    "- Inputs are bounded regular files, hashed before derivation, and re-read before publication.",
    "",
    `Authorizing: **${report.authorizing ? "yes" : "no"}**`,
    "",
  ].join("\n");
}

function expectedOutputs(report, stamp) {
  return new Map([
    ["SEMANTIC-GRAPH.md", renderMarkdown(report)],
    ["provenance.json", `${JSON.stringify(stamp, undefined, 2)}\n`],
    ["semantic-graph.json", `${JSON.stringify(report, undefined, 2)}\n`],
  ]);
}

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: MAX_GIT_BUFFER,
    windowsHide: true,
  });
}

function nulPaths(value) {
  return value.split("\0").filter((path) => path.length > 0);
}

function semanticBuildPoint(root, authoritativeInputPaths) {
  try {
    if (!Array.isArray(authoritativeInputPaths) || authoritativeInputPaths.length === 0) {
      throw new Error("semantic derivation did not disclose its authoritative inputs");
    }
    const tracked = new Set(nulPaths(git(root, ["ls-files", "-z"])));
    for (const path of SEMANTIC_TOOL_PATHS) {
      if (!tracked.has(path)) {
        throw new Error(`semantic provenance tool path is not tracked: ${path}`);
      }
    }
    const trackedInputs = authoritativeInputPaths.filter((path) => tracked.has(path));
    if (trackedInputs.length === 0) {
      throw new Error("semantic derivation has no tracked authoritative input");
    }
    const relevant = new Set([...trackedInputs, ...SEMANTIC_TOOL_PATHS]);
    const dirty = nulPaths(git(root, ["diff", "--name-only", "-z", "HEAD", "--"]));
    const dirtyRelevant = dirty.filter((path) => relevant.has(path));
    const commits = git(root, ["rev-list", "--topo-order", "HEAD"])
      .split(/\r?\n/u)
      .filter((commit) => commit.length > 0);
    if (commits.length === 0 || commits.length > MAX_GIT_COMMITS) {
      throw new Error("Git history exceeds the semantic provenance bound");
    }
    for (const commit of commits) {
      if (!GIT_IDENTITY.test(commit)) {
        throw new Error("Git returned a malformed semantic build point");
      }
      const changed = nulPaths(git(root, [
        "diff-tree",
        "--root",
        "-m",
        "--no-commit-id",
        "--name-only",
        "-r",
        "-z",
        commit,
      ]));
      if (!changed.some((path) => relevant.has(path))) continue;
      const epochText = git(root, ["show", "-s", "--format=%ct", commit]).trim();
      if (!/^\d+$/u.test(epochText)) {
        throw new Error("Git returned a malformed semantic build timestamp");
      }
      const epoch = Number(epochText);
      if (!Number.isSafeInteger(epoch) || epoch < 0) {
        throw new Error("Git returned an out-of-range semantic build timestamp");
      }
      return Object.freeze({
        kind: dirtyRelevant.length === 0 ? "clean" : "dirty",
        dirty: Object.freeze(dirtyRelevant),
        stamp: Object.freeze({
          tool: TOOL,
          authority: "NONE",
          gitCommit: commit,
          builtAt: new Date(epoch * 1000).toISOString(),
          node: process.version,
        }),
      });
    }
    throw new Error("no commit owns the semantic provenance inputs");
  } catch (error) {
    return Object.freeze({
      kind: "refused",
      code: "SEMANTIC_PROVENANCE_BUILD_POINT",
      detail: error instanceof Error ? error.message : "semantic provenance derivation failed",
    });
  }
}

function publishAtomically(root, outputs) {
  const buildRoot = join(root, "build");
  const destination = join(buildRoot, "assurance-semantic-graph");
  mkdirSync(buildRoot, { recursive: true });
  const temporary = mkdtempSync(join(tmpdir(), "galerina-assurance-semantic-write-"));
  const backup = mkdtempSync(join(tmpdir(), "galerina-assurance-semantic-backup-"));
  const existing = new Set();
  try {
    for (const [name, bytes] of outputs) {
      writeFileSync(join(temporary, name), bytes, { flag: "wx" });
      const destinationPath = join(destination, name);
      if (existsSync(destinationPath)) {
        copyFileSync(destinationPath, join(backup, name));
        existing.add(name);
      }
    }
    const actual = OUTPUTS.filter((name) => existsSync(join(temporary, name))).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...OUTPUTS].sort())) {
      throw new Error("semantic-assurance-graph: staged output set did not conserve");
    }
    mkdirSync(destination, { recursive: true });
    for (const name of OUTPUTS) {
      renameSync(join(temporary, name), join(destination, name));
    }
  } catch (error) {
    for (const name of OUTPUTS) {
      const destinationPath = join(destination, name);
      if (existing.has(name)) {
        copyFileSync(join(backup, name), destinationPath);
      } else {
        rmSync(destinationPath, { force: true });
      }
    }
    throw error;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    rmSync(backup, { recursive: true, force: true });
  }
}

export async function generateSemanticGraph(options) {
  const root = resolve(options.root);
  const check = options.check === true;
  const derive = options.derive ?? deriveSemanticCoverage;
  const outputDirectory = join(root, "build", "assurance-semantic-graph");
  const result = await derive(root);
  if (result.kind !== "accepted") {
    return Object.freeze({ kind: "refused", code: result.code, detail: result.detail });
  }
  const buildPoint = semanticBuildPoint(root, result.authoritativeInputPaths);
  if (buildPoint.kind === "refused") return buildPoint;
  if (!check && buildPoint.kind === "dirty") {
    return Object.freeze({
      kind: "refused",
      code: "SEMANTIC_PROVENANCE_DIRTY",
      detail: `semantic provenance input is dirty: ${buildPoint.dirty[0]}`,
    });
  }
  const expected = expectedOutputs(result.value, buildPoint.stamp);
  if (check) {
    const stale = [...expected].filter(([name, bytes]) => {
      const path = join(outputDirectory, name);
      return !existsSync(path)
        || readFileSync(path, "utf8") !== bytes
        || (name === "provenance.json" && buildPoint.kind === "dirty");
    }).map(([name]) => relative(root, join(outputDirectory, name)).replace(/\\/gu, "/"));
    return stale.length === 0
      ? Object.freeze({ kind: "current", outputs: expected.size, report: result.value })
      : Object.freeze({ kind: "stale", outputs: expected.size, stale, report: result.value });
  }
  publishAtomically(root, expected);
  return Object.freeze({ kind: "published", outputs: expected.size, report: result.value });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await generateSemanticGraph(options);
  if (result.kind === "refused") {
    console.error(`${result.code}: ${result.detail}`);
    process.exitCode = 1;
    return;
  }
  if (result.kind === "stale") {
    console.error(`semantic-assurance-graph: ${result.stale.length} missing or stale output(s): ${result.stale.join(", ")}; no files written`);
    process.exitCode = 1;
    return;
  }
  if (result.kind === "current") {
    console.log(`semantic-assurance-graph: ${result.outputs}/${result.outputs} outputs current`);
    return;
  }
  console.log(
    `semantic-assurance-graph: published ${result.outputs} outputs; `
    + `${result.report.totals.routes} routes / ${result.report.totals.packages} packages / `
    + `${result.report.totals.tests} tests / K3 ${result.report.verdictTrit}`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
