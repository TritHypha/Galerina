// lib/import-graph-hooks.mjs — module-resolution hooks for W1's --graph mode (RD-0401/0403).
// Runs on Node's loader thread; records every (parent → child) ESM resolution as one line in the
// log file the register shim passed via `data`. The MEASURED import graph — what actually loads on
// a real invocation — is the input to W2's dominator-cut method; a static scan would overcount
// (per-command lazy imports already exist) and undercount (dynamic import()).
import { appendFileSync } from "node:fs";

let logPath = null;

export function initialize(data) {
  logPath = data?.logPath ?? null;
}

export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  if (logPath && context.parentURL) {
    try { appendFileSync(logPath, `${context.parentURL}\t${r.url}\n`); } catch { /* never break the run */ }
  }
  return r;
}
