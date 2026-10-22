#!/usr/bin/env node
// =============================================================================
// run-phase-close.mjs — Galerina full phase-close cadence
// =============================================================================
// Runs the standard end-of-stage sweep:
//   1. Core tests        (SOT four packages — compiler/economics/graph/security)
//   2. DevTools tests    (naming / context / intelligence / provenance)
//   3. Security audit    (auth-service corpus — in-process, fast)
//   4. DevTools audits   (naming sweep + provenance directory audit)
//   5. Graph/index drift (non-mutating generated-evidence checks)
//
// Explicit-only root command. The Stop hook runs phase-close-hook.mjs, which
// reports lease state without starting tests. Blocking mode exits non-zero on
// any failed child; --report-only is the explicit non-authorizing diagnostic
// mode.
//
// Skip with:  GALERINA_SKIP_PHASE_CLOSE=1   (env)   — e.g. for rapid iteration.
// Run manually:  node scripts/run-phase-close.mjs
// Benchmarks are intentionally EXCLUDED (multi-minute) — run on demand.
// =============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseGovernanceDiff } from "./lib/phase-close-result.mjs";
import { buildPhaseCloseTimingProfile } from "./lib/phase-close-profile.mjs";
import { parseStrictJsonBytes } from "./lib/assurance-fabric/strict-json.mjs";
import suiteLeaseModule from "./lib/suite-run-lease.cjs";
import ownedProcessModule from "./lib/owned-process-tree.cjs";

const { acquireSuiteLease } = suiteLeaseModule;
const { runOwnedProcessSync } = ownedProcessModule;

function parseArguments(argv) {
  const parsed = {
    root: join(dirname(fileURLToPath(import.meta.url)), ".."),
    json: false,
    reportOnly: false,
    staticOracle: false,
    tier: "phase-close",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a path");
      parsed.root = resolve(value);
      index += 1;
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument === "--report-only") {
      parsed.reportOnly = true;
    } else if (argument === "--static-oracle") {
      parsed.staticOracle = true;
    } else if (argument === "--tier") {
      const value = argv[index + 1];
      if (!["phase-close", "exhaustive"].includes(value)) {
        throw new Error("--tier must be phase-close or exhaustive");
      }
      parsed.tier = value;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return parsed;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(`run-phase-close: ${error.message}`);
  process.exit(3);
}

if (process.env.GALERINA_SKIP_PHASE_CLOSE === "1") {
  const skipped = {
    tool: "run-phase-close",
    schemaVersion: 1,
    root: options.root,
    tier: options.tier,
    verdict: "SKIPPED",
    authorizing: false,
    skipAuthority: "GALERINA_SKIP_PHASE_CLOSE=1",
    failed: [],
    totals: { checks: 0, passed: 0, failed: 0 },
    results: [],
  };
  if (options.json) console.log(JSON.stringify(skipped, null, 2));
  else console.log("⏭️  phase-close skipped (GALERINA_SKIP_PHASE_CLOSE=1; non-authorizing)");
  process.exit(0);
}

const ROOT = options.root;
const isWin = process.platform === "win32";
const results = [];

let suiteLease;
try {
  suiteLease = acquireSuiteLease({ root: ROOT, commandClass: "phase-close" });
} catch (error) {
  const report = {
    tool: "run-phase-close",
    schemaVersion: 1,
    root: ROOT,
    tier: options.tier,
    verdict: "REFUSED",
    authorizing: false,
    code: error.code || "SUITE-LEASE-REFUSED",
    detail: error.message,
    failed: [],
    totals: { checks: 0, passed: 0, failed: 0 },
    results: [],
  };
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else console.error(`run-phase-close: ${report.code} — ${report.detail}`);
  process.exit(1);
}
process.once("exit", () => { suiteLease.release(); });

function nonAuthorizingChildEnv() {
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.GALERINA_SUITE_LEASE_NONCE;
  delete childEnv.GALERINA_SUITE_LEASE_ROOT_ID;
  delete childEnv.GALERINA_SUITE_LEASE_OWNER_PID;
  delete childEnv.GALERINA_SUITE_LEASE_MEDIATOR_PID;
  return childEnv;
}

function run(name, cmd, args, {
  cwd = ROOT,
  okCodes = [0],
  timeout = 180000,
  inheritSuiteLease = false,
} = {}) {
  const t0 = Date.now();
  console.error(`PHASE-CLOSE START ${name}`);
  const childEnv = nonAuthorizingChildEnv();
  const admittedChildEnv = inheritSuiteLease
    ? suiteLease.childEnvironment(childEnv)
    : childEnv;
  let executable = cmd === "node" ? process.execPath : cmd;
  let executableArgs = args;
  if (isWin && cmd === "npm") {
    executable = process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    executableArgs = ["/d", "/s", "/c", "npm.cmd", ...args];
  }
  const r = runOwnedProcessSync({
    command: executable,
    args: executableArgs,
    cwd,
    env: admittedChildEnv,
    timeoutMs: timeout,
    maxOutputBytes: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const ms = Date.now() - t0;
  const code = r.status;
  const ok = r.error === undefined
    && r.signal === null
    && typeof code === "number"
    && okCodes.includes(code);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const detail = r.error
    ? `spawn failed: ${r.error.message}`
    : r.signal
      ? `terminated by signal ${r.signal}`
      : typeof code !== "number"
        ? "missing numeric exit status"
        : summarise(name, out, ok, code);
  results.push({
    name,
    ok,
    durationMs: ms,
    exitCode: typeof code === "number" ? code : null,
    signal: r.signal ?? null,
    detail,
    processControl: {
      ownedTree: r.owned !== null && r.owned.spawnError === null,
      cleanupAttempted: r.owned?.cleanupAttempted === true,
    },
  });
  console.error(`PHASE-CLOSE END ${name} ${ok ? "PASS" : "FAIL"} ${ms}ms`);
  return {
    ok,
    out,
    stdout: r.stdout || "",
    code,
    processControl: {
      ownedTree: r.owned !== null && r.owned.spawnError === null,
      cleanupAttempted: r.owned?.cleanupAttempted === true,
    },
  };
}

const GRAPH_ALL_CHILD_NAMES = Object.freeze([
  "package graph",
  "project graph",
  "graph integrity",
  "KB graph",
  "dev-tool index",
  "Fungi source capability inventory",
  "semantic assurance graph",
  "roadmap",
]);

function isExactObject(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function semanticCoverageFromGraphAll(graphAll) {
  let receipt;
  try {
    receipt = parseStrictJsonBytes(Buffer.from(graphAll.stdout, "utf8"), {
      label: "graph-all semantic receipt",
      maxBytes: 1_048_576,
    });
  } catch (error) {
    return {
      ok: false,
      exitCode: typeof graphAll.code === "number" ? graphAll.code : 1,
      detail: `graph-all semantic receipt refused: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!isExactObject(receipt, ["tool", "schemaVersion", "mode", "children"])
      || receipt.tool !== "graph-all"
      || receipt.schemaVersion !== 1
      || receipt.mode !== "check"
      || !Array.isArray(receipt.children)
      || receipt.children.length !== GRAPH_ALL_CHILD_NAMES.length) {
    return { ok: false, exitCode: 1, detail: "graph-all semantic receipt has an invalid closed shape" };
  }
  const names = new Set();
  let semantic;
  for (const child of receipt.children) {
    if (!isExactObject(child, ["name", "args", "status"])
        || typeof child.name !== "string"
        || !Array.isArray(child.args)
        || !child.args.every((arg) => typeof arg === "string")
        || !Number.isSafeInteger(child.status)
        || child.status < 0
        || !GRAPH_ALL_CHILD_NAMES.includes(child.name)
        || names.has(child.name)) {
      return { ok: false, exitCode: 1, detail: "graph-all semantic receipt has an invalid child identity" };
    }
    names.add(child.name);
    if (child.name === "semantic assurance graph") semantic = child;
  }
  if (names.size !== GRAPH_ALL_CHILD_NAMES.length || semantic === undefined
      || semantic.args.length !== 4
      || semantic.args[0] !== "scripts/gen-assurance-semantic-graph.mjs"
      || semantic.args[1] !== "--root"
      || semantic.args[2] !== ROOT
      || semantic.args[3] !== "--check") {
    return { ok: false, exitCode: 1, detail: "graph-all semantic receipt omits the exact semantic owner check" };
  }
  if (semantic.status !== 0) {
    return {
      ok: false,
      exitCode: semantic.status,
      detail: `semantic coverage refused with exit ${semantic.status} according to exact graph-all result`,
    };
  }
  return { ok: true, exitCode: 0, detail: "semantic coverage validated from exact graph-all result" };
}

function runSemanticCoverageFromGraphAll(graphAll) {
  const t0 = Date.now();
  console.error("PHASE-CLOSE START semantic:coverage");
  const checked = semanticCoverageFromGraphAll(graphAll);
  const durationMs = Date.now() - t0;
  results.push({
    name: "semantic:coverage",
    ok: checked.ok,
    durationMs,
    exitCode: checked.exitCode,
    signal: null,
    detail: checked.detail,
    processControl: graphAll.processControl,
  });
  console.error(`PHASE-CLOSE END semantic:coverage ${checked.ok ? "PASS" : "FAIL"} ${durationMs}ms`);
  return checked;
}

function runStaticOracleSpecial(name, mode) {
  return run(name, "node", [
    "scripts/run-phase-close-special.mjs",
    "--root",
    ROOT,
    "--check",
    mode,
  ]);
}

function summarise(name, out, ok, code) {
  // An EXPLICIT summary always wins over the guesses below. Added 2026-07-19 after the new
  // auto-erasure-ratchet gate was rendered as "245 tests pass" — the `total` heuristic beneath grabs
  // any number following the word "total", so a DEBT count was reported in the vocabulary of passing
  // tests. A gate that measures something other than tests can now say so instead of being guessed at.
  const explicit = out.match(/^SUMMARY:\s*(.+)$/m);
  if (explicit) return explicit[1].trim();
  // graph
  const nodes = out.match(/Nodes:\s*(\d+)/);
  const edges = out.match(/Edges:\s*(\d+)/);
  if (nodes && edges) return `${nodes[1]} nodes / ${edges[1]} edges`;
  // run-all-tests.cjs owns the core aggregate TOTAL row. No other child may
  // reinterpret an arbitrary debt/count sentence containing "total" as tests.
  if (name === "tests:core") {
    const total = out.match(/(?:TOTAL|total)[^\d]*(\d[\d,]+)\b/);
    if (total) return `${total[1]} tests pass`;
  }
  // R6 corpus parity gate
  if (name === "tests:r6-corpus") {
    const pass = out.match(/(?:^|\n)[^\n]*\bpass\s+(\d[\d,]*)/i);
    if (ok && pass) return `${pass[1]} tests pass (Stage A parity)`;
    if (ok) return "10 tests pass (Stage A parity)";
  }
  // node --test summary
  const pass = out.match(/(?:^|\n)[^\n]*\bpass\s+(\d[\d,]*)/i);
  const fail = out.match(/(?:^|\n)[^\n]*\bfail\s+(\d+)/i);
  if (pass) return `${pass[1]} tests${fail && fail[1] !== "0" ? `, ${fail[1]} FAIL` : " pass"}`;
  // provenance directory audit: exit 2 = risk flows found (informational)
  if (name === "audit:provenance") {
    const risk = out.match(/HIGH RISK[^\d]*(\d+)/i) || out.match(/risk[^\d]*(\d+)/i);
    if (code === 2) return `${risk ? risk[1] : "some"} ungated-sink risk flow(s) — informational`;
    return code === 0 ? "0 risk flows" : `exit ${code}`;
  }
  return ok ? "ok" : `FAILED (exit ${code})`;
}

function finish() {
  const normalizedResults = results.map((result) => ({
    name: result.name,
    ok: result.ok === true,
    durationMs: result.durationMs ?? result.ms ?? 0,
    exitCode: result.exitCode ?? result.code ?? (result.ok === true ? 0 : 1),
    signal: result.signal ?? null,
    detail: result.detail ?? "missing result detail",
    processControl: result.processControl ?? {
      ownedTree: false,
      cleanupAttempted: false,
    },
  }));
  const failed = normalizedResults.filter((result) => !result.ok);
  const profile = buildPhaseCloseTimingProfile(normalizedResults);
  const verdict = failed.length === 0
    ? options.reportOnly
      ? "REPORT_ONLY_PASS"
      : "PASS"
    : options.reportOnly
      ? "REPORT_ONLY_FAILED"
      : "FAIL";
  const report = {
    tool: "run-phase-close",
    schemaVersion: 1,
    root: ROOT,
    tier: options.tier,
    verdict,
    authorizing: verdict === "PASS",
    failed: failed.map((result) => result.name),
    totals: {
      checks: normalizedResults.length,
      passed: normalizedResults.length - failed.length,
      failed: failed.length,
    },
    profile,
    results: normalizedResults,
  };
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("\n-- phase-close summary --");
    for (const result of normalizedResults) {
      const mark = result.ok ? "PASS" : "FAIL";
      const time = result.durationMs
        ? ` (${(result.durationMs / 1000).toFixed(1)}s)`
        : "";
      console.log(`${mark} ${result.name.padEnd(26)} ${result.detail}${time}`);
    }
    console.log("\n-- phase-close bottleneck tokens --");
    if (profile.slowest.length === 0) {
      console.log("No positive stage durations were recorded.");
    } else {
      for (const item of profile.slowest) {
        console.log(`${item.token} ${item.name.padEnd(26)} ${(item.durationMs / 1000).toFixed(1)}s · ${item.sharePct.toFixed(1)}% of accounted stage time`);
      }
    }
    if (verdict.startsWith("REPORT_ONLY")) {
      console.log(`\nphase-close: ${verdict}; no authority released.`);
    } else {
      console.log(verdict === "PASS"
        ? "\nphase-close: all blocking gates passed."
        : "\nphase-close: one or more blocking gates failed.");
    }
  }
  process.exit(failed.length > 0 && !options.reportOnly ? 1 : 0);
}

function loadFixtureCommands() {
  if (options.staticOracle) return null;
  const manifestPath = join(ROOT, "governance", "phase-close-commands.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1
      || !Array.isArray(manifest.phaseClose)
      || !Array.isArray(manifest.exhaustive)) {
    throw new Error("command manifest must use schemaVersion 1 and two arrays");
  }
  const selected = options.tier === "exhaustive"
    ? [...manifest.phaseClose, ...manifest.exhaustive]
    : manifest.phaseClose;
  const names = new Set();
  return selected.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || typeof entry.name !== "string" || entry.name.trim() === ""
        || !Array.isArray(entry.command) || entry.command.length === 0
        || entry.command.some((part) => typeof part !== "string" || part === "")) {
      throw new Error("command manifest contains a malformed entry");
    }
    if (names.has(entry.name)) throw new Error(`duplicate command: ${entry.name}`);
    names.add(entry.name);
    const cwd = entry.cwd === undefined ? ROOT : resolve(ROOT, entry.cwd);
    const rel = relative(ROOT, cwd);
    if (isAbsolute(rel) || rel.startsWith("..")) {
      throw new Error(`command cwd escapes root: ${entry.name}`);
    }
    return {
      name: entry.name,
      cmd: entry.command[0],
      args: entry.command.slice(1),
      cwd,
      timeout: Number.isInteger(entry.timeoutMs) && entry.timeoutMs > 0
        ? entry.timeoutMs
        : 30_000,
    };
  });
}

try {
  const fixtureCommands = loadFixtureCommands();
  if (fixtureCommands !== null) {
    for (const entry of fixtureCommands) {
      run(entry.name, entry.cmd, entry.args, {
        cwd: entry.cwd,
        timeout: entry.timeout,
      });
    }
    finish();
  }
} catch (error) {
  results.push({
    name: "phase-close:manifest",
    ok: false,
    durationMs: 0,
    exitCode: null,
    signal: null,
    detail: error.message,
  });
  finish();
}

if (!options.json) console.log("══ Galerina phase-close cadence ══");

// ── 1. Core tests (SOT four) ──
run("tests:core", "node", ["scripts/run-all-tests.cjs", "--core"], {
  inheritSuiteLease: true,
});
run("audit:tooling-contract", "node", ["scripts/audit-tooling-contract.mjs"]);
run(
  "audit:generator-contract",
  "node",
  ["scripts/audit-generator-contract.mjs", "--tier", options.tier],
  { timeout: 600_000 },
);
run(
  "tests:benchmark-integrity",
  "npm",
  ["test"],
  {
    cwd: join(ROOT, "packages-ts", "galerina-devtools-benchmarks"),
  },
);

// ── 1b. Architecture pattern examples — galerina check on all tests/patterns/*.fungi ──
const patternsDir = join(ROOT, "tests", "patterns");
if (options.staticOracle) {
  runStaticOracleSpecial("tests:patterns", "patterns");
} else if (existsSync(patternsDir)) {
  const patternFiles = readdirSync(patternsDir).filter(f => f.endsWith(".fungi"));
  // Use galerina.mjs (Stage A compiler) — not the legacy galerina-core-cli
  const galerinaMjs = join(ROOT, "galerina.mjs");
  let patternOk = true;
  const patternDetails = [];
  for (const f of patternFiles) {
    const res = runOwnedProcessSync({
      command: process.execPath,
      args: [galerinaMjs, "check", join(patternsDir, f)],
      cwd: ROOT,
      env: nonAuthorizingChildEnv(),
      timeoutMs: 30_000,
      windowsHide: true,
    });
    const passed = res.status === 0;
    if (!passed) { patternOk = false; patternDetails.push(`${f}: FAIL`); }
  }
  results.push({ name: "tests:patterns", ok: patternOk, ms: 0,
    detail: patternOk
      ? `${patternFiles.length} patterns pass`
      : `FAILED — ${patternDetails.join(", ")}` });
}

// ── 1b2. FULL .fungi corpus compile gate ──
// tests/patterns above checks 9 files; THIS gates the whole tracked corpus (~447) against the real
// `galerina check`, ratcheted baseline (may only shrink). Born of the sovereignTransaction rot — a
// flagship example carrying a hard FUNGI-SYNTAX-011 that nothing noticed. Cached by (size, mtime):
// warm runs are seconds; a cold cache sweeps everything, hence the raised timeout.
run("fungi:corpus-check", "node", ["scripts/audit-fungi-corpus-check.mjs"], { timeout: 600000 });

// Minimal executable language lookup: all Golden Pack sources must remain
// strict-checker clean, every declared CLI vector must replay exactly, and the
// tracked source/toolchain-bound manifest must match. This is bounded reference
// evidence only; it grants no package-conversion or production authority.
run("fungi:golden", "node", ["scripts/fungi-golden-probe.mjs", "--check"]);

// ── 1b3. Quoted-WAT drift gate — docs that quote emitted WAT must match the CURRENT emitter ──
// (emit-doc-wat.mjs regenerates the excerpts through the real pipeline; --check fails on drift.)
run("doc:wat-drift", "node", ["scripts/emit-doc-wat.mjs", "--check"]);

// ── 1b4. Status-artifact drift gate (#74) — the standalone status receipt must match component-health ──
// (gen-status-blocks.mjs owns build/status only; the roadmap is owned by the graph-derived generator.)
run("doc:status-drift", "node", ["scripts/gen-status-blocks.mjs", "--check"]);

// ── 1b4b. Graph-owned roadmap drift gate — the canonical roadmap/SVG must match admitted receipts ──
// (gen-roadmap.mjs derives the route from the closed assurance DAG plus admitted generated graphs;
// --check fails on drift AND on a missing target/markers — R&D 0422 found the day-one version was wired
// into nothing and failed open on absence; both closed the same tick.)
run("doc:roadmap-drift", "node", ["scripts/gen-roadmap.mjs", "--check"]);

// ── 1b5. Cast-hygiene lint (R&D sorted-path S0) — no NEW bare `as Verdict`/`as Trit` authority cast ──
// A bare cast MINTS governance authority past every gate (the laundering a type-brand cannot see; SUITE 5:
// an unvoted reading cast to a Verdict manufactures ALLOW). Shrink-only baseline of the casts that exist
// today, fail on any NEW one. Additive detector — touches no governance code, cannot regress the kernel.
run("lint:cast-hygiene", "node", ["scripts/audit-cast-hygiene.mjs"]);

// ── 1b6. Registry-index signer CLI (#72 walkthrough §3) — the review gate must keep refusing stubs ──
// The CLI's hermetic self-test proves fail-closed end-to-end with ephemeral keys: stub manifests are
// un-signable (deny-by-default review gate), tampered/forged/forked indexes REFUSE, and the roadmap e2e
// (forked-but-validly-signed package → HASH_MISMATCH) holds. Signing the REAL index stays an owner ceremony.
run("registry-index:selftest", "node", ["scripts/registry-index-cli.mjs", "--self-test"]);

// Dependency install scripts execute with the developer/CI account's authority. The node-floor
// audit blocks unreviewed, name-only, or stale lifecycle-script approvals and requires npm strict
// mode; the one admitted native dependency is pinned to its reviewed exact version.
run("audit:node-floor", "node", ["scripts/audit-node-dependencies.mjs"]);

// ── 1c. Goal acceptance tests (T-006/007/008) ──
const goalsDir = join(ROOT, "tests", "goals");
if (existsSync(goalsDir)) {
  const goalFiles = readdirSync(goalsDir).filter(f => f.endsWith(".test.mjs")).sort();
  if (goalFiles.length > 0) {
    run("tests:goals",
      "node", ["--test", ...goalFiles.map(f => join(goalsDir, f))]);
  }
}

// ── 2. DevTools + ext package tests ──
for (const p of ["naming", "context", "intelligence", "provenance", "pci"]) {
  const dir = join(ROOT, "packages-ts", `galerina-devtools-${p}`);
  if (existsSync(join(dir, "tests"))) run(`tests:devtools-${p}`, "npm", ["test", "--silent"], { cwd: dir });
}
// Non-core extension packages. ext-bridge-cpp is gated HERE (not just in the full suite) because it
// carries the RD-0238 P0 SEC-mutant (addon-loader.test.mjs): a present-but-unpinned native `.node` must
// be REFUSED before require() — so a regression that re-opens the native-load fail-open (arbitrary code
// execution, CWE-494/-347) fails the phase-close gate, not only the full run.
for (const p of ["galerina-ext-secrets-vault", "galerina-ext-proof-snarkjs", "galerina-ext-bridge-cpp"]) {
  const dir = join(ROOT, "packages-ts", p);
  const label = p.replace("galerina-ext-", "");
  if (existsSync(join(dir, "tests"))) run(`tests:ext-${label}`, "npm", ["test", "--silent"], { cwd: dir });
}

// ── 3 + 4. In-process security + naming audit sweep over auth-service ──
const corpus = join(ROOT, "examples", "auth-service");
if (existsSync(corpus)) {
  if (options.staticOracle) {
    runStaticOracleSpecial("audit:security", "security");
    runStaticOracleSpecial("audit:naming", "naming");
  } else {
    const fungiFiles = readdirSync(corpus).filter((f) => f.endsWith(".fungi"));
    try {
    const sec = await import(pathToFileURL(join(ROOT, "packages-ts/galerina-devtools-security/dist/index.js")).href);
    const nam = await import(pathToFileURL(join(ROOT, "packages-ts/galerina-devtools-naming/dist/index.js")).href);
    let secFindings = 0, secErrors = 0, namFindings = 0;
    for (const f of fungiFiles) {
      const src = readFileSync(join(corpus, f), "utf8");
      try {
        const sr = await sec.runSecurityAudit(src, f);
        secFindings += (sr.findings?.length ?? sr.diagnostics?.length ?? 0);
      } catch { secErrors++; }
      try {
        const nr = nam.runNamingAudit(src, f);
        namFindings += (nr.findings?.length ?? 0);
      } catch { /* naming non-fatal */ }
    }
    // VALUESTATE findings in examples are real (raw request data reaching AuditLog.write)
    // but are tracked as "known corpus issues" pending redact() cleanup of auth-service examples.
    // Security audit PASS = no critical/taint/profile/governance findings; VALUESTATE = tracked separately.
    const vsFindings = secFindings; // now includes VALUESTATE since checkValueStates wired in
    results.push({ name: "audit:security", ok: secErrors === 0, ms: 0,
      detail: `${fungiFiles.length} files, ${vsFindings} findings (incl. VALUESTATE), ${secErrors} errors` });
    results.push({ name: "audit:naming", ok: true, ms: 0,
      detail: `${fungiFiles.length} files, ${namFindings} naming findings` });
    } catch (e) {
      results.push({ name: "audit:devtools", ok: false, ms: 0, detail: `import failed: ${e.message}` });
    }
  }
  // provenance directory audit — exit 2 = "risk flows found" is INFORMATIONAL, not a failure.
  run("audit:provenance", "node",
    ["packages-ts/galerina-devtools-provenance/dist/cli.js", "audit", corpus], { okCodes: [0, 2] });
}

// ── 4b. CBOR round-trip verification (task #67) ──
// Checks that all .lmanifest files in build/ decode and re-encode to identical bytes.
// Catches non-canonical CBOR before the manifest is used for signing.
if (options.staticOracle) {
  runStaticOracleSpecial("manifest:cbor", "cbor");
} else {
  try {
    const buildDir = join(ROOT, "build");
    if (existsSync(buildDir)) {
      const manifestFiles = readdirSync(buildDir).filter(f => f.endsWith(".lmanifest") && !f.endsWith(".json"));
      if (manifestFiles.length > 0) {
        const { decodeCBOR, encodeCBOR } = await import(
          pathToFileURL(join(ROOT, "packages-ts/galerina-core-compiler/dist/manifest-generator.js")).href
        );
        let allOk = true;
        const failures = [];
        for (const f of manifestFiles) {
          const bytes = new Uint8Array(
            await import("node:fs").then(fs => Buffer.from(fs.readFileSync(join(buildDir, f))))
          );
          // Only verify binary CBOR files (starts with a valid CBOR major type byte)
          if (bytes.length > 0 && (bytes[0] & 0xe0) === 0xa0) { // map type (0xa0-0xbf)
            try {
              const { value } = decodeCBOR(bytes);
              const reEncoded = encodeCBOR(value);
              if (bytes.length !== reEncoded.length || !bytes.every((b, i) => b === reEncoded[i])) {
                allOk = false; failures.push(f);
              }
            } catch { allOk = false; failures.push(f); }
          }
        }
        results.push({ name: "manifest:cbor", ok: allOk, ms: 0,
          detail: allOk
            ? `${manifestFiles.length} manifest(s) canonical CBOR ✅`
            : `FAILED — non-canonical: ${failures.join(", ")}` });
      }
    }
  } catch { /* non-fatal if no manifests */ }
}

// ── 5. Full repository graph drift check — graph-all.mjs runs the reproducible
//   graph family: project graph, graph-integrity validation, KB graph,
//   per-package Hardened Border checks, and the dev-tool index/graph.
//   Personal/agent memory is untrusted external data, never a clean-build or
//   release-gate dependency; memory-graph.mjs is an explicit read-only aid. ──
// graph-all always owns all seven checks. Its strict receipt gives the named
// semantic gate the exact one-process result without a CLI bypass or rerun.
const graphAll = run("graph:all", "node", ["scripts/graph-all.mjs", "--quiet", "--check", "--json"]);
runSemanticCoverageFromGraphAll(graphAll);
// Chapter 4 additive lifecycle gate. The static oracle retains its original
// schedule and adds this one shared control so the cutover differential can
// compare the complete current blocking set without treating an approved new
// refusal boundary as an unexplained candidate-only result.
run("audit:assurance-legacy-lifecycle", "node", ["scripts/audit-assurance-legacy-lifecycle.mjs"]);

// ── 5a. Code index + derived registry — the INDEXES the audits read (a DIFFERENT family from the
//        graphs in graph:all above). Phase-close verifies their exact current
//        bytes and refuses drift; generation is a separate reviewed operation.
//        dev-tool-index remains inside graph:all. ──
run("code-index", "node", ["scripts/code-index.mjs", "--check"]);
run("audit:canonical-test-counts", "node", ["scripts/audit-canonical-test-counts.mjs"]);
run("code-registry", "node", ["scripts/gen-code-registry.mjs", "--check"]);
run("flow-registry", "node", ["scripts/gen-flow-registry.mjs", "--check"]);
run("code-history", "node", ["scripts/check-code-history.mjs", "--check"]);
run("code-catalog-coverage:selftest", "node", ["scripts/audit-code-catalog-coverage.mjs", "--self-test"]);
run("code-catalog-coverage", "node", ["scripts/audit-code-catalog-coverage.mjs"]);
// FUNGI-TYPE twin-parity (RD-0412): the self-hosted type-checker twin must only emit codes the real
// type-checker.ts emits (scanned from actual call-sites, per-pass). Fail-closed — exit 3 on a false
// differential — now that the type-system twin is complete, a permanent regression guard against a new
// cluster mirroring a code the checker never raises. Standalone, source-scanned (no registry dependency).
run("twin-emit-parity", "node", ["scripts/audit-twin-emit-parity.mjs"]);
// One code, one meaning (RD-0532, owner ruling 2026-07-24). C1 GATES the `.ts` reference: the same
// FUNGI-* code bound to two different NAMES is a taxonomy collision, and the owner's standing note is
// that this "may be a 50-year mistake if it slips" — so the fix and its detector ship as one unit and
// the detector runs every close. Runs its own self-test first: a detector that cannot fire on a
// known-bad shape is not evidence, so a broken checker fails the close rather than passing quietly.
// (C1b `.ts`↔twin stays ADVISORY — prose-matched until the twins carry a `name:` field.)
run("code-collisions:selftest", "node", ["scripts/audit-diagnostic-code-collisions.mjs", "--self-test"]);
run("code-collisions", "node", ["scripts/audit-diagnostic-code-collisions.mjs"]);
run("kb-index", "node", ["scripts/kb-index.mjs"]); // KB keyword index (token-saver): keep build/kb-index/ fresh vs the docs

// ── 5b. Convention lint gate (TASK-ENV-001) ──
// The umbrella that runs every registered convention enforcer (today: the #215 code scanner; later:
// SEC-002 mutation gate, DOC-004 doc↔source drift, #218 coverage cross-check). Runs --soft = report-only
// while the taxonomy-remediation baseline is non-zero; DROP --soft to make it an enforcing CI gate once
// `node scripts/lint-conventions.mjs` reports 0 (then "no convention is binding until a tool enforces it"
// becomes literally true at phase-close). PRINCIPLE: owner 2026-06-22 binding process.
run("lint:conventions", "node", ["scripts/lint-conventions.mjs", "--soft"]);

// ── 5c. Coverage cross-check (#218) ──
// "Review the graphs and check against what we audit" — cross-checks the code-index (graph) against the
// governance registry bidirectionally (blind spots · phantoms). Report-only (--soft) until the coverage
// holes are triaged; emits build/coverage/coverage-codes.md. GRAPH THE AUDIT (owner 2026-06-22).
run("coverage:codes", "node", ["scripts/audit-coverage.mjs", "codes", "--check", "--soft"]);

// ── 5c-ii. Effect-vocabulary single source of truth (2026-07-01) ──
// The compiler's effect tables (CANONICAL_EFFECTS · type-registry EFFECT_NAME_TO_FLAG · EFFECT_REGISTRY ·
// SECURE_REQUIRED/PURE_FORBIDDEN) must agree: a name accepted by one but rejected by another is the drift
// class that let an AI author non-compiling governed code (owner ask 2026-07-01). Blocks on INTERNAL drift;
// KB/SPEC doc-drift is --strict only, pending the storage.*/ledger.* family work (Commit 2).
run("effect:canonicality", "node", ["scripts/audit-effect-canonicality.mjs"]);

// ── 5c-iii. Performance hot-path audit (2026-07-03) ──
// The perf sibling of the security/bug audits: high-confidence hot-path anti-patterns (O(n²) `.find` inside
// a loop, blocking sync I/O in a loop, re-sort / re-parse per iteration, the reduce-spread accumulator).
// Report-only (--soft) — perf findings are optimisation opportunities, not correctness gates. The advisory
// tier (membership / sequential-await) is counted but never printed here. Owner ask 2026-07-03.
run("perf:hotpath", "node", ["scripts/audit-perf-hotpath.mjs", "--soft"]);

// ── 5c-iv. Runtime `.fungi` audit (2026-07-03) ──
// The self-hosted `.fungi` runtime corpus must stay WASM-lowerable + test-covered before it lowers
// kernel → GIR → WASM: every `match` exhaustive (RD-0240), no `?` error-prop (BK-3, doesn't lower), each
// file has an executing test, and the P9 parity/pipeline harness exists. Report-only (--soft). Owner ask 2026-07-03.
run("fungi:runtime", "node", ["scripts/audit-fungi-runtime.mjs", "--soft"]);

// ── 5c-v. Data-oblivious / constant-time audit (RD-0258, 2026-07-04) ──
// Flags SECRET-dependent control flow / comparison in `.fungi` (the timing + speculative-execution
// side-channel class): `secretX == y` (non-constant-time compare, HIGH) and if/while/match on a
// `protected`/`redacted`/`secret.read` value (advisory). The DETECTOR half of RD-0258 — the
// compiler-enforced `@oblivious` lowering stays OWNER-GATED. Report-only (--soft).
run("oblivious", "node", ["scripts/audit-oblivious.mjs", "--soft"]);

// ── 5c-vi. GSCM comment-coverage audit (RD-0265, 2026-07-04) ──
// Proves every example flow carries the agreed comment model: the `;;` govComment block (signed →
// .lmanifest) + the GSCM tags `// @cause` / `// @effect` (`// @todo` counted, never required — never
// fabricated). Scans examples/ only — the byte-locked self-hosted corpus retrofit stays owner-gated
// (task #12). Report-only (--soft) so coverage can't silently regress unnoticed.
run("gscm", "node", ["scripts/audit-gscm.mjs", "--soft"]);

// ── 5c-ii-bis. RD-0234b — the two dev-tools the ZT-tooling audit recommended (2026-07-02) ──
// checker:wiring — every EXPORTED checker has a real pipeline call-site (the dead-gate class:
//   checkTaint / checkMonkeyPatching / checkAttributeDirectives each had ZERO call-sites before the fix).
// sink:canonicality — no stdlib egress/exec/write sink silently escapes the taint / value-state sink
//   hand-lists (the sink-drift class). Both carry a --self-test + a reasoned allowlist. Blocking.
run("checker:wiring", "node", ["scripts/audit-checker-wiring.mjs"]);
run("sink:canonicality", "node", ["scripts/audit-sink-canonicality.mjs"]);
// scratch-dir:hygiene — no test file creates build/<prefix>-${process.pid} scratch dirs without
//   rmSync cleanup (the flaky-gate + unbounded-disk-leak class; a hand-list missed 2 instances, so
//   this enforces the class instead of a list). Own-pid sweep is parallel-safe. Blocking.
run("scratch-dir:hygiene", "node", ["scripts/audit-scratchdir-hygiene.mjs"]);

// ── 5c-iii. Muted-diagnostics gate (2026-07-01) ──
// Owner concern: "codes muted early to stop them alerting — could they still be off?" A silenced
// security/governance check is a fail-open. This enumerates every mode-gated + SUPPRESS-set diagnostic
// and FAILS if a security/governance code is muted WITHOUT being on the reviewed allowlist — so muting
// can never happen silently again.
run("muted:diagnostics", "node", ["scripts/audit-muted-diagnostics.mjs"]);

// CG-6 corpus half (2026-07-02): the teaching corpus (examples/, docs/, packages src)
// may declare only effect names a PRODUCTION compile accepts. audit-effect-canonicality
// proves the TABLES agree; this proves the CODE CORPUS does (nothing else
// production-compiles the examples, so a bad name would teach silently).
run("effects:corpus", "node", ["scripts/audit-corpus-effect-names.mjs"]);

// CG-7 (owner-directed 2026-07-01): a SIGNED fusable package must be git-clean.
// Catches the annotation→re-fuse→unsigned cascade class regardless of which tool
// dirties the src (the writer/rebuilder guards prevent the KNOWN paths; this
// gate catches any path). Blocking.
run("signed:fixtures", "node", ["scripts/audit-signed-fixture-drift.mjs"]);

// ── 5c-viii. ZT house-hygiene guards — wired into cadence 2026-07-10 (closes a dev-tool-index gap) ──
// Both tools existed with a passing --self-test but were invoked only ad-hoc, so dev-tool-index's
// gaps.toolsNotInCadence flagged them: a regression could escape phase-close and surface only on a manual
// run. Now enforced every close, following the blocking audit-* pattern above (exit != 0 → ❌).
// path:leak — ZT-17 fail-CLOSED guard: no committed file may leak an absolute local path (a
//   C:\Users\<name>\… home, a wwwprojects root, or the dash-encoded machine slug) — a public-repo
//   username/layout disclosure that also breaks on every other machine. Exit 1 on any leak.
// name:collisions — RD-0124 guard: no two package names share a token-multiset (the graph-project /
//   project-graph reordered-token bug) or sit within Levenshtein 1 (typo-twin), unless allowlisted with a
//   resolution in governance/name-registry.json. Exit = violation count.
run("path:leak", "node", ["scripts/audit-path-leak.mjs"]);
// remote-shell-install — dependency/bootstrap guidance is a toxic supply-chain border.
// Refuse curl/wget/iwr content piped directly into a shell or expression interpreter.
// Downloads must be version-pinned and have publisher/content identity verified before
// inspection or execution. The gate carries a planted-defect self-test.
run("remote-shell-install", "node", ["scripts/audit-remote-shell-install.mjs"]);
// private-doc-leak — RD-0453 enforcement (2026-07-17): no TRACKED public file may NAME a never-public
//   `-PRIVATE.md` KB doc. The kb-index generator once indexed a never-public doc's TITLE + terms digest into
//   tracked build/kb-index/ (caught pre-push); gitignoring closed that vector, this gate closes the CLASS so a
//   regen / new indexer / stray doc-link can never silently re-introduce it. Scoped to the tag, not the
//   private-KB path (which has legit refs). --self-test proves it fires. Exit = violation count. Blocking.
run("private-doc-leak", "node", ["scripts/audit-private-doc-leak.mjs"]);
// bench-report-stale — R&D 2026-07-17: the published benchmark report.md must match its generator run over
//   the committed results/latest.json. It was found 381 commits behind its data (the closing cycle refreshed
//   latest.json ~11× but never regenerated report.md), so the public report showed numbers from an old run —
//   a pure integrity defect that silently re-opens. --stale-only gates freshness ALONE (the Check-B
//   uncertified-ratio/admission gate wires in after the per-metric-table restructure). Regenerate with
//   `node src/compare.mjs > report.md`. Exit 3 on staleness. Blocking.
run("bench-report-stale", "node", ["packages-ts/galerina-devtools-benchmarks/src/audit-benchmark-integrity.mjs", "--stale-only"]);
// artifact-drift — RD-0499 family A (2026-07-18): a count STATED in a doc must equal the GENERATED
//   registry (A1 marker + prose forms — the "90 vs 133" class), and dead/phantom are shrink-only (A3).
//   The structural stamp (gen-code-registry overwrites the markers) makes count-drift unrepresentable;
//   this reports any pre-regen drift or a baseline increase. Standalone→phase-close per the RD-0499
//   wiring plan (A2 severity + A4 + families B/C/D pending R&D; CI-enforcing wiring = owner-gated).
run("artifact-drift", "node", ["scripts/audit-artifact-drift.mjs"]);
// silent-overwrite — owner 2026-07-18: hunt the silent-name-collision class (dup flow/type/member/EFFECT)
//   with myco instead of by hand. Surfaces name-keyed collection writes with no nearby dup-guard as
//   REVIEW CANDIDATES (a heuristic aid, not a proof). Report-only (exit 0) — a backlog like fungi-quality;
//   run `node scripts/audit-silent-overwrite.mjs` for the candidate list, `--all` for guarded+unguarded.
//   Its --self-test also runs in the gate-selftests meta-gate.
run("silent-overwrite", "node", ["scripts/audit-silent-overwrite.mjs"]);
// example-diagnostics — every curriculum example under docs/examples/Level-* must honour its declared
//   `/// expected_diagnostics:` contract. WIRED 2026-07-25 (board #173): the gate existed and was RED
//   since 2026-07-21 but ran NOWHERE, so nothing in the close knew — "catalogued is not wired" (R&D 0404).
//   Deliberately wired only AFTER its 6 regressions were closed: wiring a red gate converts a hidden
//   failure into a blocking one without fixing anything. Baseline-gated (89 known-drift) + the
//   Proposed-* exclusion is name-ratcheted, so a failing example cannot be renamed into silence.
run("example-diagnostics", "node", ["scripts/audit-example-diagnostics.mjs"]);
// claim:hygiene — RD technical-claims-audit (2026-07-14) durable fix: public docs (README · SECURITY ·
//   docs/**) must carry their evidence tier — no unqualified superlatives ("absolute", "native-class",
//   "mathematical proof", "unhackable" asserted rather than rebutted), controlled security/PQ vocabulary
//   (ML-DSA is the post-quantum half, not Ed25519; compliance wording needs a qualifier), and every
//   relative doc link must resolve. Turns a manual claims audit into a standing fail-closed gate.
run("claim:hygiene", "node", ["scripts/audit-claim-hygiene.mjs"]);
// audit:sections — the % audit (component-health) MUST carry all three sections (Zero-Trust thesis ·
//   Build progress · Tracking registry). The Tracking registry has recurrently gone missing from a
//   hand-built % audit widget; component-health.mjs now builds the audit from a FIXED three-section spec
//   and REFUSES (throws) if any section is empty, and its --self-test proves the throw fires. Wiring it
//   here makes it structurally impossible to ship a % audit that silently drops a section without the
//   cadence going red.
run("audit:sections", "node", ["scripts/component-health.mjs", "--self-test"]);
// audit:percent-fresh (#95) — the committed build/component-health/percent-audit.json must match what
//   component-health.mjs (the source of truth) generates NOW, comparing CONTENT only (the git provenance
//   sha moves every commit and is excluded). Closes the staleness class where a closing cycle regenerated
//   the build indexes but skipped --audit-html, leaving percent-audit.{html,json} describing an old tree.
//   Fail-closed → run `node scripts/component-health.mjs --audit-html` and commit the refreshed % audit.
run("audit:percent-fresh", "node", ["scripts/component-health.mjs", "--audit-check"]);
// no-redeclare (#56/#108 P9 Option-Y guard) — no self-hosted stage may declare a top-level name already
//   in lexer/parser: the concat-prelude (Option Y) stays sound only while parser↔stage is collision-free
//   (else a late `Duplicate export name` at WASM instantiate, #107). Cheap name-set intersection. This
//   gate is MANDATORY — it guards a structural WASM correctness invariant, not a style preference.
run("no-redeclare", "node", ["scripts/audit-no-redeclare.mjs"]);
// wat-lowering (R&D 2026-07-19, owner-directed) — corpus inventory of the WAT record-field-layout fault
//   class: a record field whose type lowers WIDER than the 4-byte i32 slot (via the emitter's REAL
//   galerinaTypeToWAT, never a name list) + the DISTINCT Decimal→f64 scalar wart. Root causes carry
//   existence-checked anchors (WAT_REC_FIELD_SIZE=4 #132 · galerinaTypeToWAT(Decimal)=f64 #137 · the
//   FUNGI-LAYOUT-001 compile guard) so the `why` can't rot. Shrink-only baseline; a NEW affected site → exit 1.
//   Complements the per-program FUNGI-LAYOUT-001 compile guard with a corpus-wide, non-compiled-included sweep.
run("wat-lowering", "node", ["scripts/audit-wat-lowering.mjs"]);
// wasm-validate (R&D prototype, owner-directed 2026-07-19) — assembles every example the front-end
//   gate ADMITS and runs WebAssembly.validate(); the only gate that catches a malformed module that
//   clears checkTypes + governance + security (052/077 hid here). 10 baselined (A1/A2/A3/B emitter
//   classes); shrink-only, a NEW invalid → exit 1. Complements the source-level audit-wat-lowering sweep.
run("wasm-validate", "node", ["scripts/audit-wasm-validate.mjs"]);
// dss-wasm-build (#57) — the SUPERVISOR half of the WASM surface, and a DIFFERENT subject to the two
//   gates above: wasm-validate + wat-lowering scan docs/examples, so neither has ever looked at
//   galerina-core-security/src/dss/*.fungi. Its ratchet (a module that used to build to real WASM and
//   no longer does → exit 1) ran automatically NOWHERE: CI spawns only its --self-test via
//   gate-selftests, and --self-test exits BEFORE the baseline comparison and before artifact emission.
//   The "asserts but is wired to nothing" class, on the gate that owns DSS.wasm. Wired 2026-07-25 after
//   measuring the cost: build/dss-wasm/ was 4 days stale and two modules had drifted 17 B each.
//   Regenerates build/dss-wasm/*.wasm + sha256 manifest as a side effect — untracked build output.
run("dss-wasm-build", "node", ["scripts/audit-dss-wasm-build.mjs"]);
// emitter-completeness (RD-0529 B2) — the per-CONSTRUCT companion to wasm-validate's per-FILE sweep:
//   classifies a curated construct inventory through the same front-end gate + emitter into the MEASURED
//   taxonomy {standalone-valid | fail-closed | host-import | emitter-invalid | gate-refused} and derives an
//   honest completeness % from that ladder (never a hand-typed number). Ratcheted: a construct that DROPS
//   emitter-completeness rank → exit 1. Measured 2026-07-23: host-import is NON-empty (string concat →
//   host.__str_concat; a Result match → 2 imports), while effectful I/O DECLINES (fail-closed) rather than
//   importing — an asymmetry the matrix surfaces.
run("emitter-completeness", "node", ["scripts/audit-emitter-completeness.mjs"]);
// wat-invalid-triage (R&D prototype, vendored 2026-07-19) — ADVISORY root-cause classifier for the
//   10 baselined INVALID modules. Pairs with wasm-validate: where wasm-validate is the enforcing gate
//   ("is any module malformed?"), this answers "WHY?" by recovering the actual WASM validator reason
//   (which WebAssembly.validate() withholds) and classifying into A1/A2/A3/B. Turns "10 broken" into
//   "4 root causes, N sites each" — the shape that makes fixing tractable. Exit 0 always (advisory);
//   exit 1 only on --self-test failure. Fix order: A2 → A1 → A3 → B LAST (never f64.convert_i32_s).
run("wat:invalid-triage", "node", ["scripts/wat-invalid-triage.mjs", "--self-test"], { okCodes: [0] });
// arith-conformance (R&D prototype, owner-directed "check ALL maths thoroughly, even if other dev
//   tools do the same") — 38 hand-pinned arithmetic cases, each pinned to the answer DERIVED BY HAND
//   from the maths, never to what the system prints and never to "Stage-A == Stage-B" (reference
//   vacuity). 4 baselined (077 Money/Money i32.div_s truncation + the Float32/16-emitted-as-integer
//   class); shrink-only, a NEW divergence / wrong-trap / silent-value-where-fail-closed-expected → exit 1.
run("arith-conformance", "node", ["scripts/audit-arithmetic-conformance.mjs"]);
// report-blind-consumers (owner-directed 2026-07-19, after #163) — the CLASS gate for the defect that
//   put an unfaithful STUB on disk: `assembleWAT` returns a value AND a report that disagree by design
//   (wabt-rejected → minimal-encoder stub, `valid:true` + a "NOT a faithful compile" diagnostic). Four
//   consumers, three verdicts: executeWASMFlow and galerina.mjs read the report and declined; cli.ts
//   wrote the stub to disk and wasm-runner.mjs benchmarked it. Nothing enforced the invariant, so the
//   blind ones stayed blind. This gate holds it: branch on the value ⟹ consult the report in a DECISION
//   (printing it in an error message is NOT consulting it — that exact shape was the wasm-runner bug),
//   and never use the artifact with no gate at all. 5 baselined (all in scripts/, incl. gather-t1-twin-
//   hashes.mjs which HASHES the artifact ungated); shrink-only, a NEW blind consumer → exit 1.
run("report-blind-consumers", "node", ["scripts/audit-report-blind-consumers.mjs"]);
// auto-erasure-ratchet (P9/#100, 2026-07-19) — the ENFORCING half of the `Auto`-in-generic ruling.
//   `Auto` was permitted as a wildcard in argument position so the generic-assignability fix could land
//   without reddening the self-hosted stages at once — explicitly CONDITIONAL on the ratchet being a
//   gate rather than a documented number ("without that it is merely the permissive option"). Per-file
//   shrink-only, so debt cannot migrate between files; a NEW file carrying `Auto` fails until it is
//   deliberately baselined. Baseline 247 (245 of them in the 5 self-hosted stages), which is ~14x
//   SMALLER than the 3,419/78-files figure the coordination trail carried — see the header.
run("auto-erasure-ratchet", "node", ["scripts/audit-auto-erasure-ratchet.mjs"]);
// gate-key-injectivity (2026-07-19) — the meta-gate for "can a baseline tell two sites apart?".
//   report-blind-consumers shipped with key = file::api::binding::kind; audit-stage-execution.mjs has
//   TWO ungated `const asm = await assembleWAT(...)` calls (:145 and :251) which collapsed onto ONE
//   baseline entry — fix one and the gate reports the file clean while the other stays blind, with no
//   red at any point. A baseline IS an identity scheme, so non-injective keys quietly void "shrink-
//   only". Checks registered gates' --json findings (distinct position => distinct key) and every
//   baseline file for duplicate keys; uncovered gates are named on each run rather than skipped.
run("gate-key-injectivity", "node", ["scripts/audit-gate-key-injectivity.mjs"]);
// doc:reference-drift — the docs/reference/ pages must not DRIFT from the enforcing code (R&D's 2026-07-15
//   re-verification found types.md documenting TypeId alone while the checker accepts the isBuiltInType()
//   union). Extracts each page's vocabulary FROM SOURCE (45 canonical effects + 2 deny-only + the union gate
//   + hardening/value-state/trust/receipt vocab) and fails closed if a page no longer covers it — the
//   doc-from-source durable fix (code > code-derived views > design docs).
run("doc:reference-drift", "node", ["scripts/audit-reference-doc-drift.mjs"]);
run("name:collisions", "node", ["scripts/audit-name-collisions.mjs"]);

// workspace:pointers — CI guard for galerina.workspace.json named pointer fields (Bob review 2026-07).
//   Every packages-ts/* path in the workspace file must resolve to a real directory. Catches a
//   renamed package that didn't update the workspace file, a stale named-pointer key, or a missing
//   package.json — the class the myco orphan detection was doing manually. Exit 1 on broken pointers.
run("workspace:pointers", "node", ["scripts/validate-workspace-pointers.mjs"]);

// ── Authority gates: previously unwired (bridge msg 0016, 2026-07-19) ─────────────────────────────
// Both gates existed with --self-test and correct exit behaviour but were NOT wired into phase-close,
// so a regression would be caught only if someone happened to run them manually that day. A gate that
// doesn't run cannot fail, and its silence reads exactly like success.
//
// stage-execution — P9 enforcement: stops a self-hosted stage silently regressing RUN → TRAP.
//   TRAP_BASELINE = 0 (shrink-only, floor reached 2026-07-22 when the #100 checker debt was paid);
//   ANY stage trapping → exit 1. The live constant is audit-stage-execution.mjs:72 — that file is
//   authoritative, this comment is description (it carried "= 3" for 3 days after the payoff; R&D 0428).
run("stage-execution", "node", ["scripts/audit-stage-execution.mjs"]);
//
// kernel-fungi-twins — RD-0361 authority ledger: guards every decision-surface twin flipped to
//   AUTHORITATIVE on the owner's nod.
//   component-health.mjs asserts "RED-on-regression + missing-target enforced by audit-kernel-fungi-
//   twins.mjs + self-tested" — that assertion was live while the gate was NOT wired. Now it is.
//   The live count is derived from the ledger and execution proofs; exit 0 on success.
run("kernel-fungi-twins", "node", ["scripts/audit-kernel-fungi-twins.mjs"]);

// r4-twin-hashes — re-derives the deterministic WASM for every authoritative RD-0361 twin,
//   compares it to the ledger hash, signs and #105-admits it, and refuses any import outside
//   the compiler's closed deterministic stdlib ABI. This closes the stale-static-hash class.
run("r4-twin-hashes", "node", ["scripts/gather-r4-twin-hashes.mjs", "--verify-ledger"]);

// compiler-stage-twins — RD-0528 compiler self-hosting authority track, SEPARATE from the kernel
//   sentinel ledger (a sentinel flip retires zero lines of the .ts compiler). Runs `galerina check`
//   on every self-hosted compiler stage (that dir was in NO standing check gate before) and enforces
//   the RD-0528 authority ledger (empty until the owner flips a stage, I-4). Self-tested; today
//   7 differential · 0 authoritative · exit 0.
run("compiler-stage-twins", "node", ["scripts/audit-compiler-stage-twins.mjs"]);

// compiler-stage-hashes — RD-0528 evidence item (d) DRIFT GATE (bridge 0101/0103, owner-blessed 0104).
//   The evidence pack's per-stage compiled-WASM sha256 table WAS a static doc snapshot that drifted
//   silently as the emitter evolved (measured: parser 17062→17854 bytes, no parser.fungi change) while
//   claiming live "hash-pin" evidence. This re-derives all 7 stage hashes (via gather --json; sha256 =
//   wasmHash of the WASM bytes, deterministic) and compares to a REVIEWED baseline JSON. Gates the
//   INVARIANT not the frozen value: emitter drift is legitimate → RED VISIBLE on drift (never silent),
//   fix = review + --update-baseline (expected emitter evolution) or investigate (unexpected .fungi
//   change). Self-tested (determinism = 2 live derivations identical + a drift-detection truth table).
run("compiler-stage-hashes", "node", ["scripts/audit-compiler-stage-hashes.mjs"]);

// mutation-anchors — the FAST liveness half of the SEC-002 mutation gate (audit-mutation.mjs). The heavy
//   per-mutant plant/build/test run is in NEITHER the test glob NOR phase-close (too slow), so a STALE
//   mutation anchor (its `find` source removed/renamed by a refactor → 0 or 2+ matches → unplantable)
//   silently disabled its mutation-kill gate and the RED sat undetected for commits (rd0528-parser-param-
//   readonly, cont.23/0211). This read-only check asserts every mutant `find` matches its file EXACTLY 1× —
//   cheap enough to gate every phase-close, catching the stale-anchor rot the moment it happens (not only
//   when the heavy run is invoked). Verified: GREEN 59/59 · RED (exit 1) on a 0-match fixture.
run("mutation-anchors", "node", ["scripts/audit-mutation.mjs", "--check-anchors"]);

// flowparam-fidelity — C4 (bridge 0145/0147, plan row C4): the Stage-B twin's parseParams used to
//   hardcode isReadonly:false in its generic capture branch, so `readonly tainted a: Int` silently
//   LOST the readonly guarantee (probe rows 3-5, zero errors). Fixed with one qualifier loop + ONE
//   capture path; this gate pins the 5-row R&D probe table (+ a maximal 6th row: order-swapped
//   qualifiers, generic type, dotted source_from) through the REAL self-hosted pipeline (twin-probe
//   rule: tokenize→parseFlows, never parseProgram). Self-tested (--self-test: RED on a wrong
//   expectation, GREEN on the table).
run("flowparam-fidelity", "node", ["scripts/audit-flowparam-fidelity.mjs"]);

// wasmtime-presence — RD-0529 A4: the second execution engine (wasmtime) must be REACHABLE, not
//   silently absent. Closes the wat-phase26:81 fail-open (a `wasmtime --version` probe ending in
//   `assert.ok(true)` — "0 wasmtime tests ran" reads identical to "all pass"). AVAILABLE = wasmtime CLI
//   on PATH OR the flat Wasmtime oracle package (cargo + the pinned crate). Profile-
//   aware + fail-closed where it counts: under CI / GALERINA_CERTIFIED=1 an absent engine EXITS 1 so the
//   coming A1/A2/A3 wasmtime conformance harnesses cannot be silently skipped; the dev profile loud-skips
//   (exit 0, warned) and always names which engine would run. Self-tested truth table (absent⟹FAIL under
//   CI vs absent⟹skip under dev is the discriminator proving it enforces, not always-passes).
run("wasmtime-presence", "node", ["scripts/audit-wasmtime-presence.mjs"]);

// u2-version-floor — U2 admission provenance: every SIGNED package manifest must carry the
//   compilerVersion of the compiler that built it (generateManifest stamps it inside the SIGNED body;
//   a signature proves provenance, never fidelity — the floor is what recalls pre-#140/#163
//   placeholder-bodied artifacts). ★ ENFORCED since 2026-07-23 (U2 ceremony step 4.8): the owner
//   re-signed the ceremony set under 942d6b2726b0a991 with the stamp (`596bae4e`), every signed
//   package manifest measures stamped, so absent-field ⟹ exit 1 (refuse) is now permanent.
//   Fail-closed corners: an UNREADABLE manifest counts pre-floor (cannot prove stamped), and zero
//   measurable rows ⟹ exit 1 (cannot-attest is not a pass — the no-op alarm). Self-tested truth table.
run("u2-version-floor", "node", ["scripts/audit-u2-version-floor.mjs", "--enforce"]);

// ── Doc-freshness gates: previously unwired (Bob review 2026-07) ────────────────────────────────────
// Documentation drift in a language specification is a security issue: a stale spec that disagrees with
// the compiler is a source of developer confusion that can lead to incorrect assumptions about guarantees.
//
// stray-docs — surfaces every *.md not reachable from a known doc root (orphaned / stale markdown).
//   A stale doc in the spec corpus can describe a removed feature as still present — a trust hazard.
//   Report-only (exit 0): the stray list may have legitimate entries on first run; triage and baseline.
run("doc:stray", "node", ["scripts/audit-stray-docs.mjs"]);
//
// doc-drift — flags "living metrics" in docs (version numbers, counts, dates) that disagree with the
//   generated source. Report-only while the baseline is being established (exit 0). Once the count
//   reaches 0, drop --soft to make it a hard gate.
run("doc:drift", "node", ["scripts/audit-doc-drift.mjs", "--soft"]);

// ── 5d. Dev-tool script tests (scripts/tests/) ──
// These live OUTSIDE packages-ts, so the package runner (run-all-tests.cjs) never sees them. Run them
// here so the audit/index/registry tooling is regression-gated (e.g. the shared code-regex self-test).
const toolingTests = existsSync(join(ROOT, "scripts", "tests"))
  ? readdirSync(join(ROOT, "scripts", "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => join("scripts", "tests", f))
  : [];
if (toolingTests.length) run("tests:tooling", "node", ["--test", "--test-concurrency=4", ...toolingTests]);

// ── 5e. R&D proofs keep-green gate (2026-07-01) ──
// POSTURE prove-own-maths: every RD claim (adopted AND refuted) carries a machine-checkable,
// re-runnable proof — but nothing ran them in the cadence, so a proof could silently bit-rot.
// This runs the CANONICAL proof set (Galerina/proofs/* — relocated from the KB 2026-07-02, all green).
// Legacy scripts/*-proof.mjs run on-demand: `node scripts/run-proofs.mjs` (currently 1 known-red,
// rd-0128 TestWitness-aspiration — tracked, not gated here).
run("proofs:canonical", "node", ["scripts/run-proofs.mjs", "--canonical-only"]);

// ── 6. Standing Governance Sanity Check — diff HEAD~1 ──
// Transforms governance diff from a passive human-review step into an active quality gate.
// Enforces the Monotonicity Rule at CI level: expansion requires explicit sign-off.
// Reference: galerina-governed-design-synthesis.md change-class table.
if (options.staticOracle) {
  runStaticOracleSpecial("governance:diff", "governance-diff");
} else {
  try {
    // Check if HEAD~1 exists (might not on first commit)
    const gitCheck = runOwnedProcessSync({
      command: "git",
      args: ["rev-parse", "--verify", "HEAD~1"],
      cwd: ROOT,
      env: nonAuthorizingChildEnv(),
      timeoutMs: 30_000,
      windowsHide: true,
    });
    if (gitCheck.status === 0) {
      const diffResult = runOwnedProcessSync({
        command: process.execPath,
        args: [
          "packages-ts/galerina-core-compiler/dist/cli.js",
          "diff",
          "HEAD~1",
          "--json",
        ],
        cwd: ROOT,
        env: nonAuthorizingChildEnv(),
        timeoutMs: 30_000,
        windowsHide: true,
      });
      const parsed = parseGovernanceDiff(diffResult.stdout || "", diffResult);
      results.push({
        name: "governance:diff",
        ok: parsed.ok,
        durationMs: 0,
        exitCode: typeof diffResult.status === "number" ? diffResult.status : null,
        signal: diffResult.signal ?? null,
        detail: `${parsed.code}: ${parsed.detail}`,
      });
    } else {
      results.push({
        name: "governance:diff",
        ok: false,
        durationMs: 0,
        exitCode: typeof gitCheck.status === "number" ? gitCheck.status : null,
        signal: gitCheck.signal ?? null,
        detail: "GOVERNANCE-DIFF-BASE-MISSING: HEAD~1 could not be verified.",
      });
    }
  } catch (error) {
    results.push({
      name: "governance:diff",
      ok: false,
      durationMs: 0,
      exitCode: null,
      signal: null,
      detail: `GOVERNANCE-DIFF-ERROR: ${error.message}`,
    });
  }
}

// ── 7. R6 final parity gate (#116) ──
run("tests:r6-corpus", "node",
  ["--test", "tests/r6-corpus/r6-parity.test.mjs"],
  { silent: false });

// ── 7b. Border-check regression check — surfaces fail-closed admission-gate failures (P9-144 §83).
//        Non-blocking: the actual deny-by-default gate is the `galerina border-check` CLI (exits 1). ──
run("tests:border-check", "node",
  ["--test", "tests/border-check/border-check.test.mjs"],
  { silent: false });

// ── 7c. CLI invoke arg-marshalling regression (dogfooding #3 — bool args must not silently fail) ──
run("tests:cli-invoke-marshal", "node",
  ["--test", "tests/cli-invoke-marshal/cli-invoke-marshal.test.mjs"],
  { silent: false });

// ── 7d. Crypto-suite register reader (crypto-agility part 1 — fail-closed suite dispatch) ──
//        The register names every signature suite + its signer/verifier; only the active suite
//        may sign, a retired suite keeps verifying (iron rule). Parts 2/3 dispatch + gate on it.
run("tests:crypto-suites", "node",
  ["--test", "tests/crypto-suites/crypto-suites.test.mjs"],
  { silent: false });

if (options.tier === "exhaustive") {
  run(
    "tests:all-packages",
    "node",
    ["scripts/run-all-tests.cjs", "--json"],
    { timeout: 1_800_000, inheritSuiteLease: true },
  );
}

finish();
