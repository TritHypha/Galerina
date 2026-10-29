#!/usr/bin/env node
// K3-ZY N-bh: git merge-tree --write-tree --name-only. Never merges.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function git(args, cwd = ROOT) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 60000 });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message) : "",
  };
}

function parseNameOnly(stdout) {
  const lines = stdout.split(/\r?\n/u);
  let tree = null;
  const conflictedPaths = [];
  for (const line of lines) {
    if (line === "") continue;
    if (/^[0-9a-f]{40}$/u.test(line)) {
      if (tree === null) tree = line;
      continue;
    }
    if (line.startsWith("Auto-merging ")) continue;
    if (line.startsWith("CONFLICT ")) continue;
    conflictedPaths.push(line);
  }
  return { tree, conflictedPaths: Object.freeze(conflictedPaths) };
}

export function mergeTreeAgainstMain(cwd = ROOT, mainRef = "origin/main") {
  const headRun = git(["rev-parse", "HEAD"], cwd);
  const mainRun = git(["rev-parse", mainRef], cwd);
  const head = headRun.stdout.trim();
  const main = mainRun.stdout.trim();
  const tree = git(["merge-tree", "--write-tree", "--name-only", mainRef, "HEAD"], cwd);
  const parsed = parseNameOnly(tree.stdout);
  if (tree.status === 0) {
    return Object.freeze({
      ok: true,
      conflicted: false,
      unknown: false,
      conflictedPaths: parsed.conflictedPaths,
      tree: parsed.tree,
      status: tree.status,
      head,
      main,
    });
  }
  if (tree.status === 1 && parsed.conflictedPaths.length > 0) {
    return Object.freeze({
      ok: false,
      conflicted: true,
      unknown: false,
      conflictedPaths: parsed.conflictedPaths,
      tree: parsed.tree,
      status: tree.status,
      head,
      main,
    });
  }
  return Object.freeze({
    ok: false,
    conflicted: false,
    unknown: true,
    conflictedPaths: Object.freeze([]),
    tree: null,
    status: tree.status,
    head,
    main,
    stderr: tree.stderr,
    error: tree.error,
  });
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const mainArg = process.argv.find((row) => row.startsWith("--main="));
  const mainRef = mainArg !== undefined ? mainArg.slice("--main=".length) : "origin/main";
  const report = mergeTreeAgainstMain(ROOT, mainRef);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok === true ? 0 : report.conflicted === true ? 1 : 2;
}
