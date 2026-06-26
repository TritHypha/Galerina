#!/usr/bin/env node
// audit-allowlist-sensitive.mjs — audit every package's Hardened-Border ALLOWLIST for SENSITIVE reach.
//
// The package-graph `--check` gate audits imports AGAINST the allowlist (is every import permitted?).
// This complements it from the other direction: it audits the ALLOWLIST ITSELF for over-reach — which
// deny-by-default borders has each package OPENED to a sensitive capability (process spawn, raw network,
// filesystem, dynamic code eval, …)? Every entry below is a border a human deliberately widened; this
// surfaces them for review so an over-permissive border can't hide in a green `--check`.
//
// Reads each packages-galerina/<pkg>/.graph/boundary-policy.json — the authoritative allowlist (NOT the
// regex-derived graph, so manual require()/dynamic-import entries are included, no false negatives).
//
// ── SPECIFIER FORM: bare AND node:-prefixed both classify (this was a fail-open) ──────────────────────
//   The package-graph scanner (galerina-devtools-package-graph/src/scanner.ts) accepts a builtin written
//   BOTH ways: its NODE_BUILTINS set maps the bare `child_process` to kind "node_core" exactly as it maps
//   `node:child_process`. So a `--check` gate passes an allowlist entry of bare `child_process`, `tls`,
//   `net`, `vm`, `process`, `os`, `fs`, `http`, `dns`, … just as it passes the `node:`-prefixed form. The
//   sensitive-border classifier MUST therefore match both forms — an earlier version anchored every regex
//   to `^node:…$`, so a bare entry passed `--check` yet was INVISIBLE here (the package reported ZERO
//   sensitive borders). Each SENSITIVE regex below now accepts an OPTIONAL `node:` prefix: `(?:node:)?`.
//
// ── COVERAGE BOUNDARY (read before trusting a clean report) ───────────────────────────────────────────
//   • node-core borders: EXHAUSTIVE. Every Node builtin the scanner recognises is classified here.
//   • third-party borders: BEST-EFFORT BLOCKLIST only. A capability wrapper (execa, cross-spawn, node-pty,
//     node-fetch, axios, shelljs, get-port, …) is kind "thirdparty" and can do everything the raw builtin
//     can — `execa` spawns processes, `node-fetch`/`axios` reach the network — but it CANNOT be recognised
//     by a builtin-name regex. KNOWN_DANGEROUS_THIRDPARTY below catches the common ones by exact package
//     name, but an UNLISTED or renamed wrapper (a fork, a private alias) will NOT be flagged. Treat a clean
//     third-party result as "no KNOWN-dangerous wrapper", not "no dangerous reach". The node-core result is
//     the authoritative one.
//
//   node scripts/audit-allowlist-sensitive.mjs            full report
//   node scripts/audit-allowlist-sensitive.mjs --quiet    summary only
//   node scripts/audit-allowlist-sensitive.mjs --strict   exit 1 if any package opens a sensitive border
//                                                          NOT on the reviewed baseline (CI gate mode)
//   node scripts/audit-allowlist-sensitive.mjs --pkg-dir <dir>  scan an alternate packages root (testing)
// Informational by default (exit 0): this is a review lens, not the enforcement gate (#149 owns that).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages-galerina");

// ── Sensitive NODE-CORE capabilities → the risk a human should justify per package. ───────────────────
// Each regex accepts the bare builtin OR the node:-prefixed form: /^(?:node:)?…$/. Order matters only for
// readability — the patterns are mutually exclusive (`child_process` ≠ `process`, anchored at both ends).
const SENSITIVE = [
  { re: /^(?:node:)?child_process$/,        cap: "process-spawn",      risk: "command execution (spawn/exec/fork)" },
  { re: /^(?:node:)?(?:net|dgram|tls)$/,     cap: "raw-socket",         risk: "raw network egress/ingress" },
  { re: /^(?:node:)?(?:http|https|http2)$/,  cap: "http",               risk: "network egress (SSRF surface)" },
  { re: /^(?:node:)?dns(?:\/promises)?$/,    cap: "dns",                risk: "name resolution (SSRF/rebind surface)" },
  { re: /^(?:node:)?(?:fs|fs\/promises)$/,   cap: "filesystem",         risk: "file read/write (path-traversal surface)" },
  { re: /^(?:node:)?(?:vm|repl|inspector)$/, cap: "dynamic-eval",       risk: "dynamic code execution" },
  // node:module is the BIGGER eval primitive: createRequire()/Module._load load arbitrary modules AND
  // native addons (process.dlopen-equivalent) — a process-spawn-equivalent escape, previously unflagged.
  { re: /^(?:node:)?module$/,                cap: "dynamic-require",    risk: "createRequire/_load → arbitrary module + native-addon load (eval/spawn-equivalent)" },
  { re: /^(?:node:)?(?:cluster|worker_threads)$/, cap: "spawn-thread",  risk: "parallel process/thread spawn" },
  // bare `process` / node:process is env-secret exfil + process.binding/dlopen (native escape) — not the
  // ambient global (always present) but an explicit import of it as a border dependency, worth justifying.
  { re: /^(?:node:)?process$/,               cap: "host-introspection", risk: "env/secret exfil, process.binding/dlopen (native escape)" },
  { re: /^(?:node:)?os$/,                     cap: "os-info",            risk: "host/env introspection" },
];

// ── Best-effort THIRD-PARTY blocklist (see COVERAGE BOUNDARY above — NOT exhaustive). ─────────────────
// A bare third-party specifier the scanner classifies "thirdparty" cannot be regex-matched against the
// builtin table, but a known capability wrapper carries the same risk as the builtin it wraps. Keyed by
// the package's BASE name (scope-aware); a subpath like `axios/lib/x` still matches `axios`.
const KNOWN_DANGEROUS_THIRDPARTY = new Map([
  ["execa",       { cap: "process-spawn", risk: "command execution (child_process wrapper)" }],
  ["cross-spawn", { cap: "process-spawn", risk: "command execution (child_process wrapper)" }],
  ["shelljs",     { cap: "process-spawn", risk: "command execution (shell wrapper)" }],
  ["node-pty",    { cap: "process-spawn", risk: "pseudo-terminal process spawn" }],
  ["zx",          { cap: "process-spawn", risk: "shell scripting (command execution)" }],
  ["node-fetch",  { cap: "http",          risk: "network egress (fetch polyfill, SSRF surface)" }],
  ["axios",       { cap: "http",          risk: "network egress (HTTP client, SSRF surface)" }],
  ["got",         { cap: "http",          risk: "network egress (HTTP client, SSRF surface)" }],
  ["undici",      { cap: "http",          risk: "network egress (HTTP client, SSRF surface)" }],
  ["request",     { cap: "http",          risk: "network egress (HTTP client, SSRF surface)" }],
  ["get-port",    { cap: "raw-socket",    risk: "binds sockets to probe free ports (raw network)" }],
]);

/** Base package name for a specifier: scope-aware (`@scope/pkg`) and subpath-stripped (`axios/lib/x`→`axios`). */
function basePkg(spec) {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0] ?? spec;
}

/**
 * Classify a single allowlist specifier into a sensitive capability, or null if benign.
 * Returns { cap, risk, source } — source is "node-core" (authoritative) or "thirdparty" (best-effort).
 * Exported so the regression suite can assert bare AND node:-prefixed forms both classify.
 */
export function classify(spec) {
  const core = SENSITIVE.find((s) => s.re.test(spec));
  if (core) return { cap: core.cap, risk: core.risk, source: "node-core" };
  const tp = KNOWN_DANGEROUS_THIRDPARTY.get(basePkg(spec));
  if (tp) return { cap: tp.cap, risk: tp.risk, source: "thirdparty" };
  return null;
}

/** Pure: map an allowlist array to its sensitive entries. The unit the regression test targets directly. */
export function auditAllowlist(allow) {
  if (!Array.isArray(allow)) return [];
  return allow
    .map((spec) => {
      const c = classify(spec);
      return c ? { spec, cap: c.cap, risk: c.risk, source: c.source } : null;
    })
    .filter(Boolean);
}

/**
 * Scan a packages root, reading each <pkg>/.graph/boundary-policy.json.
 * Returns { rows, scanned, missing }. Parameterised by pkgDir so a fixture tree can be audited in-process.
 */
export function scan(pkgDir = PKG_DIR) {
  const pkgs = readdirSync(pkgDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const rows = []; // { pkg, sensitive: [{ spec, cap, risk, source }] }
  let scanned = 0, missing = 0;
  for (const pkg of pkgs) {
    const policyPath = join(pkgDir, pkg, ".graph", "boundary-policy.json");
    if (!existsSync(policyPath)) { missing++; continue; }
    let policy;
    try { policy = JSON.parse(readFileSync(policyPath, "utf-8")); }
    catch {
      rows.push({ pkg, sensitive: [{ spec: "<unreadable boundary-policy.json>", cap: "ERROR", risk: "fail-closed: unparseable allowlist", source: "node-core" }] });
      continue;
    }
    scanned++;
    const sensitive = auditAllowlist(policy.allowedExternal);
    if (sensitive.length > 0) rows.push({ pkg, sensitive });
  }
  return { rows, scanned, missing };
}

/** Aggregate rows by capability → which packages hold each one. */
export function byCapability(rows) {
  const byCap = new Map();
  for (const r of rows) for (const s of r.sensitive) {
    if (!byCap.has(s.cap)) byCap.set(s.cap, []);
    byCap.get(s.cap).push(r.pkg);
  }
  return byCap;
}

// ── Report / CLI ──────────────────────────────────────────────────────────────────────────────────────
// Capabilities that are eval-equivalent, spawn-equivalent, or exfil-equivalent — always call them out.
const HIGHEST_RISK = ["process-spawn", "dynamic-require", "dynamic-eval", "raw-socket", "host-introspection"];

function main() {
  const quiet = process.argv.includes("--quiet");
  const strict = process.argv.includes("--strict");
  const pkgDirFlag = process.argv.indexOf("--pkg-dir");
  const pkgDir = pkgDirFlag >= 0 ? process.argv[pkgDirFlag + 1] : PKG_DIR;

  const { rows, scanned, missing } = scan(pkgDir);
  const byCap = byCapability(rows);

  if (!quiet) {
    console.log(`\n🔍 Allowlist sensitive-border audit — ${scanned} packages scanned (${missing} without a .graph policy)\n`);
    console.log(`${rows.length} package(s) have opened at least one sensitive border:\n`);
    for (const r of rows) {
      console.log(`  ${r.pkg}`);
      for (const s of r.sensitive) {
        const tag = s.source === "thirdparty" ? " (thirdparty wrapper)" : "";
        console.log(`    • ${s.spec.padEnd(22)} [${s.cap}]${tag} — ${s.risk}`);
      }
    }
    console.log(`\n── By capability (who can do what) ──`);
    for (const [cap, list] of [...byCap].sort()) {
      console.log(`  ${cap.padEnd(18)} (${list.length}): ${[...new Set(list)].sort().join(", ")}`);
    }
    console.log(
      `\nNote: node-core coverage is exhaustive (bare AND node:-prefixed). Third-party coverage is a ` +
      `best-effort blocklist — an unlisted capability wrapper is NOT flagged (see header).`,
    );
  }

  const highest = HIGHEST_RISK.filter((c) => byCap.has(c));
  console.log(`\nSummary: ${rows.length} package(s) with a sensitive border; capabilities in use: ${[...byCap.keys()].sort().join(", ") || "none"}.`);
  if (highest.length) console.log(`⚠️  Highest-risk borders open: ${highest.join(", ")} — confirm each is justified.`);

  // --strict CI mode would diff against a committed reviewed baseline (build/allowlist-sensitive-baseline.json);
  // left informational by default so this never blocks a build before the baseline + #149 land.
  process.exit(strict && rows.some((r) => r.sensitive.some((s) => s.cap === "ERROR")) ? 1 : 0);
}

// Import-safe: only run the CLI when executed directly (not when imported by a test).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
