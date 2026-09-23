#!/usr/bin/env node
// audit-three-security-boundaries.mjs
// Owner: Galerina security test/audit lane for Q1 WAT wipe-vs-return, Q2
// durable-replay admission, Q3 FIFO lstat-then-open.
//
// CLI:
//   node scripts/audit-three-security-boundaries.mjs --self-test
//   node scripts/audit-three-security-boundaries.mjs --json <file>…
//   node scripts/audit-three-security-boundaries.mjs --json --corpus-manifest <manifest.json>
//
// Exits: 0 PASS · 1 FINDING · 2 REFUSED
// Bounds: max 64 enumerated files, 8 MiB each, 3s self-test, no network.
// Mutation controls live in disposable temp fixtures only.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_FILES = 64;
const MAX_BYTES = 8 * 1024 * 1024;

export function parseArgs(argv) {
  const files = [];
  let json = false;
  let selfTest = false;
  let corpusManifest;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--self-test") selfTest = true;
    else if (a === "--corpus-manifest") {
      corpusManifest = argv[++i];
    } else if (a.startsWith("--")) {
      return { error: `unknown flag ${a}` };
    } else {
      files.push(a);
    }
  }
  return { files, json, selfTest, corpusManifest };
}

const Q1_WIPE_BEFORE_RETURN =
  /replace\(\s*\/\\?\(return\\b\/g\s*,[\s\S]{0,200}wipeFill/;
const Q1_CAPTURE_THEN_WIPE =
  /local\.set\s+\$__fungi_ret[\s\S]{0,400}memory\.fill/;
const Q2_DENYLIST_ONLY =
  /requireDurableReplay\s*===\s*true[\s\S]{0,400}isProcessLocalReplayStore/;
const Q2_POSITIVE_ADMIT =
  /isAdmittedDurableReplayStore/;
const Q3_LSTAT_THEN_OPEN =
  /lstatSync\([\s\S]{0,800}openSync\(/;
const Q3_PROMISE_LSTAT_THEN_OPEN =
  /await\s+fs\.lstat\([\s\S]{0,1600}await\s+fs\.open\(/;
const Q3_NONBLOCK =
  /O_NONBLOCK/;

export function detect(source, pathLabel = "") {
  const findings = [];
  if (Q1_WIPE_BEFORE_RETURN.test(source)) {
    findings.push({
      id: "Q1-WIPE-BEFORE-RETURN-OPERAND",
      path: pathLabel,
      detail: "memory.fill is spliced immediately before WAT (return; heap-derived operands evaluate after the wipe",
    });
  }
  if (Q2_DENYLIST_ONLY.test(source) && !Q2_POSITIVE_ADMIT.test(source)) {
    findings.push({
      id: "Q2-DURABILITY-DENYLIST-ONLY",
      path: pathLabel,
      detail: "requireDurableReplay refuses WeakSet-branded MemoryReplayStore identity and does not positively admit a durable store",
    });
  }
  if (
    (Q3_LSTAT_THEN_OPEN.test(source) || Q3_PROMISE_LSTAT_THEN_OPEN.test(source))
    && !Q3_NONBLOCK.test(source)
  ) {
    findings.push({
      id: "Q3-LSTAT-THEN-BLOCKING-OPEN",
      path: pathLabel,
      detail: "pathname lstat/isFIFO then open without O_NONBLOCK; a FIFO substituted after the check can block",
    });
  }
  return findings;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function classifyRead(abs) {
  if (!existsSync(abs)) return { kind: "refused", reason: "missing" };
  let st;
  try {
    st = statSync(abs);
  } catch {
    return { kind: "refused", reason: "unreadable-stat" };
  }
  if (!st.isFile()) return { kind: "refused", reason: "not-a-file" };
  if (st.size > MAX_BYTES) return { kind: "refused", reason: "too-large" };
  try {
    const buf = readFileSync(abs);
    return { kind: "ok", buf, digest: sha256(buf) };
  } catch {
    return { kind: "refused", reason: "unreadable" };
  }
}

function scanFiles(files) {
  if (files.length === 0) {
    return { exit: 2, status: "REFUSED", reason: "omitted-input", results: [] };
  }
  if (files.length > MAX_FILES) {
    return { exit: 2, status: "REFUSED", reason: "too-many-files", results: [] };
  }
  const results = [];
  const findings = [];
  for (const f of files) {
    const abs = resolve(f);
    const read = classifyRead(abs);
    if (read.kind !== "ok") {
      return {
        exit: 2,
        status: "REFUSED",
        reason: read.reason,
        path: abs,
        results,
      };
    }
    if (abs.toLowerCase().endsWith(".fungi")) {
      results.push({
        path: abs,
        digest: read.digest,
        classification: "not-applicable",
        reason: "fungi-source-is-not-the-emitter-admission-or-open-gate",
        findings: [],
      });
      continue;
    }
    const found = detect(read.buf.toString("utf8"), abs);
    results.push({
      path: abs,
      digest: read.digest,
      classification: found.length ? "finding" : "inspected",
      findings: found,
    });
    findings.push(...found);
  }
  if (findings.length > 0) {
    return { exit: 1, status: "FINDING", findings, results };
  }
  return { exit: 0, status: "PASS", findings: [], results };
}

function selftest() {
  let pass = 0;
  let fail = 0;
  const eq = (label, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    if (g === w) pass += 1;
    else {
      fail += 1;
      console.log(`  FAIL ${label}\n    got  ${g}\n    want ${w}`);
    }
  };

  const q1Hostile = `flowBody = flowBody.replace(/\\(return\\b/g, \`\${wipeFill} (return (; G5c ;)\`);`;
  const q1Clean = `(local.set $__fungi_ret (block (result i32)\n  (i32.load (local.get $w))\n))\n(memory.fill (i32.const 1024) (i32.const 0) (i32.sub (global.get $__fungi_heap) (i32.const 1024)))\n(local.get $__fungi_ret)`;
  eq("Q1 hostile flags wipe-before-return", detect(q1Hostile, "h1.ts").map((f) => f.id), ["Q1-WIPE-BEFORE-RETURN-OPERAND"]);
  eq("Q1 clean capture-then-wipe is silent", detect(q1Clean, "c1.ts").map((f) => f.id), []);

  const q2Hostile = `if (opts.requireDurableReplay === true && isProcessLocalReplayStore(opts.webhook.replayStore)) { throw new Error("outstanding"); }`;
  const q2Clean = `if (opts.requireDurableReplay === true && !isAdmittedDurableReplayStore(opts.webhook.replayStore)) { throw new Error("outstanding"); }`;
  const q2Prod = "readonly requireDurableReplay?: boolean;\nexport interface Gap {}\nif (\n    opts.requireDurableReplay === true\n    && opts.webhook !== undefined\n    && isProcessLocalReplayStore(opts.webhook.replayStore)\n  ) { throw 1; }";
  eq("Q2 hostile flags denylist-only", detect(q2Hostile, "h2.ts").map((f) => f.id), ["Q2-DURABILITY-DENYLIST-ONLY"]);
  eq("Q2 positive admit is silent", detect(q2Clean, "c2.ts").map((f) => f.id), []);
  eq("Q2 production-shaped gate flags", detect(q2Prod, "index.ts").map((f) => f.id), ["Q2-DURABILITY-DENYLIST-ONLY"]);

  const q3Hostile = `const st = lstatSync(live);\nrefuseSnapshotSpecialFile(st, name);\nconst fd = openSync(live, constants.O_RDONLY);`;
  const q3Clean = `const fd = openSync(live, constants.O_RDONLY | constants.O_NONBLOCK);\nconst opened = fstatSync(fd);\nif (opened.isFIFO()) throw new Error("fifo");`;
  eq("Q3 hostile flags lstat-then-open", detect(q3Hostile, "h3.ts").map((f) => f.id), ["Q3-LSTAT-THEN-BLOCKING-OPEN"]);
  eq("Q3 nonblock open is silent", detect(q3Clean, "c3.ts").map((f) => f.id), []);

  const a = q1Hostile;
  const b = q1Clean;
  eq("capability both answers", `${detect(a).length > 0}/${detect(b).length === 0}`, "true/true");

  const p = parseArgs(["file.ts", "--json", "--self-test", "--corpus-manifest", "m.json"]);
  eq("flag liveness", [p.files, p.json, p.selfTest, p.corpusManifest], [["file.ts"], true, true, "m.json"]);
  const d = parseArgs(["file.ts"]);
  eq("defaults", [d.json, d.selfTest, d.corpusManifest], [false, false, undefined]);
  eq("unknown flag refuses", parseArgs(["--nope"]).error, "unknown flag --nope");

  const dir = mkdtempSync(join(tmpdir(), "q123-audit-"));
  try {
    const cleanPath = join(dir, "clean.ts");
    const hostilePath = join(dir, "hostile.ts");
    writeFileSync(cleanPath, q1Clean);
    writeFileSync(hostilePath, q1Hostile);
    const cleanScan = scanFiles([cleanPath]);
    const hostileScan = scanFiles([hostilePath]);
    eq("fixture PASS on clean", cleanScan.status, "PASS");
    eq("fixture FINDING on hostile", hostileScan.status, "FINDING");
    const omitted = scanFiles([]);
    eq("omitted input REFUSED", omitted.status, "REFUSED");
    const missing = scanFiles([join(dir, "nope.ts")]);
    eq("missing input REFUSED", missing.status, "REFUSED");
    const mutated = q1Clean + "\n" + q1Hostile;
    writeFileSync(cleanPath, mutated);
    const mutatedScan = scanFiles([cleanPath]);
    eq("mutation of clean fixture goes red", mutatedScan.status, "FINDING");
    const fungiPath = join(dir, "lead.fungi");
    writeFileSync(fungiPath, "pure flow g(s: Int) -> Int { return s }\n");
    const fungiScan = scanFiles([fungiPath]);
    eq("existing .fungi is not-applicable", fungiScan.results[0]?.classification, "not-applicable");
    eq("fungi-only corpus is PASS", fungiScan.status, "PASS");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`self-test: ${fail === 0 ? `OK (${pass} fixtures)` : `${fail} FAILED`}`);
  return fail === 0;
}

function loadManifest(path) {
  const abs = resolve(path);
  const read = classifyRead(abs);
  if (read.kind !== "ok") {
    return { error: read.reason, path: abs };
  }
  let parsed;
  try {
    parsed = JSON.parse(read.buf.toString("utf8"));
  } catch {
    return { error: "manifest-not-json", path: abs };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.files)) {
    return { error: "manifest-shape", path: abs };
  }
  return { manifest: parsed, digest: read.digest, path: abs };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.error) {
    console.error(`REFUSED: ${opts.error}`);
    return 2;
  }
  if (opts.selfTest) return selftest() ? 0 : 1;
  if (!selftest()) {
    console.error("REFUSED: self-test failed — no findings will be reported from an unproven instrument.");
    return 2;
  }

  let files = opts.files;
  let manifestMeta;
  if (opts.corpusManifest) {
    const loaded = loadManifest(opts.corpusManifest);
    if (loaded.error) {
      const out = { status: "REFUSED", reason: loaded.error, path: loaded.path };
      console.log(opts.json ? JSON.stringify(out) : `REFUSED ${loaded.error}`);
      return 2;
    }
    manifestMeta = { path: loaded.path, digest: loaded.digest };
    files = loaded.manifest.files.map((row) => {
      if (typeof row === "string") return resolve(ROOT, row);
      return resolve(ROOT, row.path);
    });
    const expected = loaded.manifest.files.filter((row) => row && typeof row === "object" && row.sha256);
    const scan = scanFiles(files);
    if (scan.status === "REFUSED") {
      if (opts.json) console.log(JSON.stringify({ ...scan, manifest: manifestMeta }));
      else console.log(`REFUSED ${scan.reason} ${scan.path ?? ""}`);
      return 2;
    }
    for (const row of expected) {
      const abs = resolve(ROOT, row.path);
      const got = scan.results.find((r) => r.path === abs);
      if (!got || got.digest !== row.sha256) {
        const out = {
          status: "REFUSED",
          reason: "digest-mismatch",
          path: abs,
          expected: row.sha256,
          actual: got?.digest,
          manifest: manifestMeta,
        };
        console.log(opts.json ? JSON.stringify(out, null, 2) : `REFUSED digest-mismatch ${abs}`);
        return 2;
      }
    }
    const out = { ...scan, manifest: manifestMeta, bound: "digest-bound-enumerated-sources" };
    if (opts.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${scan.status} findings=${scan.findings.length} files=${scan.results.length}`);
      for (const f of scan.findings) console.log(`  ${f.id} ${f.path}`);
    }
    return scan.exit;
  }

  const scan = scanFiles(files.map((f) => resolve(f)));
  if (opts.json) console.log(JSON.stringify(scan, null, 2));
  else {
    console.log(`${scan.status}${scan.reason ? " " + scan.reason : ""} findings=${(scan.findings ?? []).length}`);
    for (const f of scan.findings ?? []) console.log(`  ${f.id} ${f.path}`);
  }
  return scan.exit;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invoked === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
void mkdirSync;
void ROOT;
