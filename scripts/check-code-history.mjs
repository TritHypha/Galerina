#!/usr/bin/env node
// check-code-history.mjs - crr-01 code history gate (fail-closed).
// Refuses: a meaning change of a registered code (against code-meanings AND against every
// previously committed version of the history, so a coordinated edit of both files in one
// commit is still refused), deletion of a committed history record, retired -> active,
// any use of a retired code in the registry (live, inline, referenced, ref, phantom; only its own dead tombstone definition may remain),
// an unregistered registry code, and an unknown status value.
// Allowed transitions only: UNKNOWN meaning -> first real meaning (once); active -> retired.
// Zero-trust choice: append-only is proven from git history, not from the file itself.
// Rejected options: (a) a self-hash inside the history file (editable in the same commit),
// (b) comparing only against code-meanings.mjs (coordinated edit survives, crr-01 M1),
// (c) treating a shallow or non-git tree as PASS (absent evidence is UNKNOWN, exit 2).
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { exitOnHelp } from "./lib/cli-help.mjs";
import { meaningOf } from "./lib/code-meanings.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/check-code-history.mjs --check\n  --check  refuse meaning change, deleted record, retired->active, retired code in the registry\n           (append-only is checked against every committed version of the history file)\n  --help, -h  print this usage and exit 0");

const ROOT = process.cwd();
const args = process.argv.slice(2);
if (!(args.length === 1 && args[0] === "--check")) {
  console.error("check-code-history: REFUSED unknown or missing --check; nothing was written.");
  process.exit(2);
}

const HISTORY_REL = "scripts/baselines/code-history.json";
const historyPath = join(ROOT, ...HISTORY_REL.split("/"));
const registryPath = join(ROOT, "build", "code-registry", "registry.json");
const STATUSES = new Set(["active", "retired"]);
let failures = 0;
const refuse = (msg) => { console.error("check-code-history: REFUSED " + msg); failures += 1; };
const unknown = (msg) => { console.error("check-code-history: UNKNOWN " + msg + " (typed UNKNOWN, not PASS)"); process.exit(2); };

if (!existsSync(historyPath)) { console.error("check-code-history: REFUSED missing " + HISTORY_REL); process.exit(1); }
if (!existsSync(registryPath)) { console.error("check-code-history: REFUSED missing build/code-registry/registry.json"); process.exit(1); }

function parseHistory(text, where) {
  let h;
  try { h = JSON.parse(text); } catch { console.error("check-code-history: REFUSED unparseable history " + where); process.exit(1); }
  if (!h || h.schema !== "galerina.code-history.v1" || !Array.isArray(h.records)) {
    console.error("check-code-history: REFUSED invalid history schema " + where);
    process.exit(1);
  }
  const byCode = new Map();
  for (const rec of h.records) {
    if (!rec || typeof rec.code !== "string" || typeof rec.meaning !== "string" || !STATUSES.has(rec.status)) {
      console.error("check-code-history: REFUSED malformed history record " + where + " " + JSON.stringify(rec));
      process.exit(1);
    }
    if (byCode.has(rec.code)) { console.error("check-code-history: REFUSED duplicate history row " + rec.code + " " + where); process.exit(1); }
    byCode.set(rec.code, rec);
  }
  return { count: h.records.length, byCode };
}

const current = parseHistory(readFileSync(historyPath, "utf8"), "(working tree)");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

// 1. Append-only against every committed version.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
const git = (a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", env, maxBuffer: 1 << 28 });
const top = git(["rev-parse", "--show-toplevel"]);
if (top.status !== 0) unknown("not a git work tree; append-only history cannot be proven");
const shallow = git(["rev-parse", "--is-shallow-repository"]);
if (shallow.status !== 0 || shallow.stdout.trim() !== "false") unknown("shallow or unreadable git history; append-only history cannot be proven");
const log = git(["log", "--format=%H", "--", HISTORY_REL]);
if (log.status !== 0) unknown("git log failed for " + HISTORY_REL);
const shas = log.stdout.split(/\r?\n/).filter(Boolean);
let versions = 0;
for (const sha of shas) {
  const show = git(["show", sha + ":" + HISTORY_REL]);
  if (show.status !== 0) continue; // commit deleted the file; deletion of records is caught by the next older version
  versions += 1;
  const prior = parseHistory(show.stdout, "@" + sha.slice(0, 8));
  for (const [code, p] of prior.byCode) {
    const c = current.byCode.get(code);
    if (!c) { refuse("deleted history record " + code + " (committed @" + sha.slice(0, 8) + ")"); continue; }
    if (p.meaning !== "UNKNOWN" && c.meaning !== p.meaning) refuse("meaning change " + code + " against committed @" + sha.slice(0, 8));
    switch (p.status + ">" + c.status) {
      case "active>active": case "active>retired": case "retired>retired": break;
      case "retired>active": refuse("retired code revived " + code + " (retired @" + sha.slice(0, 8) + ")"); break;
      default: refuse("unknown status transition " + code + " " + p.status + ">" + c.status); break;
    }
  }
}

// 2. Aliases resolve to one canonical.
const aliasToCanon = new Map();
for (const row of registry.aliases || []) {
  if (aliasToCanon.has(row.alias) && aliasToCanon.get(row.alias) !== row.canonical) refuse("alias " + row.alias + " resolves to two canonicals");
  aliasToCanon.set(row.alias, row.canonical);
}

// 3. Registry against the current history.
for (const entry of registry.entries || []) {
  const rec = current.byCode.get(entry.code);
  if (!rec) { refuse("unregistered code " + entry.code); continue; }
  if (rec.meaning !== meaningOf(entry.code)) refuse("meaning change " + entry.code + " (history vs code-meanings)");
  switch (rec.status) {
    case "active": break;
    case "retired":
      // A retired code may keep only its tombstone: a definition that is never emitted, tested or referenced
      // (registry status "dead"). Any other status means it is being used again: refused.
      // Rejected option: rewriting the 232 dead->retired records from crr-01 to active (that is a revival,
      // refused by the append-only rule, and wiring a dead code is a naming decision for Phillip).
      if (entry.status !== "dead") refuse("retired code in use in registry " + entry.code + " status=" + entry.status);
      break;
    default: refuse("unknown history status " + entry.code); break;
  }
}
if (failures) process.exit(1);
process.stdout.write("check-code-history --check PASS records=" + current.count + " committedVersions=" + versions + "\n");