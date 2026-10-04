// scripts/lib/cli-help.mjs — one shared, non-mutating `--help` contract for registered generator owners.
//
// `exitOnHelp(import.meta.url, usage)` is called once, directly after a script's imports. When that
// script is the process entrypoint and its arguments contain `--help` or `-h`, it prints `usage` to
// stdout and exits 0 BEFORE any read, generation or write. Imported as a library (tests, other tools)
// it is inert. Zero-trust default, owner may revisit: a generator owner must never treat a request for
// help as a request to regenerate tracked output.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @param {string} moduleUrl the calling script's `import.meta.url`
 * @param {string} usage exact usage text (first line `usage: node scripts/<name>.mjs ...`)
 * @param {readonly string[]} [argv] process arguments (defaults to process.argv)
 */
export function exitOnHelp(moduleUrl, usage, argv = process.argv) {
  const entry = argv[1];
  if (typeof entry !== "string" || entry === "") return;
  let isEntry = false;
  try {
    isEntry = realpathSync(resolve(entry)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return;
  }
  if (!isEntry) return;
  const args = argv.slice(2);
  if (!args.includes("--help") && !args.includes("-h")) return;
  process.stdout.write(usage.endsWith("\n") ? usage : `${usage}\n`);
  process.exit(0);
}
