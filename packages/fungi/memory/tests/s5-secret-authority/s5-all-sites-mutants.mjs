#!/usr/bin/env node
// OPEN-S5-3 (Galerina queue row 7): re-run the S5 mutants SW2, SAO, SSC, SPU and SDA on EVERY
// matching site, not only the first. The S5 merge check (gcw-s5mc, 2026-10-23) applied SSC, SPU
// and SDA with a first-of-N substitution, so later sites were never shown to be covered.
//
// Usage (from the repository root, after building packages-ts/galerina-framework-app-kernel):
//   node packages/fungi/memory/tests/s5-secret-authority/s5-all-sites-mutants.mjs [--json out.json] [--families SSC,SPU]
// --families limits the mutant loop to the named families (the baseline always runs every file).
//
// The runner mutates the BUILT dist JavaScript of app-kernel one site at a time, runs the killing
// test set, then restores the file byte-for-byte and checks it with a sha256 compare. It never
// edits src/*.ts (TS is frozen reference). It refuses to run when the dist files are missing or
// when a dist site count differs from the src site count, because then a site would be untested.
// Exit codes: 0 every applied mutant RED; 1 at least one SURVIVED; 2 environment or count refusal.
// Synthetic data only: the tests it runs use synthetic secrets.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const AK = "packages-ts/galerina-framework-app-kernel";
const M = "packages/fungi/memory";
const S5 = `${M}/tests/s5-secret-authority/s5-secret-authority.test.mjs`;
const SURV = `${M}/tests/s5-secret-authority/s5-all-sites-survivors.test.mjs`;
const TK = [
  S5,
  // Killing tests for the seven first-run survivors (SSC sites 1 and 3, SPU sites 2 to 6).
  SURV,
  `${AK}/tests/secret-gate.test.mjs`,
  `${AK}/tests/rd1415-ack-after-publication-audit.test.mjs`,
  `${AK}/tests/rd1415-ack-throw-fail-closed.test.mjs`,
  `${AK}/tests/rd1415-hostile-proxy-dispatch.test.mjs`,
  `${AK}/tests/rd1415-op-bound-ack.test.mjs`,
  `${M}/tests/36-app-kernel/kernel.test.mjs`,
];

// One family per mutant class. `pattern` is a global RegExp over the file text; every match is a
// site. `replace` maps the matched text to the mutant text. `src` is the matching TS source used to
// prove that dist and src expose the same number of sites.
const FAMILIES = [
  {
    id: "SW2", what: "widen the i32 cap guard on the classified integer",
    dist: "dist/fungi-secret-gate-loader.js", src: "src/fungi-secret-gate-loader.ts",
    pattern: /if \(value > I32_MAX \|\| value < -I32_MAX\)/g,
    replace: () => "if (false)",
    tests: [S5],
  },
  {
    id: "SAO", what: "decider check: || becomes &&",
    dist: "dist/secret-gate.js", src: "src/secret-gate.ts",
    pattern: /if \(typeof preVerdict !== "function" \|\| typeof unknownVerdict !== "function"\)/g,
    replace: (m) => m.replace("||", "&&"),
    tests: [S5],
  },
  {
    id: "SSC", what: "skip a release-authority markUnknown call",
    dist: "dist/secret-gate.js", src: "src/secret-gate.ts",
    pattern: /authority\.markUnknown\([A-Za-z_.]+\);/g,
    replace: () => "void 0;",
    tests: TK,
  },
  {
    id: "SPU", what: "kernel skips a delivery-unknown note on a spent lease",
    dist: "dist/kernel.js", src: "src/kernel.ts",
    pattern: /secretGate\.noteUnknown\(releaseOperationId\);/g,
    replace: () => "void 0;",
    tests: TK,
  },
  {
    id: "SDA", what: "noteUnknown verdict: an UNKNOWN arm becomes no-op",
    dist: "dist/fungi-secret-gate-loader.js", src: "src/fungi-secret-gate-loader.ts",
    pattern: /return "UNKNOWN";/g,
    replace: () => 'return "no-op";',
    tests: TK,
  },
];

const sha = (b) => createHash("sha256").update(b).digest("hex");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function sites(text, pattern) {
  const out = [];
  for (const m of text.matchAll(new RegExp(pattern.source, "g"))) out.push({ index: m.index, text: m[0] });
  return out;
}

function runOne(file) {
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-concurrency=1", file], {
    cwd: ROOT, encoding: "utf8", timeout: 1_500_000, maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const num = (k) => Number((out.match(new RegExp(`^# ${k} (\\d+)`, "m")) ?? [])[1] ?? NaN);
  const killers = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].slice(0, 100)).slice(0, 5);
  return { pass: num("pass"), fail: num("fail"), timedOut: r.error?.code === "ETIMEDOUT", killers };
}

// Files run one at a time in TK order (fast suites first, the slow fungi kernel suite last).
// With stopAtRed, a mutant stops at the first file that goes red: that file is the killer.
function runTests(files, stopAtRed = false) {
  const agg = { pass: 0, fail: 0, timedOut: false, killers: [], ran: [] };
  for (const f of files) {
    const r = runOne(f);
    agg.pass += Number.isNaN(r.pass) ? 0 : r.pass;
    agg.fail += Number.isNaN(r.fail) ? 1 : r.fail;
    agg.timedOut ||= r.timedOut;
    agg.killers.push(...r.killers);
    agg.ran.push(f.split("/").pop());
    if (stopAtRed && (r.fail > 0 || r.timedOut || Number.isNaN(r.fail))) { agg.killerFile = f; break; }
  }
  agg.killers = agg.killers.slice(0, 5);
  return agg;
}

function main() {
  const jsonAt = process.argv.indexOf("--json");
  const jsonOut = jsonAt > 0 ? process.argv[jsonAt + 1] : undefined;
  const famAt = process.argv.indexOf("--families");
  const only = famAt > 0 ? new Set(String(process.argv[famAt + 1] ?? "").split(",")) : undefined;
  const refusals = [];
  for (const f of FAMILIES) {
    const d = join(ROOT, AK, f.dist);
    if (!existsSync(d)) refusals.push(`missing ${AK}/${f.dist} (build app-kernel first)`);
  }
  for (const t of new Set(TK)) if (!existsSync(join(ROOT, t))) refusals.push(`missing test ${t}`);
  if (refusals.length) { console.error(`REFUSED\n${refusals.join("\n")}`); process.exit(2); }

  const baseline = runTests([...new Set(TK)]);
  console.log(`baseline pass=${baseline.pass} fail=${baseline.fail}`);
  if (!(baseline.fail === 0 && baseline.pass > 0)) {
    console.error("REFUSED baseline is not green, so a RED mutant would not be evidence");
    process.exit(2);
  }

  const results = [];
  for (const f of FAMILIES) {
    if (only !== undefined && !only.has(f.id)) continue;
    const distPath = join(ROOT, AK, f.dist);
    const original = readFileSync(distPath);
    const text = original.toString("utf8");
    const distSites = sites(text, f.pattern);
    const srcSites = sites(readFileSync(join(ROOT, AK, f.src), "utf8"), f.pattern);
    if (distSites.length !== srcSites.length || distSites.length === 0) {
      console.error(`REFUSED ${f.id}: dist sites ${distSites.length} vs src sites ${srcSites.length}`);
      process.exit(2);
    }
    for (let k = 0; k < distSites.length; k += 1) {
      const s = distSites[k];
      const mutated = text.slice(0, s.index) + f.replace(s.text) + text.slice(s.index + s.text.length);
      const id = `${f.id}-site${k + 1}of${distSites.length}`;
      let r;
      try {
        writeFileSync(distPath, mutated);
        r = runTests(f.tests, true);
      } finally {
        writeFileSync(distPath, original);
      }
      const restored = sha(readFileSync(distPath)) === sha(original);
      if (!restored) { console.error(`RESTORE FAILED for ${f.dist}`); process.exit(2); }
      const verdict = r.fail > 0 || r.timedOut ? "RED" : "SURVIVED";
      const row = { id, family: f.id, what: f.what, file: `${AK}/${f.dist}`, distLine: lineOf(text, s.index),
        srcLine: lineOf(readFileSync(join(ROOT, AK, f.src), "utf8"), srcSites[k].index), verdict,
        pass: r.pass, fail: r.fail, killerFile: r.killerFile ?? null, killers: r.killers };
      results.push(row);
      console.log(`MUTANT ${id} src:${row.srcLine} => ${verdict} (fail=${r.fail})${r.killers.length ? ` :: ${r.killers.join(" | ")}` : ""}`);
    }
  }
  const survived = results.filter((r) => r.verdict === "SURVIVED");
  console.log(`total=${results.length} red=${results.length - survived.length} survived=${survived.length}`);
  if (jsonOut) writeFileSync(resolve(jsonOut), `${JSON.stringify({ baseline, results }, null, 2)}\n`);
  process.exit(survived.length ? 1 : 0);
}

main();