#!/usr/bin/env node
// cli.ts — the `myco` command-line interface.
//
// A thin layer over the library in index.ts. Commands:
//   myco <pattern> [path]     search file contents (default)
//   myco search <pattern> ..  explicit form (use when the pattern is a command)
//   myco index [path]         (re)build the graph index
//   myco status [path]        show index stats
//   myco links [path]         find broken markdown links, classified by cause
//
// By default a search does a cheap incremental refresh first, so results are
// never stale — unchanged files are only stat()'d, not re-read. Pass
// --no-refresh to search the existing index as-is for maximum speed.

import { parseArgs } from "node:util";
import { promises as fs, existsSync } from "node:fs";
import * as path from "node:path";

import { buildIndex, DEFAULT_INDEX_OPTIONS } from "./ingest/indexer.ts";
import type { IndexOptions } from "./ingest/indexer.ts";
import { loadGraph, loadGraphOutcome } from "./graph/store.ts";
import type { SaveOutcome } from "./graph/store.ts";
import { buildPathFilter } from "./query/path-filter.ts";
import type { PathFilter } from "./query/path-filter.ts";
import { search, searchFile, isError, detectRegexIntent } from "./query/search.ts";
import type { MatchMode, SearchOptions, SearchOutcome } from "./query/search.ts";
import { render, summaryLine } from "./output.ts";
import { walk } from "./ingest/walk.ts";
import { scanText, repairText, scanPrivateRefs } from "./query/links.ts";
import type { BrokenLink, LinkClass, PrivateRef } from "./query/links.ts";
import { VERSION } from "./index.ts";

const HELP = `myco ${VERSION} — grep, but it grows a graph.

USAGE
  myco <pattern> [path]        search file contents (smart-case, whole-word)
  myco search <pattern> [path] explicit search (when pattern is a command name)
  myco index [path]            build/refresh the graph index
  myco status [path]           show index statistics
  myco links [path]            find broken markdown links, classified by cause

LINKS
      --fix              repair only the classes that resolve without guessing
                         (SELF_PREFIX, MOVED, PLACEHOLDER). AMBIGUOUS, PRIVATE_TWIN
                         and MISSING are reported and left alone — a repairer that
                         picks between two candidate documents is wrong half the
                         time, and a wrong link that resolves is invisible.
      --delink-missing   turn MISSING links into code spans: the path stays readable,
                         it just stops claiming to be navigable. For absorbed
                         documents whose links point into a repository that is not
                         checked out here, the path IS the provenance. Scope it with
                         --in; --in never affects which files count as EXISTING.
                    Exit: 0 = no broken links · 1 = broken links found · 2 = error

MATCHING
  (default)        whole-word match  (search "cat" ignores "concatenate")
  -s, --substring  match anywhere    (grep-like)
  -e, --regex      regular expression
  -f, --files      search file names / paths instead of contents

CASE
  (default)             smart-case: case-sensitive only if the pattern has a capital
  -i, --ignore-case     force case-insensitive
  -S, --case-sensitive  force case-sensitive

SCOPE
      --in <glob>   search only under this path; repeatable (patterns OR together).
                    Root-relative and POSIX. A plain path means "and everything
                    under it" (--in src matches src/a.ts, never srcfoo/a.ts).
                    Globs: * within a segment · ** across segments · ? one char.
                    Excluded candidates are COUNTED in the summary, and a glob that
                    matches nothing is called out — a scoped zero must never read
                    as a tree-wide absence.

OUTPUT
  -C, --context N   show N lines of context (content search)
  -n, --limit N     max results (default 200)
      --json        machine-readable JSON
      --no-color    disable ANSI color

INDEXING
      --no-refresh    search the existing index without refreshing first
      --no-gitignore  do not honour .gitignore
      --max-size N    skip files larger than N megabytes (default 5)
      --vendored      descend into vendored deps (node_modules; skipped + reported by default)

Exit codes: 0 = matches, 1 = no matches, 2 = error.`;

function toOptions(values: Record<string, unknown>): {
  search: SearchOptions;
  index: IndexOptions;
} {
  let mode: MatchMode = "word";
  if (values["regex"]) mode = "regex";
  else if (values["substring"]) mode = "substring";

  let caseSensitive: boolean | "smart" = "smart";
  if (values["ignore-case"]) caseSensitive = false;
  else if (values["case-sensitive"]) caseSensitive = true;

  const context = Number.parseInt(String(values["context"] ?? "0"), 10);
  const limit = Number.parseInt(String(values["limit"] ?? "200"), 10);
  const maxMb = Number.parseFloat(String(values["max-size"] ?? ""));

  return {
    search: {
      mode,
      caseSensitive,
      files: Boolean(values["files"]),
      limit: Number.isFinite(limit) && limit > 0 ? limit : 200,
      context: Number.isFinite(context) && context > 0 ? context : 0,
    },
    index: {
      maxFileSize: Number.isFinite(maxMb) && maxMb > 0
        ? Math.floor(maxMb * 1024 * 1024)
        : DEFAULT_INDEX_OPTIONS.maxFileSize,
      useGitignore: !values["no-gitignore"],
      includeVendored: Boolean(values["vendored"]),
    },
  };
}

function useColor(values: Record<string, unknown>): boolean {
  if (values["no-color"] || values["json"]) return false;
  if (process.env["NO_COLOR"]) return false;
  return Boolean(process.stdout.isTTY);
}

async function cmdIndex(root: string, index: IndexOptions): Promise<number> {
  // Same fail-closed guard as cmdSearch: `myco index <nonexistent>` must not
  // mkdir `<root>/.myco` at a path that doesn't exist. Create nothing, exit 2.
  if (!(await fs.stat(root).catch(() => undefined))) {
    process.stderr.write(`myco: path not found: ${root}\n`);
    return 2;
  }
  const started = process.hrtime.bigint();
  const {
    stats,
    saved,
    skippedLargePaths,
    skippedVendoredDirs,
    omittedOverlongTermPaths,
  } = await buildIndex(root, index);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  // Informational output → stdout. stderr is reserved for real errors (which all
  // exit non-zero), so a consumer can treat any stderr output — or a non-zero exit —
  // as a genuine failure, and this benign stat line can never be mistaken for one.
  process.stdout.write(
    `indexed ${stats.files} files ` +
      `(+${stats.added} ~${stats.updated} -${stats.removed}, ` +
      `${stats.unchanged} unchanged, ${stats.skippedBinary} binary skipped, ` +
      `${stats.skippedLarge} over-size skipped) ` +
      `in ${ms.toFixed(0)}ms\n`,
  );
  noteSaveOutcome(saved);
  if (stats.omittedOverlongTerms > 0) {
    process.stdout.write(
      `  ${stats.omittedOverlongTerms} overlong term(s) omitted from the term graph `
        + `in ${stats.filesWithOmittedOverlongTerms} file(s); `
        + `those files are directly verified during content search:\n`,
    );
    for (const p of omittedOverlongTermPaths) process.stdout.write(`    ${p}\n`);
  }
  // No silent caps: name the files that fell outside the index, so a search that
  // returns nothing is never mistaken for "not present" (DESIGN §8/§10).
  if (skippedLargePaths.length > 0) {
    const mib = (index.maxFileSize / (1024 * 1024)).toFixed(0);
    process.stdout.write(
      `  ${skippedLargePaths.length} file(s) exceed --max-size (${mib} MiB) — NOT searchable:\n`,
    );
    for (const p of skippedLargePaths) process.stdout.write(`    ${p}\n`);
  }
  // Same no-silent-caps rule for vendored trees: name the pruned dirs and the
  // escape hatch, so a miss inside node_modules can never read as absence.
  if (skippedVendoredDirs.length > 0) {
    process.stdout.write(
      `  ${skippedVendoredDirs.length} vendored dir(s) skipped (NOT searchable; pass --vendored to include):\n`,
    );
    for (const p of skippedVendoredDirs) process.stdout.write(`    ${p}\n`);
  }
  return 0;
}

function noteSaveOutcome(saved: SaveOutcome): void {
  if (saved.written) return;
  if (saved.reason === "unsafe-path") {
    process.stdout.write(
      "myco: note — index NOT cached: cache directory or index.json is a link or escaped path. "
        + "Results are correct, but the write was refused.\n",
    );
    return;
  }
  if (saved.reason === "invalid-payload") {
    process.stdout.write(
      "myco: note — index NOT cached: generated graph violates the stored-index contract. "
        + "Results are correct, but the cache was refused before writing.\n",
    );
    return;
  }
  process.stdout.write(
    `myco: note — index NOT cached: ${saved.edges.toLocaleString()} term edges `
      + `exceeds the ${saved.limit.toLocaleString()} ceiling. Results are correct, `
      + `but every run re-indexes from scratch. Index a narrower root to restore caching.\n`,
  );
}

async function cmdStatus(root: string): Promise<number> {
  const outcome = await loadGraphOutcome(root);
  if (outcome.status === "unsafe") {
    process.stderr.write(
      `index at ${path.join(root, ".myco")} is UNSAFE (symlink or escaped path) — `
        + `remove the link and run: myco index\n`,
    );
    return 2;
  }
  if (outcome.status === "rejected") {
    process.stderr.write(
      `index at ${path.join(root, ".myco")} exists but was REFUSED `
        + `(over a contract limit, corrupt, or an incompatible format) — `
        + `delete it and run: myco index\n`,
    );
    return 2;
  }
  const loaded = outcome.status === "ok" ? outcome : null;
  if (!loaded) {
    process.stderr.write(`no index at ${path.join(root, ".myco")} — run: myco index\n`);
    return 2;
  }
  let bytes = 0;
  try {
    bytes = (await fs.stat(path.join(root, ".myco", "index.json"))).size;
  } catch {
    /* ignore */
  }
  const when = new Date(loaded.meta.createdAt).toISOString();
  process.stdout.write(
    `files:  ${loaded.meta.fileCount}\n` +
      `terms:  ${loaded.meta.termCount}\n` +
      `omitted overlong terms:  ${loaded.meta.omittedOverlongTerms}\n` +
      `files requiring direct verification:  ${loaded.meta.filesWithOmittedOverlongTerms}\n` +
      `index:  ${(bytes / 1024).toFixed(1)} KiB\n` +
      `built:  ${when}\n`,
  );
  return 0;
}

const REPAIRABLE: ReadonlySet<LinkClass> = new Set<LinkClass>(["SELF_PREFIX", "MOVED", "PLACEHOLDER"]);

async function cmdLinks(
  root: string,
  values: Record<string, unknown>,
  index: IndexOptions,
): Promise<number> {
  if (!(await fs.stat(root).catch(() => undefined))) {
    process.stderr.write(`myco: path not found: ${root}\n`);
    return 2;
  }
  const files = await walk(root, {
    maxFileSize: index.maxFileSize,
    useGitignore: index.useGitignore,
    includeVendored: index.includeVendored,
  });

  // Two derived views: an existence set covering EVERY walked file (links point at images
  // and scripts too, not only markdown), and a basename index for classification.
  //
  // DIRECTORIES COUNT. `[research/rd/](research/rd/)` is a valid link, and a set built from
  // file paths alone reports every one of them missing — 17 false positives in this repo's
  // own README on the first run, which is exactly how a real finding gets buried.
  const present = new Set<string>(files.map((f) => f.relPath));
  for (const f of files) {
    const parts = f.relPath.split("/");
    for (let i = 1; i < parts.length; i++) present.add(parts.slice(0, i).join("/"));
  }
  const nameIndex = new Map<string, string[]>();
  for (const f of files) {
    const base = f.relPath.split("/").pop() ?? "";
    const list = nameIndex.get(base);
    if (list) list.push(f.relPath);
    else nameIndex.set(base, [f.relPath]);
  }
  const repoName = path.basename(root);
  // --in scopes which files are SCANNED, never which files count as existing: a scoped run
  // must not turn an out-of-scope target into a false "missing".
  // A bad --in pattern must exit, never silently widen to the whole tree: the worst
  // outcome is a user who believes they scoped and gets tree-wide results as evidence.
  const inPatterns = values["in"] as string[] | undefined;
  let scope: PathFilter | undefined;
  if (inPatterns !== undefined) {
    const built = buildPathFilter(inPatterns);
    if (typeof built === "string") {
      process.stderr.write(`myco: ${built}\n`);
      return 2;
    }
    scope = built;
  }
  const markdown = files.filter(
    (f) => /\.md$/i.test(f.relPath) && (scope === undefined || scope.test(f.relPath)),
  );

  // A link may legitimately point OUTSIDE the scanned root — sibling repositories in the
  // same workspace are linked this way constantly. The walked file set cannot see there, so
  // an index-only predicate reports every such link missing. That is a fact about the
  // instrument, not the tree: on this estate it produced 125 false positives, and acting on
  // them would have destroyed 125 working cross-repo links. Escapes are resolved against the
  // real filesystem instead.
  const outOfRootCache = new Map<string, boolean>();
  const exists = (p: string): boolean => {
    if (!p.startsWith("../")) return present.has(p);
    const cached = outOfRootCache.get(p);
    if (cached !== undefined) return cached;
    const real = existsSync(path.resolve(root, p));
    outOfRootCache.set(p, real);
    return real;
  };

  const scanAll = async (): Promise<BrokenLink[]> => {
    const acc: BrokenLink[] = [];
    for (const f of markdown) {
      const text = await fs.readFile(f.absPath, "utf8").catch(() => undefined);
      if (text === undefined) continue;
      acc.push(...scanText(f.relPath, text, exists, nameIndex, repoName));
    }
    return acc;
  };

  let findings = await scanAll();

  const delinkMissing = Boolean(values["delink-missing"]);
  if (values["fix"] || delinkMissing) {
    const byFile = new Map<string, BrokenLink[]>();
    for (const f of findings) {
      if (!REPAIRABLE.has(f.cls) && !(delinkMissing && f.cls === "MISSING")) continue;
      const list = byFile.get(f.file);
      if (list) list.push(f);
      else byFile.set(f.file, [f]);
    }
    let repaired = 0;
    let delinked = 0;
    for (const [rel, fs_] of byFile) {
      const abs = path.join(root, rel);
      const text = await fs.readFile(abs, "utf8");
      const r = repairText(rel, text, fs_, delinkMissing);
      if (r.repaired > 0 || r.delinked > 0) await fs.writeFile(abs, r.text);
      repaired += r.repaired;
      delinked += r.delinked;
    }
    const before = findings.length;
    // RE-SCAN before reporting. Printing the pre-fix findings after writing repairs would
    // state a count that is no longer true, which is the one thing a checker must never do.
    findings = await scanAll();
    process.stdout.write(
      `repaired ${repaired} link(s), de-linked ${delinked} placeholder(s) across ${byFile.size} file(s)\n`
        + `broken links: ${before} -> ${findings.length}\n`,
    );
  }

  // A RESOLVED public -> never-public link is not broken, so the report above can never see
  // it. It works today and becomes a publication-scope leak the moment the public document
  // is mirrored. Reported alongside, never counted as breakage.
  const privateRefs: PrivateRef[] = [];
  for (const f of markdown) {
    const text = await fs.readFile(f.absPath, "utf8").catch(() => undefined);
    if (text === undefined) continue;
    privateRefs.push(...scanPrivateRefs(f.relPath, text, exists));
  }

  const counts = new Map<LinkClass, number>();
  for (const f of findings) counts.set(f.cls, (counts.get(f.cls) ?? 0) + 1);

  if (values["json"]) {
    process.stdout.write(
      JSON.stringify({ scanned: markdown.length, findings, privateRefs }, null, 2) + "\n",
    );
    return findings.length > 0 ? 1 : 0;
  }

  process.stdout.write(
    `${findings.length} broken link(s) in ${markdown.length} markdown file(s) `
      + `(${files.length} files indexed for existence)\n`,
  );
  const ORDER: LinkClass[] = ["SELF_PREFIX", "MOVED", "PLACEHOLDER", "PRIVATE_TWIN", "AMBIGUOUS", "MISSING"];
  for (const cls of ORDER) {
    const n = counts.get(cls) ?? 0;
    if (n === 0) continue;
    const note = REPAIRABLE.has(cls)
      ? "repairable with --fix"
      : cls === "MISSING"
        ? "no target anywhere — --delink-missing keeps the path as text"
        : cls === "PRIVATE_TWIN"
          ? "target exists only as -PRIVATE — a publication-scope decision"
          : "needs a decision";
    process.stdout.write(`  ${cls.padEnd(13)} ${String(n).padStart(5)}  ${note}\n`);
  }
  // No silent caps: the classes --fix will never touch are listed in full, because those
  // are exactly the ones a human has to act on.
  for (const cls of ["PRIVATE_TWIN", "AMBIGUOUS"] as LinkClass[]) {
    const sub = findings.filter((f) => f.cls === cls);
    if (sub.length === 0) continue;
    process.stdout.write(`\n${cls}:\n`);
    for (const f of sub) {
      process.stdout.write(`  ${f.file}\n      -> ${f.href}`);
      process.stdout.write(f.candidates ? `   [${f.candidates.length} candidates]\n` : "\n");
    }
  }
  if (privateRefs.length > 0) {
    process.stdout.write(
      `\nPUBLIC -> PRIVATE (${privateRefs.length}) — resolves today; a scope leak if the `
        + `source is ever mirrored:\n`,
    );
    for (const r of privateRefs) process.stdout.write(`  ${r.file}\n      -> ${r.target}\n`);
  }
  return findings.length > 0 ? 1 : 0;
}

async function cmdSearch(
  pattern: string | undefined,
  root: string,
  values: Record<string, unknown>,
): Promise<number> {
  if (pattern === undefined) {
    process.stderr.write("myco: missing search pattern\n\n" + HELP + "\n");
    return 2;
  }
  const { search: sOpts, index: iOpts } = toOptions(values);

  // --in is a coverage cap. If it cannot be honoured exactly as written, STOP —
  // never fall back to searching everything. A filter that silently widens is the
  // worst outcome available here: the user believes they scoped, the tool returns
  // tree-wide hits, and the extra results look like evidence rather than noise.
  const inPatterns = values["in"] as string[] | undefined;
  if (inPatterns !== undefined) {
    const built = buildPathFilter(inPatterns);
    if (typeof built === "string") {
      process.stderr.write(`myco: ${built}\n`);
      return 2;
    }
    sOpts.pathFilter = built;
  }

  // A regex-shaped pattern (`a|b`, `\(`, `.*`, anchors) outside regex mode runs as a
  // LITERAL — correct, but two zero-trust probes were misled by exactly this in one
  // day (2026-07-25): the literal miss read as "absent". Say so up front; stdout,
  // informational — the search still runs, semantics unchanged (fail-closed = keep
  // behavior, surface the trap).
  if (!values["json"] && sOpts.mode !== "regex" && detectRegexIntent(pattern)) {
    process.stdout.write(
      `myco: note — pattern looks like a regex but ran as a LITERAL ${sOpts.mode} match; pass -e for regex\n`,
    );
  }

  // A file path arg (not a directory) → search just that one file, no index. myco's
  // index is per-directory (it mkdir's `<root>/.myco`), so a file root previously died
  // with `ENOTDIR: not a directory, mkdir <file>`. A lone file needs no prune anyway.
  const targetStat = await fs.stat(root).catch(() => undefined);
  if (!targetStat) {
    // A missing (or unstattable) path must NOT fall through to the buildIndex branch:
    // buildIndex → saveGraph() mkdir's `<root>/.myco` RECURSIVELY, which would
    // MATERIALISE a directory tree at a path the user only queried — a read-only
    // search with a filesystem side effect (a typo'd path becomes a stray dir, and
    // the created dir can then be picked up by a test-runner glob → spurious failure).
    // Fail closed: report and create nothing.
    process.stderr.write(`myco: path not found: ${root}\n`);
    return 2;
  }
  let outcome: SearchOutcome;
  if (targetStat?.isFile()) {
    // --in scopes a TREE; the target here is one named file, so the flag can only
    // be a mistake — either the user meant a different root, or they expect a
    // filter that will never be consulted. Accepting it and ignoring it would
    // return that file's hits while the user believes a scope was applied.
    if (sOpts.pathFilter) {
      process.stderr.write("myco: --in scopes a directory tree, but the path given is a single file — drop --in, or point at the directory\n");
      return 2;
    }
    outcome = await searchFile(root, pattern, sOpts);
  } else {
    // Refresh (incremental) unless told not to, so results are never stale.
    let graph;
    if (values["no-refresh"]) {
      const loaded = await loadGraph(root);
      if (!loaded) {
        process.stderr.write("myco: no index yet — run `myco index` or drop --no-refresh\n");
        return 2;
      }
      graph = loaded.graph;
    } else {
      const prior = await loadGraphOutcome(root);
      if (prior.status === "unsafe") {
        process.stderr.write(
          `myco: existing index at ${path.join(path.resolve(root), ".myco")} is UNSAFE `
            + `(symlink or escaped path) — refusing to rewrite through that identity\n`,
        );
        return 2;
      }
      if (prior.status === "rejected") {
        process.stdout.write(
          `myco: existing index at ${path.join(path.resolve(root), ".myco")} was REFUSED `
            + `(over a contract limit, corrupt, or an incompatible format) — re-indexing…\n`,
        );
      }
      if (prior.status === "absent") {
        // Informational note → stdout (stderr is errors only).
        process.stdout.write(`myco: indexing ${path.resolve(root)} (first run)…\n`);
      }
      const built = await buildIndex(root, iOpts);
      graph = built.graph;
      if (!values["json"]) noteSaveOutcome(built.saved);
      // Surface an over-size skip even on the search path — otherwise an oversized file
      // silently misses and a zero-result reads as "absent" (the recurring "we keep
      // missing things" failure). Informational → stdout: a skip is not a failure.
      if (!values["json"] && built.skippedLargePaths.length > 0) {
        process.stdout.write(
          `myco: note — ${built.skippedLargePaths.length} file(s) over --max-size ` +
            `not searched (run \`myco index\` to list them)\n`,
        );
      }
      // Vendored trees pruned on the search path get the same visibility as the
      // over-size skip — a node_modules miss must never read as absence.
      if (!values["json"] && built.skippedVendoredDirs.length > 0) {
        process.stdout.write(
          `myco: note — ${built.skippedVendoredDirs.length} vendored dir(s) (node_modules) ` +
            `not searched (pass --vendored to include)\n`,
        );
      }
    }
    outcome = await search(root, graph, pattern, sOpts);
  }
  if (isError(outcome)) {
    process.stderr.write(`myco: ${outcome.error}\n`);
    return 2;
  }

  const body = render(outcome, sOpts.files, {
    color: useColor(values),
    json: Boolean(values["json"]),
  });
  if (body) process.stdout.write(body + "\n");
  // Summary → stdout (informational). stderr stays empty on a successful search, so
  // stderr-non-empty is a trustworthy failure signal at the shell/tool boundary.
  if (!values["json"]) process.stdout.write(summaryLine(outcome) + "\n");

  // An incomplete coverage result is evidence, but never a successful proof of
  // presence or absence. Preserve the body/JSON for diagnosis and fail the
  // process boundary closed. A user-requested result limit is different: it
  // proves at least the returned matches and remains a normal capped result.
  if (
    outcome.searchTimeBudgetExceeded ||
    outcome.regexTimedOut ||
    outcome.regexLinesTruncated > 0
  ) return 2;
  return outcome.matches.length > 0 ? 0 : 1;
}

async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      files: { type: "boolean", short: "f" },
      substring: { type: "boolean", short: "s" },
      regex: { type: "boolean", short: "e" },
      "ignore-case": { type: "boolean", short: "i" },
      "case-sensitive": { type: "boolean", short: "S" },
      context: { type: "string", short: "C" },
      limit: { type: "string", short: "n" },
      json: { type: "boolean" },
      "no-color": { type: "boolean" },
      "no-gitignore": { type: "boolean" },
      "no-refresh": { type: "boolean" },
      "max-size": { type: "string" },
      in: { type: "string", multiple: true },
      vendored: { type: "boolean" },
      fix: { type: "boolean" },
      "delink-missing": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values["version"]) {
    process.stdout.write(VERSION + "\n");
    return 0;
  }
  if (values["help"] || positionals.length === 0) {
    process.stdout.write(HELP + "\n");
    return values["help"] ? 0 : 1;
  }

  const [first, ...rest] = positionals;
  const { index: iOpts } = toOptions(values);

  switch (first) {
    case "index":
      return cmdIndex(path.resolve(rest[0] ?? "."), iOpts);
    case "status":
      return cmdStatus(path.resolve(rest[0] ?? "."));
    case "links":
      return cmdLinks(path.resolve(rest[0] ?? "."), values, iOpts);
    case "help":
      process.stdout.write(HELP + "\n");
      return 0;
    case "version":
      process.stdout.write(VERSION + "\n");
      return 0;
    case "search":
      return cmdSearch(rest[0], path.resolve(rest[1] ?? "."), values);
    default:
      return cmdSearch(first, path.resolve(rest[0] ?? "."), values);
  }
}

// A downstream consumer that closes the pipe early — `myco … | head`, `| less`
// (quit before the end), a killed pager — makes stdout emit an async 'error'
// (EPIPE) that the promise chain below cannot catch: it would crash myco with a
// non-zero exit (255). A truncated pipe is normal use, not a failure — exit
// cleanly. Installed before any output so no write can race ahead of it.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    process.stderr.write(`myco: ${(e as Error).message}\n`);
    process.exitCode = 2;
  });
