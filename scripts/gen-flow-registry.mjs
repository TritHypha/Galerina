#!/usr/bin/env node
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { exitOnHelp } from "./lib/cli-help.mjs";

// crr-01 flow registry, fail-closed. Every `flow <name>(` declaration under packages/fungi/memory/src
// (recursive) must be captured by the strict column-0 grammar; any other line that declares a flow
// (indented, unknown modifier, export, etc.) is REFUSED rather than silently left unregistered.
// Rejected option: widening the strict grammar to accept any indentation (would register flows the
// .fungi parser may treat differently; the registry must not guess). Scope note: products/** is not
// scanned (memory work only), recorded in docs/registry/crr-01-decision.md.
exitOnHelp(import.meta.url, "usage: node scripts/gen-flow-registry.mjs [--check]\n  (no arguments)  regenerate build/flow-registry/flow-registry.json from packages/fungi/memory/src (recursive)\n  --check         compare without writing; refuse unregistered or unparsed flow, qualified collision, stale file\n  --help, -h  print this usage and exit 0");

const ROOT = process.cwd();
const args = process.argv.slice(2);
for (const [index, arg] of args.entries()) {
  if (arg !== "--check" || args.indexOf(arg) !== index) {
    console.error(`gen-flow-registry: REFUSED unknown or repeated argument ${JSON.stringify(arg)}; nothing was written.`);
    process.exit(2);
  }
}
const CHECK = args.includes("--check");
const SRC_REL = "packages/fungi/memory/src";
const SRC = join(ROOT, ...SRC_REL.split("/"));
const OUT_DIR = join(ROOT, "build", "flow-registry");
const OUT = join(OUT_DIR, "flow-registry.json");
const STRICT = /^(?:pure |effectful )?flow ([A-Za-z_][A-Za-z0-9_]*)\(/;
const LOOSE = /(?:^|[^A-Za-z0-9_])flow\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/;

function listFungi(dir, rel) {
  if (!existsSync(dir)) return null;
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const r = rel ? rel + "/" + name : name;
    if (statSync(abs).isDirectory()) out.push(...listFungi(abs, r));
    else if (name.endsWith(".fungi")) out.push(r);
  }
  return out;
}

function scan() {
  const files = listFungi(SRC, "");
  if (files === null) return { error: "gen-flow-registry: REFUSED missing " + SRC_REL };
  const flows = [];
  const qualified = new Map();
  for (const file of files) {
    const unit = file.replace(/\.fungi$/, "");
    const lines = readFileSync(join(SRC, ...file.split("/")), "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const code = raw.replace(/\/\/.*$/, "");
      const m = STRICT.exec(code);
      if (!m) {
        if (LOOSE.test(code)) return { error: `gen-flow-registry: REFUSED unparsed flow declaration ${SRC_REL}/${file}:${i + 1} (not column-0 \`[pure |effectful ]flow name(\`); fail-closed, not registered` };
        continue;
      }
      const name = m[1];
      const q = unit + "." + name;
      const line = i + 1;
      if (qualified.has(q)) {
        const prev = qualified.get(q);
        return { error: `gen-flow-registry: REFUSED qualified-name collision ${q} (${file}:${line} and ${prev.file}:${prev.line})` };
      }
      const row = { qualified: q, unit, flow: name, file: SRC_REL + "/" + file, line };
      qualified.set(q, row);
      flows.push(row);
    }
  }
  flows.sort((a, b) => a.qualified < b.qualified ? -1 : a.qualified > b.qualified ? 1 : 0);
  return { registry: { schema: "galerina.flow-registry.v1", generatedFrom: SRC_REL, total: flows.length, flows } };
}

const scanned = scan();
if (scanned.error) {
  console.error(scanned.error);
  process.exit(1);
}
const generated = JSON.stringify(scanned.registry, null, 2) + "\n";

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error("gen-flow-registry: REFUSED missing build/flow-registry/flow-registry.json (unregistered / stale)");
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== generated) {
    console.error("gen-flow-registry: REFUSED stale generated file (unregistered flow or drift)");
    process.exit(1);
  }
  process.stdout.write("gen-flow-registry --check PASS " + scanned.registry.total + " flows\n");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, generated);
process.stdout.write("wrote build/flow-registry/flow-registry.json total=" + scanned.registry.total + "\n");