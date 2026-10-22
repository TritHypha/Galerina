#!/usr/bin/env node
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/gen-flow-registry.mjs [--check]\n  (no arguments)  regenerate build/flow-registry/flow-registry.json from packages/fungi/memory/src\n  --check         compare without writing; refuse unregistered flow, qualified collision, stale file\n  --help, -h  print this usage and exit 0");

const ROOT = process.cwd();
const args = process.argv.slice(2);
for (const [index, arg] of args.entries()) {
  if (arg !== "--check" || args.indexOf(arg) !== index) {
    console.error(`gen-flow-registry: REFUSED unknown or repeated argument ${JSON.stringify(arg)}; nothing was written.`);
    process.exit(2);
  }
}
const CHECK = args.includes("--check");
const SRC = join(ROOT, "packages", "fungi", "memory", "src");
const OUT_DIR = join(ROOT, "build", "flow-registry");
const OUT = join(OUT_DIR, "flow-registry.json");
const FLOW_RE = /^(?:pure |effectful )?flow ([A-Za-z_][A-Za-z0-9_]*)\(/gm;

function scan() {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".fungi")).sort();
  const flows = [];
  const qualified = new Map();
  for (const file of files) {
    const unit = file.replace(/\.fungi$/, "");
    const text = readFileSync(join(SRC, file), "utf8");
    FLOW_RE.lastIndex = 0;
    let m;
    while ((m = FLOW_RE.exec(text))) {
      const name = m[1];
      const q = unit + "." + name;
      const line = text.slice(0, m.index).split(/\n/).length;
      if (qualified.has(q)) {
        const prev = qualified.get(q);
        const err = `gen-flow-registry: REFUSED qualified-name collision ${q} (${file}:${line} and ${prev.file}:${prev.line})`;
        return { error: err };
      }
      const row = { qualified: q, unit, flow: name, file: "packages/fungi/memory/src/" + file, line };
      qualified.set(q, row);
      flows.push(row);
    }
  }
  flows.sort((a, b) => a.qualified < b.qualified ? -1 : a.qualified > b.qualified ? 1 : 0);
  return {
    registry: {
      schema: "galerina.flow-registry.v1",
      generatedFrom: "packages/fungi/memory/src",
      total: flows.length,
      flows,
    },
  };
}

const scanned = scan();
if (scanned.error) {
  console.error(scanned.error);
  process.exit(1);
}
const generated = JSON.stringify(scanned.registry, null, 2) + "\n";

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error("gen-flow-registry: REFUSED missing " + OUT.replace(/\\/g, "/") + " (unregistered / stale)");
    process.exit(1);
  }
  const onDisk = readFileSync(OUT, "utf8");
  if (onDisk !== generated) {
    console.error("gen-flow-registry: REFUSED stale generated file (unregistered flow or drift)");
    process.exit(1);
  }
  process.stdout.write("gen-flow-registry --check PASS " + scanned.registry.total + " flows\n");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, generated);
process.stdout.write("wrote " + OUT.replace(/\\/g, "/") + " total=" + scanned.registry.total + "\n");
