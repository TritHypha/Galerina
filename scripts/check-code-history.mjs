#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exitOnHelp } from "./lib/cli-help.mjs";
import { meaningOf } from "./lib/code-meanings.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/check-code-history.mjs [--check]\n  --check  refuse meaning change of a registered code and reuse of a retired code\n  --help, -h  print this usage and exit 0");

const ROOT = process.cwd();
const args = process.argv.slice(2);
if (!args.includes("--check") || args.length !== 1) {
  if (!(args.length === 1 && args[0] === "--check")) {
    console.error("check-code-history: REFUSED unknown or missing --check; nothing was written.");
    process.exit(2);
  }
}

const historyPath = join(ROOT, "scripts", "baselines", "code-history.json");
const registryPath = join(ROOT, "build", "code-registry", "registry.json");
if (!existsSync(historyPath)) {
  console.error("check-code-history: REFUSED missing scripts/baselines/code-history.json");
  process.exit(1);
}
if (!existsSync(registryPath)) {
  console.error("check-code-history: REFUSED missing build/code-registry/registry.json");
  process.exit(1);
}

const history = JSON.parse(readFileSync(historyPath, "utf8"));
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
if (!history || history.schema !== "galerina.code-history.v1" || !Array.isArray(history.records)) {
  console.error("check-code-history: REFUSED invalid history schema");
  process.exit(1);
}

const byCode = new Map();
for (const rec of history.records) {
  if (!rec || typeof rec.code !== "string") {
    console.error("check-code-history: REFUSED malformed history record");
    process.exit(1);
  }
  if (byCode.has(rec.code)) {
    console.error("check-code-history: REFUSED duplicate history row " + rec.code);
    process.exit(1);
  }
  byCode.set(rec.code, rec);
}

const aliases = registry.aliases || [];
const aliasToCanon = new Map();
for (const row of aliases) {
  if (aliasToCanon.has(row.alias) && aliasToCanon.get(row.alias) !== row.canonical) {
    console.error("check-code-history: REFUSED alias " + row.alias + " resolves to two canonicals");
    process.exit(1);
  }
  aliasToCanon.set(row.alias, row.canonical);
}

let meaningChanges = 0;
let retiredReuse = 0;
let missing = 0;
for (const entry of registry.entries || []) {
  const rec = byCode.get(entry.code);
  if (!rec) {
    console.error("check-code-history: REFUSED unregistered code " + entry.code);
    missing += 1;
    continue;
  }
  const nowMeaning = meaningOf(entry.code);
  if (rec.meaning !== nowMeaning) {
    console.error("check-code-history: REFUSED meaning change " + entry.code);
    meaningChanges += 1;
  }
  if (rec.status === "retired" && (entry.status === "live" || entry.status === "inline")) {
    console.error("check-code-history: REFUSED reuse of retired code " + entry.code);
    retiredReuse += 1;
  }
}
if (meaningChanges || retiredReuse || missing) process.exit(1);
process.stdout.write("check-code-history --check PASS records=" + history.records.length + "\n");
