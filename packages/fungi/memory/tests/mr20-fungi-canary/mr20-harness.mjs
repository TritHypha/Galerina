// MR20 harness (gap 1.3, .fungi side): every secret-arena.fungi flow is fed a
// synthetic canary on each Int argument in turn, and its whole run text plus
// its packed result are scanned for any trace of the canary. Synthetic data
// only: the canary is SYNTH-CANARY-7f3a and integers derived from its bytes.
// Each invocation flattens its own copy (unique mkdtemp name) so parallel runs
// never share a build/<name>.wasm. TypeScript is not involved.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
export const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const PORT = join(MEM, "src", "secret-arena-custodian-port.fungi");
export const UNIT = join(MEM, "src", "secret-arena.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const PORT_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";

export const CANARY_TEXT = "SYNTH-CANARY-7f3a";

function wordOf(text) {
  let v = 0;
  for (let i = 0; i < 4; i += 1) v = (v * 256) + text.charCodeAt(i);
  return v;
}

// Big-endian words of the canary's own bytes. All fit a signed i32.
export const CANARY_INTS = Object.freeze({
  synt: wordOf("SYNT"),       // 0x53594E54 = 1398361684
  cana: wordOf("CANA"),       // 0x43414E41 = 1128353345
  f3a: wordOf("7f3a"),        // 0x37663361 = 929444705
  negSynt: -wordOf("SYNT"),   // the same magnitude, negative
});

// Every 4-byte window of the canary text, the rule used by the VOK (MEM-R15)
// and SLIDE (MEM-R16) canary sweeps.
export function canaryWindows(text = CANARY_TEXT) {
  const out = [];
  for (let i = 0; i + 4 <= text.length; i += 1) out.push(text.slice(i, i + 4));
  return out;
}

// Spellings a canary integer would take if a flow echoed it: decimal, and hex
// in both cases with and without 0x. Short decimal forms are not used: a
// packed code can legitimately contain any 3-digit run.
export function intSpellings(n) {
  const abs = Math.abs(n);
  const hex = abs.toString(16);
  return [String(n), String(abs), hex, hex.toUpperCase(), "0x" + hex, "0x" + hex.toUpperCase()];
}

export function traceFindings(text) {
  const hits = [];
  for (const w of canaryWindows()) if (text.includes(w)) hits.push("window:" + w);
  for (const [label, n] of Object.entries(CANARY_INTS)) {
    for (const s of intSpellings(n)) if (text.includes(s)) hits.push(label + ":" + s);
  }
  return [...new Set(hits)];
}

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  if (first === -1) throw new Error("MR20: version marker missing");
  return src.slice(first + marker.length);
}

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  if (parts.length !== 2) throw new Error("MR20: " + label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

let override = null;

export function unitSource() {
  return override ?? readFileSync(UNIT, "utf8");
}

function flatten() {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const port = readFileSync(PORT, "utf8");
  let rest = unitSource();
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, PORT_IMPORT, "custodian-port");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "mr20-flat-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n"
    + stripVersion(splitOnce(port, CB_IMPORT, "port c-boundary")) + "\n" + rest);
  return { dir, file };
}

// Flow signatures read from the unit itself, so a new flow joins the sweep
// without editing this file. Every `pure flow` returning Int: the 29 arena*
// entry points and the 7 shared helpers they call.
export function flowSignatures(src = unitSource()) {
  const re = /pure flow (\w+)\(([^)]*)\)\s*->\s*Int/g;
  const out = [];
  for (const m of src.matchAll(re)) {
    const params = m[2].split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
      const [name, type] = p.split(":").map((s) => s.trim());
      return { name, type };
    });
    out.push({ flow: m[1], params });
  }
  return out;
}

export function invoke(flow, args) {
  const flat = flatten();
  const argv = [GALERINA, "run", flat.file, "--invoke", flow, ...args.map(String)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: REPO });
    let text = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stdout.on("data", (b) => { text += b.toString("utf8"); });
    child.stderr.on("data", (b) => { text += b.toString("utf8"); });
    child.on("close", (status) => {
      clearTimeout(timer);
      rmSync(flat.dir, { recursive: true, force: true });
      const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
      const value = m ? Number(m[1]) : NaN;
      const present = m !== null && Number.isSafeInteger(value);
      resolve({ status, text, present, value: present ? value : 0, args });
    });
  });
}

// Small fixed pool: the compiler is CPU heavy and suites run files in parallel.
export async function pool(jobs, width = 3) {
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next;
      next += 1;
      results[i] = await jobs[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
  return results;
}

// Run `fn` with the unit replaced by a one-site mutant; the tracked file is
// never written.
export async function withMutant(needle, next, fn) {
  const original = readFileSync(UNIT, "utf8");
  const parts = original.split(needle);
  if (parts.length !== 2) throw new Error("MR20 mutant needle must occur once: " + needle);
  override = parts[0] + next + parts[1];
  try {
    return await fn();
  } finally {
    override = null;
  }
}

// One job per (flow, argument position, canary): every other argument is 0.
export function sweepJobs(sigs, canaries) {
  const jobs = [];
  for (const sig of sigs) {
    for (let i = 0; i < sig.params.length; i += 1) {
      for (const [label, c] of canaries) {
        const args = sig.params.map(() => 0);
        args[i] = c;
        jobs.push(() => invoke(sig.flow, args).then((r) => ({ ...r, flow: sig.flow, param: sig.params[i].name, label })));
      }
    }
  }
  return jobs;
}