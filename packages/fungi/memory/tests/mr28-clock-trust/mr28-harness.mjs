// MR28 harness: gap 4.4 (.fungi side). Expiry in secret-arena.fungi takes a
// caller-supplied clock reading; .fungi itself reads no clock. This harness
// drives applyArenaClock directly, scans the memory sources for wall-clock
// reads, and runs small synthetic probe programs through galerina.mjs.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFlow, expectPacked, withMutant, REPO, UNIT } from "../mr3-fungi-arena/mr3-harness.mjs";
import { leasedUse } from "../mr5-release-realloc/mr5-harness.mjs";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

export { runFlow, expectPacked, withMutant, REPO, UNIT, leasedUse };

export const MEM_SRC = join(REPO, "packages", "fungi", "memory", "src");
export const GALERINA = join(REPO, "galerina.mjs");

// Packed reason codes from finish(code, true): 100 + code.
export const R = Object.freeze({
  admit: 100,
  malformed: 110,
  untrusted: 111,
  missing: 121,
  backwards: 122,
  epochMismatch: 123,
  deadline: 147,
  overflow: 151,
});

export function clockGate(o = {}) {
  return runFlow("applyArenaClock", [
    o.clockClass ?? 0, o.clock ?? 1000,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
  ]);
}

// A wall-clock or ambient-time read in .fungi source text. Comments and string
// literals are stripped first so prose such as "reads no clock" never matches.
const WALL_CALL = /\b(Clock|Time|Date|Instant|SystemTime)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/;
const CLOCK_EFFECT = /\b(clock\.read|time\.read|clock\.wall|time\.wall)\b/;

export function stripCommentsAndStrings(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === "\"") {
      i += 1;
      while (i < src.length && src[i] !== "\"") {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      i += 1;
      out += "\"\"";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function wallClockFindings(src) {
  const code = stripCommentsAndStrings(src);
  const lines = code.split("\n");
  const hits = [];
  for (let n = 0; n < lines.length; n += 1) {
    if (WALL_CALL.test(lines[n])) hits.push({ line: n + 1, kind: "wall-call", text: lines[n].trim() });
    if (CLOCK_EFFECT.test(lines[n])) hits.push({ line: n + 1, kind: "clock-effect", text: lines[n].trim() });
  }
  return hits;
}

export function memorySources() {
  return readdirSync(MEM_SRC)
    .filter((name) => name.endsWith(".fungi"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(MEM_SRC, name), "utf8") }));
}

export function flowBody(src, flow) {
  const start = src.indexOf("pure flow " + flow + "(");
  if (start === -1) return null;
  const next = src.indexOf("\npure flow ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

function probe(source, argvTail) {
  const dir = mkdtempSync(join(tmpdir(), "mr28-probe-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, source);
  try {
    const r = spawnSync(process.execPath, [GALERINA, ...argvTail(file)], { encoding: "utf8", cwd: REPO, timeout: 120000 });
    return { status: r.status, text: (r.stdout || "") + (r.stderr || "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runProbe(source, flow, args = []) {
  return probe(source, (file) => ["run", file, "--invoke", flow, ...args.map(String)]);
}

export function checkProbe(source) {
  return probe(source, (file) => ["check", file]);
}

export function pureProgram(flow, body, params = "") {
  return [
    "@version 1",
    "",
    "pure flow " + flow + "(" + params + ") -> Int",
    "contract {",
    "  intent { \"MR28 synthetic probe\" }",
    "}",
    "{",
    body,
    "}",
    "",
  ].join("\n");
}