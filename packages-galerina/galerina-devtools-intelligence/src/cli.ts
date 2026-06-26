#!/usr/bin/env node
// =============================================================================
// galerina-devtools-intelligence — CLI
//
// Usage:
//   node dist/cli.js index <directory>
//   node dist/cli.js search "<query>" [--effects effect1,effect2] [--qualifier secure] [--taint] [--json]
//   node dist/cli.js stats [<directory>]
// =============================================================================

import { resolve } from "node:path";
import { buildIndex, loadIndex } from "./indexer.js";
import { search } from "./search.js";
import type { SearchFilters, IndexedFlow } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage(): void {
  console.log(`
galerina-intelligence — Hybrid BM25 + structural code search for Galerina workspaces

COMMANDS
  index <directory>
      Walk all .spore files in <directory>, build/update workspace.lindex.

  search "<query>" [options]
      Search the workspace index in the current directory (or --dir <path>).

      --effects   <e1,e2>   Filter to flows declaring ALL these effects (comma-separated)
      --qualifier <q>       Filter by qualifier: secure | pure | guarded | flow
      --taint               Filter to flows with taint
      --json                Output results as JSON
      --dir       <path>    Workspace directory (default: cwd)

  stats [<directory>]
      Show index statistics.
`);
}

function parseArgs(argv: string[]): Record<string, string | boolean | string[]> {
  const args: Record<string, string | boolean | string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      const existing = args["_positional"];
      if (Array.isArray(existing)) {
        existing.push(a);
      } else {
        args["_positional"] = [a];
      }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// index command
// ---------------------------------------------------------------------------

async function cmdIndex(dir: string): Promise<void> {
  console.log(`Indexing workspace: ${dir}`);
  const result = await buildIndex(dir);
  console.log(`Done in ${result.durationMs}ms`);
  console.log(`  Flows indexed : ${result.flowCount}`);
  console.log(`  Files parsed  : ${result.filesIndexed}`);
  console.log(`  Files skipped : ${result.filesSkipped} (mtime unchanged)`);
  console.log(`  Index at      : ${result.indexPath}`);
}

// ---------------------------------------------------------------------------
// search command
// ---------------------------------------------------------------------------

async function cmdSearch(
  query: string,
  dir: string,
  args: Record<string, string | boolean | string[]>,
): Promise<void> {
  const flows = await loadIndex(dir);
  if (flows.length === 0) {
    console.error(`No index found at ${dir}. Run: galerina-intelligence index <directory>`);
    process.exit(1);
  }

  const filters: SearchFilters = {};

  const effectsArg = args["effects"];
  if (typeof effectsArg === "string") {
    filters.effects = effectsArg.split(",").map(s => s.trim()).filter(s => s.length > 0);
  }

  const qualifierArg = args["qualifier"];
  if (typeof qualifierArg === "string") {
    filters.qualifier = qualifierArg;
  }

  if (args["taint"] === true) {
    filters.hasTaint = true;
  }

  const results = search(query, flows, filters);

  if (args["json"] === true) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`No results for: "${query}"`);
    return;
  }

  console.log(`\nResults for: "${query}" (${results.length} found)\n`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r === undefined) continue;
    const { flow, bm25Score, rankScore } = r;
    console.log(`${i + 1}. ${flow.signatureText}`);
    console.log(`   File    : ${flow.filePath}`);
    console.log(`   Effects : ${flow.declaredEffects.join(", ") || "(none)"}`);
    console.log(`   Tags    : ${flow.qualifier_tags.join(", ")}`);
    console.log(`   Score   : bm25=${bm25Score.toFixed(3)} rank=${rankScore.toFixed(3)}`);
    if (flow.contractText.length > 0) {
      const preview = flow.contractText.replace(/\s+/g, " ").slice(0, 100);
      console.log(`   Contract: ${preview}${flow.contractText.length > 100 ? "..." : ""}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// stats command
// ---------------------------------------------------------------------------

async function cmdStats(dir: string): Promise<void> {
  const flows = await loadIndex(dir);
  if (flows.length === 0) {
    console.log(`No index at ${dir}`);
    return;
  }

  const byQualifier = new Map<string, number>();
  let withEffects = 0;
  let withTaint = 0;
  let withSecrets = 0;
  let withIntent = 0;
  const effectCounts = new Map<string, number>();
  const uniqueFiles = new Set<string>();

  for (const flow of flows) {
    byQualifier.set(flow.qualifier, (byQualifier.get(flow.qualifier) ?? 0) + 1);
    if (flow.declaredEffects.length > 0) withEffects++;
    if (flow.hasTaint) withTaint++;
    if (flow.hasSecrets) withSecrets++;
    if (flow.qualifier_tags.includes("has-intent")) withIntent++;
    uniqueFiles.add(flow.filePath);
    for (const e of flow.declaredEffects) {
      effectCounts.set(e, (effectCounts.get(e) ?? 0) + 1);
    }
  }

  console.log(`\nWorkspace index: ${dir}`);
  console.log(`  Total flows    : ${flows.length}`);
  console.log(`  Files indexed  : ${uniqueFiles.size}`);
  console.log(`  With effects   : ${withEffects}`);
  console.log(`  With taint     : ${withTaint}`);
  console.log(`  With secrets   : ${withSecrets}`);
  console.log(`  With intent    : ${withIntent}`);
  console.log(`\nBy qualifier:`);
  for (const [q, count] of [...byQualifier.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${q.padEnd(10)}: ${count}`);
  }
  if (effectCounts.size > 0) {
    console.log(`\nTop effects:`);
    const sorted = [...effectCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [e, count] of sorted) {
      console.log(`  ${e.padEnd(25)}: ${count}`);
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    usage();
    process.exit(0);
  }

  const args = parseArgs(argv);
  const positional = args["_positional"] as string[] | undefined ?? [];
  const command = positional[0];

  const dirArg = args["dir"];
  const defaultDir = typeof dirArg === "string" ? dirArg : process.cwd();

  switch (command) {
    case "index": {
      const dirToIndex = positional[1] ?? defaultDir;
      await cmdIndex(resolve(dirToIndex));
      break;
    }

    case "search": {
      const query = positional[1] ?? "";
      await cmdSearch(query, defaultDir, args);
      break;
    }

    case "stats": {
      const statsDir = positional[1] ?? defaultDir;
      await cmdStats(resolve(statsDir));
      break;
    }

    default:
      usage();
      process.exit(1);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
